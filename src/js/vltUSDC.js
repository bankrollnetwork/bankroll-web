// vltUSDC vault test client — drives VltUsdcVault + ZapHelper against a local Hardhat
// mainnet fork (chainId 31337). Read-only state via an HTTP provider; signed writes via
// the connected wallet (connectEthWallet.js). Self-contained — does NOT load eth-common.js.
(function () {
  "use strict";

  // Real mainnet addresses (present on the fork). Defaulted so balances + USDC funding work
  // before the vault is configured; vault.usdc()/vlt() overwrite them on load (same values).
  var WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  var USDC_ADDR = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  var VLT_ADDR = "0x6b785a0322126826d8226d77e173d75dafb84d11";
  var MAX_UINT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  var USDC_BALANCE_SLOT = 9; // FiatTokenV2_2 balanceOf mapping slot
  var DEADLINE = "4102444800"; // year 2100
  var CFG_KEY = "vaultTestConfig";
  var SLIP_KEY = "vaultTestSlippageBps";
  var ROUTE_KEY = "vaultTestUseSdkRoute";
  var ADV_KEY = "vaultTestAdvDeposits"; // Settings → Advanced: "1" = Advanced Deposits on (default off)
  var LOG_KEY = "vaultTestShowLog";     // Settings → Advanced: "1" = Activity log panel shown (default off)
  // Per-chain settings. `dev` chains (a local fork) expose the Config + Fork-Cheats tab and honor a saved
  // localStorage override; production chains bake the read RPC + deployed addresses and hide the dev tools.
  // `rpc` is the read endpoint used BEFORE a wallet connects; the wallet's provider takes over once connected.
  // TODO(mainnet): fill 1.vault / 1.zap with the deployed addresses after the mainnet deploy (Track 1).
  var NETWORKS = {
    1:     { name: "Ethereum",     rpc: "https://ethereum-rpc.publicnode.com", vault: "", zap: "", dev: false },
    31337: { name: "Hardhat fork", rpc: "http://127.0.0.1:8545",               vault: "", zap: "", dev: true },
    1337:  { name: "Hardhat",       rpc: "http://127.0.0.1:8545",               vault: "", zap: "", dev: true },
  };
  var DEFAULT_CHAIN = 1; // pre-connect assumption when no dev override is saved (production-first)
  var POOLS_SLOT = "6"; // v4 StateLibrary: PoolManager `pools` mapping slot (for extsload)
  var ROUTE_FEE_BPS = 3500; // ~V3 0.05% + V2 0.30%, used to size the balanced zap split
  // Minimal PoolManager ABI — read the live pool price (slot0.sqrtPriceX96) via extsload.
  var POOLMANAGER_ABI = [{ name: "extsload", stateMutability: "view", type: "function", inputs: [{ type: "bytes32", name: "slot" }], outputs: [{ type: "bytes32", name: "" }] }];
  // For pulling real mainnet gas/ETH prices into the ≈$ balance readouts.
  var CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"; // mainnet ETH/USD feed (8 dec)
  var AGGREGATOR_ABI = [{ name: "latestAnswer", inputs: [], outputs: [{ type: "int256", name: "" }], stateMutability: "view", type: "function" }];
  var PUBLIC_MAINNET_RPCS = ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://cloudflare-eth.com"];
  // Pools the in-browser Uniswap-SDK route reads (mainnet; present on the fork).
  // Candidate USDC/WETH V3 pools (mainnet) — the optimizer quotes every tier and picks the best.
  var V3_USDC_WETH_POOLS = [
    { fee: 500, tickSpacing: 10, addr: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },  // 0.05%
    { fee: 3000, tickSpacing: 60, addr: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8" }, // 0.30%
    { fee: 100, tickSpacing: 1, addr: "0xe0554a476a092703abdb3ef35c80e0d76d32939f" },   // 0.01%
  ];
  var V2_USDC_WETH_PAIR = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc"; // USDC/WETH
  var V2_WETH_VLT_PAIR = "0x966053ca4fca049173eb1f27e4cb168ccb794534"; // WETH/VLT
  var V3POOL_ABI = [
    { name: "slot0", stateMutability: "view", type: "function", inputs: [], outputs: [
      { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" }, { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" }, { name: "feeProtocol", type: "uint8" }, { name: "unlocked", type: "bool" }] },
    { name: "liquidity", stateMutability: "view", type: "function", inputs: [], outputs: [{ name: "", type: "uint128" }] },
  ];
  var V2PAIR_ABI = [
    { name: "getReserves", stateMutability: "view", type: "function", inputs: [], outputs: [
      { name: "reserve0", type: "uint112" }, { name: "reserve1", type: "uint112" }, { name: "blockTimestampLast", type: "uint32" }] },
    { name: "token0", stateMutability: "view", type: "function", inputs: [], outputs: [{ name: "", type: "address" }] },
  ];

  // Swap tab: the user's wallet talks to the Universal Router DIRECTLY (no ZapHelper) — native
  // ETH wraps/unwraps inside the router; ERC-20 inputs are pulled via the canonical Permit2.
  var UNIVERSAL_ROUTER = "0x66a9893cc07d91d95644aedd05d03f95e1dba8af"; // mainnet UR (fork = mainnet)
  var PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
  var PERMIT2_ABI = [
    { name: "allowance", stateMutability: "view", type: "function",
      inputs: [{ name: "owner", type: "address" }, { name: "token", type: "address" }, { name: "spender", type: "address" }],
      outputs: [{ name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] },
    { name: "approve", stateMutability: "nonpayable", type: "function",
      inputs: [{ name: "token", type: "address" }, { name: "spender", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }],
      outputs: [] },
  ];
  var MAX_UINT160 = "1461501637330902918203684832716283019655932542975"; // 2^160 - 1
  var MAX_UINT48 = "281474976710655"; // 2^48 - 1 (Permit2 expiration = never)
  var ETH_GAS_RESERVE_WEI = "20000000000000000"; // 0.02 ETH the max-chip keeps back for gas
  // Mainnet token fallbacks so the Swap tab quotes even before a vault is configured.
  var MAINNET_USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  var MAINNET_VLT = "0x6b785a0322126826d8226d77e173d75dafb84d11";

  var state = {
    cfg: { rpc: "http://127.0.0.1:8545", vault: "", zap: "" },
    readWeb3: null, // active read provider (public RPC pre-connect, wallet once connected)
    httpWeb3: null, // the HTTP read provider built from state.cfg.rpc (also used by the fork cheats)
    chainId: null, net: null, dev: false, // resolved from the connected chain (NETWORKS)
    account: null,
    tokens: { usdc: USDC_ADDR, vlt: VLT_ADDR, usdcDec: 6, vltDec: 18, sharesDec: 18, usdcIsCurrency0: null },
    read: {}, // read contracts (HTTP)
    write: {}, // write contracts (wallet)
    bal: { usdc: "0", vlt: "0", shares: "0" }, // raw on-chain balances (strings)
    priceUsdcPerVlt: 0, // live V4 pool price (USDC per 1 VLT), for the deposit estimator
    poolKeyObj: null, // normalized PoolKey (for poolId / extsload)
    poolMgrAddr: null,
    slippageBps: 100, // zap min-out tolerance; default 1%
    zapSeq: 0, // sequence guard for the async zap quote
    zapExpShares: null, // exact shares from the last successful zap static call (else NAV estimate)
    swapSeq: 0, // sequence guard for the async Swap-tab quote
    swapSide: "in", // which Swap box the user last edited ("in" | "out") — drives the quote direction
    redSeq: 0, // sequence guard for the async USDC-only withdraw estimate
    swapPerm: { usdc: false, vlt: false }, // Permit2 approval state (ERC20→Permit2 AND Permit2→UR)
    gwei: 0, ethUsd: 0, // live mainnet gas (gwei) + ETH/USD (0 = not fetched yet), set by fetchMainnetPrices()
    useRoutingApi: false, // build zap swapData with the in-browser Uniswap SDK instead of built-in
    advDeposits: false, // Settings → Advanced: show the Advanced (two-token deposit) tab. Off by default.
    showLog: false, // Settings → Advanced: show the Activity log panel. Off by default.
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  function $f(name) { return document.querySelector('[data-field="' + name + '"]'); }
  function setField(name, val) { var el = $f(name); if (el) el.textContent = val; }
  // HTML-capable setter for values that embed token logos — only ever fed client-formatted
  // numbers plus the fixed <img> tags below (never user/chain strings).
  function setFieldHtml(name, html) { var el = $f(name); if (el) el.innerHTML = html; }
  // "logo + symbol", logo ahead of the text, for the three base tokens.
  function tokHtml(sym) {
    var k = String(sym).toLowerCase();
    if (k !== "eth" && k !== "usdc" && k !== "vlt") return sym;
    return '<img class="tok-ic" src="img/logo/coingecko/' + k + '.png" alt=""> ' + sym;
  }
  // Decorate a route path string ("USDC →(V3 0.05%) WETH →(V2 0.30%) VLT") with token logos.
  // WETH wears the ETH logo (wrapped ETH). Safe on arbitrary status strings — it only touches
  // whole-word symbols.
  function routeHtml(txt) {
    if (!txt) return txt;
    return String(txt).replace(/\b(WETH|ETH|USDC|VLT)\b/g, function (m) {
      var k = m === "WETH" ? "eth" : m.toLowerCase();
      return '<img class="tok-ic" src="img/logo/coingecko/' + k + '.png" alt=""> ' + m;
    });
  }
  // The share token: overlapped VLT+USDC badge ahead of "vltUSDC" (it wraps both).
  function sharesHtml() {
    return '<span class="tok-pair"><img class="tok-ic" src="img/logo/coingecko/vlt.png" alt="">' +
      '<img class="tok-ic" src="img/logo/coingecko/usdc.png" alt=""></span> vltUSDC';
  }
  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "-"; }
  function note(id, msg, cls) {
    var el = $f(id); if (!el) return;
    el.textContent = msg; el.className = "calc-note" + (cls ? " " + cls : "");
  }

  // raw integer string from a human decimal amount at `dec` decimals.
  function parseUnits(human, dec) {
    human = String(human == null ? "" : human).trim();
    if (human === "") human = "0";
    if (!/^\d*\.?\d*$/.test(human)) throw new Error("not a number: " + human);
    var parts = human.split(".");
    var int = parts[0] || "0";
    var frac = (parts[1] || "");
    frac = (frac + "0".repeat(dec)).slice(0, dec);
    var raw = (int + frac).replace(/^0+/, "");
    return raw === "" ? "0" : raw;
  }
  // human string from a raw integer at `dec` decimals (trims trailing zeros).
  function formatUnits(raw, dec, places) {
    if (places == null) places = 6;
    raw = window.web3 ? web3.utils.toBN(raw).toString() : String(raw);
    raw = raw.replace("-", "");
    while (raw.length <= dec) raw = "0" + raw;
    var int = raw.slice(0, raw.length - dec);
    var frac = raw.slice(raw.length - dec).slice(0, places).replace(/0+$/, "");
    return int + (frac ? "." + frac : "");
  }

  // ── tx log ───────────────────────────────────────────────────────────────
  function logEntry(text, cls) {
    // Mirror to the browser console so entries aren't "trapped" in the in-page log.
    if (cls === "err") console.error("[vault-test]", text);
    else console.log("[vault-test]", text);
    var box = document.getElementById("txlog");
    var div = document.createElement("div");
    div.className = "entry" + (cls ? " " + cls : "");
    div.textContent = "[" + new Date().toLocaleTimeString() + "] " + text;
    box.insertBefore(div, box.firstChild);
    return div;
  }
  function errText(e) {
    var m = (e && e.message) ? e.message : String(e);
    // surface revert reason if present
    var i = m.indexOf("execution reverted");
    return i >= 0 ? m.slice(i) : m;
  }

  // raw JSON-RPC to the HTTP node (for hardhat_* cheats + read fallbacks).
  function rpc(method, params) {
    return fetch(state.cfg.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: method, params: params || [] }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    });
  }

  // ── config (chain-aware) ─────────────────────────────────────────────────────
  function readSavedCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) { return {}; } }
  function setCfgInputs() {
    var r = document.getElementById("cfg-rpc"), v = document.getElementById("cfg-vault"), z = document.getElementById("cfg-zap");
    if (r) r.value = state.cfg.rpc; if (v) v.value = state.cfg.vault; if (z) z.value = state.cfg.zap;
  }
  // Pre-connect: a saved override means a dev is on a fork; otherwise preview the production default chain.
  function loadConfig() {
    var saved = readSavedCfg();
    var hasOverride = !!(saved.rpc || saved.vault || saved.zap);
    var net = NETWORKS[DEFAULT_CHAIN];
    state.chainId = null; state.net = net; state.dev = hasOverride || !!net.dev;
    state.cfg.rpc = saved.rpc || net.rpc;
    state.cfg.vault = saved.vault || net.vault;
    state.cfg.zap = saved.zap || net.zap;
    setCfgInputs();
  }
  // Post-connect: resolve cfg + dev from the connected chain (dev chains honor the localStorage override).
  function applyNetwork(cid) {
    state.chainId = cid;
    var net = NETWORKS[cid] || null;
    state.net = net; state.dev = net ? !!net.dev : false;
    var base = net || NETWORKS[DEFAULT_CHAIN];
    var saved = state.dev ? readSavedCfg() : {};
    state.cfg.rpc = saved.rpc || base.rpc;
    state.cfg.vault = saved.vault || base.vault;
    state.cfg.zap = saved.zap || base.zap;
    setCfgInputs();
  }
  function saveConfig() {
    state.cfg.rpc = document.getElementById("cfg-rpc").value.trim();
    state.cfg.vault = document.getElementById("cfg-vault").value.trim();
    state.cfg.zap = document.getElementById("cfg-zap").value.trim();
    localStorage.setItem(CFG_KEY, JSON.stringify({ rpc: state.cfg.rpc, vault: state.cfg.vault, zap: state.cfg.zap }));
  }

  // ── contracts ────────────────────────────────────────────────────────────
  function buildReadContracts() {
    // Always keep an HTTP read provider from state.cfg.rpc (used pre-connect + by the fork cheats' rpc()).
    state.httpWeb3 = new Web3(new Web3.providers.HttpProvider(state.cfg.rpc));
    // Before a wallet connects, point the global `web3` at the read RPC so read-only utils / ABI /
    // contract calls work (connectEthWallet overwrites it with the wallet instance on connect).
    if (!window.web3) window.web3 = state.httpWeb3;
    // Reads go through the connected wallet's provider once available (follows the wallet's chain),
    // else the public read RPC — so the dashboard loads pre-connect and tracks the wallet after.
    state.readWeb3 = (state.account && window.web3 && window.web3 !== state.httpWeb3) ? window.web3 : state.httpWeb3;
    state.read = {};
    if (state.cfg.vault) state.read.vault = new state.readWeb3.eth.Contract(VAULT_ABI, state.cfg.vault);
    if (state.cfg.zap) state.read.zap = new state.readWeb3.eth.Contract(ZAPHELPER_ABI, state.cfg.zap);
  }
  function buildWriteContracts() {
    if (!state.account) return; // write contracts need a connected sender (window.web3 exists pre-connect for reads)
    state.write = {};
    var opt = { from: state.account };
    if (state.cfg.vault) state.write.vault = new web3.eth.Contract(VAULT_ABI, state.cfg.vault, opt);
    if (state.cfg.zap) state.write.zap = new web3.eth.Contract(ZAPHELPER_ABI, state.cfg.zap, opt);
    if (state.tokens.usdc) state.write.usdc = new web3.eth.Contract(ERC20_ABI, state.tokens.usdc, opt);
    if (state.tokens.vlt) state.write.vlt = new web3.eth.Contract(ERC20_ABI, state.tokens.vlt, opt);
  }

  // ── dashboard (read-only) ──────────────────────────────────────────────────
  async function refreshDashboard() {
    if (!state.read.vault) { note("dep-note", "Set the vault address in Config.", "vt-warn"); return; }
    try {
      var v = state.read.vault.methods;
      var usdc = await v.usdc().call();
      var vlt = await v.vlt().call();
      state.tokens.usdc = usdc; state.tokens.vlt = vlt;
      var key = await v.poolKey().call();
      state.poolKeyObj = {
        currency0: key.currency0 || key[0], currency1: key.currency1 || key[1],
        fee: key.fee || key[2], tickSpacing: key.tickSpacing || key[3], hooks: key.hooks || key[4],
      };
      var usdc0 = await v.usdcIsCurrency0().call();
      state.tokens.usdcIsCurrency0 = usdc0;

      // token decimals
      var usdcC = new state.readWeb3.eth.Contract(ERC20_ABI, usdc);
      var vltC = new state.readWeb3.eth.Contract(ERC20_ABI, vlt);
      state.tokens.usdcDec = parseInt(await usdcC.methods.decimals().call(), 10);
      state.tokens.vltDec = parseInt(await vltC.methods.decimals().call(), 10);

      setField("d-usdc", usdc); setField("d-vlt", vlt);
      setField("d-usdc0", String(usdc0));
      setField("d-feespacing", (key.fee || key[2]) + " / " + (key.tickSpacing || key[3]));
      if (state.read.zap) {
        setField("d-router", await state.read.zap.methods.router().call());
        setField("d-permit2", await state.read.zap.methods.permit2().call());
      }

      state.tokens.sharesDec = parseInt(await v.decimals().call(), 10); // shares = liquidity units
      var sdec = state.tokens.sharesDec;
      var liq = await v.positionLiquidity().call();
      var supply = await v.totalSupply().call();
      setField("vs-liq", compact(liq));
      setFieldHtml("vs-supply", compact(supply) + " " + sharesHtml());
      var per = (Number(supply) > 0) ? (Number(liq) / (Number(supply) / Math.pow(10, sdec))) : 0;
      setField("vs-pershare", per ? (sdec === 0 ? per.toFixed(4) : per.toExponential(4)) : "0");
      // Lifetime fee growth % from L/share (price-neutral, 0 at launch). All three APRs
      // come straight from the on-chain feeApr() view — integer source of truth, no client annualization.
      try {
        var aprPct = function (bps) { return Number(bps) > 0 ? "~" + (Number(bps) / 100).toFixed(1) + "%" : "—"; };
        var fa = await v.feeApr().call();
        var lifeBps = fa.lifetimeBps || fa[0], d7 = fa.d7Bps || fa[1], d30 = fa.d30Bps || fa[2];
        if (per > 0) {
          var growthPct = (per - 1) * 100;
          setField("vs-feegrowth", (growthPct >= 0 ? "+" : "") + growthPct.toFixed(2) + "%" +
            (Number(lifeBps) > 0 ? " | " + aprPct(lifeBps) + " APR" : ""));
        } else setField("vs-feegrowth", "—");
        setField("vs-apr7", aprPct(d7));
        setField("vs-apr30", aprPct(d30));
      } catch (e) { setField("vs-feegrowth", "—"); setField("vs-apr7", "—"); setField("vs-apr30", "—"); }
      await refreshV4Price(); // live pool price for the deposit estimator
      // Cache NAV/share (USDC, principal only) so deposit/zap can show an approval-free "you receive"
      // estimate (shares ≈ value deposited ÷ NAV/share) the way redeem uses previewRedeem.
      try {
        if (toBN(supply).gtn(0)) {
          var pv = await v.previewRedeem(supply).call();
          // previewRedeem returns token-named (vltAmount, usdcAmount) — no currency-order mapping.
          var pVltRaw = pv.vltAmount || pv[0];
          var pUsdcRaw = pv.usdcAmount || pv[1];
          var posUsd = Number(formatUnits(String(pUsdcRaw), state.tokens.usdcDec)) +
            Number(formatUnits(String(pVltRaw), state.tokens.vltDec)) * (state.priceUsdcPerVlt || 0);
          state.navPerShareUsdc = posUsd / Number(supply);
          // Pool = the position's underlying token amounts; TVL = its USD value (principal, at live price).
          setFieldHtml("vs-pool", localize(formatUnits(String(pVltRaw), state.tokens.vltDec, 2)) + " " + tokHtml("VLT") + " | " +
            localize(formatUnits(String(pUsdcRaw), state.tokens.usdcDec, 2)) + " " + tokHtml("USDC"));
          setField("vs-tvl", "$" + localize(posUsd.toFixed(2)));
        } else { state.navPerShareUsdc = 0; setField("vs-pool", "—"); setField("vs-tvl", "—"); }
      } catch (e) { state.navPerShareUsdc = 0; setField("vs-pool", "—"); setField("vs-tvl", "—"); }
      await refreshClaimable(); // claimable value + auto-compound trigger for the Stats panel
    } catch (e) {
      console.error("[vault-test] dashboard read error:", e); // full object/stack in console
      logEntry("dashboard read failed: " + errText(e), "err");
    }
  }

  async function refreshBalances() {
    if (!state.account || !state.readWeb3) return;
    try {
      var eth = await state.readWeb3.eth.getBalance(state.account);
      state.bal.eth = eth;
      setField("eth", localize(formatUnits(eth, 18, 4)));
      if (state.tokens.usdc) {
        var u = new state.readWeb3.eth.Contract(ERC20_ABI, state.tokens.usdc);
        state.bal.usdc = String(await u.methods.balanceOf(state.account).call());
        setField("usdc", localize(formatUnits(state.bal.usdc, state.tokens.usdcDec, 4)));
      }
      if (state.tokens.vlt) {
        var t = new state.readWeb3.eth.Contract(ERC20_ABI, state.tokens.vlt);
        state.bal.vlt = String(await t.methods.balanceOf(state.account).call());
        setField("vlt", localize(formatUnits(state.bal.vlt, state.tokens.vltDec, 4)));
      }
      if (state.read.vault) {
        state.bal.shares = String(await state.read.vault.methods.balanceOf(state.account).call());
        setField("shares", compact(state.bal.shares)); // huge raw integer → "2,995 T"
        // What those shares are worth in-kind (proportional VLT/USDC) — same previewRedeem the Pool row uses.
        state.bal.sharesVlt = state.bal.sharesUsdc = null;
        try {
          if (toBN(state.bal.shares).gtn(0)) {
            var pv = await state.read.vault.methods.previewRedeem(state.bal.shares).call();
            state.bal.sharesVlt = String(pv.vltAmount || pv[0]);
            state.bal.sharesUsdc = String(pv.usdcAmount || pv[1]);
          }
        } catch (e) { /* leave null → the breakdown line hides */ }
      }
      renderBalanceUsd(); // ≈$ + underlying-token sub-lines — rendered once their data is available
      renderBalanceChips();
      await renderAllApprovals();
    } catch (e) { console.error("[vault-test] balance read error:", e); logEntry("balance read failed: " + errText(e), "err"); }
  }
  // Render the muted "≈ $" sub-lines on the ETH / VLT / shares cards from the cached balances × the
  // latest prices. Also called when live prices land — so each ≈$ appears only once its price data is
  // available (usdEq() returns "" → the :empty rule hides the line), never off a placeholder default.
  function renderBalanceUsd() {
    if (!state.account) return;
    if (state.bal.eth != null)
      setField("eth-usd", usdEq(Number(formatUnits(state.bal.eth, 18)) * (state.ethUsd || 0)));
    setField("vlt-usd", usdEq(Number(formatUnits(state.bal.vlt, state.tokens.vltDec)) * (state.priceUsdcPerVlt || 0)));
    setField("shares-usd", usdEq(Number(state.bal.shares) * (state.navPerShareUsdc || 0)));
    // Underlying VLT | USDC these shares represent (blank until previewRedeem resolves).
    setFieldHtml("shares-parts", (state.bal.sharesVlt != null)
      ? localize(formatUnits(String(state.bal.sharesVlt), state.tokens.vltDec, 2)) + " " + tokHtml("VLT") + " | " +
        localize(formatUnits(String(state.bal.sharesUsdc), state.tokens.usdcDec, 2)) + " " + tokHtml("USDC")
      : "");
  }

  // ── swapData builder (mirrors scripts/dev/build_vlt_route.js) ───────────────
  // USDC -(V3 `v3Fee`)-> WETH -(V2)-> VLT; the tier comes from builtinTier() (deepest pool).
  // amountInRaw MUST equal the contract's swapUsdcToVlt / spend amount. Output recipient =
  // UR MSG_SENDER (helper-independent).
  function buildVltRouteSwapData(amountInRaw, usdc, vlt, v3Fee) {
    v3Fee = v3Fee || 500;
    var MSG_SENDER = "0x0000000000000000000000000000000000000001";
    var ADDRESS_THIS = "0x0000000000000000000000000000000000000002";
    var CONTRACT_BALANCE = web3.utils.toBN(2).pow(web3.utils.toBN(255)).toString();
    // V3 path is TIGHTLY packed (address|uint24|address). encodeParameters left-pads, so
    // hand-pack it, then pass as a `bytes` arg (which gets length-prefixed correctly).
    var feeHex = web3.utils.padLeft(web3.utils.numberToHex(v3Fee).replace("0x", ""), 6);
    var v3Path = "0x" + usdc.toLowerCase().replace("0x", "") + feeHex + WETH.replace("0x", "");
    var v3Input = web3.eth.abi.encodeParameters(
      ["address", "uint256", "uint256", "bytes", "bool"],
      [ADDRESS_THIS, amountInRaw.toString(), "0", v3Path, true]
    );
    var v2Input = web3.eth.abi.encodeParameters(
      ["address", "uint256", "uint256", "address[]", "bool"],
      [MSG_SENDER, CONTRACT_BALANCE, "0", [WETH, vlt], false]
    );
    return web3.eth.abi.encodeFunctionCall(
      {
        name: "execute", type: "function",
        inputs: [{ type: "bytes", name: "commands" }, { type: "bytes[]", name: "inputs" }, { type: "uint256", name: "deadline" }],
      },
      ["0x0008", [v3Input, v2Input], DEADLINE]
    );
  }

  // The ZapHelper treats swapData as opaque Universal-Router calldata. By default we build the
  // fixed USDC→(V3)→WETH→(V2)→VLT route above; with the Config "routing API" toggle on, we instead
  // fetch the calldata from an external routing service (the production path). Returns {data, src};
  // any API failure falls back to the built-in route so dev never breaks.
  var BUILTIN_ROUTE = "USDC →(V3 0.05%) WETH →(V2 0.30%) VLT";
  // Depth-aware tier for the BUILT-IN fallback: when the SDK optimizer is unavailable (the very
  // scenario this path exists for), pick the deepest-liquidity V3 USDC/WETH tier from plain
  // web3 reads — the best execution proxy computable without quoting machinery (L units are
  // comparable across tiers of the same pair at the same price). Defaults to 0.05% if even the
  // pool reads fail, matching the old hardcode.
  async function builtinTier() {
    try {
      var pp = await readPoolParams();
      var best = null;
      for (var i = 0; i < (pp.v3Pools || []).length; i++) {
        var c = pp.v3Pools[i];
        if (!best || toBN(c.liquidity).gt(toBN(best.liquidity))) best = c;
      }
      if (best) return Number(best.fee);
    } catch (e) {}
    return 500;
  }
  function builtinRouteText(fee) {
    return "USDC →(V3 " + (fee / 10000) + "%) WETH →(V2 0.30%) VLT";
  }
  async function getZapSwapData(swapRaw) {
    if (state.useRoutingApi) {
      try {
        var sdk = await sdkRouteSwapData(swapRaw);
        if (sdk && sdk.calldata) return { data: sdk.calldata, src: "Uniswap SDK", route: sdk.routeText || BUILTIN_ROUTE };
      } catch (e) {
        logEntry("SDK route failed (" + errText(e) + ") — using built-in route", "err");
        var tf = await builtinTier();
        return { data: buildVltRouteSwapData(swapRaw, state.tokens.usdc, state.tokens.vlt, tf), src: "built-in (SDK failed)", route: builtinRouteText(tf) };
      }
    }
    var tier = await builtinTier();
    return { data: buildVltRouteSwapData(swapRaw, state.tokens.usdc, state.tokens.vlt, tier), src: "built-in route", route: builtinRouteText(tier) };
  }
  // Read live V3 USDC/WETH + V2 WETH/VLT pool state via the read provider and hand the raw values to
  // the bundled @uniswap/universal-router-sdk (window.UniswapRouting) to build + encode the calldata.
  // Output recipient = the ZapHelper (it measures its own balance delta). chainId 1 — fork mirrors it.
  // Live V3 USDC/WETH + V2 WETH/VLT pool state + token metadata, shaped as the routing bundle's
  // shared params (see uniswap-routing-entry.js buildContext). Used by both the zap route
  // (Deposit tab) and the Swap tab quotes. Sequential reads per the read-provider etiquette.
  // All venue state the route optimizer can use, read sequentially (RPC discipline) and cached
  // for 15s — the reverse estimator calls buildSwap up to 4x per quote, all local math after
  // this one read. A venue that fails to read is simply absent from the candidate set.
  async function readPoolParams() {
    var now = Date.now();
    if (state._poolParams && now - state._poolParams.t < 15000) return state._poolParams.p;
    var w = state.readWeb3;

    var v3Pools = [];
    for (var i = 0; i < V3_USDC_WETH_POOLS.length; i++) {
      var cfg = V3_USDC_WETH_POOLS[i];
      try {
        var c3 = new w.eth.Contract(V3POOL_ABI, cfg.addr);
        var s0 = await c3.methods.slot0().call();
        var lq = await c3.methods.liquidity().call();
        if (toBN(String(lq)).gtn(0)) {
          v3Pools.push({ fee: cfg.fee, tickSpacing: cfg.tickSpacing, sqrtPriceX96: String(s0.sqrtPriceX96 || s0[0]), tick: String(s0.tick || s0[1]), liquidity: String(lq) });
        }
      } catch (e) {}
    }

    var v2 = new w.eth.Contract(V2PAIR_ABI, V2_WETH_VLT_PAIR);
    var res = await v2.methods.getReserves().call();
    var wethIs0 = (await v2.methods.token0().call()).toLowerCase() === WETH.toLowerCase();

    var v2Usdc = null;
    try {
      var uw = new w.eth.Contract(V2PAIR_ABI, V2_USDC_WETH_PAIR);
      var ures = await uw.methods.getReserves().call();
      var uWethIs0 = (await uw.methods.token0().call()).toLowerCase() === WETH.toLowerCase();
      v2Usdc = { usdcReserve: String(uWethIs0 ? ures[1] : ures[0]), wethReserve: String(uWethIs0 ? ures[0] : ures[1]) };
    } catch (e) {}

    // The vault's own V4 pool (exists once deployed): sqrtPrice + ACTIVE liquidity straight from
    // PoolManager storage (StateLibrary layout: slot0 at +0, liquidity at +3). The Swap tab uses
    // it as a venue-neutral candidate; zap deposit/redeem paths exclude it (includeV4: false).
    var v4 = null;
    try {
      if (state.poolKeyObj && state.poolMgrAddr) {
        var k = state.poolKeyObj;
        var poolId = web3.utils.keccak256(web3.eth.abi.encodeParameters(
          ["address", "address", "uint24", "int24", "address"],
          [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
        var slot = web3.utils.soliditySha3({ t: "bytes32", v: poolId }, { t: "uint256", v: POOLS_SLOT });
        var pm = new w.eth.Contract(POOLMANAGER_ABI, state.poolMgrAddr);
        var word0 = await pm.methods.extsload(slot).call();
        var sqrtP = toBN(word0).and(toBN("0x" + "f".repeat(40)));
        var liqSlot = "0x" + toBN(slot).addn(3).toString(16, 64);
        var wordL = await pm.methods.extsload(liqSlot).call();
        var v4Liq = toBN(wordL);
        if (sqrtP.gtn(0) && v4Liq.gtn(0)) {
          v4 = { sqrtPriceX96: sqrtP.toString(), liquidity: v4Liq.toString(), fee: Number(k.fee), tickSpacing: Number(k.tickSpacing) };
        }
      }
    } catch (e) {}

    var p = {
      chainId: 1,
      slippageBps: state.slippageBps,
      usdc: { address: state.tokens.usdc || MAINNET_USDC, decimals: state.tokens.usdcDec || 6 },
      weth: { address: WETH },
      vlt: { address: state.tokens.vlt || MAINNET_VLT, decimals: state.tokens.vltDec || 18 },
      v3Pools: v3Pools,
      v2: { wethReserve: String(wethIs0 ? res[0] : res[1]), vltReserve: String(wethIs0 ? res[1] : res[0]) },
      v2Usdc: v2Usdc,
      v4: v4,
    };
    state._poolParams = { t: now, p: p };
    return p;
  }
  async function sdkRouteSwapData(swapRaw) {
    if (typeof UniswapRouting === "undefined" || !UniswapRouting.buildSwapData) {
      throw new Error("uniswap-routing bundle not loaded (run npm run bundle:routing)");
    }
    var p = await readPoolParams();
    p.recipient = state.cfg.zap;
    p.amountIn = String(swapRaw);
    p.deadline = DEADLINE;
    var r = await UniswapRouting.buildSwapData(p);
    return { calldata: r.calldata, routeText: r.routeText };
  }

  // ── Swap tab: ETH / USDC / VLT via the Universal Router (no ZapHelper) ──────
  // Quote + calldata come from the routing bundle's buildSwap; the tx goes straight from the
  // user's wallet to the UR. ETH in/out wraps/unwraps inside the router (ETH-in needs no
  // approval at all); ERC-20 inputs are pulled via Permit2 — two one-time approvals per token
  // (ERC20 → Permit2, then Permit2 grant → UR), driven from Settings → Approvals.
  function swapTokens() { return { tin: $("#swp-in").val() || "ETH", tout: $("#swp-out").val() || "USDC" }; }
  function swapDec(sym) { return sym === "USDC" ? (state.tokens.usdcDec || 6) : 18; }
  // ≈$ for a raw swap amount, from the same sources the balance readouts use: USDC at the peg,
  // VLT at the live V4 pool price, ETH at the fetched mainnet spot. 0 when the price isn't known.
  function swapUsd(sym, raw) {
    var n = Number(formatUnits(raw, swapDec(sym)));
    if (sym === "USDC") return n;
    if (sym === "VLT") return n * (state.priceUsdcPerVlt || 0);
    return n * (state.ethUsd || 0); // ETH
  }
  function renderSwapRoute(rows, note, warn) {
    var el = $f("swp-route"); if (!el) return;
    var html = "";
    if (rows && rows.length) {
      html = '<div class="vt-kvs">';
      for (var i = 0; i < rows.length; i++) html += '<div class="vt-kv"><span>' + rows[i][0] + "</span><strong>" + rows[i][1] + "</strong></div>";
      html += "</div>";
    }
    if (note) html += '<div class="vt-route-note' + (warn ? " vt-warn" : "") + '">' + note + "</div>";
    el.innerHTML = html || '<div class="vt-route-note">Enter an amount to see the route.</div>';
  }
  var _swapTimer;
  function refreshSwapQuoteDebounced() { clearTimeout(_swapTimer); _swapTimer = setTimeout(refreshSwapQuote, 350); }
  // Reverse estimate for "type what you want out": mixed routes are EXACT_INPUT-only in the SDK,
  // so invert the forward quote — a 1-unit probe for the marginal rate, then up to three
  // proportional corrections. All buildSwap calls are local math on the pool state already read
  // by readPoolParams (no extra RPC), so the loop is effectively free.
  async function estimateSwapInput(p, targetOutRaw) {
    var unit = toBN(10).pow(toBN(swapDec(p.tokenIn)));
    var target = toBN(targetOutRaw);
    var r = await UniswapRouting.buildSwap(Object.assign({}, p, { amountIn: unit.toString() }));
    if (!toBN(r.quotedOut).gtn(0)) throw new Error("no liquidity on this route");
    var guess = target.mul(unit).div(toBN(r.quotedOut));
    for (var i = 0; i < 3; i++) {
      if (guess.lten(0)) guess = toBN("1");
      r = await UniswapRouting.buildSwap(Object.assign({}, p, { amountIn: guess.toString() }));
      var out = toBN(r.quotedOut);
      if (!out.gtn(0)) throw new Error("no liquidity on this route");
      if (out.sub(target).abs().muln(1000).lte(target)) break; // within 0.1% of the target
      guess = guess.mul(target).div(out);
    }
    return { inRaw: guess.toString(), quote: r };
  }
  // Two-way quote: whichever box the user last edited (state.swapSide) is the anchor — typing
  // the From amount fills the To box with the quote; typing the To amount reverse-estimates the
  // required From amount. The swap itself is always EXACT_INPUT on the From box (minOut guards).
  async function refreshSwapQuote() {
    var seq = ++state.swapSeq;
    var t = swapTokens();
    var side = state.swapSide;
    var srcRaw;
    try {
      srcRaw = parseUnits($(side === "out" ? "#swp-out-amount" : "#swp-amount").val(), swapDec(side === "out" ? t.tout : t.tin));
    } catch (e) { srcRaw = "0"; }
    if (toBN(srcRaw).lten(0)) {
      $(side === "out" ? "#swp-amount" : "#swp-out-amount").val("");
      if (side === "out") syncSwapSliderFromAmount();
      setField("swp-out-est", ""); renderSwapRoute(null); return;
    }
    if (typeof UniswapRouting === "undefined" || !UniswapRouting.buildSwap) {
      renderSwapRoute(null, "uniswap-routing bundle not loaded (run npm run bundle:routing)", true); return;
    }
    renderSwapRoute(null, "quoting…");
    try {
      var p = await readPoolParams();
      if (seq !== state.swapSeq) return;
      p.tokenIn = t.tin; p.tokenOut = t.tout;
      p.recipient = state.account || "0x0000000000000000000000000000000000000001"; // display quote pre-connect
      p.deadline = DEADLINE; // display only — doSwap() rebuilds with a live deadline
      var r;
      if (side === "out") {
        var est = await estimateSwapInput(p, String(srcRaw));
        if (seq !== state.swapSeq) return;
        r = est.quote;
        $("#swp-amount").val(formatUnits(est.inRaw, swapDec(t.tin), 6));
        syncSwapSliderFromAmount();
      } else {
        p.amountIn = String(srcRaw);
        r = await UniswapRouting.buildSwap(p);
        if (seq !== state.swapSeq) return;
        $("#swp-out-amount").val(formatUnits(r.quotedOut, swapDec(t.tout), 6));
      }
      var outDec = swapDec(t.tout);
      setField("swp-out-est", usdEq(swapUsd(t.tout, r.quotedOut)));
      renderSwapRoute([
        ["route", routeHtml(r.routeText || "—") + (r.bestOf > 1 ? " · best of " + r.bestOf : "")],
        ["minimum received", fmtT(r.minOut, outDec) + " " + tokHtml(t.tout)],
        ["slippage", (state.slippageBps / 100) + "%"],
      ]);
    } catch (e) {
      if (seq !== state.swapSeq) return;
      setField("swp-out-est", "");
      renderSwapRoute(null, "quote failed: " + errText(e), true);
    }
  }
  // Both Permit2 legs must be live for an ERC-20 input: ERC20 allowance → Permit2, AND the
  // Permit2 internal grant → Universal Router (unexpired, nonzero).
  async function permit2On(tokenAddr) {
    var w = state.readWeb3;
    var erc = new w.eth.Contract(ERC20_ABI, tokenAddr);
    var a = await erc.methods.allowance(state.account, PERMIT2).call();
    if (!toBN(a).gtn(0)) return false;
    var p2 = new w.eth.Contract(PERMIT2_ABI, PERMIT2);
    var g = await p2.methods.allowance(state.account, tokenAddr, UNIVERSAL_ROUTER).call();
    var amt = toBN(g.amount || g[0]);
    var exp = Number(g.expiration || g[1]);
    return amt.gtn(0) && exp > Math.floor(Date.now() / 1000);
  }
  async function renderSwapApprovals() {
    var have = { usdc: false, vlt: false };
    if (state.account) {
      try {
        have.usdc = await permit2On(state.tokens.usdc || MAINNET_USDC);
        have.vlt = await permit2On(state.tokens.vlt || MAINNET_VLT);
      } catch (e) { return; } // network hiccup — keep previous state
    }
    state.swapPerm = have;
    $("#swap-approve-usdc").prop("disabled", !state.account).text(have.usdc ? "Unapprove USDC" : "Approve USDC");
    $("#swap-approve-vlt").prop("disabled", !state.account).text(have.vlt ? "Unapprove VLT" : "Approve VLT");
    renderSwapAction();
  }
  // Gate the Swap button on the INPUT token's requirements (ETH-in needs nothing but a wallet).
  function renderSwapAction() {
    var t = swapTokens();
    var ok = !!state.account && (t.tin === "ETH" || state.swapPerm[t.tin.toLowerCase()]);
    gateAction("#swp-go", ok);
    // In-panel approve stand-in (hidden once approved / for ETH): mirrors the other panels.
    $("#swp-approve-p").prop("disabled", !state.account || t.tin === "ETH" || state.swapPerm[t.tin.toLowerCase()])
      .text("Approve " + t.tin);
  }
  async function toggleSwapApproval(sym) {
    try {
      requireConnected();
      var tokenAddr = sym === "USDC" ? (state.tokens.usdc || MAINNET_USDC) : (state.tokens.vlt || MAINNET_VLT);
      var erc = new web3.eth.Contract(ERC20_ABI, tokenAddr);
      var p2 = new web3.eth.Contract(PERMIT2_ABI, PERMIT2);
      var on = state.swapPerm[sym.toLowerCase()];
      if (on) {
        // Revoke both legs (inner grant first so no window exists where UR can still pull).
        await runTx("revoke Permit2 grant " + sym + " → UR", p2.methods.approve(tokenAddr, UNIVERSAL_ROUTER, "0", "0").send({ from: state.account }));
        await runTx("unapprove " + sym + " → Permit2", erc.methods.approve(PERMIT2, "0").send({ from: state.account }));
      } else {
        var cur = await erc.methods.allowance(state.account, PERMIT2).call();
        if (!toBN(cur).gtn(0)) {
          await runTx("approve(MAX) " + sym + " → Permit2", erc.methods.approve(PERMIT2, MAX_UINT).send({ from: state.account }));
        }
        await runTx("Permit2 grant " + sym + " → Universal Router", p2.methods.approve(tokenAddr, UNIVERSAL_ROUTER, MAX_UINT160, MAX_UINT48).send({ from: state.account }));
      }
      await renderSwapApprovals();
    } catch (e) { logEntry(errText(e), "err"); }
  }
  async function doSwap() {
    try {
      requireConnected();
      var t = swapTokens();
      var amountRaw = parseUnits($("#swp-amount").val(), swapDec(t.tin));
      if (toBN(amountRaw).lten(0)) throw new Error("enter an amount");
      // Rebuild at send time: live pool state + a real mempool deadline (the displayed quote's
      // deadline is a far-future placeholder).
      var p = await readPoolParams();
      p.tokenIn = t.tin; p.tokenOut = t.tout;
      p.amountIn = String(amountRaw);
      p.recipient = state.account;
      p.deadline = await txDeadline();
      var r = await UniswapRouting.buildSwap(p);
      await runTx("swap " + $("#swp-amount").val() + " " + t.tin + " → " + t.tout + " (min " + fmtT(r.minOut, swapDec(t.tout)) + ")",
        web3.eth.sendTransaction({ from: state.account, to: UNIVERSAL_ROUTER, data: r.calldata, value: r.value || "0x0" }));
      refreshSwapQuote();
    } catch (e) { note("swp-note", errText(e), "vt-warn"); }
  }
  // Keep the pair valid (in ≠ out): picking the other side's token swaps them, like a flip.
  function onSwapTokenChange(changed) {
    var tin = $("#swp-in").val(), tout = $("#swp-out").val();
    if (tin === tout) {
      var prev = changed === "in" ? state._swpPrevIn : state._swpPrevOut;
      if (changed === "in") $("#swp-out").val(prev || (tin === "USDC" ? "ETH" : "USDC"));
      else $("#swp-in").val(prev || (tout === "USDC" ? "ETH" : "USDC"));
    }
    state._swpPrevIn = $("#swp-in").val(); state._swpPrevOut = $("#swp-out").val();
    renderSwapChip(); renderSwapAction(); syncSwapSliderFromAmount(); refreshSwapQuoteDebounced();
  }
  function flipSwap() {
    var tin = $("#swp-in").val();
    $("#swp-in").val($("#swp-out").val()); $("#swp-out").val(tin);
    // Swap the amounts and the anchor with the tokens, so the value the user actually TYPED stays
    // the typed side (reversing "1000 VLT for ~398 USDC" → "1000 VLT for ~398 USDC" the other way).
    var a = $("#swp-amount").val();
    $("#swp-amount").val($("#swp-out-amount").val()); $("#swp-out-amount").val(a);
    state.swapSide = state.swapSide === "out" ? "in" : "out";
    state._swpPrevIn = $("#swp-in").val(); state._swpPrevOut = $("#swp-out").val();
    renderSwapChip(); renderSwapAction(); syncSwapSliderFromAmount(); refreshSwapQuoteDebounced();
  }
  // The balance chips follow the selected tokens: the From chip is the clickable spendable-max
  // (ETH keeps a gas reserve back); the To chip is a static readout of the output token's balance.
  function renderSwapChip() {
    var t = swapTokens();
    var tin = t.tin.toLowerCase();
    var chip = $("#swp-bal");
    chip.attr("data-token", tin);
    chip.text(formatUnits(swapMaxRaw(tin), decOf(tin), 4) + " · max");
    var tout = t.tout.toLowerCase();
    var oChip = $("#swp-out-bal");
    oChip.attr("data-token", tout);
    oChip.text(formatUnits(balRaw(tout), decOf(tout), 4));
    // Token logos on the selects follow the picks (filenames match the lowercase symbols).
    $("#swp-in-ic").attr("src", "img/logo/coingecko/" + tin + ".png");
    $("#swp-out-ic").attr("src", "img/logo/coingecko/" + tout + ".png");
  }
  function swapMaxRaw(tk) {
    var b = toBN(balRaw(tk));
    if (tk !== "eth") return b.toString();
    var r = b.sub(toBN(ETH_GAS_RESERVE_WEI));
    return r.gtn(0) ? r.toString() : "0";
  }
  // % slider over the input token's spendable balance (100% = swapMaxRaw, so ETH's top end
  // already keeps the gas reserve back). Mirrors the deposit/withdraw slider pattern.
  function onSwapSlider() {
    var pct = Number($("#swp-slider").val());
    var tk = swapTokens().tin.toLowerCase();
    var dec = decOf(tk);
    state.swapSide = "in"; // the slider writes the From box
    $("#swp-amount").val(formatUnits(toBN(swapMaxRaw(tk)).muln(pct).divn(100).toString(), dec, dec));
    setField("swp-pct", pct + "%");
    refreshSwapQuoteDebounced();
  }
  function syncSwapSliderFromAmount() {
    var tk = swapTokens().tin.toLowerCase();
    var max = toBN(swapMaxRaw(tk));
    var a; try { a = toBN(parseUnits($("#swp-amount").val(), decOf(tk))); } catch (e) { a = toBN("0"); }
    var pct = max.gtn(0) ? Math.min(100, Number(a.muln(100).div(max).toString())) : 0;
    $("#swp-slider").val(pct);
    setField("swp-pct", pct + "%");
  }

  // ── input UX: balances, max chips, deposit estimator, zap quote, slippage ────
  function toBN(x) { return web3.utils.toBN(x); }
  function decOf(token) { return token === "usdc" ? state.tokens.usdcDec : token === "shares" ? state.tokens.sharesDec : token === "eth" ? 18 : state.tokens.vltDec; }
  function balRaw(token) { return state.bal[token] || "0"; }
  function maxHuman(token) { var d = decOf(token); return formatUnits(balRaw(token), d, d); }
  function numVal(sel) { var n = parseFloat($(sel).val()); return isFinite(n) ? n : 0; }
  function trim(n) { return isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : "0"; }
  // floor a raw amount by the configured slippage tolerance.
  function withSlippage(raw) { return toBN(raw).mul(toBN(10000 - state.slippageBps)).div(toBN(10000)).toString(); }
  // balanced split: how much USDC to swap so bought-VLT value ≈ kept USDC (mirrors quoteDepositSwap).
  function quoteDepositSwap(totalRaw) { return toBN(totalRaw).mul(toBN(1000000)).div(toBN(2000000 - ROUTE_FEE_BPS)).toString(); }
  function fmtU(raw) { return formatUnits(raw, state.tokens.usdcDec, 2); }
  function fmtT(raw, d) { return formatUnits(raw, d, 6); }
  // Compact display for the huge raw share/liquidity integers (shares have 0 decimals, so ~1e16).
  // Expressed in trillions (T), comma-grouped, no decimals → e.g. "22,093 T". We divide by 1e12
  // ourselves because numeral's 'a' abbreviation mis-handles values past ~1e15 (it caps the suffix at
  // 't' but keeps scaling the mantissa, e.g. "22.093 t"). Falls back to plain grouping without numeral.
  function compact(s) {
    if (typeof numeral !== "undefined") return numeral(Number(s) / 1e12).format("0,0") + " T";
    return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  // Thousands-group the integer part of an already-formatted decimal string (string-based, so no
  // Number precision loss): "997661.1889" → "997,661.1889".
  function localize(s) {
    var p = String(s).split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return p.join(".");
  }
  // "≈ $X.XX" for a USD amount; blank when non-positive so the status card's sub-line hides (:empty).
  function usdEq(n) { return (isFinite(n) && n > 0) ? "≈ $" + localize(n.toFixed(2)) : ""; }
  // Approval-free share estimate: USDC value deployed ÷ NAV/share (cached in refreshDashboard).
  // Display + a pre-approval minShares floor; the exact figure comes from the static call once approved.
  function estSharesFromUsd(effUsd) {
    var nav = state.navPerShareUsdc;
    if (!nav || !(effUsd > 0)) return "0";
    return String(Math.max(0, Math.round(effUsd / nav)));
  }

  // V4 pool price (USDC per 1 VLT) read straight from PoolManager storage via extsload.
  function priceFromSqrt(sqrtP) {
    var sp = Number(sqrtP) / Math.pow(2, 96);
    var raw = sp * sp; // currency1 per currency0 (raw units)
    var ud = state.tokens.usdcDec, vd = state.tokens.vltDec;
    return state.tokens.usdcIsCurrency0 ? 1 / (raw * Math.pow(10, ud - vd)) : raw * Math.pow(10, vd - ud);
  }
  async function refreshV4Price() {
    try {
      if (!state.read.vault || !state.poolKeyObj || !state.readWeb3) return;
      if (!state.poolMgrAddr) state.poolMgrAddr = await state.read.vault.methods.poolManager().call();
      var k = state.poolKeyObj;
      var poolId = web3.utils.keccak256(web3.eth.abi.encodeParameters(
        ["address", "address", "uint24", "int24", "address"],
        [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
      var slot = web3.utils.soliditySha3({ t: "bytes32", v: poolId }, { t: "uint256", v: POOLS_SLOT });
      var pm = new state.readWeb3.eth.Contract(POOLMANAGER_ABI, state.poolMgrAddr);
      var word = await pm.methods.extsload(slot).call();
      var sqrtP = toBN(word).and(toBN("0x" + "f".repeat(40))); // low 160 bits = sqrtPriceX96
      state.priceUsdcPerVlt = priceFromSqrt(sqrtP.toString());
    } catch (e) { console.error("[vault-test] V4 price read error:", e); }
  }

  // balance chips ------------------------------------------------------------
  function renderBalanceChips() {
    $(".vt-bal").not("#swp-bal, #swp-out-bal").each(function () {
      var tk = $(this).data("token");
      $(this).text(formatUnits(balRaw(tk), decOf(tk), 4) + " · max");
    });
    renderSwapChip(); // the swap chips own their own render (tokens follow the selects; ETH reserves gas)
  }
  function onBalChip() {
    // attr(), not data(): the swap chip's data-token changes with the token select, and jQuery's
    // data() would serve the first (cached) value forever.
    var tk = $(this).attr("data-token"), target = $(this).attr("data-target");
    if (target === "swp-amount") {
      // Swap max: ETH keeps the gas reserve back so the swap (and anything after) stays payable.
      state.swapSide = "in"; // the chip writes the From box
      $("#" + target).val(formatUnits(swapMaxRaw(tk), decOf(tk), decOf(tk)));
      syncSwapSliderFromAmount(); // lands on 100%
      refreshSwapQuoteDebounced();
      return;
    }
    $("#" + target).val(maxHuman(tk));
    if (target === "dep-vlt") onDepInput("vlt", true);
    else if (target === "dep-usdc") onDepInput("usdc", true);
    else if (target === "zap-usdc") onZapTotal(true);
    else if (target === "red-shares") { syncRedeemSliderFromShares(); redeemPreview(); }
  }

  // deposit estimator --------------------------------------------------------
  // Typing one side estimates the other at the live V4 price. `reconcile` (blur / max click)
  // hard-clamps both sides to the wallet balances; while typing we only estimate + warn.
  function depEstimate(side, reconcile) {
    var price = state.priceUsdcPerVlt;
    if (!price || price <= 0) { note("dep-note", "pool price unavailable — set the vault in Config", "vt-warn"); return; }
    var connected = !!state.account;
    var vltBal = connected ? (parseFloat(maxHuman("vlt")) || 0) : Infinity;
    var usdcBal = connected ? (parseFloat(maxHuman("usdc")) || 0) : Infinity;
    var vlt = numVal("#dep-vlt"), usdc = numVal("#dep-usdc");
    if (side === "vlt") {
      if (reconcile && vlt > vltBal) { vlt = vltBal; $("#dep-vlt").val(trim(vlt)); }
      usdc = vlt * price;
      if (usdc > usdcBal && reconcile) { usdc = usdcBal; vlt = usdc / price; $("#dep-vlt").val(trim(vlt)); }
      $("#dep-usdc").val(trim(usdc));
    } else {
      if (reconcile && usdc > usdcBal) { usdc = usdcBal; $("#dep-usdc").val(trim(usdc)); }
      vlt = usdc / price;
      if (vlt > vltBal && reconcile) { vlt = vltBal; usdc = vlt * price; $("#dep-usdc").val(trim(usdc)); }
      $("#dep-vlt").val(trim(vlt));
    }
    var warn = (vlt > vltBal + 1e-9) ? "exceeds VLT balance" : (usdc > usdcBal + 1e-9) ? "exceeds USDC balance" : "";
    note("dep-note", warn, warn ? "vt-warn" : ""); // price moved into the "you receive" readout

  }

  // zap quote ----------------------------------------------------------------
  function clampZapTotal() {
    if (!state.account) return;
    var bal = parseFloat(maxHuman("usdc")) || 0;
    if (numVal("#zap-usdc") > bal) $("#zap-usdc").val(trim(bal));
  }
  function onZapTotal(reconcile) {
    // New amount ⇒ any cached exact quote is stale; drop it so the recv line falls back to the
    // NAV estimate until the (debounced) re-quote lands rather than showing the old amount's figure.
    // Bump the sequence too: an IN-FLIGHT quote for the old amount would otherwise still pass its
    // own guard (nothing else increments until the debounced re-quote starts 450ms later) and
    // repopulate the cache / route table with the previous amount's numbers.
    state.zapExpShares = null;
    state.zapSeq++;
    if (reconcile) clampZapTotal();
    fillZapSwap();
    syncZapSliderFromUsdc();
    refreshZapQuoteDebounced();
    zapPreviewDebounced();
  }
  // swapUsdcToVlt is computed, never typed (hidden input read by refreshZapQuote/doZapDeposit).
  function fillZapSwap() {
    try {
      var totalRaw = parseUnits($("#zap-usdc").val(), state.tokens.usdcDec);
      $("#zap-swap").val(formatUnits(quoteDepositSwap(totalRaw), state.tokens.usdcDec, state.tokens.usdcDec));
    } catch (e) { /* invalid input — leave swap as-is */ }
  }
  // zap amount slider (% of USDC balance) + "X%" readout — mirrors the redeem slider.
  function renderZapReadout() {
    paintRange(document.getElementById("zap-slider"));
    setField("zap-pct", ($("#zap-slider").val() || "0") + "%");
  }
  function onZapSlider() {
    var pct = parseInt($("#zap-slider").val(), 10) || 0;
    var usdcRaw = toBN(state.bal.usdc || "0").muln(pct).divn(100).toString();
    $("#zap-usdc").val(formatUnits(usdcRaw, state.tokens.usdcDec, state.tokens.usdcDec));
    fillZapSwap();
    renderZapReadout();
    refreshZapQuoteDebounced();
    zapPreviewDebounced();
  }
  function syncZapSliderFromUsdc() {
    var bal = toBN(state.bal.usdc || "0");
    var u; try { u = toBN(parseUnits($("#zap-usdc").val(), state.tokens.usdcDec)); } catch (e) { u = toBN("0"); }
    $("#zap-slider").val(bal.gtn(0) ? Math.min(100, Number(u.muln(100).div(bal).toString())) : 0);
    renderZapReadout();
  }
  var _zapPrevTimer;
  function zapPreviewDebounced() { clearTimeout(_zapPrevTimer); _zapPrevTimer = setTimeout(zapPreview, 350); }
  // "you receive ≈ <shares> vltUSDC" — the exact figure from refreshZapQuote()'s static call once
  // it lands (state.zapExpShares), else the approval-free NAV estimate (≈ all the input USDC ends
  // up deployed) so the line is never blank pre-approval or between keystroke and quote.
  function zapPreview() {
    try {
      var totalRaw = parseUnits($("#zap-usdc").val(), state.tokens.usdcDec);
      if (toBN(totalRaw).lten(0)) { setField("zap-out", ""); return; }
      var totalUsd = Number(formatUnits(totalRaw, state.tokens.usdcDec));
      var shares = state.zapExpShares || estSharesFromUsd(totalUsd);
      setFieldHtml("zap-out", (toBN(shares).gtn(0) ? fmtT(shares, state.tokens.sharesDec) + " " + sharesHtml() + " " : "") + "≈ $" + totalUsd.toFixed(2));
    } catch (e) { setField("zap-out", ""); }
  }
  // Render the zap route as a key/value table (like the stats grid) plus an optional status/error
  // note line. rows = array of [key, valueHtml]; note = status string; warn = tint the note.
  function setRoute(rows, note, warn) {
    var el = $f("zap-route"); if (!el) return;
    var html = "";
    if (rows && rows.length) {
      html = '<div class="vt-kvs">';
      for (var i = 0; i < rows.length; i++) {
        html += '<div class="vt-kv"><span>' + rows[i][0] + "</span><strong>" + rows[i][1] + "</strong></div>";
      }
      html += "</div>";
    }
    if (note) html += '<div class="vt-route-note' + (warn ? " vt-warn" : "") + '">' + note + "</div>";
    el.innerHTML = html || '<div class="vt-route-note">Enter a USDC amount to see the route.</div>';
  }
  var _zapTimer;
  function refreshZapQuoteDebounced() { clearTimeout(_zapTimer); _zapTimer = setTimeout(refreshZapQuote, 450); }
  async function refreshZapQuote(depth) {
    var seq = ++state.zapSeq;
    state.zapExpShares = null; // invalid until this run proves a fresh figure (set on success below)
    var usdcDec = state.tokens.usdcDec, vltDec = state.tokens.vltDec;
    var totalRaw, swapRaw;
    try { totalRaw = parseUnits($("#zap-usdc").val(), usdcDec); swapRaw = parseUnits($("#zap-swap").val(), usdcDec); }
    catch (e) { setRoute(null, "Enter a USDC amount to see the route."); return; }
    var slipPct = state.slippageBps / 100, sharesDec = state.tokens.sharesDec;
    // Generic route text until the quote runs; replaced with the SDK's actual computed path on success.
    var routeText = state.useRoutingApi ? "via Uniswap SDK (computing…)" : BUILTIN_ROUTE;
    // swapUsdcToVlt is auto-derived from the USDC amount; if it isn't ready yet (e.g. no vault set, so
    // token decimals are unknown), show a NEUTRAL prompt — not an alarming warning about a hidden field.
    if (toBN(swapRaw).lte(toBN("0")) || toBN(swapRaw).gte(toBN(totalRaw))) {
      setRoute(null, "Enter a USDC amount to see the route.");
      $("#zap-minvlt").val("0"); $("#zap-minshares").val("0"); return;
    }
    var usdcForLp = toBN(totalRaw).sub(toBN(swapRaw)).toString();
    // Rows shared by every state: route, the swap/keep split, and the live pool price.
    function baseRows(routeStr) {
      var rows = [["route", routeHtml(routeStr)], ["split", "swap " + fmtU(swapRaw) + " · keep " + fmtU(usdcForLp) + " " + tokHtml("USDC")]];
      if (state.priceUsdcPerVlt) rows.push(["price", "~$" + state.priceUsdcPerVlt.toFixed(4) + "/VLT"]);
      return rows;
    }

    // Build the route FIRST — this needs no approval (just pool reads + SDK encode), so the COMPUTED
    // path can render immediately rather than waiting on (or being gated by) the static-call quote.
    setRoute(baseRows(routeText), "building route…");
    var sd, swapData, routeStr;
    try {
      sd = await getZapSwapData(swapRaw);
      if (seq !== state.zapSeq) return;
      swapData = sd.data;
      routeStr = sd.route || BUILTIN_ROUTE;
    } catch (e) {
      if (seq !== state.zapSeq) return;
      setRoute(baseRows(routeText), "route build failed: " + errText(e), true);
      return;
    }

    // The exact minimums need the USDC→ZapHelper allowance (the static-call performs the transferFrom).
    if (!state.account || !state.write.zap || !(APPROVALS[2] && APPROVALS[2].on)) {
      $("#zap-minvlt").val("0"); $("#zap-minshares").val("0");
      setRoute(baseRows(routeStr), "approve USDC → ZapHelper to compute minimums (sent with min 0 until then)");
      zapPreview(); // no exact figure available — fall the recv line back to the NAV estimate
      return;
    }
    setRoute(baseRows(routeStr), "quoting… (slippage " + slipPct + "%)");
    try {
      var z = state.write.zap.methods;
      var expVlt = String(await z.zap(state.tokens.usdc, state.tokens.vlt, swapRaw, "0", DEADLINE, state.account, swapData).call({ from: state.account }));
      if (seq !== state.zapSeq) return;
      // Refine the split for the price gap between the external route and the vault's own pool.
      // fillZapSwap()'s seed assumes both trade at ~the same price, but the vault refunds whatever
      // the bought VLT is worth ABOVE the kept USDC at ITS pool price — any gap (large on an
      // un-arbed fork, small on mainnet) comes straight back to the caller as VLT dust instead of
      // being deployed. Balanced when swap·r·p = total − swap → swap = total / (1 + r·p), with
      // r = the route's realized VLT-per-USDC (measured by the preview above, impact included)
      // and p = the vault pool's USDC-per-VLT. Re-quote at the refined split (≤2 passes).
      var pPool = state.priceUsdcPerVlt || 0;
      var swapHuman = Number(formatUnits(swapRaw, usdcDec));
      var rRoute = swapHuman > 0 ? Number(formatUnits(expVlt, vltDec)) / swapHuman : 0;
      if (pPool > 0 && rRoute > 0 && (depth || 0) < 2) {
        var totalHuman = Number(formatUnits(totalRaw, usdcDec));
        var idealSwap = totalHuman / (1 + rRoute * pPool);
        if (Math.abs(idealSwap - swapHuman) / totalHuman > 0.005) {
          $("#zap-swap").val(idealSwap.toFixed(usdcDec));
          return refreshZapQuote((depth || 0) + 1);
        }
      }
      var expShares = String(await z.zapDeposit(totalRaw, swapRaw, "0", "0", await txDeadline(), state.account, swapData).call({ from: state.account }));
      if (seq !== state.zapSeq) return;
      var minVlt = withSlippage(expVlt), minShares = withSlippage(expShares);
      $("#zap-minvlt").val(formatUnits(minVlt, vltDec, vltDec));
      $("#zap-minshares").val(formatUnits(minShares, sharesDec, sharesDec));
      // The table shows what the tx SENDS/ENFORCES; the expected output lives on the "you receive ≈"
      // line above (upgraded below from the NAV estimate to this exact static-call figure).
      state.zapExpShares = expShares;
      setRoute(baseRows(routeStr).concat([
        ["minimum VLT", fmtT(minVlt, vltDec) + " " + tokHtml("VLT")],
        ["minimum vltUSDC", fmtT(minShares, sharesDec) + " " + sharesHtml()],
        ["slippage", slipPct + "%"],
      ]));
      zapPreview(); // undebounced: refresh the recv line now that the exact figure is known
    } catch (e) {
      if (seq !== state.zapSeq) return;
      $("#zap-minvlt").val("0"); $("#zap-minshares").val("0");
      setRoute(baseRows(routeStr), "quote failed: " + errText(e), true);
      zapPreview(); // no exact figure available — fall the recv line back to the NAV estimate
    }
  }

  // settings modal (Slippage | Approvals | Advanced) --------------------------
  function setSettingsTab(tab) {
    $(".vt-mtab").each(function () { $(this).toggleClass("active", $(this).data("stab") === tab); });
    $(".vt-mpane").each(function () { this.classList.toggle("active", this.id === "mset-" + tab); });
    $("#settings-footer").toggle(tab === "slippage"); // Save applies slippage only; approvals are immediate
  }
  function openSettings() {
    var pct = state.slippageBps / 100;
    $("#slip-range").val(pct); $("#slip-input").val(pct);
    paintRange(document.getElementById("slip-range"));
    setSettingsTab("slippage");        // always open on the Slippage tab
    renderAllApprovals();              // refresh the Approvals tab's button states
    if ($.fn.modal) $("#settingsModal").modal("show"); else $("#settingsModal").addClass("show");
  }
  function saveSlippage() {
    var pct = parseFloat($("#slip-input").val());
    if (!isFinite(pct) || pct <= 0) pct = 1;
    pct = Math.min(50, Math.max(0.01, pct));
    state.slippageBps = Math.round(pct * 100);
    try { localStorage.setItem(SLIP_KEY, String(state.slippageBps)); } catch (e) {}
    logEntry("max slippage set to " + pct + "%", "ok");
    refreshZapQuote();
    refreshSwapQuoteDebounced(); // swap minimum-received moves with the tolerance too
    depositPreview(); // re-compute the deposit minShares floor at the new tolerance
  }

  // ── tx plumbing ─────────────────────────────────────────────────────────────
  function requireConnected() {
    if (!state.account) throw new Error("connect a wallet first");
    if (!state.write.vault) throw new Error("set the vault address in Config");
  }
  // ── tx result / error modals ────────────────────────────────────────────────
  var EXPLORERS = { 1: "https://etherscan.io/tx/" }; // chainId → tx URL base; fork chains have none
  function explorerTxUrl(hash) { var b = EXPLORERS[state.chainId]; return (b && hash) ? b + hash : null; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Tx-modal action line: escape the label FIRST (amounts are user-typed), then decorate the
  // token symbols with logos (vltUSDC gets the pair badge; ETH/WETH/USDC/VLT via routeHtml).
  function labelHtml(label) {
    var s = escapeHtml(label);
    s = s.replace(/\bvltUSDC\b/g, sharesHtml());
    return routeHtml(s);
  }
  function openTxModal(variant, title, bodyHtml) {
    var t = document.getElementById("tx-modal-title");
    t.textContent = title; t.className = "modal-title " + variant;
    document.getElementById("tx-modal-body").innerHTML = bodyHtml;
    if ($.fn.modal) $("#txModal").modal("show"); else $("#txModal").addClass("show");
  }
  function showTxResult(label, rec) {
    var hash = (rec && rec.transactionHash) || (typeof rec === "string" ? rec : "");
    var url = explorerTxUrl(hash);
    var blk = (rec && rec.blockNumber != null) ? rec.blockNumber : null;
    openTxModal("tx-ok", "Transaction confirmed",
      '<p class="tx-kv"><b>action</b><br>' + labelHtml(label) + "</p>" +
      '<p class="tx-kv"><b>tx hash</b></p><div class="tx-mono">' + escapeHtml(hash) + "</div>" +
      (blk != null ? '<p class="tx-kv" style="margin-top:10px"><b>block</b> ' + blk + "</p>" : "") +
      '<div class="tx-actions">' +
        '<button type="button" class="button ghost small" id="tx-copy">Copy hash</button>' +
        (url ? '<a class="button ghost small" href="' + url + '" target="_blank" rel="noopener">View on explorer ↗</a>'
             : '<span class="vt-hint">local fork — no block explorer</span>') +
      "</div>");
    var c = document.getElementById("tx-copy");
    if (c) c.onclick = function () { try { navigator.clipboard.writeText(hash); c.textContent = "Copied ✓"; } catch (e) {} };
  }
  function showTxError(label, e) {
    openTxModal("tx-err", "Transaction failed",
      '<p class="tx-kv"><b>action</b><br>' + labelHtml(label) + "</p>" +
      '<p class="tx-kv"><b>error</b></p><div class="tx-mono tx-err-detail">' + escapeHtml(errText(e)) + "</div>");
  }
  async function runTx(label, sendPromise) {
    var entry = logEntry(label + " — pending…", "pending");
    try {
      var rec = await sendPromise;
      entry.className = "entry ok";
      entry.textContent = "[" + new Date().toLocaleTimeString() + "] " + label + " — OK  tx " + (rec.transactionHash || rec);
      showTxResult(label, rec);
      await refreshBalances(); await refreshDashboard();
      return rec;
    } catch (e) {
      entry.className = "entry err";
      entry.textContent = "[" + new Date().toLocaleTimeString() + "] " + label + " — FAILED  " + errText(e);
      showTxError(label, e);
      throw e;
    }
  }

  // ── allowance: explicit approve/unapprove toggle buttons ────────────────────
  // Each button reads the live allowance and either approves MAX (when 0) or revokes to 0
  // (when nonzero). Deposit / zapDeposit do NOT auto-approve — these buttons are the only
  // approval path, so the unapproved (reverting) state is testable. Deposit needs VLT+USDC
  // to the vault; zapDeposit needs USDC to the ZapHelper.
  // Each approval drives TWO buttons: the Settings→Approvals toggle (`btn`, always shown, Approve/Unapprove)
  // and the in-panel approve button (`pbtn`, "Approve X" that hides once granted so the main action button
  // takes its place via the panel disabled-hide CSS).
  var APPROVALS = [
    { btn: "#dep-approve-vlt",  pbtn: "#dep-approve-vlt-p",  sym: "VLT",  target: "vault", on: false, token: function () { return state.write.vlt; },  spender: function () { return state.cfg.vault; } },
    { btn: "#dep-approve-usdc", pbtn: "#dep-approve-usdc-p", sym: "USDC", target: "vault", on: false, token: function () { return state.write.usdc; }, spender: function () { return state.cfg.vault; } },
    { btn: "#zap-approve-usdc", pbtn: "#zap-approve-usdc-p", sym: "USDC", target: "ZapHelper", on: false, token: function () { return state.write.zap && state.write.usdc; }, spender: function () { return state.cfg.zap; } },
  ];
  function isApproved(raw) { return web3.utils.toBN(raw).gt(web3.utils.toBN("0")); }
  async function renderApproval(a) {
    var tok = a.token(), spender = a.spender();
    var avail = !!(state.account && tok && spender);
    if (avail) {
      try { a.on = isApproved(await tok.methods.allowance(state.account, spender).call()); }
      catch (e) { return; } // network hiccup — leave both buttons as-is
    } else { a.on = false; }
    // Settings toggle: shown always (greyed when unavailable), text flips on approval.
    $(a.btn).prop("disabled", !avail).text(a.on ? "Unapprove " + a.sym : "Approve " + a.sym);
    // In-panel approve: disabled (→ hidden) once approved or unavailable, so the action button swaps in.
    $(a.pbtn).prop("disabled", !avail || a.on).text("Approve " + a.sym);
  }
  // Gate an action button on its required approval(s). While gated it's disabled → hidden in-panel, so the
  // in-panel approve button(s) show in its place until every required token is approved.
  function gateAction(sel, ok) {
    var $b = $(sel);
    if ($b.length) $b.prop("disabled", !ok).attr("title", ok ? "" : "approve the required token(s) first");
  }
  // Which approval rows the Settings list shows. The ZapHelper row backs the default (USDC-only)
  // Deposit flow, so it's always there. The two vault approvals are only reachable from the
  // Advanced tab — hide them unless Advanced Deposits is on, EXCEPT while an allowance is still
  // live (`a.on`): opting out after approving must never strand a standing allowance with no way
  // to revoke it. Sync (uses the last-read `a.on`) so the settings toggle can call it directly.
  function renderApprovalRows() {
    for (var i = 0; i < APPROVALS.length; i++) {
      var a = APPROVALS[i];
      if (a.target !== "vault") continue;
      $(a.btn).closest(".vt-approval-row").toggle(!!(state.advDeposits || a.on));
    }
  }
  async function renderAllApprovals() {
    for (var i = 0; i < APPROVALS.length; i++) await renderApproval(APPROVALS[i]);
    renderApprovalRows(); // a.on is fresh now — a live vault allowance keeps its row (revocable)
    await renderSwapApprovals(); // Permit2 pair for the Swap tab (own two-leg model)
    var depOk = APPROVALS[0].on && APPROVALS[1].on; // VLT + USDC → vault
    var zapOk = APPROVALS[2].on;                    // USDC → ZapHelper
    gateAction("#dep-go", depOk);
    gateAction("#zap-go", zapOk);
    gateAction("#fund-vlt-go", zapOk);              // "Get VLT" spends USDC through the ZapHelper
    refreshZapQuoteDebounced();                      // re-quote mins now that allowance may have changed
    depositPreview();                                // exact minShares now that the static call can run
  }
  async function toggleApproval(a) {
    try {
      requireConnected();
      var spender = a.spender();
      if (!spender) throw new Error("set the " + a.target + " address in Config");
      var on = isApproved(await a.token().methods.allowance(state.account, spender).call());
      await runTx((on ? "unapprove " : "approve(MAX) ") + a.sym + " → " + a.target,
        a.token().methods.approve(spender, on ? "0" : MAX_UINT).send({ from: state.account }));
      await renderAllApprovals();
    } catch (e) { logEntry(errText(e), "err"); }
  }

  // ── actions ─────────────────────────────────────────────────────────────────
  // Live deposit preview (debounced, input-driven) — always populates the readonly minShares floor.
  // Once VLT+USDC are approved the exact figure comes from a static call (deposit() does transferFrom);
  // before that it falls back to an approval-free NAV estimate, so the field is never stuck at 0.
  async function depositPreview() {
    if (!state.account || !state.write.vault) return;
    try {
      var vltRaw = parseUnits($("#dep-vlt").val(), state.tokens.vltDec);
      var usdcRaw = parseUnits($("#dep-usdc").val(), state.tokens.usdcDec);
      if (toBN(vltRaw).lten(0) || toBN(usdcRaw).lten(0)) { $("#dep-minshares").val("0"); setField("dep-out", ""); return; }
      var shares;
      if (APPROVALS[0].on && APPROVALS[1].on) {
        shares = String(await state.write.vault.methods.deposit(vltRaw, usdcRaw, "0", await txDeadline(), state.account).call({ from: state.account }));
      } else {
        // Balanced portion only — the vault refunds the excess side, so value deployed = 2·min(sides).
        var p = state.priceUsdcPerVlt || 0;
        var effUsd = 2 * Math.min(Number(formatUnits(vltRaw, state.tokens.vltDec)) * p,
          Number(formatUnits(usdcRaw, state.tokens.usdcDec)));
        shares = estSharesFromUsd(effUsd);
      }
      var minShares = withSlippage(shares);
      $("#dep-minshares").val(formatUnits(minShares, state.tokens.sharesDec, state.tokens.sharesDec));
      // "you receive ≈" readout (right-aligned under the input, render-when-available) — same UX as zap/redeem.
      var price = state.priceUsdcPerVlt || 0;
      var pstr = price.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
      setFieldHtml("dep-out", fmtT(shares, state.tokens.sharesDec) + " " + sharesHtml() + " · min " +
        fmtT(minShares, state.tokens.sharesDec) + " (−" + (state.slippageBps / 100) + "% slippage)" +
        (price > 0 ? " · @ $" + pstr + " / VLT" : ""));
    } catch (e) { $("#dep-minshares").val("0"); setField("dep-out", ""); /* over balance / not-yet-valid */ }
  }
  var _depTimer;
  function depositPreviewDebounced() { clearTimeout(_depTimer); _depTimer = setTimeout(depositPreview, 400); }
  // deposit input: synchronous estimate immediately, then a debounced expected-shares preview.
  function onDepInput(side, reconcile) {
    depEstimate(side, reconcile);       // cross-fill the other side at the live price
    syncDepSlider("vlt"); syncDepSlider("usdc");
    depositPreviewDebounced();
  }
  // Per-token deposit sliders (% of that token's balance). Mirrors the redeem slider; the two sides
  // stay linked through depEstimate, so dragging one fills the other and the other slider follows.
  function renderDepReadout(side) {
    var el = document.getElementById("dep-" + side + "-slider");
    paintRange(el);
    setField("dep-" + side + "-pct", (el && el.value || "0") + "%");
  }
  function syncDepSlider(side) {
    var dec = side === "vlt" ? state.tokens.vltDec : state.tokens.usdcDec;
    var bal = toBN(balRaw(side));
    var amt; try { amt = toBN(parseUnits($("#dep-" + side).val(), dec)); } catch (e) { amt = toBN("0"); }
    $("#dep-" + side + "-slider").val(bal.gtn(0) ? Math.min(100, Number(amt.muln(100).div(bal).toString())) : 0);
    renderDepReadout(side);
  }
  function onDepSlider(side) {
    var dec = side === "vlt" ? state.tokens.vltDec : state.tokens.usdcDec;
    var pct = parseInt($("#dep-" + side + "-slider").val(), 10) || 0;
    $("#dep-" + side).val(formatUnits(toBN(balRaw(side)).muln(pct).divn(100).toString(), dec, dec));
    renderDepReadout(side);                          // paint the dragged slider (don't re-sync it)
    depEstimate(side, false);                        // cross-fill the other side
    syncDepSlider(side === "vlt" ? "usdc" : "vlt");  // move the other slider to match
    depositPreviewDebounced();
  }
  // deposit()/zapDeposit() take a deadline (stale-tx guard): 30 minutes from "now" covers any
  // realistic confirmation wait; a tx that lingers past it reverts "expired" instead of executing
  // under moved market terms. "Now" is CHAIN time, read just-in-time: the contract checks
  // block.timestamp, and on a time-jumped fork (evm_increaseTime) the wall clock sits days in
  // the chain's past — on mainnet the two agree to ~seconds, so this costs one cheap read per
  // action. Hoisted function — also used by the preview static-calls above.
  async function txDeadline() {
    var blk = await state.readWeb3.eth.getBlock("latest");
    // The margin is anchored to the LAST MINED block. On mainnet that is seconds old, so 30
    // minutes bounds mempool staleness as intended. On an idle dev fork nothing mines between
    // interactions while the node's clock (often evm_increaseTime-shifted) keeps flowing, so a
    // 30-minute anchor to a stale block expires by the time the tx mines — use 7 days there
    // (a private fork has no mempool to guard against).
    return String(Number(blk.timestamp) + (state.dev ? 604800 : 1800));
  }
  async function doDeposit() {
    try {
      requireConnected();
      var vltRaw = parseUnits($("#dep-vlt").val(), state.tokens.vltDec);
      var usdcRaw = parseUnits($("#dep-usdc").val(), state.tokens.usdcDec);
      var minShares = parseUnits($("#dep-minshares").val(), state.tokens.sharesDec);
      // No auto-approve — approve VLT + USDC to the vault via the Approve buttons first.
      await runTx("deposit(" + $("#dep-vlt").val() + " VLT, " + $("#dep-usdc").val() + " USDC)",
        state.write.vault.methods.deposit(vltRaw, usdcRaw, minShares, await txDeadline(), state.account).send({ from: state.account }));
    } catch (e) { note("dep-note", errText(e), "vt-warn"); }
  }
  async function doZapDeposit() {
    try {
      requireConnected();
      if (!state.write.zap) throw new Error("set the ZapHelper address in Config");
      var totalRaw = parseUnits($("#zap-usdc").val(), state.tokens.usdcDec);
      var swapRaw = parseUnits($("#zap-swap").val(), state.tokens.usdcDec);
      if (web3.utils.toBN(swapRaw).lte(web3.utils.toBN("0")) || web3.utils.toBN(swapRaw).gte(web3.utils.toBN(totalRaw)))
        throw new Error("need 0 < swapUsdcToVlt < total USDC");
      var minVlt = parseUnits($("#zap-minvlt").val(), state.tokens.vltDec);
      var minShares = parseUnits($("#zap-minshares").val(), state.tokens.sharesDec);
      var swapData = (await getZapSwapData(swapRaw)).data;
      // No auto-approve — approve USDC to the ZapHelper via the Approve button first.
      await runTx("zapDeposit(" + $("#zap-usdc").val() + " USDC, swap " + $("#zap-swap").val() + ")",
        state.write.zap.methods.zapDeposit(totalRaw, swapRaw, minVlt, minShares, await txDeadline(), state.account, swapData).send({ from: state.account }));
    } catch (e) { note("zap-note", errText(e), "vt-warn"); }
  }
  var _redTimer;
  function redeemPreviewDebounced() { clearTimeout(_redTimer); _redTimer = setTimeout(redeemPreview, 350); }
  // Redeem amount slider (% of share balance) + live "X%" readout (the $ value lives on the
  // "you receive (est.)" line). Drive the webkit two-tone track fill (filled = input bg, rest =
  // grey border) from the value.
  function paintRange(el) {
    if (!el) return;
    var min = Number(el.min || 0), max = Number(el.max || 100), v = Number(el.value || 0);
    var pct = max > min ? Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)) : 0;
    el.style.setProperty("--fill", pct + "%");
  }
  function renderRedeemReadout() {
    paintRange(document.getElementById("red-slider"));
    setField("red-pct", ($("#red-slider").val() || "0") + "%");
  }
  function onRedeemSlider() {
    var pct = parseInt($("#red-slider").val(), 10) || 0;
    var sharesRaw = toBN(state.bal.shares || "0").muln(pct).divn(100).toString();
    $("#red-shares").val(formatUnits(sharesRaw, state.tokens.sharesDec, state.tokens.sharesDec));
    renderRedeemReadout();
    redeemPreviewDebounced();
  }
  function syncRedeemSliderFromShares() {
    var bal = toBN(state.bal.shares || "0");
    var sh; try { sh = toBN(parseUnits($("#red-shares").val(), state.tokens.sharesDec)); } catch (e) { sh = toBN("0"); }
    $("#red-slider").val(bal.gtn(0) ? Math.min(100, Number(sh.muln(100).div(bal).toString())) : 0);
    renderRedeemReadout();
  }
  async function redeemPreview() {
    try {
      if (!state.read.vault) return;
      var sharesRaw = parseUnits($("#red-shares").val(), state.tokens.sharesDec);
      if (web3.utils.toBN(sharesRaw).lten(0)) { setField("red-out", ""); renderRedeemReadout(); note("red-note", " "); return; }
      // Pure view — no wallet, no approval, no staticCall. Returns the in-kind principal at the
      // current price. Display-only: redeem() takes no min bounds (in-kind, can't be sandwiched).
      var r = await state.read.vault.methods.previewRedeem(sharesRaw).call();
      // Token-named returns (vltAmount, usdcAmount) — no currency-order mapping needed.
      var vltRaw = String(r.vltAmount || r[0]), usdcRaw = String(r.usdcAmount || r[1]);
      // USD value of the in-kind output (USDC side at par + VLT side at the live pool price).
      var usd = Number(formatUnits(usdcRaw, state.tokens.usdcDec)) + Number(formatUnits(vltRaw, state.tokens.vltDec)) * (state.priceUsdcPerVlt || 0);
      if ($("#red-usdc-only").is(":checked")) {
        // Route-quoted estimate, so the form agrees with the tx modal's enforced minimum: the
        // VLT leg is valued on the ACTUAL external sell route, not the V4 pool price (the two
        // venues can diverge). Same math as doZapRedeem: total = redeemed USDC + route quote,
        // min = redeemed USDC + route minOut at the configured slippage.
        var seq = ++state.redSeq;
        setFieldHtml("red-out", "~" + usd.toFixed(2) + " " + tokHtml("USDC") + " (quoting route…)");
        try {
          if (typeof UniswapRouting === "undefined" || !UniswapRouting.buildSwap || !state.cfg.zap) {
            throw new Error("no-routing");
          }
          var sellRaw = toBN(vltRaw).muln(9995).divn(10000); // the 0.05% shave doZapRedeem encodes
          var quoted = toBN("0"), minOut = toBN("0");
          if (sellRaw.gtn(0)) {
            var p = await readPoolParams();
            if (seq !== state.redSeq) return;
            p.tokenIn = "VLT"; p.tokenOut = "USDC";
            p.amountIn = sellRaw.toString();
            p.recipient = state.cfg.zap;
            p.deadline = DEADLINE; // display only — doZapRedeem rebuilds with a live deadline
            p.includeV4 = false; // exit legs never self-trade the vault's own pool
            var r = await UniswapRouting.buildSwap(p);
            if (seq !== state.redSeq) return;
            quoted = toBN(r.quotedOut); minOut = toBN(r.minOut);
          }
          var totalRaw = toBN(usdcRaw).add(quoted);
          var minRaw = toBN(usdcRaw).add(minOut);
          setFieldHtml("red-out",
            "≈ " + formatUnits(totalRaw.toString(), state.tokens.usdcDec, 6) + " " + tokHtml("USDC") +
            " · min " + formatUnits(minRaw.toString(), state.tokens.usdcDec, 6));
        } catch (e2) {
          if (seq === state.redSeq) {
            setFieldHtml("red-out", "~" + usd.toFixed(2) + " " + tokHtml("USDC") + " (pool-price estimate — route unavailable)");
          }
        }
      } else {
        setFieldHtml("red-out", formatUnits(vltRaw, state.tokens.vltDec, 6) + " " + tokHtml("VLT") + " + " + formatUnits(usdcRaw, state.tokens.usdcDec, 6) + " " + tokHtml("USDC") + " ≈ $" + usd.toFixed(2));
      }
      renderRedeemReadout();
      note("red-note", " ");
    } catch (e) { note("red-note", errText(e), "vt-warn"); }
  }
  async function doRedeem() {
    if ($("#red-usdc-only").is(":checked")) return doZapRedeem();
    try {
      requireConnected();
      var sharesRaw = parseUnits($("#red-shares").val(), state.tokens.sharesDec);
      // In-kind, no slippage bound (can't be sandwiched for value); pays out to the connected wallet.
      await runTx("redeem(" + $("#red-shares").val() + " shares)",
        state.write.vault.methods.redeem(sharesRaw, state.account).send({ from: state.account }));
    } catch (e) { note("red-note", errText(e), "vt-warn"); }
  }
  // EIP-2612 permit over the vltUSDC shares (OZ ERC20Permit domain: token name, version "1").
  // Signed via the wallet's eth_signTypedData_v4; consumed by zapRedeemWithPermit in the same tx.
  async function signSharePermit(valueRaw, deadline) {
    var owner = state.account, spender = state.cfg.zap;
    var nonce = String(await state.read.vault.methods.nonces(owner).call());
    var chainId = Number(await web3.eth.getChainId());
    var typed = {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" }, { name: "version", type: "string" },
          { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }
        ],
        Permit: [
          { name: "owner", type: "address" }, { name: "spender", type: "address" },
          { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      primaryType: "Permit",
      domain: { name: "Bankroll VLT-USDC LP", version: "1", chainId: chainId, verifyingContract: state.cfg.vault },
      message: { owner: owner, spender: spender, value: String(valueRaw), nonce: nonce, deadline: String(deadline) }
    };
    var sigHex = await web3.currentProvider.request({ method: "eth_signTypedData_v4", params: [owner, JSON.stringify(typed)] });
    var raw = sigHex.slice(2);
    var v = parseInt(raw.slice(128, 130), 16);
    if (v < 27) v += 27;
    return { v: v, r: "0x" + raw.slice(0, 64), s: "0x" + raw.slice(64, 128) };
  }
  // USDC-only exit: previewRedeem sizes the VLT sell leg, buildSwap routes it (output to the
  // ZapHelper — it measures its own balance delta), a share permit replaces the approval, and
  // zapRedeemWithPermit runs the whole thing in one transaction. The on-chain bound is the
  // AGGREGATE minUsdcOut (redeemed USDC + route minOut at the configured slippage).
  async function doZapRedeem() {
    try {
      requireConnected();
      if (!state.cfg.zap) throw new Error("no ZapHelper configured (Config tab)");
      if (typeof UniswapRouting === "undefined" || !UniswapRouting.buildSwap) {
        throw new Error("uniswap-routing bundle not loaded (run npm run bundle:routing)");
      }
      var sharesRaw = parseUnits($("#red-shares").val(), state.tokens.sharesDec);
      if (toBN(sharesRaw).lten(0)) throw new Error("enter shares");

      var pr = await state.read.vault.methods.previewRedeem(sharesRaw).call();
      var expVlt = toBN(String(pr.vltAmount || pr[0]));
      var expUsdc = toBN(String(pr.usdcAmount || pr[1]));

      // Encode the sell leg 0.05% under the preview: a drift between build and mine can only
      // leave a VLT sliver (swept to the receiver), never make the router pull more than the
      // redeem produced (which would revert).
      var sellRaw = expVlt.muln(9995).divn(10000);
      var deadline = await txDeadline();
      var swapData = "0x";
      var minTotal = expUsdc.muln(10000 - state.slippageBps).divn(10000);
      if (sellRaw.gtn(0)) {
        var p = await readPoolParams();
        p.tokenIn = "VLT"; p.tokenOut = "USDC";
        p.amountIn = sellRaw.toString();
        p.recipient = state.cfg.zap; // the helper measures its own balance delta
        p.deadline = deadline;
        p.includeV4 = false; // exit legs never self-trade the vault's own pool
        var r = await UniswapRouting.buildSwap(p);
        swapData = r.calldata;
        minTotal = expUsdc.add(toBN(r.minOut));
      }

      var sig = await signSharePermit(sharesRaw, deadline);
      await runTx(
        "zapRedeem " + $("#red-shares").val() + " shares -> USDC (min " + formatUnits(minTotal.toString(), state.tokens.usdcDec, 6) + " USDC)",
        state.write.zap.methods.zapRedeemWithPermit(
          sharesRaw, minTotal.toString(), deadline, state.account,
          sig.v, sig.r, sig.s, swapData
        ).send({ from: state.account })
      );
      redeemPreview();
    } catch (e) { note("red-note", errText(e), "vt-warn"); }
  }
  // Read what the next triggering deposit would auto-compound (retained balances + pending pool
  // fees) and the fixed trigger, for the Stats panel. There is no public compound() — a deposit
  // whose claimable value is at or above AUTO_COMPOUND_MIN_USDC runs the compound leg itself;
  // 100% of the harvest reinvests for holders (no fee of any kind).
  async function refreshClaimable() {
    if (!state.read.vault) return;
    try {
      var c = await state.read.vault.methods.compoundClaimable().call();
      var valueUsdc = c.valueUsdc || c[2];
      var min = await state.read.vault.methods.AUTO_COMPOUND_MIN_USDC().call();
      var above = web3.utils.toBN(valueUsdc).gte(web3.utils.toBN(min));
      setFieldHtml("vs-claimable", formatUnits(valueUsdc, 6, 2) + " " + tokHtml("USDC") + (above ? " ✓ next deposit compounds" : ""));
      setFieldHtml("vs-trigger", formatUnits(min, 6, 0) + " " + tokHtml("USDC"));
      // Lifetime realized fees (on-chain counters; always == Σ Compound + Σ FeesRetained events).
      var fVlt = await state.read.vault.methods.totalFeesVlt().call();
      var fUsdc = await state.read.vault.methods.totalFeesUsdc().call();
      setFieldHtml("vs-fees", localize(formatUnits(String(fVlt), state.tokens.vltDec, 2)) + " " + tokHtml("VLT") + " | " +
        localize(formatUnits(String(fUsdc), state.tokens.usdcDec, 2)) + " " + tokHtml("USDC"));
    } catch (e) { console.error("[vault-test] compoundClaimable read error:", e); }
  }

  // Pull real mainnet gas + ETH prices into the assumption inputs. Gas: a live public RPC
  // (eth_gasPrice), falling back to the fork block's real base fee. ETH/USD: the Chainlink feed
  // present on the fork (no CORS, always works). Each leg fails soft and keeps the manual value.
  async function mainnetGasGwei() {
    for (var i = 0; i < PUBLIC_MAINNET_RPCS.length; i++) {
      try {
        var r = await fetch(PUBLIC_MAINNET_RPCS[i], {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
        });
        var j = await r.json();
        if (j && j.result) return { gwei: Number(web3.utils.fromWei(web3.utils.toBN(j.result), "gwei")), src: "live mainnet" };
      } catch (e) { /* CORS/network — try the next endpoint, then the fork fallback */ }
    }
    // Fallback: the fork block's real base fee (scan back past locally-mined zero-base-fee blocks).
    try {
      var latest = await state.readWeb3.eth.getBlockNumber();
      for (var n = latest, hops = 0; n >= 0 && hops < 50; n--, hops++) {
        var blk = await state.readWeb3.eth.getBlock(n);
        if (blk && blk.baseFeePerGas && web3.utils.toBN(blk.baseFeePerGas).gtn(0)) {
          return { gwei: Number(web3.utils.fromWei(web3.utils.toBN(blk.baseFeePerGas), "gwei")), src: "fork-block base fee" };
        }
      }
    } catch (e) { /* give up */ }
    return null;
  }
  async function mainnetEthUsd() {
    // 1. Live spot — CoinGecko (CORS-friendly, no key).
    try {
      var r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
      var j = await r.json();
      if (j && j.ethereum && j.ethereum.usd > 0) return { usd: Number(j.ethereum.usd), src: "live (CoinGecko)" };
    } catch (e) { /* try the next source */ }
    // 2. Live spot — Coinbase.
    try {
      var r2 = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
      var j2 = await r2.json();
      var amt = j2 && j2.data ? Number(j2.data.amount) : 0;
      if (amt > 0) return { usd: amt, src: "live (Coinbase)" };
    } catch (e) { /* fall back to the on-fork feed */ }
    // 3. Fallback — Chainlink ETH/USD on the fork (real, as of the fork block; no CORS).
    try {
      var agg = new state.readWeb3.eth.Contract(AGGREGATOR_ABI, CHAINLINK_ETH_USD);
      var a = await agg.methods.latestAnswer().call();
      var usd = Number(a) / 1e8;
      if (usd > 0) return { usd: usd, src: "Chainlink @ fork block" };
    } catch (e) { /* feed unavailable on this fork */ }
    return null;
  }
  async function fetchMainnetPrices(quiet) {
    var msgs = [];
    var g = await mainnetGasGwei();
    if (g) {
      state.gwei = Math.round(g.gwei * 100) / 100;
      msgs.push("gas " + state.gwei + " gwei (" + g.src + ")");
    } else { msgs.push("gas fetch failed — kept previous"); }
    var eth = await mainnetEthUsd();
    if (eth) {
      state.ethUsd = Math.round(eth.usd);
      msgs.push("ETH $" + state.ethUsd + " (" + eth.src + ")");
    } else { msgs.push("ETH fetch failed — kept previous"); }
    renderBalanceUsd(); // ETH ≈$ now that a live price landed (also refreshes VLT/shares ≈$)
    if (!quiet) logEntry("mainnet prices: " + msgs.join(" · "), "ok");
  }

  // ── fund (fork cheats, via HTTP provider) ───────────────────────────────────
  async function fundEth() {
    try {
      if (!state.account) throw new Error("connect first");
      var wei = parseUnits($("#fund-eth").val(), 18);
      await rpc("hardhat_setBalance", [state.account, web3.utils.numberToHex(wei)]);
      logEntry("setBalance " + $("#fund-eth").val() + " ETH", "ok");
      await refreshBalances();
    } catch (e) { note("fund-note", errText(e), "vt-warn"); }
  }
  async function fundUsdc() {
    try {
      if (!state.account) throw new Error("connect first");
      if (!state.tokens.usdc) throw new Error("load the vault first (need USDC address)");
      var raw = parseUnits($("#fund-usdc").val(), state.tokens.usdcDec);
      var slot = web3.utils.keccak256(web3.eth.abi.encodeParameters(["address", "uint256"], [state.account, String(USDC_BALANCE_SLOT)]));
      var value = web3.utils.padLeft(web3.utils.numberToHex(raw), 64);
      await rpc("hardhat_setStorageAt", [state.tokens.usdc, slot, value]);
      logEntry("setStorageAt USDC = " + $("#fund-usdc").val(), "ok");
      await refreshBalances();
    } catch (e) { note("fund-note", errText(e), "vt-warn"); }
  }
  async function fundVlt() {
    try {
      requireConnected();
      if (!state.write.zap) throw new Error("set the ZapHelper address in Config");
      var raw = parseUnits($("#fund-vlt").val(), state.tokens.usdcDec);
      var swapData = (await getZapSwapData(raw)).data;
      // No auto-approve — approve USDC to the ZapHelper via the zapDeposit panel's Approve button first.
      await runTx("zap " + $("#fund-vlt").val() + " USDC -> VLT",
        state.write.zap.methods.zap(state.tokens.usdc, state.tokens.vlt, raw, "1", await txDeadline(), state.account, swapData).send({ from: state.account }));
    } catch (e) { note("fund-note", errText(e), "vt-warn"); }
  }

  // Gate the whole UI below the hero behind a connect widget — reveal #app once a wallet connects.
  function applyGate() {
    var connected = !!state.account;
    var gate = document.getElementById("vt-gate");
    var app = document.getElementById("app");
    var hero = document.getElementById("top");
    if (gate) gate.style.display = connected ? "none" : "";
    if (app) app.style.display = connected ? "" : "none";
    // Once connected, drop the hero copy to reclaim vertical space (restored on disconnect).
    if (hero) hero.style.display = connected ? "none" : "";
    // The vltUSDC Stats panel is SHARED between the two states: while disconnected it sits in the
    // gate's left column (populated via the HTTP read RPC — the boot path already runs
    // refreshDashboard() pre-connect); once connected it moves back into the Stats tab. Same DOM
    // node either way, so data-field updates keep working regardless of where it lives.
    // (#vt-gate's own display toggle above covers visibility.)
    var pub = document.getElementById("vt-public-stats");
    var panel = document.getElementById("vault-stats");
    if (pub && panel) {
      var host = connected ? document.getElementById("pane-stats") : pub;
      if (host && panel.parentNode !== host) host.appendChild(panel);
    }
  }

  // Show/hide dev-only affordances based on the active chain: the Config tab (Configuration + Fork
  // Cheats panels live there) and the footer disclaimer. Production chains hide the dev tools.
  function applyChainUI() {
    var cfgTab = document.querySelector('.vt-tab[data-tab="config"]');
    if (cfgTab) cfgTab.style.display = state.dev ? "" : "none";
    if (!state.dev) {
      var active = document.querySelector(".vt-tab.active");
      if (active && active.getAttribute("data-tab") === "config") {
        var stats = document.querySelector('.vt-tab[data-tab="stats"]');
        if (stats) stats.click(); // don't leave the now-hidden Config tab selected
      }
    }
    var foot = document.querySelector(".site-footer .footer-inner p");
    if (foot) foot.textContent = state.dev
      ? "Internal dev/test tool. Local Hardhat fork only — not for production use."
      : "vltUSDC · auto-compounding Uniswap V4 liquidity vault. Non-custodial — no admin, no pause.";
  }

  // Settings → Advanced: both toggles are opt-in and OFF unless localStorage says otherwise, so the
  // default UI is just the USDC-only Deposit/Withdraw flows.
  //   • Advanced Deposits → the Advanced tab (raw two-token vault.deposit()) + its vault approvals.
  //   • Activity Log      → the tx/read/error trail panel (everything is mirrored to the browser
  //                         console either way, so hiding it loses nothing).
  // Tab show/hide follows the same don't-strand-the-active-tab pattern as applyChainUI().
  // Both buttons are state-dependent like the approval toggles: the label states the action.
  function applyAdvancedUI() {
    var tab = document.querySelector('.vt-tab[data-tab="advanced"]');
    if (tab) tab.style.display = state.advDeposits ? "" : "none";
    if (!state.advDeposits) {
      var active = document.querySelector(".vt-tab.active");
      if (active && active.getAttribute("data-tab") === "advanced") {
        var stats = document.querySelector('.vt-tab[data-tab="stats"]');
        if (stats) stats.click(); // don't leave the now-hidden Advanced tab selected
      }
    }
    $("#adv-deposits-toggle").text(state.advDeposits ? "Disable" : "Enable");
    renderApprovalRows(); // the vault approvals follow the setting (a live allowance keeps its row)

    var logPanel = document.getElementById("txlog-panel");
    if (logPanel) logPanel.style.display = state.showLog ? "" : "none";
    $("#show-log-toggle").text(state.showLog ? "Hide" : "Show");
  }
  function toggleAdvDeposits() {
    state.advDeposits = !state.advDeposits;
    try { localStorage.setItem(ADV_KEY, state.advDeposits ? "1" : "0"); } catch (e) {}
    applyAdvancedUI();
    logEntry("advanced deposits " + (state.advDeposits ? "enabled" : "disabled"), "ok");
  }
  function toggleActivityLog() {
    state.showLog = !state.showLog;
    try { localStorage.setItem(LOG_KEY, state.showLog ? "1" : "0"); } catch (e) {}
    applyAdvancedUI();
  }

  // Consolidate the panels into the tab control: move each panel (by a known inner id) into its pane,
  // drop the now-empty grid, then wire tab switching + remember the active tab. Runs once on load
  // while #app is still gated/hidden, so there's no visible reflow.
  var TAB_KEY = "vaultTestTab";
  function setupTabs() {
    var groups = {
      "pane-stats": ["vault-stats"],
      "pane-your-stats": ["your-stats"],
      "pane-deposit": ["zap-go"],
      "pane-withdraw": ["red-go"],
      "pane-swap": ["swap-panel"],
      "pane-advanced": ["dep-go"],
      "pane-config": ["cfg-save", "fund-eth-go"],
    };
    Object.keys(groups).forEach(function (paneId) {
      var pane = document.getElementById(paneId);
      groups[paneId].forEach(function (innerId) {
        var el = document.getElementById(innerId);
        var panel = el && el.closest(".calculator-panel");
        if (pane && panel) pane.appendChild(panel);
      });
    });
    var grid = document.querySelector(".vt-grid");
    if (grid) grid.parentNode.removeChild(grid);

    function activate(tab) {
      var tabs = document.querySelectorAll(".vt-tab");
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tab);
      var panes = document.querySelectorAll(".vt-tab-pane");
      for (var j = 0; j < panes.length; j++) panes[j].classList.toggle("active", panes[j].id === "pane-" + tab);
      try { localStorage.setItem(TAB_KEY, tab); } catch (e) {}
    }
    var btns = document.querySelectorAll(".vt-tab");
    for (var k = 0; k < btns.length; k++) {
      btns[k].addEventListener("click", function () { activate(this.getAttribute("data-tab")); });
    }
    var saved = "stats";
    try { saved = localStorage.getItem(TAB_KEY) || "stats"; } catch (e) {}
    if (!document.getElementById("pane-" + saved)) saved = "stats";
    activate(saved);
  }

  // Friendly NETWORK-card label from a chainId (falls back to the raw id for anything unmapped).
  function netName(cid) {
    var known = { 1: "Ethereum", 31337: "Hardhat fork", 1337: "Hardhat" };
    return known[cid] || "chainId " + cid;
  }

  // ── post-connect ─────────────────────────────────────────────────────────
  async function main() {
    state.account = window.ethDefaultAddress;
    setField("account", short(state.account));
    applyGate(); // reveal the dashboard now that we're connected
    try {
      var cid = Number(await web3.eth.getChainId());
      applyNetwork(cid); // resolve cfg (rpc/vault/zap) + dev flag from the connected chain
      setField("net", netName(cid));
      // Warn only on an UNSUPPORTED chain; mainnet + the dev forks are both fine now.
      if (!state.net) {
        note("dep-note", "Unsupported network (chainId " + cid + "). Switch your wallet to Ethereum mainnet.", "vt-warn");
      }
    } catch (e) {}
    applyChainUI();       // show/hide the dev Config tab + footer for this chain
    buildReadContracts(); // reads now go through the connected wallet's provider
    await refreshDashboard(); // ensures token addrs/decimals are loaded
    buildWriteContracts();
    await refreshBalances();
    onZapTotal(false); // now that decimals are known, compute the swap split + build the zap route
    depositPreview();
    logEntry("connected " + state.account, "ok");
  }
  // Soft disconnect — connectEthWallet has already cleared window.web3/ethDefaultAddress + the persist
  // flag; reset our own state + re-gate the UI. (main() does the reverse on (re)connect.)
  function onWalletDisconnect() {
    state.account = null;
    state.write = {};
    window.web3 = null;      // connectEthWallet already nulled it; ensure buildReadContracts rebuilds HTTP
    loadConfig();            // back to the pre-connect network (public RPC / saved dev override)
    buildReadContracts();    // rebuild reads on the HTTP provider + restore global web3
    applyChainUI();          // restore dev/prod tab + footer for the pre-connect context
    applyGate(); // hide #app, show the connect gate
    setField("account", "not connected");
    setField("net", "-");
    ["eth", "usdc", "vlt", "shares"].forEach(function (f) { setField(f, "-"); });
    setField("eth-usd", ""); setField("vlt-usd", ""); setField("shares-usd", ""); setField("shares-parts", ""); // hide sub-lines
    logEntry("wallet disconnected", "ok");
  }

  // ── wiring ─────────────────────────────────────────────────────────────────
  function reload() {
    state._poolParams = null;
    saveConfig();
    buildReadContracts();
    buildWriteContracts();
    refreshDashboard().then(function () { refreshBalances(); onZapTotal(false); depositPreview(); });
    logEntry("config saved; contracts reloaded", "ok");
  }

  // Spin a button's SVG icon while `work` (a promise) runs, then stop at the next full-rotation
  // boundary so it never snaps back mid-spin (fallback timer covers reduced-motion / no anim events).
  function spinDuring(btn, work) {
    var icon = btn && btn.querySelector("svg");
    if (icon) icon.classList.add("spin");
    Promise.resolve(work).catch(function () {}).then(function () {
      if (!icon) return;
      var stop = function () { icon.classList.remove("spin"); icon.removeEventListener("animationiteration", stop); clearTimeout(t); };
      icon.addEventListener("animationiteration", stop);
      var t = setTimeout(stop, 700);
    });
  }

  // The page's ONE refresh (tab row, next to the settings gear): pull everything on-chain the page
  // shows, then recompute the derived previews. Order matters — the dashboard read caches the pool
  // price + NAV/share that refreshBalances()'s ≈$ readouts and the previews depend on. Covers both
  // "Your Stats" (identity + balances; refreshBalances also re-renders approvals + balance chips)
  // and the panels (vault stats, price, claimable, fee APR), so no panel needs its own button.
  function refreshAll(btn) {
    state._poolParams = null; // manual refresh requotes fresh venue state
    spinDuring(btn, (async function () {
      if (window.web3 && state.account) {
        try {
          var cid = Number(await web3.eth.getChainId());
          state.chainId = cid;
          setField("net", netName(cid));
          setField("account", short(state.account));
        } catch (e) {}
      }
      await refreshDashboard();
      await refreshBalances();
      onZapTotal(false);
      depositPreview();
      redeemPreviewDebounced();
      refreshSwapQuoteDebounced();
    })());
  }

  $(function () {
    loadConfig();
    setupTabs(); // consolidate panels into the tab control (runs while #app is gated/hidden)
    applyGate(); // pre-connect: surface the shared vltUSDC Stats panel beside the connect card
    applyChainUI(); // hide the dev Config tab + set the footer for the pre-connect context
    state.advDeposits = localStorage.getItem(ADV_KEY) === "1"; // default OFF (anything unsaved → false)
    state.showLog = localStorage.getItem(LOG_KEY) === "1";     // default OFF (anything unsaved → false)
    applyAdvancedUI(); // hide the Advanced tab + log unless opted in (also un-strands a saved "advanced" tab)
    state.slippageBps = parseInt(localStorage.getItem(SLIP_KEY) || "100", 10) || 100;
    state.useRoutingApi = (localStorage.getItem(ROUTE_KEY) || "1") === "1"; // default ON (Uniswap SDK route)
    $("#cfg-routing-api").prop("checked", state.useRoutingApi);
    buildReadContracts();
    refreshDashboard().then(function () {
      onZapTotal(false);   // populate swap split + slider + "you receive" from the default USDC
      depositPreview();    // populate the deposit minShares floor from the default amounts
      fetchMainnetPrices(false); // pull live gas + ETH on load
    });

    // balance chips (click = use max), deposit estimator, zap auto-quote, slippage modal
    $(".vt-bal").not("#swp-out-bal").on("click", onBalChip); // the To readout is static (no max on an output)
    $("#dep-vlt").on("input", function () { onDepInput("vlt", false); }).on("change", function () { onDepInput("vlt", true); });
    $("#dep-usdc").on("input", function () { onDepInput("usdc", false); }).on("change", function () { onDepInput("usdc", true); });
    $("#dep-vlt-slider").on("input", function () { onDepSlider("vlt"); });
    $("#dep-usdc-slider").on("input", function () { onDepSlider("usdc"); });
    $("#red-shares").on("input", function () { syncRedeemSliderFromShares(); redeemPreviewDebounced(); });
    $("#red-usdc-only").on("change", function () {
      $("#red-go").text(this.checked ? "Withdraw as USDC" : "Withdraw");
      redeemPreview();
    });
    $("#red-slider").on("input", onRedeemSlider);
    $("#zap-usdc").on("input", function () { onZapTotal(false); }).on("change", function () { onZapTotal(true); });
    $("#zap-slider").on("input", onZapSlider);
    $("#swp-amount").on("input", function () { state.swapSide = "in"; syncSwapSliderFromAmount(); refreshSwapQuoteDebounced(); });
    $("#swp-out-amount").on("input", function () { state.swapSide = "out"; refreshSwapQuoteDebounced(); });
    $("#swp-slider").on("input", onSwapSlider);
    $("#swp-in").on("change", function () { onSwapTokenChange("in"); });
    $("#swp-out").on("change", function () { onSwapTokenChange("out"); });
    $("#swp-flip").on("click", flipSwap);
    $("#swp-go").on("click", doSwap);
    $("#swp-approve-p").on("click", function () { toggleSwapApproval(swapTokens().tin); });
    $("#swap-approve-usdc").on("click", function () { toggleSwapApproval("USDC"); });
    $("#swap-approve-vlt").on("click", function () { toggleSwapApproval("VLT"); });
    $("#settings-open").on("click", openSettings);
    $(".vt-mtab").on("click", function () { setSettingsTab($(this).data("stab")); });
    $("#slip-range").on("input", function () { $("#slip-input").val($(this).val()); paintRange(this); });
    $("#slip-input").on("input", function () { $("#slip-range").val($(this).val()); paintRange(document.getElementById("slip-range")); });
    $(".vt-slip-presets [data-slip]").on("click", function () { var v = $(this).data("slip"); $("#slip-range").val(v); $("#slip-input").val(v); paintRange(document.getElementById("slip-range")); });
    $("#slip-save").on("click", saveSlippage);
    $("#adv-deposits-toggle").on("click", toggleAdvDeposits); // immediate, like the approval toggles
    $("#show-log-toggle").on("click", toggleActivityLog);

    $("#cfg-save").on("click", reload);
    // Normalized per-panel refresh (delegated — buttons get moved into tab panes by setupTabs()).
    $("#refresh-all").on("click", function () { refreshAll(this); });
    $("#dep-approve-vlt, #dep-approve-vlt-p").on("click", function () { toggleApproval(APPROVALS[0]); });
    $("#dep-approve-usdc, #dep-approve-usdc-p").on("click", function () { toggleApproval(APPROVALS[1]); });
    $("#dep-go").on("click", doDeposit);
    $("#zap-approve-usdc, #zap-approve-usdc-p").on("click", function () { toggleApproval(APPROVALS[2]); });
    $("#zap-go").on("click", doZapDeposit);
    $("#red-go").on("click", doRedeem);
    $("#cfg-routing-api").on("change", function () {
      state.useRoutingApi = this.checked;
      try { localStorage.setItem(ROUTE_KEY, this.checked ? "1" : "0"); } catch (e) {}
      refreshZapQuoteDebounced(); // re-quote via the newly-selected route source
    });
    $("#fund-eth-go").on("click", fundEth);
    $("#fund-usdc-go").on("click", fundUsdc);
    $("#fund-vlt-go").on("click", fundVlt);

    // periodic dashboard refresh (read-only, cheap)
    setInterval(refreshDashboard, 60000);
    // keep live mainnet gas/ETH fresh (quiet)
    setInterval(function () { fetchMainnetPrices(true); }, 60000);

    applyGate(); // gated until connect (the #app inline display:none is the pre-JS fallback)
    // The gate's CTA forwards to the header CONNECT button (same connect flow; the click is a user
    // gesture so the wallet prompt still opens).
    $("#gate-connect").on("click", function () {
      var b = document.getElementById("connect-wallet");
      if (b) b.click();
    });

    // Build marker — if you don't see this in the activity log, you're on a cached old JS.
    logEntry("vault test client ready (build 2026-06-23z75 — chain-aware: dev on fork / prod on mainnet) — ERC20_ABI[" +
      (typeof ERC20_ABI !== "undefined" ? ERC20_ABI.length : "MISSING") + "]", "ok");

    initEthConnect(main, { requireMainnet: false, persist: true, onDisconnect: onWalletDisconnect });
  });
})();
