// Browserify/esbuild ENTRY for the vault test client's optional Uniswap-SDK zap route.
// Bundled (IIFE, global `UniswapRouting`) into src/js/vendor/uniswap-routing.js via:
//   npm run bundle:routing
//
// The vault test client is a no-build <script> page, so the @uniswap/universal-router-sdk stack
// (+ v3/v2/router/sdk-core) is bundled here and exposed as one global. The browser reads pool
// state via web3 and passes it in as plain decimal strings (BigintIsh) — keeping all SDK objects
// (and the single deduped jsbi) inside this module so there are no cross-realm instance issues.
//
// Builds the fixed USDC →(V3 fee) WETH →(V2) VLT mixed route and returns Universal-Router
// `execute(...)` calldata, which the (route-agnostic) ZapHelper runs verbatim against its
// whitelisted Universal Router. The V3 pool is modeled as a single full-range position at the
// live (sqrtPriceX96, tick, liquidity) — accurate for moderate swaps with no tick crossing; the
// internal min-out uses a slippage buffer and the ZapHelper enforces the real minVltOut/minShares.
const { Token, CurrencyAmount, TradeType, Percent } = require("@uniswap/sdk-core");
const { Pool, TickMath, nearestUsableTick, Tick } = require("@uniswap/v3-sdk");
const { Pair } = require("@uniswap/v2-sdk");
const { Trade, MixedRouteSDK } = require("@uniswap/router-sdk");
const { SwapRouter } = require("@uniswap/universal-router-sdk");

// p = {
//   chainId, recipient, amountIn, slippageBps, deadline,
//   usdc:{address,decimals}, weth:{address}, vlt:{address,decimals},
//   v3:{fee, tickSpacing, sqrtPriceX96, tick, liquidity},
//   v2:{wethReserve, vltReserve},
// }  — all numeric fields are decimal strings.
async function buildSwapData(p) {
  const USDC = new Token(p.chainId, p.usdc.address, p.usdc.decimals, "USDC");
  const WETH = new Token(p.chainId, p.weth.address, 18, "WETH");
  const VLT = new Token(p.chainId, p.vlt.address, p.vlt.decimals, "VLT");

  // V3 USDC/WETH pool, modeled as one full-range position with the live liquidity.
  const spacing = Number(p.v3.tickSpacing);
  const L = String(p.v3.liquidity);
  const minTick = nearestUsableTick(TickMath.MIN_TICK, spacing);
  const maxTick = nearestUsableTick(TickMath.MAX_TICK, spacing);
  const ticks = [
    new Tick({ index: minTick, liquidityGross: L, liquidityNet: L }),
    new Tick({ index: maxTick, liquidityGross: L, liquidityNet: "-" + L }),
  ];
  const pool = new Pool(USDC, WETH, Number(p.v3.fee), String(p.v3.sqrtPriceX96), L, Number(p.v3.tick), ticks);

  // V2 WETH/VLT pair from reserves (Pair sorts tokens internally).
  const pair = new Pair(
    CurrencyAmount.fromRawAmount(WETH, String(p.v2.wethReserve)),
    CurrencyAmount.fromRawAmount(VLT, String(p.v2.vltReserve))
  );

  const route = new MixedRouteSDK([pool, pair], USDC, VLT);
  const trade = await Trade.fromRoute(route, CurrencyAmount.fromRawAmount(USDC, String(p.amountIn)), TradeType.EXACT_INPUT);

  const { calldata } = SwapRouter.swapCallParameters(trade, {
    slippageTolerance: new Percent(p.slippageBps, 10000),
    recipient: p.recipient, // route output to the ZapHelper (it measures its own balance delta)
    deadlineOrPreviousBlockhash: String(p.deadline),
  });
  return { calldata: calldata, quotedVltOut: trade.outputAmount.quotient.toString(), routeText: describeRoute(trade) };
}

// Human description of the route the SDK actually chose, e.g. "USDC →(V3 0.05%) WETH →(V2 0.30%) VLT".
function describeRoute(trade) {
  try {
    const r = trade.routes[0]; // single mixed route for USDC→VLT
    const sym = r.path.map((t) => t.symbol || (t.address || "").slice(0, 6));
    let s = sym[0];
    r.pools.forEach((pool, i) => {
      const hop = pool instanceof Pool ? "V3 " + (Number(pool.fee) / 10000) + "%"
        : pool instanceof Pair ? "V2 0.30%"
        : "?";
      s += " →(" + hop + ") " + sym[i + 1];
    });
    return s;
  } catch (e) {
    return null;
  }
}

module.exports = { buildSwapData };
