//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TUTik4srgKuzgXoL4KfV75foQbYuP8SirY',
    'shasta': 'TNKK3sLSBikAwVVwnCr16LGZ4kw9dZcqVP'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

const dailyPlusContractAddress = 'THVYLtjFbXNcXwDvZcwCGivS95Wtd4juFn'
const bnkrAddress = 'TNo59Khpq46FGf4sD7XSWYFNfYfbc8CqNK'
const boostAddress = 'TMmWrjjKGRCdoUzmv6YUaov7mwxy1swDnq'
const luckContractAddress = 'TUxeCSq2GGwLWyBE7Q32g5G6f7LkVPh6zu'
const dailyContractAddress = 'THEA3DKyvufxh63DYdZMrqvyyWQcFAj6AL'
const donationPoolAddress = 'TRepyJ3eTRPWE8X4xQfiReQvW95SWztnzt'
const moonAddress = 'TJRq8Sc2Dnx2PJZYccr37BdHdqVt1X2j89'
const saveAddress = 'THjY7rDKfjMiyCFMoCMCXdQAtRakD21RZQ'
const swapAddress = 'TRXYvAoYvCqmvZWpFCTLc4rdQ7KxbLsUSj'
const credits2Address = 'TWkuzBQqzJpQFYoX4DXzMeswgeAqH7EkX2'
var contractAddress
var currentAddress
var network
var tronLinkUrlPrefix
var credits
var waiting = 0
var loaded = false

let trxVolume


$(document).ready(async () => {
    window.addEventListener('load', async () => {
        main()
    })
})

async function main() {

    //First UI render
    showStats()


}

async function showStats() {

    try {

        let network_stats = (await axios.get('https://bnkr-info.bankroll.network/network_stats', {timeout: 5000})).data


        $('#totalTxs').text(numeral(network_stats.txs).format('0,0.000 a').toUpperCase())

        let trxBalance = network_stats.aum
        //let ethBalance = await getPlatformUSDC()
        console.log('balances', trxBalance)
        $('#usdBalance').text(numeral(trxBalance).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text(numeral(network_stats.players).format('0.000 a').toUpperCase())

        loaded = true

    } catch (e) {
        console.error('showstats', e)
    }


    if (!loaded) {
        console.log('stat load retry')
        setTimeout(showStats, 500)
    }

}


function cleanAddress(address) {
    return address.trim().replace(/[^\u0000-\u007E]/g, "")
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


