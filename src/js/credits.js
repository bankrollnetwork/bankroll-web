//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TUTik4srgKuzgXoL4KfV75foQbYuP8SirY',
    'shasta': 'TNKK3sLSBikAwVVwnCr16LGZ4kw9dZcqVP'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

const feeLimit = 150e6

const donationPoolAddress = 'TRepyJ3eTRPWE8X4xQfiReQvW95SWztnzt'
const luckAddress = ''

var contractAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
var credits
var waiting = 0
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate, prices


$(document).ready(async () => {
    setTimeout(main, 100);
})

async function main() {

    if (!(window.tronWeb && window.tronWeb.ready)) {
        waiting += 1;
        console.log('waiting', waiting)
        if (waiting == 50) {
            $('#tronWebModal').modal()
            return
        }
        console.error('Could not connect to TronLink.')
        setTimeout(main, 500);
        return;
    } else {

        tronWeb = window.tronWeb

        setNetwork()
        updateReferrer()
        bindUI()

        prices = await getPrices()
        credits = await tronWeb.contract().at(contractAddress)
        console.log('found tronweb')
        currentAddress = tronWeb.defaultAddress['base58']

        userTag(currentAddress)
        console.log('current address', currentAddress)

        //First UI render
        try {
            Promise.all([mainLoop(), showStats()])
        } catch (e) {

        } finally {
            closeLoading()
        }

        //Detect new account
        //newAccount()

        // Schedule loops
        setInterval(mainLoop, 2000)
        setInterval(showStats, 5000)
        setInterval(watchSelectedWallet, 2000)
    }

}

function bindUI(){
    buyAmountInp = $('#buyAmount')
    sellAmountInp = $('#sellAmount')
    transferAmountInp = $('#transferAmount')
    buyEstimate = $('#buy-estimate')
    sellEstimate = $('#sell-estimate')
    transferEstimate = $('#transfer-estimate')



    buyAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseInt(buyAmountInp.val().trim())
        buyEstimate.text(`${numeral(amount * 0.90).format('0.000 a').toUpperCase()} Credits`)
    })

    sellAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseInt(sellAmountInp.val().trim())
        sellEstimate.text(`${numeral(amount * 0.90).format('0.000 a').toUpperCase()} TRX`)
    })

    transferAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseInt(transferAmountInp.val().trim())
        transferEstimate.text(`${numeral(amount * 0.99).format('0.000 a').toUpperCase()} Credits`)
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
}

async function newAccount(){
    let investments =   (await credits.checkInvestments(currentAddress).call()).toNumber()
    let sponsorships = (await credits.checkCurrentSponsorships(currentAddress).call()).toNumber()
    let title, msg
    let withdrawals = (await credits.checkWithdrawals(currentAddress).call()).toNumber()

    if (withdrawals){
        title = 'Important Action Needed'
        msg = `To maintain access to your account, please click 'Withdraw'. A 1 TRX buy will be applied to reset internal metrics`
        showAlert(title, msg)
    }

    if (!investments){
        if (sponsorships){
            title = 'A Member Invited You To Bankroll!'
            msg = 'Congratulations on the sponsorship.  You can access it by funding your account 1 TRX'
        } else {
            title = 'Welcome to Bankroll!'
            msg = 'To start using Bankroll you can activate your account with just 1 TRX'
        }

        showAlert(title,msg)
    }
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

async function checkResources() {
    var useProtection = $('#walletProtection').is(':checked')

    if (!useProtection){
        return true
    }

    var balance = tronWeb.fromSun(await tronWeb.trx.getBalance())
    var bandwidth = await tronWeb.trx.getBandwidth()
    var result = await tronWeb.trx.getAccountResources()
    var energy = result.EnergyLimit - result.EnergyUsed

    if (balance < 10 && energy < 2000){
        showError(`Low energy and unsafe TRX balance for transaction processing: ${balance} (minimum 10 TRX) , ${energy} (minimum 2000)`)
        return false
    }

    return true
}

async function isInvested() {
    var investments = tronWeb.fromSun((await credits.checkInvestments(currentAddress).call()).toNumber())
    if (investments > 0 ) {
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

async function selectRandomReferral(){
    const networkName = getNetworkName()
    let rewardsData = await $.ajax({
      url: REF_API_URL + '/rewards_info?walletId=' + currentAddress + '&network=' + networkName
    });
    if (rewardsData.length){
      let curReferral = rewardsData[Math.floor(Math.random()*rewardsData.length)];
      $('#recipient').val(curReferral.customer_address);
    } else {
        $.notify({
            message: '<span class="text-white">No referrals found...</span>'
        }, {
            type: 'dark',
            delay: 1000,
            allow_dismiss: false,
            placement: {from: 'bottom', align: 'left'}
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
        $('#walletBalanceValue').text(formatSun(await tronWeb.trx.getBalance()))
    } catch(e){}
}

async function showStats() {
    try {
        $('#totalTxs').text(numeral((await credits.totalTxs().call()).toNumber()).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text((await credits.players().call()).toNumber())
        $('#contractBalance').text(formatSun((await tronWeb.trx.getBalance(contractAddress))))
        let supply = await credits.totalSupply().call()
        $('#totalSupply').text(formatSun(supply))
        $('#totalSupply-usdt').html(`${approxStr} ${formatSun(supply * prices.usdt)} USDT`)
        let pool = await tronWeb.trx.getBalance(donationPoolAddress)
        $('#poolBalance').text(formatSun(pool))
        $('#poolBalance-usdt').html(`${approxStr} ${formatSun(pool * prices.usdt)} USDT`)
    }catch(e){}
}


async function showUserStats() {
    let stats = await credits.statsOf(currentAddress).call()
    let balance = (await credits.myTokens().call()).toNumber()
    let divs = (await credits.myDividends(true).call()).toNumber()
    let referrals = formatSun((await credits.myReferrals().call()).toNumber())
    let withdrawn = formatSun(stats[1].toNumber())
    let reinvested = formatSun(stats[12].toNumber())

    $('#user-withdrawn').text(withdrawn)
    $('#user-reinvested').text(reinvested)
    $('#user-rolls').text(stats[13].toNumber())
    $('#user-bonus').text(formatSun(balance))
    $('#user-bonus-usdt').html(`${approxStr} ${formatSun(balance * prices.usdt)} USDT`)
    $('#user-vault').text(formatSun(divs))
    $('#user-vault-usdt').html(divs > 0 ? `${approxStr} ${formatSun(divs * prices.usdt)} USDT`:'')
    $('#user-buddy').text(referrals)

}


function cleanAddress(address){
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

function showAlert(title, msg){
    $('#alertTitle').text(title)
    $('#alertId').text(msg)
    $('#alertModal').modal()
}

function showError(msg){
    $('#errorId').text(msg)
    $('#errorModal').modal()
    setTimeout(mainLoop)
}

function shortId(str, size) {
    return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

/************ Chain Functions *******************/

async function transfer() {
    if (!await checkResources()){
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
            credits.transfer(address, tronWeb.toSun(amount)).send({callValue: 0, feeLimit: feeLimit }).then(tx => {
                console.log('sponsor slice', address, amount, tx)
                refresh(tx)
            }).catch(e => {
                txError(e)
            })
        }
    }
}

async function sell() {
    if (!await checkResources()){
        return
    }
    let tokens = tronWeb.fromSun((await credits.myTokens().call()).toNumber())
    let amount = $('#sellAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        amount = Math.floor(Math.min(amount, tokens))
        $.notify({
            message: `<span class="text-white">The TRX from your sale will  be deposited to your DIVS</span>`
        }, {
            type: 'dark',
            delay: 5000,
            allow_dismiss: true
        })
        credits.sell(tronWeb.toSun(amount)).send({callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('sell', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }
}

async function withdraw() {
    if (!((await credits.myDividends(true).call()).toNumber())){
        showAlert('NO DIVS!!!','Slow down there buddy, you need to have some divs first!')
        return
    }


    if (!await checkResources()){
        return
    }

    credits.withdraw().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('withdraw', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function reinvest() {

    if (!((await credits.myDividends(true).call()).toNumber())){
        showAlert('NO DIVS!!!','Slow down there buddy, you need to have some divs first!')
        return
    }

    if (!await checkResources()){
        return
    }

    credits.reinvest().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('reinvest', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function buy() {
    if (!await checkResources()){
        return
    }

    var amount = $('#buyAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var referrer = getReferrer()
        credits.buy(referrer).send({callValue: tronWeb.toSun(amount), feeLimit: feeLimit }).then(tx => {
            console.log('buy', referrer, amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }
}



