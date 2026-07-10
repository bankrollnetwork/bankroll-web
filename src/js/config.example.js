// Frontend runtime config — TEMPLATE (committed).
//
// Copy to `config.js` (which is gitignored) and fill in your values. Each page loads
// `config.js` before the wallet bundle, so anything it sets on `window` is visible to
// connectEthWallet.js and friends. Put real keys ONLY in `config.js`, never here and never
// in committed source. Mirrors the src/contracts/.env / .env.example convention.

// Read-only mainnet RPC endpoint used for eth_call before a wallet is connected (the
// window.infura fallback in connectEthWallet.js). A private endpoint (Alchemy/Infura/etc.) is
// more reliable and higher-rate-limit than the keyless public default. If this is unset (no
// config.js), connectEthWallet.js falls back to a keyless public endpoint, so the app still works.
window.rpcURL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY';
