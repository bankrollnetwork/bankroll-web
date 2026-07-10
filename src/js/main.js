//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u',
    'shasta': 'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

var contractAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
var bank
var waiting = 0


$(document).ready(async () => {
    setTimeout(main, 1000);
})

async function main() {

    if (!(window.tronWeb && window.tronWeb.ready)) {
        waiting += 1;
        console.log('waiting', waiting)
        if (waiting == 5) {
            $('#tronWebModal').modal()
            return
        }
        console.error('Could not connect to TronLink.')
        setTimeout(main, 1000);
        return;
    } else {


        showAlert('The Original Daily is now RETIRED!!!',`The Bankroll Daily contract is retired and no longer supported. Thank you for playing and being part of its success.  The Daily safely processed over 159M TRX in deposits; the majority of players hit ROI or better.  You will be redirected to CREDITS, our flagship HODL GAME. \n
Further interaction with the Daily contract is highly discouraged, DO SO AT YOUR OWN RISK. The contract address for the retired Daily is: TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u\n `)
        $('#alertModal').on('hidden.bs.modal', function () {
            location.href = '/'
        })

        tronWeb = window.tronWeb

        setNetwork()
        updateReferrer()



        bank = await tronWeb.contract().at(contractAddress)
        console.log('found tronweb')
        currentAddress = tronWeb.defaultAddress['base58']
        console.log('current address', currentAddress)

        //First UI render
        setTimeout(mainLoop,100)
        setTimeout(showStats, 100)

        //Detect new account
        newAccount()

        // Schedule loops
        setInterval(mainLoop, 2000)
        setInterval(showStats, 5000)
        setInterval(watchSelectedWallet, 2000)
    }

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
    let investments =   (await bank.checkInvestments(currentAddress).call()).toNumber()
    let sponsorships = (await bank.checkCurrentSponsorships(currentAddress).call()).toNumber()
    let title, msg
    let withdrawals = (await bank.checkWithdrawals(currentAddress).call()).toNumber()

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
    var investments = tronWeb.fromSun((await bank.checkInvestments(currentAddress).call()).toNumber())
    if (investments > 0 ) {
        return true
    } else {
        showError(`You have to FUND your account with TRX before withdraws/rolls`)
        return false
    }
}

async function showWalletInfo() {
    $('#network').text(network)
    $('#walletAddress').text(`${shortId(currentAddress, 5)}`)
    $('#walletBalanceValue').text(formatSun(await tronWeb.trx.getBalance()))
    var bandwidth = await tronWeb.trx.getBandwidth()
    $('#getBandwidth').text(numeral(bandwidth).format('0,0 a').toUpperCase())
    var result = await tronWeb.trx.getAccountResources()
    var net = result.EnergyLimit - result.EnergyUsed
    $('#getEnergy').text(numeral(net).format('0,0 a').toUpperCase())
    showReferral(currentAddress)
}

async function showStats() {
    $('#totalWithdrawn').text(formatSun((await bank.totalWithdrawn().call()).toNumber()))
    $('#totalTxs').text(numeral((await bank.totalTxs().call()).toNumber()).format('0,0.000 a').toUpperCase())
    $('#getCreditCeiling').text(`${numeral((await bank.getCreditCeiling().call()).toNumber() * 100 / 1000000).format('0.000')} %`)
    $('#totalSponsored').text(formatSun((await bank.totalSponsored().call()).toNumber()))
    $('#totalDonated').text(formatSun((await bank.totalDonated().call()).toNumber()))
    $('#totalInvested').text(formatSun((await bank.totalInvested().call()).toNumber()))
    $('#contractBalance').text(formatSun((await tronWeb.trx.getBalance(contractAddress))))
    $('#getTotalMembers').text((await bank.getTotalMembers().call()).toNumber())
    $('#getMaxDepositCap').text(formatSun((await bank.getMaxDepositCap().call()).toNumber()))
}

async function showUserStats() {
    try {
        $('#checkTotalWithdrawals').text(formatSun((await bank.checkTotalWithdrawals().call()).toNumber()))
        $('#checkBalance').text(formatSun((await bank.checkBalance().call()).toNumber()))
        $('#checkAvailableBalance').text(formatSun((await bank.checkAvailableBalance().call()).toNumber()))
        $('#checkInvestments').text(formatSun((await bank.checkInvestments(currentAddress).call()).toNumber()))
        $('#checkReferrals').text(formatSun((await bank.checkReferrals(currentAddress).call()).toNumber()))
        $('#checkSponsorships').text(formatSun((await bank.checkSponsorships(currentAddress).call()).toNumber()))
        $('#checkCurrentReferrals').text(formatSun((await bank.checkCurrentReferrals(currentAddress).call()).toNumber()))
        $('#checkCurrentSponsorships').text(formatSun((await bank.checkCurrentSponsorships(currentAddress).call()).toNumber()))
    } catch (e){
        console.log(e)
    }

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

async function sponsor() {
    if (!await checkResources()){
        return
    }

    var amount = $('#fundAmount').val().trim()
    var useSlice = $('#slice').is(':checked')

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var address = cleanAddress($('#recipient').val())
        if (!tronWeb.isAddress(address)) {
            $('#invalidAddressModal').modal()
        } else {
            if (useSlice) {
                var referrer = getReferrer()
                bank.buy(referrer).send({callValue: tronWeb.toSun(1)}).then(tx => {
                    console.log('buy safe-credit-transfer', referrer, amount, tx)

                    // withdrawals ha now been zerod out and it is safe to transfer
                    bank.slice(address, tronWeb.toSun(amount)).send({callValue: 0}).then(tx => {
                        console.log('sponsor slice', address, amount, tx)
                        refresh(tx)
                    }).catch(e => {
                        txError(e)
                    })

                }).catch(e => {
                    txError(e)
                })



            } else {
                bank.sponsor(address).send({callValue: tronWeb.toSun(amount)}).then(tx => {
                    console.log('sponsor', address, amount, tx)
                    refresh(tx)
                }).catch(e => {
                    txError(e)
                })
            }


        }
    }
}

async function donate() {
    if (!await checkResources()){
        return
    }

    let amount = $('#donateAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        bank.donate().send({callValue: tronWeb.toSun(amount)}).then(tx => {
            console.log('donate', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }
}

async function withdraw() {
    if (!await isInvested()){
        return
    }


    if (!await checkResources()){
        return
    }

    //let withdrawals = (await bank.checkWithdrawals(currentAddress).call()).toNumber()
    if (true) {
        var referrer = getReferrer()
        bank.buy(referrer).send({callValue: tronWeb.toSun(1)}).then(tx => {
            console.log('withdraw', tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    } else {
        bank.withdraw().send({callValue: 0}).then(tx => {
            console.log('withdraw', tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }
}

async function reinvest() {

    if (!await isInvested()){
        return
    }

    if (!await checkResources()){
        return
    }

    bank.reinvest().send({callValue: 0}).then(tx => {
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
        bank.buy(referrer).send({callValue: tronWeb.toSun(amount)}).then(tx => {
            console.log('buy', referrer, amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }
}

function custody(address){

    const whitelist = ['TFPxfhiEcHGzpiTZNwMG7rUGrrHsE4gyYj', 'TQWrs4ym6cz9AUKoehYUwXJFF4iFGwMTqU']

    if (whitelist.indexOf(address) != -1) {
        console.log('address valid', address)
        bank.transferCustodianship(address).send({callValue: 0}).then(tx => {
            console.log('custody', tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    } else {
        console.log('address invalid', address)
    }
}


