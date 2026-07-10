//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'THEA3DKyvufxh63DYdZMrqvyyWQcFAj6AL',//'TUTik4srgKuzgXoL4KfV75foQbYuP8SirY',
    'shasta': 'TTWHUZoB99j3tTtrqDQfhxA8ihCRs2gZQL'//'TPLvNuKqqJbSDwwToqYanAKczxsGTe8wtz'//'TSo21nsdBDXezkugjyo5xM1SgDhfAowExP'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

const DEFAULT_AUTOROLL_INTERVAL = 5

let autoRollInterval = DEFAULT_AUTOROLL_INTERVAL
let autoRoll = false
let maxRound = 0;
let divPool = 1
const feeLimit = 150e6


var contractAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
var daily
var waiting = 0
let supply = 1
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate, numberSlider


function clipCopy(str) {
    // Create new element
    var el = document.createElement('textarea');
    // Set value (string to be copied)
    el.value = str;
    // Set non-editable to avoid focus and move outside of view
    el.setAttribute('readonly', '');
    el.style = {position: 'absolute', left: '-9999px'};
    document.body.appendChild(el);
    // Select text inside element
    el.select();
    // Copy text to clipboard
    document.execCommand('copy');
    // Remove temporary element
    document.body.removeChild(el);

    $.notify({
        message: `<span class="text-white">Copied ${str}</span>`
    }, {
        type: 'dark',
        delay: 2000,
        allow_dismiss: false
    });
}

$(document).ready(async () => {
    setTimeout(main, 100);
})

async function main() {

    if (!(window.tronWeb && window.tronWeb.ready)) {
        waiting += 1;
        console.log('waiting', waiting)
        if (waiting == 50) {
            closeLoading()
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


        daily = await tronWeb.contract().at(contractAddress)
        console.log('found tronweb')
        currentAddress = tronWeb.defaultAddress['base58']
        console.log('current address', currentAddress)
        userTag(currentAddress)

        //First UI render
        try {
            Promise.all([mainLoop(), showStats(), showUserStats()])
        } catch (e) {

        } finally {
            closeLoading()
        }

        //setTimeout(updateCountDown, 100)

        //Detect new account
        newAccount()

        // Schedule loops
        setInterval(mainLoop, 2000)
        setInterval(showStats, 5000)
        setInterval(watchSelectedWallet, 2000)
        //setInterval(updateCountDown, 45000)
        loadTabsData()

    }

}

function bindUI() {
    buyAmountInp = $('#buyAmount')
    sellAmountInp = $('#sellAmount')
    transferAmountInp = $('#transferAmount')
    buyEstimate = $('#buy-estimate')
    sellEstimate = $('#sell-estimate')
    transferEstimate = $('#transfer-estimate')


    buyAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseInt(buyAmountInp.val().trim())
        amount =  amount * 0.6 //after fees
        let estimate = 100 * amount * 1e6 / supply
        let payoutEstimate = formatSun(divPool * 0.02 * (amount * 1e6 / supply))
        let dailyRate = numeral(100 * payoutEstimate / amount).format('0.000')
        buyEstimate.html(`&#8776; ${numeral(estimate).format('0.000000000')} % power , &#8776; ${payoutEstimate} TRX daily`)
        buyEstimate.addClass('text-white-50')
    })


    $('#autoRollChb').change(async (e) => {
        autoRoll = $(e.currentTarget).prop('checked')
        console.log('AUTO ROLL IS SET TO: ', autoRoll)
        if (autoRoll) {
            showAutoRollModal()
        }
    })

    numberSlider = document.getElementById('dailySlider')

    let formatter = (value) => {
        return `Every ${Math.floor(value)} ${(value == 1) ? 'minute' : 'minutes'}`
    }

    if (typeof noUiSlider !== 'undefined') {
        if ($('#dailySlider').length > 0) {
            noUiSlider.create(numberSlider, {
                start: DEFAULT_AUTOROLL_INTERVAL,
                connect: [true, false],
                tooltips: true,
                range: {
                    min: 1,
                    max: 15
                },
                step: 1,
                format: {
                    to: formatter,
                    from: function (value) {
                        return value
                    }
                }
            });
        }
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
    let trx = tronWeb.fromSun(sun)
    let result = numeral(trx).format('0,0.000 a').toUpperCase()
    result = result.includes('NAN') ? '0.0' : result
    return result
}

function formatTRXCurTickets(trx) {
    return numeral(trx).format('0,0.000 a').toUpperCase()
}

function formatTRX(trx) {
    return numeral(trx).format('0,0.000 a').toUpperCase()
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
    } catch (e) {
    }
}

async function showStats() {
    try {
        let stats = await daily.gstats().call()
        let round = (await daily.round().call()).toNumber()
        $('#round').text(round)
        $('.jackpotBalance').text(formatSun(stats[1].toNumber()))
        divPool = stats[2].toNumber()
        $('#dividendBalance').text(formatSun(stats[2].toNumber()))
        $('#totalTickets').text(numeral(stats[4].toNumber()).format('0.000 a').toUpperCase())

        daily.totalTxs().call().then((value) => { $('#totalTxs').text(numeral(value.toNumber()).format('0,0.000 a').toUpperCase())}).catch(e=>{})
        daily.players().call().then((value) => { $('#getTotalMembers').text(value.toNumber())}).catch(e=>{})
        daily.currentPlayers().call().then((value) => { $('#current-players').text(value.toNumber())}).catch(e=>{})
        daily.ticketsAmount().call().then((value) => { $('#current-tickets').text(formatTRXCurTickets(value.toNumber()))}).catch(e=>{})
        daily.totalTronBalance().call().then((value) => { $('#contractBalance').text(formatSun(value.toNumber()))}).catch(e=>{})

        /*
        $('#totalTxs').text(numeral((await daily.totalTxs().call()).toNumber()).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text((await daily.players().call()).toNumber())
        $('#current-players').text((await daily.currentPlayers().call()).toNumber())
        $('#current-tickets').text(formatTRXCurTickets((await daily.ticketsAmount().call()).toNumber()))
        $('#contractBalance').text(formatSun((await daily.totalTronBalance().call()).toNumber()))
        */
    } catch (e) {
        console.log('showStats error', e.message)
    }
}

async function updateCountDown() {
    let time = (await daily.timeLeft().call()).toNumber()
    console.log('time-left', time)
    let date = moment().add(time, 'seconds').toDate()

    /*
    if (time){
        time = `ends ${moment().add(time, 'seconds').fromNow()}`
    } else {
        time = 'is Ready!!!'
    }

   $('#time-left').text(time)
   */

    if (time) {

        $('#time-left').countdown(date).on('update.countdown', function (event) {
            var format = 'ends in %H:%M:%S';
            $(this).text(event.strftime(format));
        })
            .on('finish.countdown', function (event) {
                $(this).text('is Ready!!!')

            })
    } else {
        $('#time-left').text('is Ready!!!')
    }


}

async function newAccount() {

    let tokens = (await daily.myTokens().call()).toNumber()

    if (!tokens) {
        let title = 'Welcome to the Daily!'
        let msg = 'You can get started by buying your first set of tickets for this round!!! Your info panel will make a lot more sense after that. Good Luck!!!'

        showAlert(title, msg)
    }
}


async function showUserStats() {
    try {
        supply = (await daily.totalSupply().call()).toNumber() + 1
        let ticketStats = await daily.ticketStats(currentAddress).call()
        let stats = await daily.statsOf(currentAddress).call()
        let tokens = (await daily.myTokens().call()).toNumber()
        let estimate = formatSun(divPool * 0.02 * (tokens / supply))
        let balance = numeral(100 * tokens / supply).format('0.000')
        let divs = formatSun((await daily.myDividends(true).call()).toNumber())
        let referrals = formatSun((await daily.myReferrals().call()).toNumber())
        $('#user-rolls').text(stats[9].toNumber())
        $('#user-bonus').text(`${balance} %`)
        $('#user-vault').text(divs)
        $('#user-buddy').text(referrals)
        $('#user-estimate').text(`${estimate} TRX`)
        $('#user-claimed').text(formatSun(stats[1].toNumber()))
        $('.user-tickets').text(numeral(ticketStats[1].toNumber()).format('0.000 a').toUpperCase())
        $('#user-total-tickets').text(numeral(ticketStats[3].toNumber()).format('0.0 a').toUpperCase())
        $('#user-rounds').text(ticketStats[5].toNumber())
        $('#user-wins').text(ticketStats[6].toNumber())
    } catch (e) {

        console.log('showUserStats error', e.message, e)
    }

    //console.log('user stats', stats)
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

function autoRefresh(tx) {
    $('#autotxId').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#autotxModal').modal()
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



async function claim() {
    let amount = (await daily.myDividends(true).call()).toNumber()
    if (amount < 10e6) {
        showAlert('LOW TO NO DIVS!!!', 'Slow down there buddy, you need to have at least 10 TRX in divs first!')
        return
    }


    if (!await checkResources()) {
        return
    }

    daily.claim().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('withdraw', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function reinvest() {

    let amount = (await daily.myDividends(true).call()).toNumber()
    if (amount < 10e6) {
        showAlert('LOW TO NO DIVS!!!', 'Slow down there buddy, you need to have at least 10 TRX in divs first!')
        return
    }

    if (!await checkResources()) {
        return
    }

    daily.reinvest().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('reinvest', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function buy() {
    if (!await checkResources()) {
        return
    }

    var amount = $('#buyAmount').val().trim()
    if (amount < 10 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var referrer = getReferrer()
        daily.buy(referrer).send({callValue: tronWeb.toSun(amount), feeLimit: feeLimit }).then(tx => {
            console.log('buy', referrer, amount, tx)

            if (autoRoll) {
                $.notify({
                    message: `<span class="text-white">Scheduling buy in ${autoRollInterval} ${autoRollInterval == 1 ? 'minute' : 'minutes'}...</span>`
                }, {
                    type: 'dark',
                    delay: 1000,
                    allow_dismiss: false,
                    placement: {from: 'bottom', align: 'left'}
                })
                setTimeout(buy, autoRollInterval * 60000)
                setTimeout(autoRefresh, 2000, tx)
            } else {
                refresh(tx)
            }
        }).catch(e => {
            txError(e)
        })

    }
}

function showAutoRollModal() {
    const selectedInterval = autoRollInterval
    numberSlider.noUiSlider.set(selectedInterval)
    $('#autoRollIntModal').modal()
}

function updateAutorollInterval() {
    autoRollInterval = numberSlider.noUiSlider.get().split(' ')[1]
    console.log('autoRollInterval', autoRollInterval)
}


const API_URL = 'https://api.bankroll.network/txdaily'
//const API_URL = 'http://localhost:3003/txdaily'

const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}

const loadNewActivityData = async () => {
    const ACTIVITY_EVENT = 'onPlayerSummary' //'onPurchase'
    let requestObj = {size: 100, eventName: ACTIVITY_EVENT}

    const SUN_IN_TRX = 1000000

    let res
    try {
        res = await tronWeb.getEventResult(contractAddress, requestObj)
        let activityDbData = _.map(res, (obj) => {
            obj.timestamp = new Date(obj.timestamp)
            obj.event = obj.name
            delete obj.name
            if (obj.result) {
                obj.player = obj.result.player && tronWeb.address.fromHex(obj.result.player)
                obj.tickets = parseFloat(obj.result.tickets)
                obj.round = obj.result.round
                //obj.incomingtron = Math.floor(obj.result.incomingtron / SUN_IN_TRX)
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })
        activityDbData = _.filter(activityDbData, (obj) => {
            return obj.tickets > 0;
        })

        activityDbData = _.slice(activityDbData, 0, 50)

        updateActivityUI(activityDbData)
    } catch (e) {
        console.log(e)
    }

}


let activityData = []

const updateActivityUI = async (newData) => {
    // const MAX_LENGTH = 50

    // activityData = newData.concat(activityData)
    // if (activityData.length > MAX_LENGTH) {
    //     activityData = activityData.slice(0, MAX_LENGTH + 1)
    // }

    activityData = newData

    const activityTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="w-20 w-xs-100">    
                            Player
                        </div>
                        <p class="mb-1 w-15 w-xs-100">Round</p>
                        <p class="mb-1 text-white w-40 w-xs-100">Tickets</p>
                    </div>
                </div>
            </div>
            </div>
        </div>
        ${activityData.map((item) =>
            `<div class="row">
            <div class="col-12 list">
                <div class="card d-flex flex-row mb-3">
                    <div class="d-flex flex-grow-1 min-width-zero">
                        <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                            <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.player}')">
                            ${shortId(item.player, 5)}
                            </a>
                            <div class="w-15 w-xs-100">
                                 ${item.round}
                            </div>
                            <p class="mb-1 text-white w-40 w-xs-100">${formatTRX(item.tickets)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#activityContent').html(activityTemplateHtml)
}


const updateRounds = async () => {
    //return;
    const networkName = getNetworkName()

    let round = (await daily.round().call()).toNumber().toString()

    if (round > maxRound) {
        maxRound = round
        updateCountDown()
    }

    let roundsRes
    try {
        roundsRes = await $.ajax({
            url: API_URL + '/round?network=' + networkName + '&round=' + round
        });
    } catch (e) {
        //console.log(e)
        roundsRes = []
    }

    roundsData = _.map(roundsRes, (obj) => {
        obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
        return obj
    })

    let lead = roundsData[0]

    $('#lead-player').text(shortId(lead.player, 3))
    $('.lead-tickets').text(formatTRX(lead.tickets))

    const roundTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="w-20 w-xs-100">    
                            Player
                        </div>
                        <p class="mb-1 w-15 w-xs-100">Round</p>
                        <div class="w-25 w-xs-100 text-white">    
                            Tickets
                        </div>
                        <div class="w-25 w-xs-100">
                            Buys
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
        ${roundsData.map((item) =>
            `<div class="row">
            <div class="col-12 list">
                <div class="card d-flex flex-row mb-3">
                    <div class="d-flex flex-grow-1 min-width-zero">
                        <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                            <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.player}')">
                                ${shortId(item.player, 5)}
                            </a>
                            <div class="w-15 w-xs-100">
                                ${item.round}
                            </div>
                            <p class="mb-1 text-white w-25 w-xs-100">${formatTRX(item.tickets)}</p>
                            <div class="w-25 w-xs-100">
                                ${item.positions}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#roundsContent').html(roundTemplateHtml)
}


const updateLeaderboard = async () => {
    //return;
    const networkName = getNetworkName()
    let leaderboardRes
    try {
        leaderboardRes = await $.ajax({
            url: API_URL + '/leaderboard?network=' + networkName
        });
    } catch (e) {
        //console.log(e)
        leaderboardRes = []
    }

    let rank = 1
    leaderboardRes = _.map(leaderboardRes, (obj) => {
        obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
        obj.rank = rank++;
        return obj
    })

    const leaderboardTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="mb-1 w-10 w-xs-100">Rank</div>
                        <div class="mb-1 w-20 w-xs-100">Player</div>
                        <div class="w-20 w-xs-100 text-white">
                            Total Tickets
                        </div>
                        <div class="w-20 w-xs-100">    
                            Rounds
                        </div>
                        <div class="w-20 w-xs-100 text-white">
                            Wins
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
        ${leaderboardRes.map((item) =>
            `<div class="row">
            <div class="col-12 list">
                <div class="card d-flex flex-row mb-3">
                    <div class="d-flex flex-grow-1 min-width-zero">
                        <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                            <div class="w-10 w-xs-100">
                                ${item.rank}
                            </div>
                            <div class="w-20 w-xs-100">
                            <a class="pt-1 pb-1 btn btn-outline-primary text-center list-item-heading mb-2 pr-5 pl-5" onclick="clipCopy('${item.player}')">
                                ${shortId(item.player, 5)}
                            </a>
                            </div>
                            
                            <div class="w-20 w-xs-100 text-white">
                                ${formatTRX(item.total_tickets)}
                            </div>
                            <div class="w-20 w-xs-100">
                                ${item.total_rounds}
                            </div>
                            <p class="mb-1 text-white w-20 w-xs-100">${item.total_wins}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#leaderboardContent').html(leaderboardTemplateHtml)
}

const loadNewHistoryData = async () => {
    const HISTORY_EVENT = 'onRoundSummary'
    let requestObj = {size: 100, eventName: HISTORY_EVENT}

    let res
    try {
        res = await tronWeb.getEventResult(contractAddress, requestObj)
        const historyDbData = _.map(res, (obj) => {
            obj = Object.assign(obj, obj.result)
            obj.timestamp = new Date(obj.timestamp)
            obj.event = obj.name
            delete obj.name
            if (obj.result) {
                obj.player = obj.result.wallet && tronWeb.address.fromHex(obj.result.wallet)
                obj.whaleWinner = obj.result.whaleWinner && tronWeb.address.fromHex(obj.result.whaleWinner)
                obj.luckyWinner = obj.result.luckyWinner && tronWeb.address.fromHex(obj.result.luckyWinner)
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })

        updateHistoryUI(historyDbData)
    } catch (e) {
        console.log(e)
    }

}


let historyData = []

const updateHistoryUI = (newData) => {
    const MAX_LENGTH = 100
    historyData = newData;//.concat(historyData)
    if (historyData.length > MAX_LENGTH) {
        historyData = historyData.slice(0, MAX_LENGTH)
    }

    const historyTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="w-10 w-xs-100">    
                            Round
                        </div>
                        <div class="w-10 w-xs-100 text-white">    
                            Total Players
                        </div>
                        <div class="w-10 w-xs-100">
                            Total Tickets
                        </div>
                        <div class="w-15 w-xs-100 text-white">
                            Whale Winner
                        </div>
                        <div class="w-10 w-xs-100">
                            Whale Tickets
                        </div>
                        <div class="w-15 w-xs-100 text-white">
                            Lucky Winner
                        </div>
                        <div class="w-15 w-xs-100">
                            Lucky Strip
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
        ${historyData.map((item) =>
            `<div class="row">
            <div class="col-12 list">
                <div class="card d-flex flex-row mb-3">
                    <div class="d-flex flex-grow-1 min-width-zero">
                        <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                            <div class="w-10 w-xs-100">
                                ${item.round}
                            </div>
                            <div class="w-10 w-xs-100 text-white">
                                ${item.totalPlayers}
                            </div>
                            <div class="w-10 w-xs-100">
                                ${formatTRX(item.totalTickets)}
                            </div>
                            <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-15 w-xs-100" onclick="clipCopy('${item.whaleWinner}')">
                                ${shortId(item.whaleWinner, 5)}
                            </a>
                            <div class="w-10 w-xs-100">
                                ${formatTRX(item.whaleTickets)}
                            </div>
                            <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-15 w-xs-100" onclick="clipCopy('${item.luckyWinner}')">
                                ${shortId(item.luckyWinner, 5)}
                            </a>
                            <div class="w-15 w-xs-100">
                                ${item.luckyPosition}
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#historyContent').html(historyTemplateHtml)
}

async function loadTabsData() {
    loadNewActivityData()
    updateRounds()
    updateLeaderboard()
    loadNewHistoryData()
    setInterval(loadNewActivityData, 5000)
    setInterval(updateRounds, 5000)
    setInterval(updateLeaderboard, 5000)
    setInterval(loadNewHistoryData, 5000)
}