(function ($) {
  "use strict";

  const ETHEREUM_CHAIN_ID = 1;
  const VLT_PAIR_TOKEN0 = "0x6b785a0322126826d8226d77e173d75dafb84d11";
  const VLT_PAIR_TOKEN1 = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

  var CONFIG = {
    fixedSupply: 1800000,
    rpcBurstSize: 4,
    rpcWindowMs: 1000,
    endpointDelayMs: 700,
    endpointAttempts: 2,
    endpoints: [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.llamarpc.com"
    ],
    addresses: {
      vlt: "0x6b785a0322126826d8226d77e173d75dafb84d11",
      weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      router: "0xf164fC0Ec4E93095b804a4795bBe1e041497b92a",
      pair: "0x966053ca4fca049173eb1f27e4cb168ccb794534"
    },
    chainId: ETHEREUM_CHAIN_ID,
    pairToken0: VLT_PAIR_TOKEN0,
    pairToken1: VLT_PAIR_TOKEN1,
    ladder: [0.1, 0.5, 1, 2.5, 5]
  };

  var ROUTER_ABI = [
    {
      "inputs": [
        { "internalType": "uint256", "name": "amountOut", "type": "uint256" },
        { "internalType": "address[]", "name": "path", "type": "address[]" }
      ],
      "name": "getAmountsIn",
      "outputs": [
        { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
        { "internalType": "address[]", "name": "path", "type": "address[]" }
      ],
      "name": "getAmountsOut",
      "outputs": [
        { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];

  var PAIR_ABI = [
    {
      "inputs": [],
      "name": "getReserves",
      "outputs": [
        { "internalType": "uint112", "name": "reserve0", "type": "uint112" },
        { "internalType": "uint112", "name": "reserve1", "type": "uint112" },
        { "internalType": "uint32", "name": "blockTimestampLast", "type": "uint32" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];

  var state = {
    web3: null,
    endpoint: "",
    router: null,
    pair: null,
    reserves: null,
    ethUsd: null,
    vltSpotEth: null,
    blockNumber: null,
    ready: false
  };
  var rpcQueue = Promise.resolve();
  var rpcRequestTimes = [];

  function setField(name, value) {
    $("[data-calc-field='" + name + "']").text(value);
  }

  function toDecimalString(value, places) {
    var fixed;

    if (!isFinite(value) || value <= 0) {
      return "0";
    }

    fixed = value.toFixed(places || 18);
    return fixed.replace(/\.?0+$/, "");
  }

  function toWei(value) {
    return state.web3.utils.toWei(toDecimalString(value, 18), "ether");
  }

  function fromWei(value) {
    return parseFloat(state.web3.utils.fromWei(value.toString(), "ether"));
  }

  function formatNumber(value, decimals) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    });
  }

  function formatEth(value) {
    if (!isFinite(value)) {
      return "-";
    }

    if (value === 0) {
      return "0 ETH";
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: value < 1 ? 6 : 4,
      minimumFractionDigits: 0
    }) + " ETH";
  }

  function formatUsd(value) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value < 1 ? 4 : 0
    });
  }

  function formatUsdUnit(value) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value < 1 ? 5 : 3
    });
  }

  function formatEthUnit(value) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: 8,
      minimumFractionDigits: 0
    }) + " ETH";
  }

  function formatPercent(value, decimals) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    }) + "%";
  }

  function formatK(value) {
    if (!isFinite(value)) {
      return "-";
    }

    return formatNumber(value, 2) + " VLT*ETH";
  }

  function formatMultiple(value) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }) + "x";
  }

  function constantProductK() {
    return state.reserves.vlt * state.reserves.weth;
  }

  function currentLpPercent() {
    return (state.reserves.vlt / CONFIG.fixedSupply) * 100;
  }

  function firstFormulaStep(percent) {
    return Math.floor((percent - 0.000001) / 5) * 5;
  }

  function formulaTarget(percent) {
    var targetVlt = CONFIG.fixedSupply * (percent / 100);
    var k = constantProductK();
    var targetEth = k / targetVlt;

    return {
      percent: percent,
      vlt: targetVlt,
      eth: targetEth,
      k: k,
      spotEth: targetEth / targetVlt
    };
  }

  function getAmountOut(amountIn, reserveIn, reserveOut) {
    var amountInWithFee = amountIn * 997;
    return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
  }

  function getAmountIn(amountOut, reserveIn, reserveOut) {
    if (amountOut >= reserveOut) {
      return Infinity;
    }

    return ((reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997));
  }

  function priceImpact(averageEthPerVlt) {
    if (!state.vltSpotEth || !isFinite(averageEthPerVlt)) {
      return "-";
    }

    return Math.max(0, ((averageEthPerVlt / state.vltSpotEth) - 1) * 100).toLocaleString(undefined, {
      maximumFractionDigits: 2
    }) + "%";
  }

  function makeWeb3(endpoint) {
    return new Web3(new Web3.providers.HttpProvider(endpoint, { timeout: 12000 }));
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  async function callRpc(request) {
    await reserveRpcSlot();
    return request();
  }

  async function reserveRpcSlot() {
    var run = rpcQueue.then(async function () {
      var now = Date.now();
      var waitMs;

      pruneRpcWindow(now);

      if (rpcRequestTimes.length >= CONFIG.rpcBurstSize) {
        waitMs = Math.max(0, CONFIG.rpcWindowMs - (now - rpcRequestTimes[0]));
        if (waitMs > 0) {
          await sleep(waitMs);
        }

        now = Date.now();
        pruneRpcWindow(now);
      }

      rpcRequestTimes.push(now);
    });

    rpcQueue = run.catch(function () {});
    return run;
  }

  function pruneRpcWindow(now) {
    while (rpcRequestTimes.length && now - rpcRequestTimes[0] >= CONFIG.rpcWindowMs) {
      rpcRequestTimes.shift();
    }
  }

  function connectReadonly(endpoint) {
    var web3 = makeWeb3(endpoint);

    state.web3 = web3;
    state.endpoint = endpoint;
    state.router = new web3.eth.Contract(ROUTER_ABI, CONFIG.addresses.router);
    state.pair = new web3.eth.Contract(PAIR_ABI, CONFIG.addresses.pair);
  }

  async function loadMarketWithFallback() {
    var lastError = null;
    var i;
    var attempt;

    for (i = 0; i < CONFIG.endpoints.length; i += 1) {
      for (attempt = 0; attempt < CONFIG.endpointAttempts; attempt += 1) {
        try {
          connectReadonly(CONFIG.endpoints[i]);
          await loadMarket();
          return;
        } catch (error) {
          lastError = error;
          await sleep(CONFIG.endpointDelayMs);
        }
      }
    }

    throw lastError || new Error("No public Ethereum RPC endpoint responded.");
  }

  async function loadMarket() {
    var reserves = callRpc(function () {
      return state.pair.methods.getReserves().call();
    });
    var token0IsVlt = CONFIG.pairToken0.toLowerCase() === CONFIG.addresses.vlt.toLowerCase();
    var token0IsWeth = CONFIG.pairToken0.toLowerCase() === CONFIG.addresses.weth.toLowerCase();
    var block;
    var ethUsdAmounts;
    var vltEthAmounts;

    if (!token0IsVlt && !token0IsWeth) {
      throw new Error("Configured VLT/WETH pair token order is invalid.");
    }

    block = callRpc(function () {
      return state.web3.eth.getBlockNumber();
    });
    ethUsdAmounts = callRpc(function () {
      return state.router.methods.getAmountsOut(toWei(1), [CONFIG.addresses.weth, CONFIG.addresses.usdc]).call();
    });
    vltEthAmounts = callRpc(function () {
      return state.router.methods.getAmountsOut(toWei(1), [CONFIG.addresses.vlt, CONFIG.addresses.weth]).call();
    });
    reserves = await reserves;
    block = await block;
    ethUsdAmounts = await ethUsdAmounts;
    vltEthAmounts = await vltEthAmounts;

    state.reserves = {
      vlt: fromWei(token0IsVlt ? reserves.reserve0 : reserves.reserve1),
      weth: fromWei(token0IsVlt ? reserves.reserve1 : reserves.reserve0)
    };
    state.ethUsd = Number(ethUsdAmounts[1]) / 1e6;
    state.vltSpotEth = fromWei(vltEthAmounts[1]);
    state.blockNumber = Number(block);
    state.ready = true;
  }

  async function quoteEthToVlt(ethAmount) {
    var amounts;

    try {
      amounts = await callRpc(function () {
        return state.router.methods.getAmountsOut(toWei(ethAmount), [CONFIG.addresses.weth, CONFIG.addresses.vlt]).call();
      });
      return {
        vlt: fromWei(amounts[1]),
        source: "Router quote"
      };
    } catch (error) {
      return {
        vlt: getAmountOut(ethAmount, state.reserves.weth, state.reserves.vlt),
        source: "Pool formula"
      };
    }
  }

  async function quoteVltOut(vltAmount) {
    var amounts;

    if (vltAmount >= state.reserves.vlt) {
      return {
        eth: Infinity,
        source: "Unavailable"
      };
    }

    try {
      amounts = await callRpc(function () {
        return state.router.methods.getAmountsIn(toWei(vltAmount), [CONFIG.addresses.weth, CONFIG.addresses.vlt]).call();
      });
      return {
        eth: fromWei(amounts[0]),
        source: "Router quote"
      };
    } catch (error) {
      return {
        eth: getAmountIn(vltAmount, state.reserves.weth, state.reserves.vlt),
        source: "Pool formula"
      };
    }
  }

  function syncStatus() {
    setField("eth-usd", formatUsd(state.ethUsd));
    setField("vlt-spot", formatEthUnit(state.vltSpotEth) + " / " + formatUsdUnit(state.vltSpotEth * state.ethUsd));
    setField("pool-reserves", formatNumber(state.reserves.vlt, 0) + " VLT / " + formatNumber(state.reserves.weth, 2) + " ETH");
    setField("updated", "Block " + formatNumber(state.blockNumber, 0));
  }

  function syncFormulaStatus() {
    var currentPercent = currentLpPercent();
    var defaultPercent = firstFormulaStep(currentPercent);

    setField("formula-x", formatNumber(state.reserves.vlt, 0) + " VLT");
    setField("formula-y", formatNumber(state.reserves.weth, 4) + " ETH");
    setField("formula-k", formatK(constantProductK()));
    setField("formula-current-percent", formatPercent(currentPercent, 3) + " of fixed supply");

    if (!$("#formula-percent-input").val()) {
      $("#formula-percent-input").val(toDecimalString(defaultPercent >= 5 ? defaultPercent : currentPercent, 4));
    }
  }

  async function updateDollarCalculator() {
    var usd = parseFloat($("#usd-input").val());
    var ethAmount;
    var quote;
    var avgEth;

    if (!state.ready || !isFinite(usd) || usd <= 0) {
      setField("usd-vlt", "-");
      setField("usd-eth", "-");
      setField("usd-average", "-");
      setField("usd-impact", "-");
      setField("usd-note", state.ready ? "Enter a dollar amount to estimate VLT." : "Waiting for live liquidity data.");
      return;
    }

    ethAmount = usd / state.ethUsd;
    quote = await quoteEthToVlt(ethAmount);
    avgEth = quote.vlt > 0 ? ethAmount / quote.vlt : Infinity;

    setField("usd-vlt", formatNumber(quote.vlt, 2) + " VLT");
    setField("usd-eth", formatEth(ethAmount));
    setField("usd-average", formatEthUnit(avgEth) + " / " + formatUsdUnit(avgEth * state.ethUsd));
    setField("usd-impact", priceImpact(avgEth));
    setField("usd-note", quote.source + ". Estimates exclude gas and slippage settings.");
  }

  async function updateSupplyCalculator() {
    var percent = parseFloat($("#percent-input").val());
    var vltAmount;
    var quote;
    var avgEth;
    var usd;

    if (!state.ready || !isFinite(percent) || percent <= 0) {
      setField("supply-vlt", "-");
      setField("supply-eth", "-");
      setField("supply-usd", "-");
      setField("supply-average", "-");
      setField("supply-note", state.ready ? "Enter a supply percent to estimate cost." : "Waiting for live liquidity data.");
      return;
    }

    vltAmount = CONFIG.fixedSupply * (percent / 100);

    if (vltAmount >= state.reserves.vlt) {
      setField("supply-vlt", formatNumber(vltAmount, 2) + " VLT");
      setField("supply-eth", "-");
      setField("supply-usd", "-");
      setField("supply-average", "-");
      setField("supply-note", "Not available from current VLT/WETH pool liquidity.");
      return;
    }

    quote = await quoteVltOut(vltAmount);
    avgEth = quote.eth / vltAmount;
    usd = quote.eth * state.ethUsd;

    setField("supply-vlt", formatNumber(vltAmount, 2) + " VLT");
    setField("supply-eth", formatEth(quote.eth));
    setField("supply-usd", formatUsd(usd));
    setField("supply-average", formatEthUnit(avgEth) + " / " + formatUsdUnit(avgEth * state.ethUsd));
    setField("supply-note", quote.source + ". " + poolStatus(vltAmount));
  }

  function poolStatus(vltAmount) {
    var share = vltAmount / state.reserves.vlt;

    if (vltAmount >= state.reserves.vlt) {
      return "Not available from current VLT/WETH pool liquidity.";
    }

    if (share > 0.25) {
      return "High pool impact.";
    }

    if (share > 0.1) {
      return "Meaningful pool impact.";
    }

    return "Within current pool liquidity.";
  }

  async function renderLadder() {
    var $body = $("[data-calc-field='ladder-body']");
    var rows = [];
    var i;
    var percent;
    var vltAmount;
    var quotePromises = [];
    var quote;
    var avgEth;

    for (i = 0; i < CONFIG.ladder.length; i += 1) {
      percent = CONFIG.ladder[i];
      vltAmount = CONFIG.fixedSupply * (percent / 100);

      if (vltAmount >= state.reserves.vlt) {
        rows.push(
          "<tr>" +
            "<td>" + percent + "%</td>" +
            "<td>" + formatNumber(vltAmount, 0) + "</td>" +
            "<td>-</td>" +
            "<td>-</td>" +
            "<td>-</td>" +
          "</tr>"
        );
      } else {
        quotePromises.push({
          index: rows.length,
          percent: percent,
          vltAmount: vltAmount,
          quote: quoteVltOut(vltAmount)
        });
        rows.push("");
      }
    }

    for (i = 0; i < quotePromises.length; i += 1) {
      quote = await quotePromises[i].quote;
      avgEth = quote.eth / quotePromises[i].vltAmount;
      rows[quotePromises[i].index] = (
        "<tr>" +
          "<td>" + quotePromises[i].percent + "%</td>" +
          "<td>" + formatNumber(quotePromises[i].vltAmount, 0) + "</td>" +
          "<td>" + formatEth(quote.eth) + "</td>" +
          "<td>" + formatUsd(quote.eth * state.ethUsd) + "</td>" +
          "<td>" + formatEthUnit(avgEth) + " / " + formatUsdUnit(avgEth * state.ethUsd) + "</td>" +
        "</tr>"
      );
    }

    $body.html(rows.join(""));
  }

  function updateFormulaCalculator() {
    var percent = parseFloat($("#formula-percent-input").val());
    var currentPercent;
    var target;

    if (!state.ready || !state.reserves) {
      setField("formula-target-vlt", "-");
      setField("formula-target-eth", "-");
      setField("formula-target-price", "-");
      setField("formula-target-market-cap", "-");
      setField("formula-note", "Waiting for live liquidity data.");
      return;
    }

    currentPercent = currentLpPercent();

    if (!isFinite(percent) || percent <= 0) {
      setField("formula-target-vlt", "-");
      setField("formula-target-eth", "-");
      setField("formula-target-price", "-");
      setField("formula-target-market-cap", "-");
      setField("formula-note", "Enter a percent of fixed supply left in the LP.");
      return;
    }

    if (percent > currentPercent + 0.000001) {
      setField("formula-target-vlt", "-");
      setField("formula-target-eth", "-");
      setField("formula-target-price", "-");
      setField("formula-target-market-cap", "-");
      setField("formula-note", "Choose " + formatPercent(currentPercent, 3) + " or less. That is the current VLT left in the pool.");
      return;
    }

    target = formulaTarget(percent);

    setField("formula-target-vlt", formatNumber(target.vlt, 0) + " VLT");
    setField("formula-target-eth", formatEth(target.eth));
    setField("formula-target-price", formatEthUnit(target.spotEth) + " / " + formatUsdUnit(target.spotEth * state.ethUsd));
    setField("formula-target-market-cap", formatUsd(target.spotEth * state.ethUsd * CONFIG.fixedSupply));
    setField("formula-note", "Pure x*y=k spot estimate. This excludes swap fees, gas, slippage, price movement, and MEV.");
  }

  function renderFormulaTable() {
    var $body = $("[data-calc-field='formula-body']");
    var rows = [];
    var currentPercent = currentLpPercent();
    var percents = formulaTablePercents(currentPercent);
    var i;
    var target;

    for (i = 0; i < percents.length; i += 1) {
      target = formulaTarget(percents[i]);
      rows.push(renderFormulaRow(percents[i], target));
    }

    $body.html(rows.join(""));
  }

  function formulaTablePercents(currentPercent) {
    var values = [];
    var firstStep = firstFormulaStep(currentPercent);
    var percent;
    var lowTail = [5, 4, 3, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01];
    var i;

    addFormulaPercent(values, currentPercent);

    if (firstStep >= 5) {
      addFormulaPercent(values, firstStep);
      percent = firstStep - 15;

      while (percent >= 5) {
        addFormulaPercent(values, percent);
        percent -= 15;
      }
    }

    for (i = 0; i < lowTail.length; i += 1) {
      addFormulaPercent(values, lowTail[i]);
    }

    return values;
  }

  function addFormulaPercent(values, percent) {
    var i;

    if (percent <= 0) {
      return;
    }

    for (i = 0; i < values.length; i += 1) {
      if (Math.abs(values[i] - percent) < 0.000001) {
        return;
      }
    }

    values.push(percent);
  }

  function renderFormulaRow(percent, target) {
    var spotUsd = target.spotEth * state.ethUsd;
    var lpValue = target.eth * state.ethUsd * 2;
    var marketCap = spotUsd * CONFIG.fixedSupply;
    var currentSpot = state.reserves.weth / state.reserves.vlt;
    var percentDecimals = percent === currentLpPercent() ? 3 : (percent < 1 ? 2 : 0);

    return (
      "<tr>" +
        "<td>" + formatPercent(percent, percentDecimals) + "</td>" +
        "<td>" + formatNumber(target.vlt, 0) + "</td>" +
        "<td>" + formatMultiple(target.spotEth / currentSpot) + "</td>" +
        "<td>" + formatUsd(lpValue) + "</td>" +
        "<td>" + formatUsd(marketCap) + "</td>" +
        "<td>" + formatUsdUnit(spotUsd) + "</td>" +
      "</tr>"
    );
  }

  function debounce(fn, delay) {
    var timer;

    return function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, delay);
    };
  }

  function bindInputs() {
    var updateDollars = debounce(updateDollarCalculator, 180);
    var updateSupply = debounce(updateSupplyCalculator, 180);
    var updateFormula = debounce(updateFormulaCalculator, 180);

    $("[data-calculator='dollars']").on("submit", function (event) {
      event.preventDefault();
      updateDollarCalculator();
    });

    $("[data-calculator='supply']").on("submit", function (event) {
      event.preventDefault();
      updateSupplyCalculator();
    });

    $("[data-calculator='formula']").on("submit", function (event) {
      event.preventDefault();
      updateFormulaCalculator();
    });

    $("#usd-input").on("input", updateDollars);
    $("#percent-input").on("input", updateSupply);
    $("#formula-percent-input").on("input", updateFormula);
  }

  async function initCalculator() {
    if (!window.Web3) {
      throw new Error("Web3 library did not load.");
    }

    setField("updated", "Connecting");
    setField("updated", "Reading pool");
    await loadMarketWithFallback();
    syncStatus();
    syncFormulaStatus();
    await Promise.all([updateDollarCalculator(), updateSupplyCalculator(), renderLadder()]);
    updateFormulaCalculator();
    renderFormulaTable();
  }

  $(function () {
    if (!$(".calculator-section").length) {
      return;
    }

    bindInputs();
    initCalculator().catch(function (error) {
      setField("eth-usd", "Unavailable");
      setField("vlt-spot", "Unavailable");
      setField("pool-reserves", "Unavailable");
      setField("updated", "RPC error");
      setField("usd-note", "Unable to load live Ethereum data. Try refreshing in a moment.");
      setField("supply-note", "Unable to load live Ethereum data. Try refreshing in a moment.");
      setField("formula-note", "Unable to load live Ethereum data. Try refreshing in a moment.");
      setField("formula-x", "Unavailable");
      setField("formula-y", "Unavailable");
      setField("formula-k", "Unavailable");
      setField("formula-current-percent", "Unavailable");
      $("[data-calc-field='ladder-body']").html("<tr><td colspan='5'>Unable to load live Ethereum data from the public RPC endpoints.</td></tr>");
      $("[data-calc-field='formula-body']").html("<tr><td colspan='6'>Unable to load live Ethereum data from the public RPC endpoints.</td></tr>");
      if (window.console && window.console.warn) {
        window.console.warn("VLT calculator failed:", error);
      }
    });
  });
})(jQuery);
