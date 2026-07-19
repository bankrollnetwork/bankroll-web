// Browserify/esbuild ENTRY for the vault test client's Uniswap routing.
// Bundled (IIFE, global `UniswapRouting`) into src/js/vendor/uniswap-routing.js via:
//   npm run bundle:routing
//
// The vault test client is a no-build <script> page, so the @uniswap/universal-router-sdk
// stack (+ v2/v3/v4/router/sdk-core) is bundled here and exposed as one global. The browser
// reads pool state via web3 and passes it in as plain decimal strings (BigintIsh) — keeping
// all SDK objects (and the single deduped jsbi) inside this module so there are no
// cross-realm instance issues.
//
// OPTIMAL ROUTING: buildSwap() no longer hardcodes one route per pair. It enumerates every
// viable candidate over the venue set the browser provided — the USDC/WETH V3 pools at each
// fee tier, the V2 USDC/WETH and WETH/VLT pairs, and (when present and not excluded) the V4
// VLT/USDC pool itself — quotes each candidate locally with the SDK's exact pool math, ranks
// by output, and encodes the best route the Universal Router can execute (falling back down
// the ranking if an encoding is unsupported). Candidates that fail to construct or quote are
// skipped, so a missing venue degrades gracefully rather than erroring.
//
// `includeV4: false` (the zap deposit/redeem legs) keeps the vault's own pool OUT of the
// candidate set: vault entry/exit flows must not self-trade the pool they are entering or
// exiting, and the deposit zap's buy-pressure property is defined against VLT's EXTERNAL
// market. The Swap tab is venue-neutral and includes it.
const JSBI = require("jsbi");
const { Token, CurrencyAmount, TradeType, Percent, Ether } = require("@uniswap/sdk-core");
const { Pool, TickMath, nearestUsableTick, Tick, Route: RouteV3 } = require("@uniswap/v3-sdk");
const { Pair, Route: RouteV2 } = require("@uniswap/v2-sdk");
const { Pool: V4Pool } = require("@uniswap/v4-sdk");
const { Trade, MixedRouteSDK } = require("@uniswap/router-sdk");
const { SwapRouter } = require("@uniswap/universal-router-sdk");

const NO_HOOKS = "0x0000000000000000000000000000000000000000";

// One full-range position at the live (sqrtPriceX96, tick, liquidity) — accurate for moderate
// swaps with no tick crossing; the internal min-out uses a slippage buffer and every consumer
// enforces its own on-chain bound (minOut / minVltOut / minUsdcOut).
function fullRangeTicks(spacing, L) {
  const minTick = nearestUsableTick(TickMath.MIN_TICK, spacing);
  const maxTick = nearestUsableTick(TickMath.MAX_TICK, spacing);
  return [
    new Tick({ index: minTick, liquidityGross: L, liquidityNet: L }),
    new Tick({ index: maxTick, liquidityGross: L, liquidityNet: "-" + L }),
  ];
}

function modelV3Pool(USDC, WETH, spec) {
  const spacing = Number(spec.tickSpacing);
  const L = String(spec.liquidity);
  return new Pool(
    USDC, WETH, Number(spec.fee), String(spec.sqrtPriceX96), L, Number(spec.tick),
    fullRangeTicks(spacing, L)
  );
}

// The V4 VLT/USDC pool (the vault's own, hookless). The browser supplies sqrtPriceX96 and the
// pool's ACTIVE liquidity from PoolManager storage; the tick is derived here.
function modelV4Pool(VLT, USDC, spec) {
  const spacing = Number(spec.tickSpacing);
  const L = String(spec.liquidity);
  const tick = TickMath.getTickAtSqrtRatio(JSBI.BigInt(String(spec.sqrtPriceX96)));
  return new V4Pool(
    VLT, USDC, Number(spec.fee), spacing, NO_HOOKS,
    String(spec.sqrtPriceX96), L, tick, fullRangeTicks(spacing, L)
  );
}

// Shared context: SDK Token/pool/pair objects from the plain values the browser read via web3.
// p carries: chainId, usdc:{address,decimals}, weth:{address}, vlt:{address,decimals},
//   v3Pools:[{fee,tickSpacing,sqrtPriceX96,tick,liquidity}, ...] (or legacy single v3),
//   v2:{wethReserve, vltReserve}, v2Usdc:{usdcReserve, wethReserve}|null,
//   v4:{sqrtPriceX96, liquidity, fee, tickSpacing}|null, includeV4 (default true).
function buildContext(p) {
  const USDC = new Token(p.chainId, p.usdc.address, p.usdc.decimals, "USDC");
  const WETH = new Token(p.chainId, p.weth.address, 18, "WETH");
  const VLT = new Token(p.chainId, p.vlt.address, p.vlt.decimals, "VLT");
  const ETH = Ether.onChain(p.chainId); // native; SwapRouter emits WRAP_ETH / UNWRAP_WETH

  const v3Specs = p.v3Pools || (p.v3 ? [p.v3] : []);
  const v3Pools = [];
  for (const spec of v3Specs) {
    try { v3Pools.push(modelV3Pool(USDC, WETH, spec)); } catch (e) { /* skip bad venue */ }
  }

  let pairWethVlt = null;
  if (p.v2) {
    pairWethVlt = new Pair(
      CurrencyAmount.fromRawAmount(WETH, String(p.v2.wethReserve)),
      CurrencyAmount.fromRawAmount(VLT, String(p.v2.vltReserve))
    );
  }
  let pairUsdcWeth = null;
  if (p.v2Usdc) {
    try {
      pairUsdcWeth = new Pair(
        CurrencyAmount.fromRawAmount(USDC, String(p.v2Usdc.usdcReserve)),
        CurrencyAmount.fromRawAmount(WETH, String(p.v2Usdc.wethReserve))
      );
    } catch (e) { /* skip */ }
  }
  let v4Pool = null;
  if (p.v4 && p.includeV4 !== false) {
    try { v4Pool = modelV4Pool(VLT, USDC, p.v4); } catch (e) { /* skip */ }
  }

  return { USDC, WETH, VLT, ETH, v3Pools, pairWethVlt, pairUsdcWeth, v4Pool };
}

// Every route worth quoting for the pair over the venues present. Construction is wrapped
// (a candidate that throws is skipped), so this list can be generous.
function candidateRoutes(c, tokenIn, tokenOut) {
  const cur = { ETH: c.ETH, USDC: c.USDC, VLT: c.VLT };
  const IN = cur[tokenIn];
  const OUT = cur[tokenOut];
  if (!IN || !OUT || IN === OUT) throw new Error("unsupported pair " + tokenIn + "->" + tokenOut);

  const wantsUsdc = tokenIn === "USDC" || tokenOut === "USDC";
  const wantsVlt = tokenIn === "VLT" || tokenOut === "VLT";
  const mk = [];

  if (wantsUsdc && !wantsVlt) {
    // ETH <-> USDC: every V3 tier, plus the V2 pair.
    for (const pool of c.v3Pools) mk.push(() => new RouteV3([pool], IN, OUT));
    if (c.pairUsdcWeth) mk.push(() => new RouteV2([c.pairUsdcWeth], IN, OUT));
  } else if (wantsVlt && !wantsUsdc) {
    // ETH <-> VLT: the direct V2 pair, plus (venue-neutral only) two-hop via USDC + the V4 pool.
    if (c.pairWethVlt) mk.push(() => new RouteV2([c.pairWethVlt], IN, OUT));
    if (c.v4Pool) {
      for (const pool of c.v3Pools) {
        mk.push(() => new MixedRouteSDK(tokenIn === "ETH" ? [pool, c.v4Pool] : [c.v4Pool, pool], IN, OUT));
      }
    }
  } else {
    // USDC <-> VLT: two-hop via WETH on every V3 tier, the pure-V2 two-hop, and V4 direct.
    if (c.pairWethVlt) {
      for (const pool of c.v3Pools) {
        mk.push(() => new MixedRouteSDK(tokenIn === "USDC" ? [pool, c.pairWethVlt] : [c.pairWethVlt, pool], IN, OUT));
      }
      if (c.pairUsdcWeth) {
        mk.push(() => new MixedRouteSDK(
          tokenIn === "USDC" ? [c.pairUsdcWeth, c.pairWethVlt] : [c.pairWethVlt, c.pairUsdcWeth], IN, OUT));
      }
    }
    if (c.v4Pool) mk.push(() => new MixedRouteSDK([c.v4Pool], IN, OUT));
  }

  const routes = [];
  for (const build of mk) {
    try { routes.push(build()); } catch (e) { /* venue unusable for this direction — skip */ }
  }
  return { IN, routes };
}

// Encode a trade + slippage/recipient/deadline into Universal Router execute() params.
function encode(trade, p) {
  const slippageTolerance = new Percent(p.slippageBps, 10000);
  const { calldata, value } = SwapRouter.swapCallParameters(trade, {
    slippageTolerance: slippageTolerance,
    recipient: p.recipient,
    deadlineOrPreviousBlockhash: String(p.deadline),
  });
  return {
    calldata: calldata,
    value: value, // nonzero (hex) when the input is native ETH — send as the tx value
    quotedOut: trade.outputAmount.quotient.toString(),
    minOut: trade.minimumAmountOut(slippageTolerance).quotient.toString(),
    routeText: describeRoute(trade),
  };
}

// Optimal-price swap over {ETH, USDC, VLT}: quote every candidate, rank by output, encode the
// best executable one. Returns the encode() shape plus bestOf (candidate count) and quotes
// (route/out per candidate, ranked) so the client can surface what the optimizer saw.
async function buildSwap(p) {
  const c = buildContext(p);
  const { IN, routes } = candidateRoutes(c, p.tokenIn, p.tokenOut);
  const amountIn = CurrencyAmount.fromRawAmount(IN, String(p.amountIn));

  const quoted = [];
  for (const route of routes) {
    try {
      const trade = await Trade.fromRoute(route, amountIn, TradeType.EXACT_INPUT);
      quoted.push({ trade, out: BigInt(trade.outputAmount.quotient.toString()) });
    } catch (e) { /* insufficient liquidity / bad hop for this size — skip */ }
  }
  if (!quoted.length) throw new Error("no viable route for " + p.tokenIn + "->" + p.tokenOut);
  quoted.sort((a, b) => (a.out === b.out ? 0 : a.out > b.out ? -1 : 1));

  let lastErr = null;
  for (const q of quoted) {
    try {
      const r = encode(q.trade, p);
      r.bestOf = quoted.length;
      r.quotes = quoted.map((x) => ({ route: describeRoute(x.trade), out: x.out.toString() }));
      return r;
    } catch (e) { lastErr = e; /* encoder can't express this route — try the next best */ }
  }
  throw lastErr;
}

// Legacy zap-route entry (Deposit tab / fork tooling): USDC -> VLT with the vault's own pool
// EXCLUDED (the buy-pressure leg is defined against VLT's external market, and a zap must not
// self-trade the pool it is entering). Now tier-optimized across the external venues.
// p additionally carries recipient, amountIn, slippageBps, deadline.
async function buildSwapData(p) {
  const r = await buildSwap(Object.assign({}, p, { tokenIn: "USDC", tokenOut: "VLT", includeV4: false }));
  return { calldata: r.calldata, quotedVltOut: r.quotedOut, routeText: r.routeText };
}

// Human description of the route a trade actually takes, e.g.
// "USDC →(V3 0.05%) WETH →(V2 0.30%) VLT" or "VLT →(V4 1%) USDC".
function describeRoute(trade) {
  try {
    const r = trade.routes[0]; // single route (this module never splits)
    const sym = r.path.map((t) => t.symbol || (t.address || "").slice(0, 6));
    let s = sym[0];
    r.pools.forEach((pool, i) => {
      const hop = pool instanceof V4Pool ? "V4 " + (Number(pool.fee) / 10000) + "%"
        : pool instanceof Pool ? "V3 " + (Number(pool.fee) / 10000) + "%"
        : pool instanceof Pair ? "V2 0.30%"
        : "?";
      s += " →(" + hop + ") " + sym[i + 1];
    });
    return s;
  } catch (e) {
    return null;
  }
}

module.exports = { buildSwapData, buildSwap };
