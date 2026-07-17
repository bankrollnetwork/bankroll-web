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
const { Token, CurrencyAmount, TradeType, Percent, Ether } = require("@uniswap/sdk-core");
const { Pool, TickMath, nearestUsableTick, Tick, Route: RouteV3 } = require("@uniswap/v3-sdk");
const { Pair, Route: RouteV2 } = require("@uniswap/v2-sdk");
const { Trade, MixedRouteSDK } = require("@uniswap/router-sdk");
const { SwapRouter } = require("@uniswap/universal-router-sdk");

// Shared context: SDK Token/pool/pair objects from the plain values the browser read via web3.
// p carries: chainId, usdc:{address,decimals}, weth:{address}, vlt:{address,decimals},
//   v3:{fee, tickSpacing, sqrtPriceX96, tick, liquidity}, v2:{wethReserve, vltReserve}
// — all numeric fields decimal strings (BigintIsh; keeps every jsbi instance inside this module).
function buildContext(p) {
  const USDC = new Token(p.chainId, p.usdc.address, p.usdc.decimals, "USDC");
  const WETH = new Token(p.chainId, p.weth.address, 18, "WETH");
  const VLT = new Token(p.chainId, p.vlt.address, p.vlt.decimals, "VLT");
  const ETH = Ether.onChain(p.chainId); // native; SwapRouter emits WRAP_ETH / UNWRAP_WETH commands

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

  return { USDC, WETH, VLT, ETH, pool, pair };
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

// Legacy zap-route entry (Deposit tab): fixed USDC → WETH → VLT, output to the ZapHelper,
// which enforces the real minVltOut/minShares itself. p additionally carries
// recipient, amountIn, slippageBps, deadline.
async function buildSwapData(p) {
  const c = buildContext(p);
  const route = new MixedRouteSDK([c.pool, c.pair], c.USDC, c.VLT);
  const trade = await Trade.fromRoute(route, CurrencyAmount.fromRawAmount(c.USDC, String(p.amountIn)), TradeType.EXACT_INPUT);
  const r = encode(trade, p);
  return { calldata: r.calldata, quotedVltOut: r.quotedOut, routeText: r.routeText };
}

// Generalized pair-scoped swap (Swap tab): any direction over {ETH, USDC, VLT}, sent by the
// user's wallet DIRECTLY to the Universal Router (no ZapHelper). Native ETH legs wrap/unwrap
// inside the router; ERC-20 inputs are pulled via Permit2 (approved separately by the client).
// p as buildSwapData plus tokenIn / tokenOut ∈ "ETH" | "USDC" | "VLT" (recipient = the user).
async function buildSwap(p) {
  const c = buildContext(p);
  const cur = { ETH: c.ETH, USDC: c.USDC, VLT: c.VLT };
  const IN = cur[p.tokenIn];
  const OUT = cur[p.tokenOut];
  if (!IN || !OUT || IN === OUT) throw new Error("unsupported pair " + p.tokenIn + "->" + p.tokenOut);

  // Route legs: ETH↔USDC crosses only the V3 pool, ETH↔VLT only the V2 pair, USDC↔VLT both.
  // Single-protocol legs use that protocol's own Route class (native-ETH support is first-class
  // there); only the two-hop USDC↔VLT needs a mixed route.
  const wantsUsdc = p.tokenIn === "USDC" || p.tokenOut === "USDC";
  const wantsVlt = p.tokenIn === "VLT" || p.tokenOut === "VLT";
  let route;
  if (wantsUsdc && wantsVlt) {
    route = new MixedRouteSDK(p.tokenIn === "USDC" ? [c.pool, c.pair] : [c.pair, c.pool], IN, OUT);
  } else if (wantsUsdc) {
    route = new RouteV3([c.pool], IN, OUT);
  } else {
    route = new RouteV2([c.pair], IN, OUT);
  }
  const trade = await Trade.fromRoute(route, CurrencyAmount.fromRawAmount(IN, String(p.amountIn)), TradeType.EXACT_INPUT);
  return encode(trade, p);
}

// Human description of the route the SDK actually chose, e.g. "USDC →(V3 0.05%) WETH →(V2 0.30%) VLT".
function describeRoute(trade) {
  try {
    const r = trade.routes[0]; // single mixed route (this module never splits)
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

module.exports = { buildSwapData, buildSwap };
