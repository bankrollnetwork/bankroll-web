function initConnect(callback) {
    // Example usage with a button
      document.getElementById('connect-wallet').addEventListener('click', async () => {
        try {
          console.log('Connecting to TronLink…');
          const { tronWeb, addressBase58, chainId } = await connectWallet({ requireMainnet: false });
          console.log('✅ Connected: ' + addressBase58);
          console.log('Chain: ' + chainId);

          const balSun = await tronWeb.trx.getBalance(addressBase58);
          console.log('Balance: ' + tronWeb.fromSun(balSun) + ' TRX');

          const btn = document.getElementById('connect-wallet');
          btn.textContent = 'Connected';
          btn.classList.add('disabled');
          btn.style.pointerEvents = 'none';

        } catch (e) {
          // Wallet-handshake failures only. Log the ERROR (not console.log — an errors-only
          // console filter hid these) with the object intact so the stack survives, and read
          // .message defensively: a non-Error throw used to make .includes() blow up in here.
          const msg = (e && e.message) ? e.message : String(e);
          console.error('❌ TronLink connect failed:', e);
          if (msg.includes('not detected')) {
            console.log('Install TronLink: open your browser’s extension store and search for TronLink.');
          } else if (msg.includes('locked') || msg.includes('not approved')) {
            console.log('Please open the TronLink extension, unlock, and approve this site.');
          }
          return; // never run the page bootstrap on a failed connect
        }

        // The page's own bootstrap runs OUTSIDE the wallet try/catch. It used to sit inside it,
        // so any page error (a bad contract read, a BigInt/BigNumber mismatch) was swallowed as
        // "❌ <msg>" at log level and mistaken for a wallet problem — the page just died quietly
        // after a successful connect. Now it reports as what it is.
        try {
          await callback()
        } catch (e) {
          console.error('❌ page init failed AFTER a successful connect:', e);
        }
      });
   
}

// Wait for TronLink injection (window.tronWeb / window.tronLink)
function waitForTronLinkInstalled(timeoutMs = 8000, intervalMs = 200) {
return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
    if (window.tronWeb || window.tronLink) return resolve(true);
    if (Date.now() - start > timeoutMs) return reject(new Error('TronLink not detected'));
    setTimeout(tick, intervalMs);
    };
    tick();
});
}

// Wait until tronWeb.ready flips true (user has unlocked + approved)
function waitForReady(timeoutMs = 20000, intervalMs = 300) {
return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
    if (window.tronWeb && window.tronWeb.ready) return resolve(true);
    if (Date.now() - start > timeoutMs) {
        return reject(new Error('TronLink detected but still locked or not approved'));
    }
    setTimeout(tick, intervalMs);
    };
    tick();
});
}

/**
 * Connects to TronLink and resolves when the wallet is ready.
 * Returns { tronWeb, addressBase58, addressHex, chainId, nodeInfo }
 */
async function connectWallet({ requireMainnet = false } = {}) {
// 1) Ensure TronLink is installed
await waitForTronLinkInstalled();

// 2) If the modern request API exists, ask for accounts (triggers a popup)
// This can help when extension is installed but not yet connected to the site.
if (window.tronLink?.request) {
    try {
    await window.tronLink.request({ method: 'tron_requestAccounts' });
    } catch (err) {
    // User may have rejected the connection request
    throw new Error('User rejected connection request to TronLink');
    }
}

// 3) Wait until unlocked & injected tronWeb is ready
await waitForReady();

const tronWeb = window.tronWeb;

// 3a) attach limiter: e.g., max 6 req/sec windowed
attachLimiterToTronWeb(window.tronWeb, { rate: 6, intervalMs: 1000 });

// 3b) Setup API Key

window.tronWeb.setHeader({ 'TRON-PRO-API-KEY': 'fa8afc14-3874-4223-aa8d-9881cd1ac04a' });

// 4) Optional: network check (Tron mainnet only)
if (requireMainnet) {
    // Heuristic: trongrid mainnet host OR chain params (no strict chainId standard like EVM)
    const nodeInfo = await tronWeb.trx.getNodeInfo().catch(() => ({}));
    const isMainnetHost = (tronWeb.fullNode?.host || '').includes('trongrid.io');
    if (!isMainnetHost && nodeInfo?.configNodeInfo?.chain_id && nodeInfo.configNodeInfo.chain_id !== 'mainnet') {
    throw new Error('Wrong network: please switch TronLink to Tron mainnet');
    }
}

// 5) Gather basics
const addressBase58 = tronWeb.defaultAddress.base58;
const addressHex = tronWeb.defaultAddress.hex;

// Chain / node info (best-effort)
let nodeInfo = null;
try { nodeInfo = await tronWeb.trx.getNodeInfo(); } catch {}
const chainId = nodeInfo?.configNodeInfo?.chain_id || 'unknown';

return { tronWeb, addressBase58, addressHex, chainId, nodeInfo };
}

// ---- Minimal rate limiter (burst: `rate` per `intervalMs`) ----
function makeRateLimiter({ rate = 10, intervalMs = 1000, maxBackoffMs = 8000 } = {}) {
  const timestamps = []; // when requests started
  const queue = [];

  // schedule a task with rate-limit + optional 429 backoff
  function schedule(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject, attempt: 0, nextAt: 0 });
      pump();
    });
  }

  function pump() {
    const now = Date.now();
    // remove timestamps older than window
    while (timestamps.length && now - timestamps[0] >= intervalMs) timestamps.shift();

    // pull tasks that are ready by time and capacity
    let capacity = rate - timestamps.length;
    for (let i = 0; i < queue.length && capacity > 0; ) {
      const item = queue[i];
      if (item.nextAt > now) { i++; continue; }

      // take it
      queue.splice(i, 1);
      timestamps.push(now);
      capacity--;

      // run
      item.task()
        .then(item.resolve)
        .catch(err => {
          // 429 backoff (exponential, capped)
          const status = (err && (err.status || err.statusCode || err.response?.status)) || 0;
          if (status === 429) {
            item.attempt++;
            const backoff = Math.min(2 ** item.attempt * 250, maxBackoffMs);
            item.nextAt = Date.now() + backoff;
            queue.push(item); // requeue
            setTimeout(pump, backoff + 5);
          } else {
            item.reject(err);
          }
        })
        .finally(() => {
          // schedule another pump soon to keep draining the queue
          setTimeout(pump, 0);
        });
    }

    // DEADLOCK GUARD. pump() is otherwise only re-entered by a NEW schedule() or by an
    // in-flight task settling. Once the rate window is full and every started task has already
    // settled, neither happens: the queue strands forever and each caller hangs on a promise
    // that never settles — no error, no rejection, just a page stuck on placeholders. (Reproduced
    // at rate 6/s: a 14-request burst completed 6 and stranded 8.) So if work is still queued but
    // nothing could start this pass, wake ourselves when the window frees a slot — or when the
    // earliest 429 backoff expires, whichever is sooner.
    if (queue.length) {
      const waits = [];
      if (timestamps.length >= rate) waits.push(timestamps[0] + intervalMs - now);
      const soonest = queue.reduce((m, it) => Math.min(m, it.nextAt || 0), Infinity);
      if (soonest !== Infinity && soonest > now) waits.push(soonest - now);
      if (waits.length) schedulePump(Math.min.apply(null, waits) + 5);
    }
  }

  // One pending wake-up at a time — pump() is idempotent, so extra timers are pure waste.
  let pumpTimer = null;
  function schedulePump(delayMs) {
    if (pumpTimer) return;
    pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, Math.max(0, delayMs));
  }

  return (fn) => schedule(fn);
}

// ---- Patch TronWeb providers with the limiter ----
function attachLimiterToTronWeb(tronWeb, opts = { rate: 5, intervalMs: 1000 }) {
  const limit = makeRateLimiter(opts);

  const wrapProvider = (prov) => {
    if (!prov || typeof prov.request !== 'function') return;
    const original = prov.request.bind(prov);
    prov.request = (...args) => limit(() => original(...args));
  };

  wrapProvider(tronWeb.fullNode);
  wrapProvider(tronWeb.solidityNode);
  wrapProvider(tronWeb.eventServer);

  return tronWeb;
}