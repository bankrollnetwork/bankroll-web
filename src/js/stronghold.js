//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TF7dD5SYMEZvmUXUt8EcKLYnNk3pE9V5Ls',//'TNbpnzNg2quViNYDDBUgvBuYofzkJvy3Aw',//'TWvNVtYeFgRtLkzzzLUahvSejQNTLqtTbu',//'TSHZ8qNCuAL2wacGocYzZxff9LZHWhRKYG',
    'shasta': 'TNKK3sLSBikAwVVwnCr16LGZ4kw9dZcqVP'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

/*
Mainnet Test

Daily - TWvNVtYeFgRtLkzzzLUahvSejQNTLqtTbu
TokenMint - TRPyZKJkCe958zrfyMf8vHJi84ai8dbaqL
GameHub - TNpvL6PddcnE1kPc8a7LcqNuYaocyMecux

 */

const feeLimit = 150e6
const refreshInterval = 1000 * 60 * 30

const tokenAddress = 'TNo59Khpq46FGf4sD7XSWYFNfYfbc8CqNK'
const fastAddress = 'TNYMAeKiTPKDgeeAtD7hebneYYDUt9QdoY'
const swapAddress = 'TRXYvAoYvCqmvZWpFCTLc4rdQ7KxbLsUSj'

let fastContract

const flowOrgAPI = 'https://flowbot-dot-bankroll-5a78d.uc.r.appspot.com' //'https://flow-info-xe7v2z5oaa-uc.a.run.app'

var contractAddress
var tronWeb
var currentAddress
var mintAddress = 'TFMcU3QBGVB5ghtYw8g9wMV3rTFdkH2avv'
var network
var tronLinkUrlPrefix
let credits, bnkrMint, bnkr, swap
var waiting = 0
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate, prices

var players = {}

var balanceFeed = []
let balanceChart, tronLocal


$(document).ready(async () => {
    initConnect(main);
})

async function main() {

    tronWeb = window.tronWeb
    setNetwork()
    bindUI()


    prices = await getPrices()


    bnkr = await tronWeb.contract().at(tokenAddress)
    credits = await tronWeb.contract().at(contractAddress)
    bnkrMint = await tronWeb.contract().at(mintAddress)
    fastContract = await tronWeb.contract().at(fastAddress)
    swap = await tronWeb.contract().at(swapAddress)

    console.log('found tronweb')
    currentAddress = tronWeb.defaultAddress['base58']

    userTag(currentAddress)
    console.log('current address', currentAddress)

    //First UI render — sequential awaits keep us under the 6 req/sec limiter
    // (see TRON RPC discipline memory).
    try {
        await mainLoop()
        await showStats()
    } catch (e) {
    } finally {
        closeLoading()
    }

    //Detect new account
    //newAccount()

    // Schedule loops — RPC-firing intervals at 60s, local watcher faster.
    setInterval(mainLoop, 60000)
    setInterval(showStats, 60000)
    setInterval(watchSelectedWallet, 20000)
}

function bindUI() {
    buyAmountInp = $('#buyAmount')
    sellAmountInp = $('#sellAmount')
    transferAmountInp = $('#transferAmount')
    buyEstimate = $('#buy-estimate')
    sellEstimate = $('#sell-estimate')
    transferEstimate = $('#transfer-estimate')


    $('#contract-url').attr('href', `https://tronscan.org/#/contract/${contractAddress}`)
    $('#contract-url').text(`https://tronscan.org/#/contract/${shortId(contractAddress, 5)}`)


    let calcTokens = async (e) => {
        try {
            let amount = Number.parseFloat(buyAmountInp.val().trim())
            if (!isFinite(amount) || amount <= 0) return buyEstimate.text('')
            amount = await credits.calculateTaxedTrxToTokenLiquidity(tronWeb.toSun(amount)).call()
            buyEstimate.text(`${formatSun(amount)} STRHLD`)
        } catch (e) {
            console.error(e)
        }
    }

    let sellTokens = async (e) => {
        try {
            let amount = Number.parseFloat(sellAmountInp.val().trim())
            if (!isFinite(amount) || amount <= 0) return sellEstimate.text('')
            amount = await credits.calculateTaxedLiquidityToTrx(tronWeb.toSun(amount)).call()
            sellEstimate.text(`${formatSun(amount)} TRX`)
        } catch (e) {
            console.error(e)
        }
    }



    buyAmountInp.on("change paste keyup", _.debounce(calcTokens, 250))


    sellAmountInp.on("change paste keyup", _.debounce(sellTokens, 250))

    transferAmountInp.on("change paste keyup", (e) => {
        try {
            let amount = Number.parseFloat(transferAmountInp.val().trim())
            transferEstimate.text(`${numeral(amount).format('0.000 a').toUpperCase()} STRHLD`)
        } catch (e) {
            console.error(e)
        }
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

async function isStakeEnabled() {
    let allowance = await bnkr.allowance(currentAddress, contractAddress).call();
    return allowance > BigInt(21e12)
}

function enableStake() {
    bnkr.approve(contractAddress, 100e12).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function disableStake() {
    bnkr.approve(contractAddress, 0).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}


async function mainLoop() {
    await showWalletInfo()
    await showUserStats()
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

async function checkResources() {
    var useProtection = $('#walletProtection').is(':checked')

    if (!useProtection) {
        return true
    }

    var balance = tronWeb.fromSun(await tronWeb.trx.getBalance())
    var bandwidth = await tronWeb.trx.getBandwidth()
    var result = await tronWeb.trx.getAccountResources()
    var energy = result.EnergyLimit - result.EnergyUsed

    if (balance < 10 && energy < 2000) {
        showError(`Low energy and unsafe TRX balance for transaction processing: ${balance} (minimum 10 TRX) , ${energy} (minimum 2000)`)
        return false
    }

    return true
}

async function isInvested() {
    var investments = tronWeb.fromSun(await credits.checkInvestments(currentAddress).call())
    if (investments > 0) {
        return true
    } else {
        showError(`You have to FUND your account with TRX before withdraws/rolls`)
        return false
    }
}
const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}

const REF_API_URL = 'https://api.bankroll.network/credits-tx'

async function selectRandomReferral() {
    const networkName = getNetworkName()
    let rewardsData = await $.ajax({
        url: REF_API_URL + '/rewards_info?walletId=' + currentAddress + '&network=' + networkName
    });
    if (rewardsData.length) {
        let curReferral = rewardsData[Math.floor(Math.random() * rewardsData.length)];
        $('#recipient').val(curReferral.customer_address);
    } else {
        $.notify({
            message: '<span class="text-white">No referrals found...</span>'
        }, {
            type: 'dark',
            delay: 1000,
            allow_dismiss: false,
            placement: { from: 'bottom', align: 'left' }
        });
    }
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
        showReferral(currentAddress)
        $('#walletBalanceValue').text(formatSun(await credits.trxBalance(currentAddress).call()))
    } catch (e) {
        console.warn('showWalletInfo', e.toString())
    }
}

async function showStats() {
    try {
        const totalTxs = await credits.totalTxs().call()
        const players = await credits.players().call()
        const tokenBalance = await credits.totalTokenBalance().call()
        const totalSupply = await credits.totalSupply().call()
        const dividendBalance = await credits.dividendBalance().call()
        const totalBNKR = await credits.totalWithdrawn().call()
        const lockedBalance = await credits.lockedTokenBalance().call()
        const price = await swap.getTokenToTrxInputPrice(1e6).call()
        const tokenBalanceTrx = await credits.calculateLiquidityToTrx(tokenBalance).call()

        $('#totalTxs').text(numeral(Number(totalTxs)).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text(players.toString())
        $('#contractBalance').text(formatSun(tokenBalance))
        // prices.usdt is single-1e6-scaled (USDT-sun per 1 TRX), so /1e6n before formatSun.
        $('#contractBalance-usdt').html(`${approxStr} ${formatSun(tokenBalanceTrx * prices.usdt / 1000000n)} USDT`)
        $('#totalSupply').text(formatSun(totalSupply))
        $('#dividendPool').text(formatSun(dividendBalance))
        $('#lockedPool').text(formatSun(lockedBalance))
        $('#totalWithdrawn').text(formatSun(totalBNKR))
        $('.buy-price').text(formatSun(price))
    } catch (e) {
        console.error('showStats fail', e)
    }
}


async function showUserStats() {
    try {
        const stats = await credits.statsOf(currentAddress).call()
        const balance = await credits.myTokens().call()
        const divs = await credits.myDividends().call()
        // dailyEstimateTrx isn't on every version of the contract — treat absent as zero.
        let estimateTrx = 0n
        try {
            estimateTrx = await credits.dailyEstimateTrx(currentAddress).call()
        } catch (e) {}
        const totalSupply = await credits.totalSupply().call()
        const divsTrx = await credits.calculateLiquidityToTrx(divs).call()
        const balanceTrx = await credits.calculateLiquidityToTrx(balance).call()

        // APY comes from a separate API endpoint — also defensive against API outage.
        let apy = 0
        try {
            const apiStats = await axios.get(`${flowOrgAPI}/stronghold`)
            apy = (apiStats && apiStats.data) ? apiStats.data.apy : 0
        } catch (e) {}

        // Percentage in basis points, then /100 to preserve three decimals without float-dividing huge BigInts.
        const stakePercent = totalSupply > 0n ? Number(balance * 10000n / totalSupply) / 100 : 0

        $('#user-percentage').text(numeral(stakePercent).format('0.000') + ' %')
        $('#user-apy').text(numeral(apy).format('0.000') + ' % APY')

        $('#user-withdrawn').text(formatSun(stats[1]))
        $('#user-reinvested').text(formatSun(stats[12]))
        $('#user-rolls').text(stats[13].toString())
        $('#user-bonus').text(formatSun(balance))
        // prices.usdt is single-1e6-scaled, so /1e6n before formatSun.
        $('#user-bonus-usdt').html(`${approxStr} ${formatSun(balanceTrx * prices.usdt / 1000000n)} USDT`)

        $('#user-vault').text(formatSun(divsTrx))
        $('#user-vault-usdt').html(divs > 0n ? `${approxStr} ${formatSun(divsTrx * prices.usdt / 1000000n)} USDT` : '')
    } catch (e) {
        console.error('showUserStats fail', e)
    }
}


function cleanAddress(address) {
    return address.trim().replace(/[^\u0000-\u007E]/g, "")
}

function showReferral(address) {
    $('#address').html(address)
    $("#quoteDisplay").empty()
    var url = `${window.location.origin}${window.location.pathname}?ref=${address}`
    var shortUrl = `${window.location.origin}${window.location.pathname}?ref=${shortId(address, 5)}`
    var element = `<a href="${url}">${shortUrl}</a>`
    $("#quoteDisplay").append(element)

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

async function transfer() {
    if (!await checkResources()) {
        return
    }

    var amount = $('#transferAmount').val().trim()
    var useSlice = $('#slice').is(':checked')

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var address = cleanAddress($('#recipient').val())
        if (!tronWeb.isAddress(address)) {
            $('#invalidAddressModal').modal()
        } else {
            // withdrawals ha now been zerod out and it is safe to transfer
            credits.transfer(address, tronWeb.toSun(amount)).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
                console.log('sponsor slice', address, amount, tx)
                refresh(tx)
            }).catch(e => {
                txError(e)
            })
        }
    }

    return false;
}

async function sell() {
    //let tokens = tronWeb.fromSun((await credits.myTokens().call()).toNumber())
    //let amount = $('#sellAmount').val().trim()
    var amount = Number.parseFloat($('#sellAmount').val().trim())
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        let balance = await credits.myTokens().call()
        amount = BigInt(Math.floor(amount * Math.pow(10, 6)))

        //The solution to the decimals bug
        console.log(balance.toString(), amount.toString(), amount > balance)
        amount = (amount > balance) ? balance : amount

        let amount_hex = `0x${amount.toString(16)}`
        $.notify({
            message: `<span class="text-white">The TRX from your sale will  be deposited to your DIVS</span>`
        }, {
            type: 'dark',
            delay: 5000,
            allow_dismiss: true
        })
        credits.sell(amount_hex).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('sell', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }

    return false;
}

async function withdraw() {
    if (!(await credits.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    credits.withdraw().send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('withdraw', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })


    return false;
}


async function reinvest() {

    if (!(await credits.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    credits.reinvest().send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('reinvest', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })

    return false;
}

async function buy() {

    //var amount = $('#buyAmount').val().trim()
    var amount = Number.parseFloat($('#buyAmount').val().trim())
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        credits.buy().send({ callValue: tronWeb.toSun(amount), feeLimit: feeLimit }).then(tx => {
            console.log('buy', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }

    return false;
}
