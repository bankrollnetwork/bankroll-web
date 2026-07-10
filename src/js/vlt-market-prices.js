(function ($) {
  "use strict";

  const ETHEREUM_CHAIN_ID = 1;
  const VLT_PAIR_TOKEN0 = "0x6b785a0322126826d8226d77e173d75dafb84d11";
  const VLT_PAIR_TOKEN1 = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

  var CONFIG = {
    fixedSupply: 1800000,
    launchTimestamp: 1592022548,
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
    pairToken1: VLT_PAIR_TOKEN1
  };

  var rpcQueue = Promise.resolve();
  var rpcRequestTimes = [];

  var ROUTER_ABI = [
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

  function setPriceField(name, value) {
    $("[data-price-field='" + name + "']").text(value);
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

  async function readMarketWithFallback() {
    var lastError = null;
    var i;
    var attempt;

    for (i = 0; i < CONFIG.endpoints.length; i += 1) {
      for (attempt = 0; attempt < CONFIG.endpointAttempts; attempt += 1) {
        try {
          return await readMarketFromEndpoint(CONFIG.endpoints[i]);
        } catch (error) {
          lastError = error;
          await sleep(CONFIG.endpointDelayMs);
        }
      }
    }

    throw lastError || new Error("No public Ethereum RPC endpoint responded.");
  }

  async function readMarketFromEndpoint(endpoint) {
    var web3 = makeWeb3(endpoint);
    var router = new web3.eth.Contract(ROUTER_ABI, CONFIG.addresses.router);
    var pair = new web3.eth.Contract(PAIR_ABI, CONFIG.addresses.pair);
    var ethUsdAmounts;
    var vltEthAmounts;
    var reserves;
    var wethReserve;

    ethUsdAmounts = callRpc(function () {
      return router.methods.getAmountsOut(web3.utils.toWei("1", "ether"), [CONFIG.addresses.weth, CONFIG.addresses.usdc]).call();
    });
    vltEthAmounts = callRpc(function () {
      return router.methods.getAmountsOut(web3.utils.toWei("1", "ether"), [CONFIG.addresses.vlt, CONFIG.addresses.weth]).call();
    });
    reserves = callRpc(function () {
      return pair.methods.getReserves().call();
    });
    ethUsdAmounts = await ethUsdAmounts;
    vltEthAmounts = await vltEthAmounts;
    reserves = await reserves;
    wethReserve = fromWei(web3, CONFIG.pairToken0.toLowerCase() === CONFIG.addresses.weth.toLowerCase() ? reserves.reserve0 : reserves.reserve1);

    return {
      ethUsd: Number(ethUsdAmounts[1]) / 1e6,
      vltEth: fromWei(web3, vltEthAmounts[1]),
      wethReserve: wethReserve
    };
  }

  function fromWei(web3, value) {
    return parseFloat(web3.utils.fromWei(value.toString(), "ether"));
  }

  function formatUsd(value) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value < 1 ? 5 : 0
    });
  }

  function formatEth(value) {
    if (!isFinite(value)) {
      return "-";
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: 8,
      minimumFractionDigits: 0
    }) + " ETH";
  }

  function formatAge() {
    var now = Math.floor(Date.now() / 1000);
    var totalDays = Math.max(0, Math.floor((now - CONFIG.launchTimestamp) / 86400));
    var years = Math.floor(totalDays / 365);
    var days = totalDays % 365;
    return years + " years, " + days + " days";
  }

  async function initPrices() {
    var market;

    if (!$("[data-price-field]").length) {
      return;
    }

    if (!window.Web3) {
      throw new Error("Web3 library did not load.");
    }

    market = await readMarketWithFallback();

    setPriceField("market-cap", formatUsd(market.vltEth * market.ethUsd * CONFIG.fixedSupply));
    setPriceField("vlt-spot", formatUsd(market.vltEth * market.ethUsd));
    setPriceField("age", formatAge());
    setPriceField("liquidity", formatUsd(market.ethUsd * market.wethReserve * 2));
  }

  $(function () {
    initPrices().catch(function (error) {
      setPriceField("market-cap", "Unavailable");
      setPriceField("vlt-spot", "Unavailable");
      setPriceField("age", formatAge());
      setPriceField("liquidity", "Unavailable");
      if (window.console && window.console.warn) {
        window.console.warn("VLT market prices failed:", error);
      }
    });
  });
})(jQuery);
