# bankroll-web

Frontend for the **Bankroll Network** dApps — the static, client-side site behind VLT, the
vltUSDC vault, swaps, staking, and the network's other on-chain apps. Self-custodial: the pages
talk directly to Ethereum contracts via web3 in the browser; there is no backend.

Smart contracts live in a separate repo:
[bankrollnetwork/bankroll-contracts](https://github.com/bankrollnetwork/bankroll-contracts)
(the vltUSDC Uniswap V4 vault, ZapHelper, and periphery).

## Stack

- Multi-page static site — each `src/*.html` is its own page/app (e.g. `index` VLT landing,
  `vltUSDC`, `swap`, `stack-*` staking, `daily`, `luck`, leaderboards).
- jQuery + web3.js (a vendored bundle) for wallet connect and direct contract calls.
- **gulp** build: `gulp-useref` bundling, **dart-sass**, `gulp-terser`, `gulp-cssnano`,
  cache-busting → `output.nosync/dist`.
- Deployed via Firebase Hosting / Netlify (both serve `output.nosync/dist`).

> The toolchain is pure-JS (dart-sass, not node-sass), so it builds cleanly on modern Node /
> Apple Silicon.

## Prerequisites

- Node LTS (developed on Node 22).
- `npm install`

## Configuration

The read-only RPC endpoint used before a wallet is connected is injected at runtime:

```bash
cp src/js/config.example.js src/js/config.js   # config.js is gitignored — real keys live here only
```

Set `window.rpcURL` in `config.js` to your Ethereum endpoint (Alchemy/Infura/…). If it's unset,
`connectEthWallet.js` falls back to a keyless public endpoint (publicnode), so the app still runs.

## Develop

```bash
npx gulp            # dev server (BrowserSync) serving src/ with live reload
```

## Build

```bash
npx gulp build      # compile SCSS, bundle + minify JS/CSS, cache-bust → output.nosync/dist
```

## Deploy

```bash
npm run push        # netlify deploy --prod  +  firebase deploy
```

## Layout

```
src/
├── *.html                # pages / apps
├── js/
│   ├── *.js              # per-page scripts (connectEthWallet, vltUSDC, flow, stack-*, …)
│   ├── config.example.js # RPC config template (copy → config.js, gitignored)
│   └── vendor/           # jQuery, web3, the Uniswap routing bundle
├── css/sass/             # Dore-theme SCSS → compiled CSS
└── ...
gulpfile.js               # build pipeline
```

## Notes

- `src/js/config.js`, `.env`, `node_modules/`, `output.nosync/`, and archived material in
  `src-bak/` are gitignored — never commit real RPC keys.
- The routing bundle (`src/js/vendor/uniswap-routing.js`) is rebuilt with
  `npm run bundle:routing` and is intentionally kept out of the gulp JS bundle.
- You interact with blockchain contracts directly and are responsible for your own transactions.
