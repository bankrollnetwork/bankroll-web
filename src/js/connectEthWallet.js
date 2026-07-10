// EIP-6963-aware EVM connect helper. Mirrors the public surface of connectWallet.js
// (the Tron-side helper) so any EVM page just calls initEthConnect(main) instead of
// listening for the legacy br-bootstrap event.
//
// What this does that the old eth-common.js auto-connect didn't:
//   - Discovers wallets via EIP-6963 (Rabby, Coinbase, Frame, MetaMask, ...) instead
//     of only `window.ethereum`.
//   - User-gesture-triggered `eth_requestAccounts` (modern wallets reject auto-fires).
//   - Multi-wallet picker modal when more than one provider is announced.
//   - "Wallet not detected" modal as a real UI state, not a silent console message.
//   - Flips #connect-wallet to "Connected" / disabled after success.
//
// Side effect on script load: registers the EIP-6963 announce listener immediately
// and fires `eip6963:requestProvider` so wallets announce themselves before the user
// clicks the button. Listener must be installed before the page is interactive —
// keep this script tag before eth-common.js and before the page-specific JS.

const eip6963Providers = new Map() // uuid -> EIP6963ProviderDetail

// The provider chosen for the current session + its EIP-6963 rdns (stable across reloads, unlike the
// per-load uuid). Used by the opt-in persist/disconnect/eager-reconnect path in initEthConnect.
let activeProvider = null
let activeRdns = null
const PERSIST_KEY = 'brEthWallet' // localStorage: { rdns } of the last connected wallet

window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event.detail
    if (detail && detail.info && detail.info.uuid) {
        eip6963Providers.set(detail.info.uuid, detail)
    }
})

// Kick off discovery. Wallets are spec-required to respond synchronously with
// announceProvider events; doing this on script load means by the time the user
// clicks CONNECT, the Map is already populated.
window.dispatchEvent(new Event('eip6963:requestProvider'))

// Options:
//   requireMainnet  — prompt a chain switch to mainnet (default true; production unchanged).
//   persist         — opt in to the Connect/Disconnect toggle + localStorage eager reconnect.
//                     When false (default), behaves exactly as before: connect → "Connected"/disabled,
//                     no persistence, no eager reconnect (production pages keep their old behavior).
//   onDisconnect    — called after a disconnect so the page can reset its own UI/state.
function initEthConnect(callback, { requireMainnet = true, persist = false, onDisconnect } = {}) {
    const btn = document.getElementById('connect-wallet')
    if (!btn) {
        console.warn('initEthConnect: no #connect-wallet button on page')
        return
    }

    // Reflect the connected wallet in the button — clickable "Disconnect" in persist mode, the legacy
    // dead "Connected" otherwise.
    function showConnected() {
        if (persist) {
            btn.textContent = 'Disconnect'
            btn.classList.remove('disabled')
            btn.style.pointerEvents = ''
        } else {
            btn.textContent = 'Connected'
            btn.classList.add('disabled')
            btn.style.pointerEvents = 'none'
        }
    }
    function showDisconnected() {
        btn.textContent = 'CONNECT'
        btn.classList.remove('disabled')
        btn.style.pointerEvents = ''
    }
    // EVM has no hard "disconnect" RPC — forget the session client-side. Clearing PERSIST_KEY is what
    // makes a reload stay disconnected (eager reconnect only runs when the key is present).
    function disconnect() {
        window.web3 = null
        window.ethDefaultAddress = null
        activeProvider = null
        activeRdns = null
        try { localStorage.removeItem(PERSIST_KEY) } catch (e) {}
        showDisconnected()
        if (typeof onDisconnect === 'function') { try { onDisconnect() } catch (e) {} }
    }

    btn.addEventListener('click', async () => {
        if (persist && window.ethDefaultAddress) { disconnect(); return }
        try {
            console.log('Connecting to EVM wallet…')
            const result = await connectEthereumWallet({ requireMainnet })
            console.log('✅ Connected:', result.address)
            console.log('Chain:', result.chainId)
            if (persist) {
                try { localStorage.setItem(PERSIST_KEY, JSON.stringify({ rdns: activeRdns })) } catch (e) {}
            }
            showConnected()
            await callback()
        } catch (e) {
            console.log('❌ ' + (e && e.message ? e.message : e))
            if (e && e.code === 'NO_WALLET') {
                showEthModal('walletNotDetectedModal')
            } else if (e && e.code === 'WRONG_NETWORK') {
                showEthModal('wrongNetworkModal')
            }
        }
    })

    // Eager reconnect (persist only): if we stored a wallet last time and it's still authorized,
    // reconnect SILENTLY (eth_accounts, no prompt) and run the page's callback.
    if (persist) eagerReconnect(callback, requireMainnet, showConnected)
}

// Silent reconnect on load. No-ops (and clears the stale flag) unless the stored wallet still returns
// accounts without prompting. Never shows a prompt or an error modal.
async function eagerReconnect(callback, requireMainnet, showConnected) {
    let stored
    try { stored = JSON.parse(localStorage.getItem(PERSIST_KEY) || 'null') } catch (e) { stored = null }
    if (!stored || !stored.rdns) return
    // Re-ask wallets to announce, then give them a moment (some announce asynchronously).
    try { window.dispatchEvent(new Event('eip6963:requestProvider')) } catch (e) {}
    await new Promise((r) => setTimeout(r, 250))
    let provider = null
    if (stored.rdns === '__injected__') {
        provider = window.ethereum || null
    } else {
        for (const d of eip6963Providers.values()) {
            if (d.info && d.info.rdns === stored.rdns) { provider = d.provider; break }
        }
    }
    if (!provider) { try { localStorage.removeItem(PERSIST_KEY) } catch (e) {} return }
    try {
        await connectEthereumWallet({ requireMainnet, silent: true, provider })
        activeRdns = stored.rdns
        showConnected()
        await callback()
    } catch (e) {
        // NOT_AUTHORIZED (wallet revoked / locked) or any failure → quietly stay disconnected.
        try { localStorage.removeItem(PERSIST_KEY) } catch (e2) {}
    }
}

async function connectEthereumWallet({ requireMainnet = true, silent = false, provider: forced } = {}) {
    // 1) Decide which provider to use — forced (rdns-matched, for eager reconnect) or picked.
    const provider = forced || await pickProvider()
    if (!provider) {
        const err = new Error('No EVM wallet detected')
        err.code = 'NO_WALLET'
        throw err
    }
    activeProvider = provider

    // 2) Get accounts. silent → eth_accounts (no prompt, for eager reconnect); otherwise the
    //    user-gesture eth_requestAccounts (modern wallets reject that outside a click handler).
    let accounts
    if (silent) {
        try { accounts = await provider.request({ method: 'eth_accounts' }) } catch (err) { accounts = [] }
        if (!accounts || accounts.length === 0) {
            const err = new Error('Wallet not authorized'); err.code = 'NOT_AUTHORIZED'; throw err
        }
    } else {
        try {
            accounts = await provider.request({ method: 'eth_requestAccounts' })
        } catch (err) {
            throw new Error('User rejected wallet connection: ' + (err.message || err))
        }
        if (!accounts || accounts.length === 0) {
            throw new Error('Wallet returned no accounts')
        }
    }

    // 3) Wire up the same globals that eth-common.js used to set on auto-connect,
    //    so downstream code (initContracts, view helpers, page-specific JS)
    //    keeps working unchanged.
    window.web3 = new Web3(provider)
    window.ethDefaultAddress = accounts[0]

    // Best-effort chainId fetch (some old providers only expose .chainId).
    let chainId = '0x0'
    try {
        chainId = await provider.request({ method: 'eth_chainId' })
    } catch (e) {
        chainId = provider.chainId || '0x0'
    }

    // All Bankroll ETH-side contracts live on Ethereum mainnet only — if the
    // wallet is on any other chain (BNB, Polygon, testnets, etc.), the address
    // lookups still succeed (mainnet fallback) but the contract calls return
    // `0x` and web3.js explodes with "Returned values aren't valid". Prompt a
    // chain switch via EIP-3326. If the wallet declines or fails, surface a
    // wrong-network modal and abort.
    //
    // Gated on requireMainnet (default true) so production pages keep enforcing
    // mainnet exactly as before. The vault test client passes requireMainnet:false
    // to connect against a local Hardhat fork (chainId 31337).
    if (!silent && requireMainnet && chainId !== '0x1') {
        try {
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x1' }]
            })
            // Re-read chainId after the switch — providers should fire chainChanged
            // (which our handler reloads on) but read defensively in case.
            try { chainId = await provider.request({ method: 'eth_chainId' }) } catch (e) {}
        } catch (switchErr) {
            console.warn('chain switch declined or failed', switchErr)
            const err = new Error('Please switch your wallet to Ethereum mainnet to use this page')
            err.code = 'WRONG_NETWORK'
            throw err
        }
        if (chainId !== '0x1') {
            const err = new Error('Wallet is still not on Ethereum mainnet')
            err.code = 'WRONG_NETWORK'
            throw err
        }
    }

    // 4) Set BANKROLL.network from the hex chainId directly. The legacy
    //    networkReady() in eth-common.js uses a `switch` on web3.eth.getChainId()
    //    that fails to match when the value comes back as a BigInt, string, or
    //    from a chain not in its hardcoded list — and a miss leaves BANKROLL.network
    //    undefined, which crashes initContracts with "Cannot read properties of
    //    undefined (reading 'VLT')". Setting it here from the reliable
    //    `eth_chainId` hex makes initContracts safe.
    if (typeof BANKROLL !== 'undefined') {
        const chainIdMap = { '0x1': 'mainnet', '0x4': 'rinkeby' }
        BANKROLL.network = chainIdMap[chainId] || 'mainnet'
    }

    // 5) Re-run the bits of eth-common.js's old bootstrap that we still need.
    //    networkReady() just updates the #eth-network display text now; it's
    //    fine if its switch misses since BANKROLL.network is already set above.
    if (typeof networkReady === 'function') {
        try { await networkReady() } catch (e) { console.warn('networkReady', e) }
    }
    if (typeof initContracts === 'function') await initContracts()

    // 5) Read-only RPC fallback for calls made before a wallet is connected — kept for
    //    parity with the old eth-common.js bootstrap. The endpoint is injected via
    //    window.rpcURL (set in js/config.js, which is gitignored; js/config.example.js is
    //    the committed template). Falls back to a keyless public endpoint so the app works
    //    with no config and no key in source. Only set if not already configured.
    if (!window.infura && typeof Web3 !== 'undefined') {
        try {
            var rpcUrl = window.rpcURL || 'https://ethereum-rpc.publicnode.com'
            window.infura = new Web3(new Web3.providers.HttpProvider(rpcUrl))
        } catch (e) {}
    }

    // Auto-reload on accountsChanged / chainChanged is intentionally NOT wired
    // up. MetaMask (and other wallets) emit those events as a side effect of
    // our own eth_requestAccounts + wallet_switchEthereumChain calls, which
    // caused the page to reload itself a moment after connecting — same
    // behavior the user was hitting on stack-vlt. The wallet's own UI signals
    // chain/account changes; the user can refresh manually if they want the
    // page to pick up a different wallet state.

    // 7) Fire the legacy br-bootstrap event for anything still listening.
    //    The new initEthConnect-based pages don't need it, but other code paths
    //    might.
    try {
        window.dispatchEvent(new Event('br-bootstrap', { bubbles: true }))
    } catch (e) {}

    return { provider, web3: window.web3, address: accounts[0], chainId }
}

// Returns a Promise<EIP1193Provider> resolved to whichever provider should be used.
// Logic:
//   - 0 announced + no window.ethereum  → throw NO_WALLET
//   - 0 announced + window.ethereum     → use window.ethereum (legacy fallback)
//   - 1 announced                       → use it directly, no picker
//   - 2+ announced                      → show picker, resolve to user's choice
async function pickProvider() {
    if (eip6963Providers.size === 0) {
        activeRdns = window.ethereum ? '__injected__' : null
        return window.ethereum || null
    }
    if (eip6963Providers.size === 1) {
        const only = Array.from(eip6963Providers.values())[0]
        activeRdns = (only.info && only.info.rdns) || '__injected__'
        return only.provider
    }
    const details = Array.from(eip6963Providers.values())
    const chosen = await showWalletPicker(details)
    // Record the rdns of the chosen provider (match by provider identity) for persistence.
    const match = details.find((d) => d.provider === chosen)
    activeRdns = (match && match.info && match.info.rdns) || '__injected__'
    return chosen
}

// Renders a list of announced wallets into #walletPickerModal's body and shows it.
// Resolves with the chosen EIP1193Provider when the user clicks one, rejects on dismiss.
function showWalletPicker(details) {
    return new Promise((resolve, reject) => {
        const modal = document.getElementById('walletPickerModal')
        if (!modal) {
            // No picker modal in this page's HTML — fall back to the first one.
            console.warn('walletPickerModal not found in DOM; using first announced provider')
            return resolve(details[0].provider)
        }

        const body = modal.querySelector('.modal-body')
        if (!body) return resolve(details[0].provider)

        body.innerHTML = ''
        details.forEach((detail) => {
            const row = document.createElement('a')
            row.className = 'btn btn-outline-primary btn-block d-flex align-items-center justify-content-start mb-2'
            row.style.cursor = 'pointer'
            row.innerHTML =
                `<img src="${detail.info.icon}" alt="" width="24" height="24" class="mr-2" style="margin-right:8px;"/>` +
                `<span class="notranslate">${detail.info.name}</span>`
            row.addEventListener('click', () => {
                $('#walletPickerModal').modal('hide')
                resolve(detail.provider)
            })
            body.appendChild(row)
        })

        let resolved = false
        const onHidden = () => {
            $('#walletPickerModal').off('hidden.bs.modal', onHidden)
            if (!resolved) {
                reject(new Error('Wallet picker dismissed'))
            }
        }
        $('#walletPickerModal').on('hidden.bs.modal', onHidden)
        // Mark resolved when one of the row handlers fires (they'll hide the modal
        // and resolve before the hidden handler runs).
        const origResolve = resolve
        resolve = (val) => { resolved = true; origResolve(val) }

        $('#walletPickerModal').modal('show')
    })
}

function showEthModal(id) {
    const el = document.getElementById(id)
    if (el && typeof $ !== 'undefined') {
        $(el).modal('show')
    } else {
        console.warn(id + ' not in DOM; cannot show modal')
    }
}
