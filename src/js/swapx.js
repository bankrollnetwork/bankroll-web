//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TB4S2pvyX8uQsBPrTDWYCuSDfYSg6tMJm7',
    'shasta': 'TNKK3sLSBikAwVVwnCr16LGZ4kw9dZcqVP'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

/*
Mainnet Test

Daily - TWvNVtYeFgRtLkzzzLUahvSejQNTLqtTbu
TokenMint - TRPyZKJkCe958zrfyMf8vHJi84ai8dbaqL
GameHub - TNpvL6PddcnE1kPc8a7LcqNuYaocyMecux

 */

const feeLimit = 150e6

const fastAddress = 'TNYMAeKiTPKDgeeAtD7hebneYYDUt9QdoY'
const bnkrxAddress = 'TKSLNVrDjb7xCiAySZvjXB9SxxVFieZA7C'
const bnkrAddress = 'TNo59Khpq46FGf4sD7XSWYFNfYfbc8CqNK'
const quickSwapAddress = 'TGh44grzTvc3uHNrfNmcKP4sHXoH3RrbxB'
const reactorAddress = 'TCJyoZeCdrZm63KUkjbJY7yfRS5FKG5tW2'
const reactorAddressv2 = 'TGQWyLZtmirMF2bPvtzwgVRb6ktQEMrrwe'

let fastContract

var contractAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
let swapContract, bnkrMint, bnkrx, bnkr, quickSwap, reactor
var waiting = 0
let buyAmountInp, sellAmountInp, swapAmountInp, addAmountInp, removeAmountInp, buyEstimate, sellEstimate, addEstimate, removeEstimate, prices

// Unit prices for 1e6 sun of input (i.e. 1 token assuming 6 decimals).
// Refreshed by showPrice on a 30s interval. Estimates use these for instant
// linear approximation instead of hitting the chain on every keystroke.
let priceCache = {
    trxToBnkrx: 0n,
    bnkrxToTrx: 0n,
    bnkrToBnkrx: 0n
}

var players = {}


$(document).ready(async () => {
    initConnect(main);
})

async function main() {

    tronWeb = window.tronWeb

    setNetwork()
    updateReferrer()
    bindUI()

    prices = await getPrices()



    swapContract = await tronWeb.contract().at(contractAddress)
    fastContract = await tronWeb.contract().at(fastAddress)
    bnkrx = await tronWeb.contract().at(bnkrxAddress)
    bnkr = await tronWeb.contract().at(bnkrAddress)
    quickSwap = await tronWeb.contract().at(quickSwapAddress)
    reactor = await tronWeb.contract().at(reactorAddress)

    console.log('found tronweb')
    currentAddress = tronWeb.defaultAddress['base58']

    userTag(currentAddress)
    console.log('current address', currentAddress)

    //First UI render
    try {
        await mainLoop()
        await showPrice()
    } catch (e) {

    } finally {
        closeLoading()
    }

    //Detect new account
    //newAccount()

    // Schedule loops — RPC-firing intervals run at 60s to stay under the 6
    // req/sec limit (mainLoop alone fires ~20 calls per pass). watchSelectedWallet
    // is a pure local check on tronWeb.defaultAddress so it can poll faster.
    setInterval(mainLoop, 60000)
    setInterval(watchSelectedWallet, 5000)
    setInterval(showPrice, 60000)

}

function bindUI() {
    buyAmountInp = $('#buyAmount')
    sellAmountInp = $('#sellAmount')
    addAmountInp = $('#addAmount')
    removeAmountInp = $('#removeAmount')
    swapAmountInp = $('#bnkrAmount')
    buyEstimate = $('#buy-estimate')
    swapEstimate = $('#swap-bnkrx-estimate')
    sellEstimate = $('#sell-estimate')
    addEstimate = $('#add-liquidity-estimate')
    removeEstimate = $('#remove-liquidity-estimate')


    $('#swapingChb').change(async (e) => {
        let isSwaping = $(e.currentTarget).prop('checked')
        console.log('Enable Swaping: ', isSwaping)
        if (isSwaping) {
            enableSwap()
        } else {
            disableSwap()
        }
    })

    $('#bnkrSwapingChb').change(async (e) => {
        let isSwaping = $(e.currentTarget).prop('checked')
        console.log('Enable Strong Swaping: ', isSwaping)
        if (isSwaping) {
            enableQuickSwap()
        } else {
            disableQuickSwap()
        }
    })

    // Add/remove liquidity still hit the chain (their math depends on supply
    // ratios that change per call), so they need a sequence guard against
    // stale responses overwriting fresher input. The three single-hop
    // estimators use priceCache and are synchronous, so no guard needed.
    let addSeq = 0, removeSeq = 0

    // These three use the priceCache (refreshed every 30s by showPrice) for a
    // linear estimate — instant, no per-keystroke RPC. Trade-off: ignores
    // AMM slippage, so the estimate is accurate for small trades and slightly
    // optimistic for trades large relative to the reserves. The actual on-chain
    // call() inside buy/sell still uses live reserves, so this only affects
    // the displayed preview.
    let calcTokens = (e) => {
        let amount = Number.parseFloat(buyAmountInp.val().trim())
        if (!isFinite(amount) || amount <= 0) return buyEstimate.text('')
        if (priceCache.trxToBnkrx === 0n) return buyEstimate.text('')
        const out = BigInt(Math.floor(amount * 1e6)) * priceCache.trxToBnkrx / 1000000n
        buyEstimate.text(`${numeral(tronWeb.fromSun(out)).format('0.000 a').toUpperCase()} BNKRX`)
    }

    let calcSwapBNKRX = (e) => {
        let amount = Number.parseFloat(swapAmountInp.val().trim())
        if (!isFinite(amount) || amount <= 0) return swapEstimate.text('')
        if (priceCache.bnkrToBnkrx === 0n) return swapEstimate.text('')
        const out = BigInt(Math.floor(amount * 1e6)) * priceCache.bnkrToBnkrx / 1000000n
        swapEstimate.text(`${numeral(tronWeb.fromSun(out)).format('0.000 a').toUpperCase()} BNKRX`)
    }

    let calcTRX = (e) => {
        let amount = Number.parseFloat(sellAmountInp.val().trim())
        if (!isFinite(amount) || amount <= 0) return sellEstimate.text('')
        if (priceCache.bnkrxToTrx === 0n) return sellEstimate.text('')
        const out = BigInt(Math.floor(amount * 1e6)) * priceCache.bnkrxToTrx / 1000000n
        sellEstimate.text(`${numeral(tronWeb.fromSun(out)).format('0.000 a').toUpperCase()} TRX`)
    }

    let calcSwap = async (e) => {
        const mySeq = ++addSeq
        let amount = Number.parseFloat(addAmountInp.val().trim())
        if (!isFinite(amount) || amount <= 0) return addEstimate.text('')
        let supply = await swapContract.totalSupply().call()
        if (mySeq !== addSeq) return
        if (supply <= 0n) return
        amount = tronWeb.toSun(amount)
        amount = await swapContract.getTrxToLiquidityInputPrice(amount).call()
        if (mySeq !== addSeq) return
        let bnkrAmount = (await swapContract.getLiquidityToReserveInputPrice(amount).call())[1]
        if (mySeq !== addSeq) return
        addEstimate.text(`${formatSun(amount)} SWAP ; ${formatSun(bnkrAmount)} BNKRX required`)
    }

    let calcReserve = async (e) => {
        const mySeq = ++removeSeq
        let amount = Number.parseFloat(removeAmountInp.val().trim())
        if (!isFinite(amount) || amount <= 0) return removeEstimate.text('')
        amount = tronWeb.toSun(amount)
        amount = await swapContract.getLiquidityToReserveInputPrice(amount).call()
        if (mySeq !== removeSeq) return
        removeEstimate.text(`${numeral(tronWeb.fromSun(amount[0])).format('0.000 a').toUpperCase()} TRX + ` + `${numeral(tronWeb.fromSun(amount[1])).format('0.000 a').toUpperCase()} BNKR`)
    }

    swapAmountInp.on("change paste keyup", _.debounce(calcSwapBNKRX, 250))

    buyAmountInp.on("change paste keyup", _.debounce(calcTokens, 250))

    sellAmountInp.on("change paste keyup", _.debounce(calcTRX, 250))

    addAmountInp.on("change paste keyup", _.debounce(calcSwap, 250))

    removeAmountInp.on("change paste keyup", _.debounce(calcReserve, 250))

}

async function isQuickSwapEnabled() {
    let allowance = await bnkr.allowance(currentAddress, quickSwapAddress).call()
    let balance = await bnkr.balanceOf(currentAddress).call()
    return allowance >= balance
}

async function enableQuickSwap() {
    amount = await bnkrx.MAX_INT().call()
    bnkr.approve(quickSwapAddress, amount).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function disableQuickSwap() {
    bnkr.approve(quickSwapAddress, 0).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}



async function isSwapEnabled() {
    let allowance = await bnkrx.allowance(currentAddress, contractAddress).call()
    let balance = await bnkrx.balanceOf(currentAddress).call()
    return allowance >= balance
}

async function enableSwap() {
    amount = await bnkrx.MAX_INT().call()
    bnkrx.approve(contractAddress, amount).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function disableSwap() {
    bnkrx.approve(contractAddress, 0).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function watchSelectedWallet() {
    if (tronWeb.defaultAddress['base58'] != currentAddress) {
        location.reload()
        return
    }

    var url = tronWeb.currentProvider().fullNode.host
    var tempNet = (url.indexOf('shasta') != -1) ? 'Shasta' : 'Mainnet'

    if (network != tempNet) {
        location.reload()
    }
}


async function mainLoop() {
    await showWalletInfo()
    await showUserStats()
    await showStats()
}

function updateReferrer() {
    var url_string = window.location.href
    var url = new URL(url_string)
    var address = url.searchParams.get("ref")

    if (address !== null) {
        address = cleanAddress(address)
        if (!tronWeb.isAddress(address)) {
            $('#invalidRefAddressModal').modal()
        } else {
            document.cookie = "ref=" + address
        }
    } else {

        var refCookie = getCookie("ref")

        if (refCookie === null) {
            console.log("Ref cookie was null. Setting to default.")
            document.cookie = `ref=${zeroAddress}`
        } else {
            // do nothing if the cookie is already set and there is no new mnode link
        }
    }
}

function getReferrer() {
    return getCookie('ref').split(';')[0]
}

function getCookie(name) {
    var dc = document.cookie
    var prefix = name + "="
    var begin = dc.indexOf("; " + prefix)

    if (begin == -1) {
        begin = dc.indexOf(prefix)
        if (begin != 0) return null
    }
    else {
        begin += 2
        var end = document.cookie.indexOf(";", begin)
        if (end == -1) {
            end = dc.length
        }
    }

    return decodeURI(dc.substring(begin + prefix.length, end))
}

function formatSun(sun) {
    return numeral(tronWeb.fromSun(sun)).format('0,0.000 a').toUpperCase()
}

// Renders very small prices using subscript-zero notation, e.g. 0.0000073 → "0.0<sub>4</sub>73".
// Falls back to the standard 0,0.000 numeral format for values ≥ 0.001.
// Input is sun (BigInt); output is an HTML string — use with .html() not .text().
function formatPriceSun(sun) {
    const num = Number(sun) / 1e6
    if (!isFinite(num) || num === 0) return '0.000'
    if (Math.abs(num) >= 0.001) {
        return numeral(num).format('0,0.000 a').toUpperCase()
    }
    const exp = Math.floor(Math.log10(Math.abs(num)))
    const zerosAfterDecimal = -exp - 1
    const sig = (num * Math.pow(10, -exp)).toPrecision(3)
    const digits = sig.replace('.', '').replace(/0+$/, '') || '0'
    if (zerosAfterDecimal <= 1) {
        return numeral(num).format('0.000000').replace(/0+$/, '0')
    }
    return `0.0<sub>${zerosAfterDecimal - 1}</sub>${digits}`
}



const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}


async function showWalletInfo() {
    try {
        $('#network').text(network)
        $('#walletAddress').text(`${shortId(currentAddress, 5)}`)

        var bandwidth = await tronWeb.trx.getBandwidth()
        $('#getBandwidth').text(numeral(bandwidth).format('0,0 a').toUpperCase())
        var result = await tronWeb.trx.getAccountResources()
        var net = result.EnergyLimit - result.EnergyUsed
        $('#getEnergy').text(numeral(net).format('0,0 a').toUpperCase())
        $('#walletBalanceValue').text(formatSun(await fastContract.balanceOf(currentAddress).call()))
    } catch (e) {
        console.error(e)
    }
}

async function showPrice() {
    try {
        const bnkrxToTrx = await swapContract.getTokenToTrxInputPrice(1e6).call()
        const trxToBnkrx = await swapContract.getTrxToTokenInputPrice(1e6).call()
        const bnkrToBnkrx = await quickSwap.swapBnkrPrice(1e6).call()
        priceCache = { trxToBnkrx, bnkrxToTrx, bnkrToBnkrx }
        $('.buy-price').html(formatPriceSun(bnkrxToTrx))
    } catch (e) {
        console.warn('showPrice fail', e.toString())
    }
}

async function showStats() {
    try {

        let totalTxs, players, tronBalance, totalBNKR, price, supply, reactorBalance, reactorBalancev2
        let complete = false
        let retries = 0

        while (!complete && retries < 5) {
            try {
                retries++
                totalTxs = (totalTxs) ? totalTxs : await swapContract.totalTxs().call()
                    players = (players) ? players : await swapContract.providers().call()
                    tronBalance = (tronBalance) ? tronBalance : await swapContract.tronBalance().call()
                    totalBNKR = (totalBNKR) ? totalBNKR : await swapContract.tokenBalance().call()
                    price = (price) ? price : await swapContract.getTokenToTrxInputPrice(1e6).call()
                    supply = (supply) ? supply : await swapContract.totalSupply().call()
                    reactorBalance = (reactorBalance) ? reactorBalance : await fastContract.balanceOf(reactorAddress).call()
                    reactorBalancev2 = (reactorBalancev2) ? reactorBalancev2 : await fastContract.balanceOf(reactorAddressv2).call()
                complete = true
            } catch (e) {
                console.warn('showstats fail', e.toString())
            }
        }


        // prices.usdt is single-1e6-scaled (USDT-sun per 1 TRX), prices.bnkrx is
        // double-scaled (bnkrx_raw * usdt_raw from getPrices), so undo the extra
        // scaling before formatSun does its own /1e6.
        $('.reactor-balance').text(formatSun(reactorBalance + reactorBalancev2))
        $('#reactor-usdt').html(`${approxStr} ${formatSun((reactorBalance + reactorBalancev2) * prices.usdt / 1000000n)} USDT`)
        $('#liquidity').text(formatSun(supply))
        $('#liquidity-usdt').html(`${approxStr} ${formatSun(tronBalance * prices.usdt / 1000000n + totalBNKR * prices.bnkrx / 1000000000000n)} USDT`)
        $('#totalTxs').text(numeral(Number(totalTxs)).format('0,0.000 a').toUpperCase())
        $('#providers').text(players.toString())
        $('#contractBalance').text(formatSun(tronBalance))
        $('#contractBalance-usdt').html(`${approxStr} ${formatSun(tronBalance * prices.usdt / 1000000n)} USDT`)
        $('.buy-price').html(formatPriceSun(price))
        $('#price-usdt').html(`${approxStr} ${formatPriceSun(price * prices.usdt / 1000000n)} USDT`)
        $('#totalSupply').text(formatSun(totalBNKR))
        $('#totalSupply-usdt').html(`${approxStr} ${formatSun(totalBNKR * prices.bnkrx / 1000000000000n)} USDT`)
    } catch (e) {
        console.error('showStats fail', e)
    }
}


async function showUserStats() {
    let userTRX, userBNKR,userBNKRX, userSwap, supply, userTXs
    let complete = false
    let retries = 0

    while (!complete && retries < 5) {
        try {
            retries++

            userTRX = (userTRX) ? userTRX : await fastContract.balanceOf(currentAddress).call()
            userBNKR = (userBNKR) ? userBNKR : await bnkr.balanceOf(currentAddress).call()
            userBNKRX = (userBNKRX) ? userBNKRX : await bnkrx.balanceOf(currentAddress).call()
            userSwap = (userSwap) ? userSwap : await swapContract.balanceOf(currentAddress).call()
            supply = (supply) ? supply : await swapContract.totalSupply().call()
            userTXs = (userTXs) ? userTXs : await swapContract.txs(currentAddress).call()
            complete = true
        } catch (e) {
            console.warn('showstats fail', e.toString())
        }
    }

    try {
        let isSwaping = await isSwapEnabled()
        $('#swaping-status').text(isSwaping ? 'Swap enabled' : 'Swap disabled')
        $('#swapingChb').prop('checked', isSwaping)
        let isQuickSwaping = await isQuickSwapEnabled()
        $('#bnkr-swaping-status').text(isQuickSwaping ? 'Swap enabled' : 'Swap disabled')
        $('#bnkrSwapingChb').prop('checked', isQuickSwaping)
        $('#user-txs').text(numeral(Number(userTXs)).format('0,0.000 a').toUpperCase())
        $('.user-balance-bnkrx').text(formatSun(userBNKRX))
        $('.user-balance-bnkr').text(formatSun(userBNKR))
        $('.user-balance-trx').text(formatSun(userTRX))
        $('.user-balance-bnkrx-usdt').html(`${approxStr} ${formatSun(userBNKRX * prices.bnkrx / 1000000000000n)} USDT`)
        $('.user-balance-trx-usdt').html(`${approxStr} ${formatSun(userTRX * prices.usdt / 1000000n)} USDT`)
        $('.user-balance-swap').text(formatSun(userSwap))
        if (userSwap > 0n) {
            $("#user-estimate").html('Earning 0.3% of swap volume')
            $("#user-estimate-usdt").html('')
            let pctBp = supply > 0n ? Number(userSwap * 10000n / supply) / 100 : 0
            $('#user-swap-percentage').text(numeral(pctBp).format('0.000') + ' %')
            let amount = await swapContract.getLiquidityToReserveInputPrice(userSwap).call()
            console.log('sell-amount-estimate', amount)
            let trx_value = amount[0]
            $('#user-balance-estimate').html(`<h5 class="color-theme-1 mr-2">Staked Value</h5> <h5><span class="text-white">${formatSun(trx_value)}</span> TRX + ` + `<span class="text-white">${formatSun(amount[1])}</span> BNKRX = <span class="text-success">${formatSun(trx_value * 2n)}</span> TRX</h5>`)
            $('#user-balance-estimate-usdt').html(`${approxStr} ${formatSun(trx_value * 2n * prices.usdt / 1000000n)} USDT`)
        } else {
            $("#user-estimate").html('Add TRX and BNKR liquidity to earn 0.3%')
            $('#user-balance-estimate').text('')
        }
    } catch (e) {
        console.error('showUserStats fail', e)
    }
}


function cleanAddress(address) {
    return address.trim().replace(/[^\u0000-\u007E]/g, "")
}

function setNetwork() {
    var url = tronWeb.currentProvider().fullNode.host
    if (url.indexOf('shasta') != -1) {
        network = 'Shasta'
        contractAddress = tron_networks['shasta']
        tronLinkUrlPrefix = 'https://shasta.tronscan.org/#/transaction/'
    } else {
        network = 'Mainnet'
        contractAddress = tron_networks['mainnet']
        tronLinkUrlPrefix = 'https://tronscan.org/#/transaction/'
    }

    console.log('network detected', network, contractAddress)
}

function refresh(tx) {
    $('#txId').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#txModal').modal()
    setTimeout(mainLoop)
}

function txError(error) {
    var msg = error.message
    $('#txErrorId').text(msg)
    $('#txErrorModal').modal()
    setTimeout(mainLoop)
}

function showAlert(title, msg) {
    $('#alertTitle').text(title)
    $('#alertId').text(msg)
    $('#alertModal').modal()
}

function showError(msg) {
    $('#errorId').text(msg)
    $('#errorModal').modal()
    setTimeout(mainLoop)
}

function shortId(str, size) {
    return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

/************ Chain Functions *******************/


async function sell() {

    let isSwaping = await isSwapEnabled()
    if (!isSwaping) {
        showAlert('Enable Swap', 'Swap is not enabled.  Look for the toggle and make sure it is on (purple)!')
        return
    }

    //let tokens = tronWeb.fromSun((await bnkr.balanceOf(currentAddress).call()).toNumber())
    //let amount = $('#sellAmount').val().trim()
    var amount = Number.parseFloat($('#sellAmount').val().trim())
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        showAlert('Whoops', `Enter a valid amount of BNKR`)
        return
    } else {

        let balance = await bnkrx.balanceOf(currentAddress).call()
        amount = BigInt(Math.floor(amount * Math.pow(10, 6)))

        //The solution to the decimals bug
        console.log(balance.toString(), amount.toString(), amount > balance)
        amount = (amount > balance) ? balance : amount

        let amount_hex = `0x${amount.toString(16)}`
        console.log('selltokens', amount, amount_hex)

        swapContract.tokenToTrxSwapInput(amount_hex, 1).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('sell', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }

    return false;
}

async function swap() {

    let isSwaping = await isQuickSwapEnabled()
    if (!isSwaping) {
        showAlert('Enable BNKR Swap', 'BNKR Swap is not enabled.  Look for the toggle and make sure it is on (purple)!')
        return
    }

    var amount = Number.parseFloat($('#bnkrAmount').val().trim())
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        showAlert('Whoops', `Enter a valid amount of BNKR`)
        return
    } else {

        let balance = await bnkr.balanceOf(currentAddress).call()
        amount = BigInt(Math.floor(amount * Math.pow(10, 6)))

        //The solution to the decimals bug
        console.log(balance.toString(), amount.toString(), amount > balance)
        amount = (amount > balance) ? balance : amount

        let amount_hex = `0x${amount.toString(16)}`
        console.log('selltokens', amount, amount_hex)

        quickSwap.swapBnkr(amount_hex).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('sell', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }

    return false;
}


async function buy() {

    let isSwaping = await isSwapEnabled()
    if (!isSwaping) {
        showAlert('Enable Swap', 'Swap is not enabled.  Look for the toggle and make sure it is on (purple)!')
        return
    }

    await buySwap()

    /*
    if (price <= 1.02){
        await buySwap()
    } else {
        await buyReactor()
    }*/

    return false;
}

async function buySwap(){
    var amount = Number.parseFloat($('#buyAmount').val().trim())
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        showAlert('Whoops', `Enter a valid amount of TRX`)
        return
    } else {


        let balance = await fastContract.balanceOf(currentAddress).call()
        amount = BigInt(Math.floor(amount * Math.pow(10, 6)))

        //The solution to the decimals bug
        console.log(balance.toString(), amount.toString(), amount > balance)
        amount = (amount > balance) ? balance : amount

        let amount_hex = `0x${amount.toString(16)}`
        console.log('buy tokens', amount, amount_hex)


        swapContract.trxToTokenSwapInput(1).send({ callValue: amount_hex, feeLimit: feeLimit }).then(tx => {
            console.log('buy', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }
}

async function buyReactor(){
    var amount = Number.parseFloat($('#buyAmount').val().trim())
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        showAlert('Whoops', `Enter a valid amount of TRX`)
        return
    } else {


        let balance = await fastContract.balanceOf(currentAddress).call()
        amount = BigInt(Math.floor(amount * Math.pow(10, 6)))

        //The solution to the decimals bug
        console.log(balance.toString(), amount.toString(), amount > balance)
        amount = (amount > balance) ? balance : amount

        let amount_hex = `0x${amount.toString(16)}`
        console.log('buy tokens', amount, amount_hex)


        reactor.buy(1).send({ callValue: amount_hex, feeLimit: feeLimit }).then(tx => {
            console.log('buy', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }
}

async function addLiquidity() {

    let isSwaping = await isSwapEnabled()
    if (!isSwaping) {
        showAlert('Enable Swap', 'Swap is not enabled.  Look for the toggle and make sure it is on (purple)!')
        return
    }

    let balancedTokens
    let supply = await swapContract.totalSupply().call()

    var amount = $('#addAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        showAlert('Whoops', `Enter a valid amount of TRX`)
        return
    } else {

        amount = tronWeb.toSun(amount)

        if (supply == 0n) {
            balancedTokens = Math.floor(Number(amount) / 2.5)
        } else {
            let tokens = Number(await bnkrx.balanceOf(currentAddress).call())

            let liquid_amount = await swapContract.getTrxToLiquidityInputPrice(amount).call()
            balancedTokens = Number((await swapContract.getLiquidityToReserveInputPrice(liquid_amount).call())[1])
            balancedTokens = Math.floor(Math.min(balancedTokens * 1.2, tokens))
        }

        swapContract.addLiquidity(1, balancedTokens).send({ callValue: amount, feeLimit: feeLimit }).then(tx => {
            console.log('addLiquidity', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }

    return false;
}

async function removeLiquidity() {

    let isSwaping = await isSwapEnabled()
    if (!isSwaping) {
        showAlert('Enable Swap', 'Swap is not enabled.  Look for the toggle and make sure it is on (purple)!')
        return
    }

    let tokens = tronWeb.fromSun(await swapContract.balanceOf(currentAddress).call())
    if (tokens == 0) {
        showAlert('No Liquidity', `You don't have any SWAP tokens`)
        return
    }

    let amount = $('#removeAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        showAlert('Whoops', `Enter a valid amount of tokens`)
        return
    } else {
        amount = Math.floor(Math.min(amount, tokens))
        swapContract.removeLiquidity(tronWeb.toSun(amount), 1, 1).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('removeLiquidity', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }

    return false;
}


async function transfer() {


    var amount = $('#transferAmount').val().trim()
    let tokens = tronWeb.fromSun(await swapContract.balanceOf(currentAddress).call())

    if (tokens == 0) {
        showAlert('No Liquidity', `You don't have any SWAP tokens`)
        return
    }

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        showAlert('Whoops', `Enter a valid amount of tokens`)
        return
    } else {
        var address = cleanAddress($('#recipient').val())
        if (!tronWeb.isAddress(address)) {
            $('#invalidAddressModal').modal()
        } else {

            amount = Math.floor(Math.min(amount, tokens))

            // withdrawals ha now been zerod out and it is safe to transfer
            swapContract.transfer(address, tronWeb.toSun(amount)).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
                console.log('transfer', address, amount, tx)
                refresh(tx)
            }).catch(e => {
                txError(e)
            })
        }
    }
}

