let BANKROLL = {
    "rinkeby": {
        VLT: "0xcdeb88ba2bf9b98824f1f2293b1c7d603330dc7a",
        Stack: "",
        Life: "",
        USDC: "0xbaf95828cb73073b0339000254ed0029212feb4d",
        Router: "0xf164fC0Ec4E93095b804a4795bBe1e041497b92a",
        WETH: "0xc778417E063141139Fce010982780140Aa0cD5Ab",
        WBTC: "0xb81a042838de0e48fb672eec7b32f4e59574713e",
        Moon: {
            AMPL: {contract:"0x8DE95B8e307BE9Df7b5ec00EB8ceC392649Bf283", token:"0xb81a042838de0e48fb672eec7b32f4e59574713e"}
        }
    },
    "mainnet": {
        VLT: "0x6b785a0322126826d8226d77e173d75dafb84d11",
        AMPL: "0xd46ba6d942050d489dbd938a2c909a5d5039a161",
        WETHToken: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        Stack: "0x84A4eCCB81A1Fd0867C7682E2c85FFeF4538A2F4",
        Life: "0x3d76cd9723e0cc8875907CF944c147eE4baFB29E",
        Router: "0xf164fC0Ec4E93095b804a4795bBe1e041497b92a",
        VLTWETH_BAL: "",
        WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        Univ2Pool: "0x966053ca4fca049173eb1f27e4cb168ccb794534",
        StackPlus: {
            LINK: {token:"0x514910771af9ca656af840dff83e8264ecf986ca", stack:"0x7B3611b0AfFc27D212A68293831d3B55354B802F", name:"Chainlink", desc:""},
            DAI: {token:"0x6b175474e89094c44da98b954eedeac495271d0f", stack:"0x7a40ab4b8d016e4e76faea844543b033a00ab54d", name:"Dai", desc:""},
            BAT: {token:"0x0D8775F648430679A709E98d2b0Cb6250d2887EF", stack:"0x85cdDcE5C1889D84e10d97074b7Af007f2CaDCC5", name:"Basic Attention Token", desc:""},
            KNC: {token:"", stack:"", name:"", desc:""},
            LEND: {token:"", stack:"", name:"", desc:""}
        },
        Moon: {
            AMPL: {contract:"0x45B7A724DaDb55fAe51319184Ad6e2323287959e", token:"0xd46ba6d942050d489dbd938a2c909a5d5039a161", decimals:9}
        }

    }
}


var default_currency = 'USDT'
var currency = (typeof default_currency === 'undefined') ? 'USD' : default_currency


var vlt, stack, life, router, weth, collateral, stackplus, moon

async function networkReady() {

    let netId = await window.web3.eth.getChainId()
    var network = 'Unsupported network detected'
    switch (netId) {
        case 1:
            console.log('This is mainnet')
            network = 'Mainnet'
            if (BANKROLL) {
                BANKROLL.network = 'mainnet'
            }
            break
        case 2:
            console.log('This is the deprecated Morden test network.')
            break
        case 3:
            console.log('This is the ropsten test network.')
            break
        case 4:
            console.log('This is the Rinkeby test network.')
            network = 'Rinkeby'
            if (BANKROLL) {
                BANKROLL.network = 'rinkeby'
            }
            break
        case 42:
            console.log('This is the Kovan test network.')
            break
        default:
            console.log('This is an unknown network.')
    }


    $('#eth-network').text(network)
}

function getWeb3() {
    let web3js;

    if (window.web3 !== null) {
        web3js = window.web3
    } else {
        web3js = window.infura
    }

    return web3js;
}

//this is always called after init
async function initContracts() {
    let web3js = getWeb3();

    let options = {from: window.ethDefaultAddress}

    //Vault
    if (BANKROLL.network == 'mainnet'){
        stack = new web3js.eth.Contract(ABI_STACK, BANKROLL[BANKROLL.network].Stack, options)
        life = new web3js.eth.Contract(ABI_LIFE, BANKROLL[BANKROLL.network].Life, options)
        if (typeof(COLLATERAL_SYMBOL) !== 'undefined') {
            collateral = new web3js.eth.Contract(ABI_VLT, BANKROLL[BANKROLL.network].StackPlus[COLLATERAL_SYMBOL].token, options)
            stackplus = new web3js.eth.Contract(ABI_STACKPLUS, BANKROLL[BANKROLL.network].StackPlus[COLLATERAL_SYMBOL].stack, options)
        }
    }
    vlt = new web3js.eth.Contract(ABI_VLT, BANKROLL[BANKROLL.network].VLT, options)
    router = new web3js.eth.Contract(ABI_UNIROUTER, BANKROLL[BANKROLL.network].Router, options)
    weth = new web3js.eth.Contract(ABI_WETH, BANKROLL[BANKROLL.network].WETHToken, options)
    
    if (typeof(REWARD_SYMBOL) !== 'undefined') {
        moon = new web3js.eth.Contract(ABI_MOON, BANKROLL[BANKROLL.network].Moon[REWARD_SYMBOL].contract, options)
    }

    /*
    console.log('vlt.totalSupply', convertWeiToEth(await vlt.methods.totalSupply().call()))
    console.log('vltusdc.price', await getVLTUSDC())
    console.log('vlteth.price', await getVLTETH())
    console.log('ethusdc.price', await getETHUSDC())
    console.log('stack.totalSupply', await stack.methods.totalSupply().call())
    console.log('life.totalSupply', await life.methods.totalSupply().call())
    console.log('life.swapCollector', convertWeiToEth(await life.methods.swapCollector_().call()))
    console.log('eth.aum', await getPlatformUSDC())
    */

}

async function getCollateralUSDC() {
    let web3js = getWeb3()
    return (await router.methods.getAmountsOut(web3js.utils.toBN(1e18), [BANKROLL[BANKROLL.network].StackPlus[COLLATERAL_SYMBOL].token, BANKROLL[BANKROLL.network].WETH, BANKROLL[BANKROLL.network].USDC]).call())[2] / 1e6
}

async function getCollateralETH() {
    let web3js = getWeb3()
    return convertWeiToEth((await router.methods.getAmountsOut(web3js.utils.toBN(1e18), [BANKROLL[BANKROLL.network].StackPlus[COLLATERAL_SYMBOL].token, BANKROLL[BANKROLL.network].WETH]).call())[1])
}

async function getRewardUSDC(reward) {
    let web3js = getWeb3()
    return (await router.methods.getAmountsOut(web3js.utils.toBN(reward), [BANKROLL[BANKROLL.network].Moon[REWARD_SYMBOL].token, BANKROLL[BANKROLL.network].WETH, BANKROLL[BANKROLL.network].USDC]).call())[2] / 1e6
}

async function getVLTUSDC() {
    let web3js = getWeb3()
    return (await router.methods.getAmountsOut(web3js.utils.toBN(1e18), [BANKROLL[BANKROLL.network].VLT, BANKROLL[BANKROLL.network].WETH, BANKROLL[BANKROLL.network].USDC]).call())[2] / 1e6
}

async function getVLTETH() {
    let web3js = getWeb3()
    return convertWeiToEth((await router.methods.getAmountsOut(web3js.utils.toBN(1e18), [BANKROLL[BANKROLL.network].VLT, BANKROLL[BANKROLL.network].WETH]).call())[1])
}

async function getETHVLT(eth) {
    let web3js = getWeb3()
    return convertWeiToEth((await router.methods.getAmountsOut(web3js.utils.toBN(eth), [BANKROLL[BANKROLL.network].WETH, BANKROLL[BANKROLL.network].VLT]).call())[1])
}

async function getETHUSDC() {
    let web3js = getWeb3()
    return (await router.methods.getAmountsOut(web3js.utils.toBN(1e18), [BANKROLL[BANKROLL.network].WETH, BANKROLL[BANKROLL.network].USDC]).call())[1] / 1e6
}

async function getPlatformUSDC() {

    let vltMarketCap = 1800000 * await getVLTUSDC()
    let eth_price = await getETHUSDC()
    let lifeBalance = convertWeiToEth(await life.methods.totalEthBalance().call()) * eth_price
    let uniswapPool = convertWeiToEth(await weth.methods.balanceOf(BANKROLL[BANKROLL.network].Univ2Pool).call()) * eth_price

    return vltMarketCap + lifeBalance + uniswapPool
}

async function getRevertReason(txHash){

    const tx = await web3.eth.getTransaction(txHash)
  
    var result = await web3.eth.call(tx, tx.blockNumber)
  
    result = result.startsWith('0x') ? result : `0x${result}`
  
    if (result && result.substr(138)) {
  
      const reason = web3.utils.toAscii(result.substr(138))
      console.log('Revert reason:', reason)
      return reason
  
    } else {
  
      console.log('Cannot get reason - No return value')
  
    }
  
  }


function convertEthToWei(e) {
    return 1e18 * e
}

function convertWeiToEth(e) {
    return e / 1e18
}


function formatTxUrl(hash) {
    let domain = 'etherscan.io'

    if (BANKROLL.network == 'rinkeby') {
        domain = 'rinkeby.etherscan.io'
    }

    return `https://${domain}/tx/${hash}`
}


async function ethBalance() {
    if (window.web3) {
        return await web3.eth.getBalance(window.def)
    }

    return 0
}

async function getDefaultAddress() {
    if (window.ethDefaultAddress) {
        return window.ethDefaultAddress
    }

    return null
}

// Auto-connect on page load removed — `ethereum.enable()` requires a user gesture
// and didn't support EIP-6963 multi-wallet discovery. Wallet connection is now
// handled in connectEthWallet.js, which calls networkReady() and initContracts()
// from this file after the user clicks #connect-wallet.
