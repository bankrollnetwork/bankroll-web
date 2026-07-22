// Frontend runtime config — TEMPLATE (committed).
//
// Copy to `config.js` (which is gitignored) and fill in your values. Each page loads
// `config.js` before the wallet bundle, so anything it sets on `window` is visible to
// connectEthWallet.js and friends. Put real keys ONLY in `config.js`, never here and never
// in committed source. Mirrors the src/contracts/.env / .env.example convention.

// Read-only mainnet RPC endpoints used for eth_call before a wallet is connected, in
// PREFERENCE ORDER: the client probes them and reads through the first one that answers,
// failing over to the next (and finally to the built-in keyless public endpoints) if one is
// down or rate-limited. Put keyed endpoints (Alchemy/Infura/etc.) first — more reliable and
// higher-rate-limit than the public fallbacks. If this is unset (no config.js), the app
// still works on the keyless public endpoints alone.
// Leave the array empty to run entirely on the built-in keyless public endpoints.
window.rpcURLs = [
  // 'https://your-rpc-provider.example/v2/YOUR_KEY',
];
