//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TCc2GDHSG3VE2GfTXseNma8RSi1iTF7yWE',//'TFN6syP5GmZ13sbRDoPMwaucacxzNz4aUA',//'TFypUutFr2Fbfp3bbKkgatMGayBqNydADk',//'TNn9rqesarhMLSDuoYWe96ry7fUBCKvEE8',//'TKue5tHyVn7bTmSXyyZ9LXB6T3eTPsQGZc',//'TNALgvKej92jdzUtJ6kVpFrmgzLzhukCNK',//'TLUWBWx2vaeKohScVKiSv5QBMuP7fnc6WQ',//'TVZz8o5cBVByELRt7YhPMDrawc3irQaQ41',//'TRYcG8TWVaM1RgNKJZ2hEVDoafBWmbGgUG',//'TL3Gxm9KhF4Qgyf9RtvCXh8kcemw7eVVSm',//'TZ1ekYz4VkecTT112WLLxqncpXpD9jAnzc', //'THEA3DKyvufxh63DYdZMrqvyyWQcFAj6AL',//'TUTik4srgKuzgXoL4KfV75foQbYuP8SirY',
    'shasta': 'TTWHUZoB99j3tTtrqDQfhxA8ihCRs2gZQL'//'TPLvNuKqqJbSDwwToqYanAKczxsGTe8wtz'//'TSo21nsdBDXezkugjyo5xM1SgDhfAowExP'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

const dailyAddress = 'THVYLtjFbXNcXwDvZcwCGivS95Wtd4juFn'
const creditsAddress = 'TUTik4srgKuzgXoL4KfV75foQbYuP8SirY'
const fastAddress = 'TNYMAeKiTPKDgeeAtD7hebneYYDUt9QdoY'

let dailyContract
let creditsContract
let fastContract

const DEFAULT_AUTOROLL_INTERVAL = 5

let autoRollInterval = DEFAULT_AUTOROLL_INTERVAL
let autoRoll = false
let maxRound = 0;
let divPool = 1
const feeLimit = 20e6
const retryInterval = 1000
const captainInterval = 10 * 1000
const CAPTAIN = 'CAP!'
let isSoundOn = false
let buyTimer = null




var contractAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
var rocket
var waiting = 0
let supply = 1
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate, numberSlider

var players = {}


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



        rocket = await tronWeb.contract().at(contractAddress)
        dailyContract = await tronWeb.contract().at(dailyAddress)
        creditsContract = await tronWeb.contract().at(creditsAddress)
        fastContract = await tronWeb.contract().at(fastAddress)

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

async function checkBalances() {
    let day = (await dailyContract.myTokens().call()).toNumber()/1e6
    let credits = (await creditsContract.myTokens().call()).toNumber()/1e6
    let ok = day >= 100 && credits >= 100
    console.log('balances', {credits:credits, day:day, ok})
    return ok
}

async function waitForTx(tx) {
    console.log('wait tx', tx)
    let events = await tronWeb.getEventByTransactionID(tx)
    let count = 0

    while (!events.length && count < 20) {
        await sleep(600)
        count++
        events = await tronWeb.getEventByTransactionID(tx)
    }

    console.log('wait events', tx, events)
    return events
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
        amount =  amount * 0.85 //after fees
        buyEstimate.html(`${numeral(amount).format('0.00')} gallons`)
    })


    $('#autoRollChb').change(async (e) => {
        autoRoll = $(e.currentTarget).prop('checked')
        console.log('AUTO ROLL IS SET TO: ', autoRoll)
        /*if (autoRoll) {
            showAutoRollModal()
        }*/
    })

    $('#soundChb').change((e) => {
        isSoundOn = $(e.currentTarget).prop('checked')
        console.log('SOUND IS SET TO: ', isSoundOn)
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
        $('#walletBalanceValue').text(formatSun(await fastContract.balanceOf(currentAddress).call()))
    } catch (e) {
    }
}

async function showStats() {
    try {
        let lead = tronWeb.address.fromHex((await rocket.whale().call()))

        let carry = tronWeb.address.fromHex((await rocket.carryWhale().call()))

        if (lead == currentAddress) {
            $('#lucky').removeClass('text-danger')
            $('#lucky').addClass('text-success')
            $('#lucky').text(CAPTAIN)
        } else if ($('#lucky').text() == CAPTAIN) {
            $('#lucky').removeClass('text-success')
            $('#lucky').addClass('text-danger')
            $('#lucky').text('POOF!')
        }
        let leadStats = await rocket.ticketStats(lead).call()
        let stageSize = Math.floor((await rocket.stageSize().call()).toNumber()/1e6)
        let luckyNumber = (await rocket.luckyNumber().call()).toNumber()

        let stats = await rocket.gstats().call()
        let round = (await rocket.round().call()).toNumber()
        let totalGallons = (await rocket.totalGallons().call()).toNumber()
        let totalBNKR = (await rocket.totalBNKR().call()).toNumber()
        let multiplier = (await rocket.participationMultiplier().call()).toNumber()
        let partSize = (await rocket.participationSize().call()).toNumber()
        $('.lucky-number').text(luckyNumber)
        $('#lead-player').text(shortId(lead, 3))
        $('#carry').text(shortId(carry,3))
        $('#max-carries').text((await rocket.maxCarries().call()).toNumber())
        $('.lead-gallons').text(formatTRX(leadStats[1]))
        $('#whaleMsg').text(`Captain election requires a minimum of ${stageSize} gallons per round.  Play to Win!`)
        $('#totalGallons').text(numeral(totalGallons).format('0,0.000 a').toUpperCase())
        $('#totalBNKR').text(formatSun(totalBNKR))
        $('#participation-size').text(formatSun(partSize))
        $('#round').text(round)
        $('#lines').text(`${multiplier}x`)
        $('#participation-multiplier').text(`${multiplier} X`)
        $('.jackpotBalance').text(formatSun(stats[0].toNumber()))

        $('#totalTickets').text(numeral(totalGallons).format('0.000 a').toUpperCase())

        rocket.totalTxs().call().then((value) => { $('#totalTxs').text(numeral(value.toNumber()).format('0,0.000 a').toUpperCase())}).catch(e=>{})
        rocket.players().call().then((value) => { $('#getTotalMembers').text(value.toNumber())}).catch(e=>{})
        rocket.currentPlayers().call().then((value) => { $('#current-players').text(value.toNumber())}).catch(e=>{})
        rocket.gallonsAmount().call().then((value) => { $('#current-gallons').text(formatTRXCurTickets(value.toNumber()))}).catch(e=>{})
        rocket.totalTronBalance().call().then((value) => { $('#contractBalance').text(formatSun(value.toNumber()))}).catch(e=>{})

    } catch (e) {
        console.log('showStats error', e.message, e)
    }
}

async function updateCountDown() {
    let time = (await rocket.timeLeft().call()).toNumber()
    console.log('time-left', time)
    let date = moment().add(time, 'seconds').toDate()


    if (time) {

        $('#time-left').countdown(date).on('update.countdown', function (event) {
            var format = 'ends in %H:%M:%S';
            $(this).text(event.strftime(format));
        })
            .on('finish.countdown', function (event) {
                $(this).text('is Ready!!!')

            })



        $('#round-countdown').countdown(date).on('update.countdown', function (event) {
            var format = '%H:%M:%S';
            $(this).text(event.strftime(format));
        })
            .on('finish.countdown', function (event) {
                $(this).text('Ready!!!')

            })

    } else {
        $('#time-left').text('is Ready!!!')
        $('#round-countdown').text('Ready!!!')
    }


}

async function newAccount() {

    let stats = await rocket.statsOf(currentAddress).call()

    if (stats[0].toNumber() == 0) {
        let title = 'Welcome to Rocket!'
        let msg = 'You can get started by buying some gallons this round!!! Your info panel will make a lot more sense after that. Good Luck!!!'

        showAlert(title, msg)
    }
}


async function showUserStats() {
    try {
        //supply = (await daily.totalSupply().call()).toNumber() + 1
        let gallonStats = await rocket.ticketStats(currentAddress).call()
        let stageSize = Math.floor((await rocket.stageSize().call()).toNumber()/1e6)
        let stats = await rocket.statsOf(currentAddress).call()
        let eligible = stats[3].toNumber() > stageSize * 1e6
        $('#user-deposits').text(formatSun(stats[0].toNumber()))
        $('#user-bnkr').text(formatSun(stats[1].toNumber()))
        $('#user-pumps').text(stats[2].toNumber())
        $('#carries').text(`${gallonStats[2].toNumber()} carries`)
        $('#bonus').text(`${formatSun(stats[4].toNumber())} bonus gallons`)
        $('#user-eligibility').html(`Captain Status: ${eligible ? 'Ready':'Tank Low'} <br> ${numeral(stats[3].toNumber()/1e6).format('0 a').toUpperCase()} of ${stageSize} gallons required to roll`)
        //$('#user-eligibility').css('color', eligible ? 'green':'red')
        $('#user-eligibility').removeClass('text-success')
        $('#user-eligibility').removeClass('text-danger')
        $('#user-eligibility').addClass(`text-${eligible ? 'success':'danger'}`)
        $('#user-balance').html(`&#8776; ${formatSun(stats[3].toNumber())} gallons / Ready to ${eligible ? 'FLUSH':'PUMP'}!!!`)
        $('.user-gallons').text(numeral(gallonStats[1].toNumber()).format('0.000 a').toUpperCase())
        $('#user-rounds').text(gallonStats[4].toNumber())
        $('#user-wins').text(gallonStats[5].toNumber())
    } catch (e) {

        console.log('showUserStats error', e.message, e)
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
    let amount = (await rocket.myDividends(true).call()).toNumber()
    if (amount < 10e6) {
        showAlert('LOW TO NO DIVS!!!', 'Slow down there buddy, you need to have at least 10 TRX in divs first!')
        return
    }


    if (!await checkResources()) {
        return
    }

    rocket.claim().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('withdraw', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function reinvest() {

    let amount = (await rocket.myDividends(true).call()).toNumber()
    if (amount < 10e6) {
        showAlert('LOW TO NO DIVS!!!', 'Slow down there buddy, you need to have at least 10 TRX in divs first!')
        return
    }


    rocket.reinvest().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('reinvest', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function buy(clicked) {

    if (! await checkBalances()){
        showAlert('NOT SO FAST!!!', 'You need to funds Credits and Daily+ with 100 Credits/Day before playing Rocket & Luck. Play to Win!!!')
        return
    }

    if ((await tronWeb.trx.getBalance()) < 100e6){
        showAlert('Watch your Levels!!!', 'You need to have more than 100 TRX in your wallet! Load up before playing Rocket!')
        return
    }

    if (buyTimer != null){
        clearTimeout(buyTimer)
    }

    let lead = tronWeb.address.fromHex((await rocket.whale().call()))
    if (lead == currentAddress && autoRoll && !clicked) {

        buyTimer = setTimeout(buy, captainInterval)
        console.log('captain now', 'skipping auto buy')
    } else {

        var amount = $('#buyAmount').val().trim()
        if (amount < 10 || !isFinite(amount) || amount === '') {
            $('#invalidAmountModal').modal()
        } else {
            var referrer = getReferrer()
            rocket.buy().send({callValue: tronWeb.toSun(amount), feeLimit: feeLimit}).then(tx => {
                console.log('buy', referrer, amount, tx)

                if (!autoRoll) {
                    refresh(tx)
                }
                setTimeout(checkTxStatus, retryInterval, tx, 0)
            }).catch(e => {
                txError(e)
            })

        }
    }

    return false;
}

async function checkTxStatus(tx, count) {

    tronWeb.getEventByTransactionID(tx).then(async events => {
        //Update Wallet
        showWalletInfo()
        if (events.length) {
            console.log('events', events)


            events = _.filter(events, (event) => {
                return event.name == 'onWhaleElection'
            })

            if (events.length) {

                let roll = parseInt(events[0].result.roll)
                const logObj = {
                    roll: roll,
                    win: events[0].result.challenger == events[0].result.winner,
                    bonus: [0,50,100].indexOf(roll) != -1
                }

                rollOnUI(logObj)


                showUserStats()

            }

            //console.log('events', events)
            if (autoRoll) {
                buy()
            }
        } else {

            if (count < 20) {
                setTimeout(checkTxStatus, retryInterval, tx, ++count)
            } else {

                if (autoRoll) {
                    roll()
                }

            }
        }

    }).catch(e => {
        console.log('not found', count, e.message)
        if (count < 20) {
            setTimeout(checkTxStatus, retryInterval, tx, ++count)
        } else {

            showError('Looks like the roll hung.  You can claim or roll again to complete')
            resetRollBoxUI()
            //txError(e)
        }

    })

}

const soundWin = new Audio()
soundWin.src = 'media/swin.mp3'
soundWin.volume = 0.1

const soundLose = new Audio()
soundLose.src = 'media/slose.mp3'
soundLose.volume = 0.1

const soundJackpot = new Audio()
soundJackpot.src = 'media/ojackpot.mp3'
soundJackpot.volume = 0.1

const soundLocalJackpot = new Audio()
soundLocalJackpot.src = 'media/jackpot.mp3'
soundLocalJackpot.volume = 0.1

function rollOnUI(event) {
    // animateNumber accepts same arguments, as animate does
    // it adds only 'number' and 'numberStep' params

    const randomNumber = event.roll // Math.ceil(Math.random() * 100)

    const startNumber = 0

    const isWin = event.win

    const isBonus = event.bonus

    const firstNumber = isWin ? randomNumber : 0

    const animationTime = isWin ? '1800' : '900'

    $('#lucky')
        .prop('number', startNumber)
        .animateNumber(
            {
                number: firstNumber,
                color: 'green', // require jquery.color
                // 'font-size': '50px',

                easing: 'easeInQuad' // require jquery.easing

            },
            animationTime,
            function () {
                if (isWin && isSoundOn) {
                    soundWin.play()
                }
                $('#lucky').removeClass('text-danger')
                $('#lucky').addClass('text-success')
            }
        );

    if (!isWin) {
        $('#lucky')
            .prop('number', 0)
            .animateNumber(
                {
                    number: randomNumber,
                    color: 'red', // require jquery.color
                    // 'font-size': '50px',

                    easing: 'easeInQuad', // require jquery.easing
                },
                animationTime,
                function () {
                    if (isSoundOn) {
                        soundLose.play()
                    }
                    $('#lucky').removeClass('text-success')
                    $('#lucky').addClass('text-danger')
                }
            );
    }

    if (isWin){
        $.notify({
            message: `<span class="text-white">Look at you! Look at you!  You are the captain NOW!</span>`
        }, {
            type: 'success',
            delay: 1000,
            allow_dismiss: false,
            placement: {from:'bottom', align: 'left'}
        })
    } else if (isBonus){
        $.notify({
            message: `<span class="text-white">Bonus Time! More Gallons for YOU!!!</span>`
        }, {
            type: 'success',
            delay: 1000,
            allow_dismiss: false,
            placement: {from:'bottom', align: 'left'}
        })
    }

}

function resetRollBoxUI() {
    $('#autoRollChb').prop('checked', false)
    autoRoll = false
}

async function flush () {

    let stats = await rocket.statsOf(currentAddress).call()

    if (stats[3].toNumber() < 100e6){
        showAlert('Got to Pump More!!!', 'You need to have at least 100 gallons to flush!')
        return
    }

    if ((await tronWeb.trx.getBalance()) < 10e6){
        showAlert('Watch your Levels!!!', 'You need to have at least 10 TRX in your wallet to flush!')
        return
    }

    rocket.flush().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('flush', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })

    return false;
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
                obj.gallons = parseFloat(obj.result.gallons)
                obj.round = obj.result.round
                //obj.incomingtron = Math.floor(obj.result.incomingtron / SUN_IN_TRX)
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })
        activityDbData = _.filter(activityDbData, (obj) => {
            return obj.gallons > 0;
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
                        <p class="mb-1 text-white w-40 w-xs-100">Fuel</p>
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
                            <p class="mb-1 text-white w-40 w-xs-100">${formatTRX(item.gallons)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#activityContent').html(activityTemplateHtml)
}

const getCarries = async (player) =>{
    let stats = await rocket.ticketStats(player).call()
    players[player].carries = stats[2].toNumber()
    players[player].totalCarries = stats[6].toNumber()
}

const loadElectionData = async () => {
    const ACTIVITY_EVENT = 'onWhaleElection' //'onPurchase'
    let requestObj = {size: 100, eventName: ACTIVITY_EVENT}

    const SUN_IN_TRX = 1000000

    /*
    emit onWhaleElection(
        round,
        roll,
        luckyNumber,
        current,
        challenger,
        winner,
        scores[winner].carries,
        whaleWinners
    );
    */


    let res
    try {
        res = await tronWeb.getEventResult(contractAddress, requestObj)
        let activityDbData = _.map(res, (obj) => {
            obj.timestamp = new Date(obj.timestamp)
            obj.event = obj.name
            delete obj.name
            if (obj.result) {
                obj.round = parseInt(obj.result.round);
                obj.roll = parseInt(obj.result.roll);
                obj.luckyNumber = parseInt(obj.result.roundNumber);
                obj.current = tronWeb.address.fromHex(obj.result.current)
                obj.challenger = tronWeb.address.fromHex(obj.result.challenger)
                obj.winner = tronWeb.address.fromHex(obj.result.winner)
                obj.carryWinner = tronWeb.address.fromHex(obj.result.carryWinner)
                obj.carries = parseInt(obj.result.winnerCarries);
                obj.totalWinners = parseInt(obj.result.totalWinners);
            }




            if (players[obj.winner] != null) {
                setTimeout(getCarries,0,obj.winner)
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })

        activityDbData = _.slice(activityDbData, 0, 50)

        updateElectionUI(activityDbData)
    } catch (e) {
        console.log(e)
    }

}


const updateElectionUI = async (newData) => {
    // const MAX_LENGTH = 50

    // activityData = newData.concat(activityData)
    // if (activityData.length > MAX_LENGTH) {
    //     activityData = activityData.slice(0, MAX_LENGTH + 1)
    // }

    if (!newData.length){
        activityData = []
    } else {
        activityData = newData
    }



    const activityTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <p class="mb-1 text-white w-10 w-xs-100">Round</p>
                        <p class="mb-1 text-white w-10 w-xs-100">Roll</p>
                        <div class="w-15 w-xs-100">    
                            Captain
                        </div>
                        <!--<div class="w-15 w-xs-100">    
                            Carry
                        </div>-->
                         <div class="w-15 w-xs-100">    
                            Challenger
                        </div>
                        <p class="mb-1 text-white w-10 w-xs-100">Carries</p>
                        <p class="mb-1 text-white w-10 w-xs-100">Turnovers</p>
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
                            <p class="mb-1 text-white w-10 w-xs-100">${item.round}</p>
                            <p class="text-${item.roll == item.luckyNumber || [0,50,100].indexOf(item.roll) != -1 ? 'success':'danger'} mb-1 w-10 w-ws-100">${item.roll}</p>
                            <a class="text-${item.current == item.winner ? 'success':'danger'} p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-15 w-xs-100" onclick="clipCopy('${item.current}')">
                            ${shortId(item.current, 5)}
                            </a>
                            <!--<a class="text-success p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-15 w-xs-100" onclick="clipCopy('${item.carryWinner}')">
                            ${shortId(item.carryWinner, 5)}
                            </a>-->
                            <a class="text-${item.challenger == item.winner ? 'success':'danger'} p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-15 w-xs-100" onclick="clipCopy('${item.challenger}')">
                            ${shortId(item.challenger, 5)}
                            </a>
                            <p class="mb-1 text-white w-10 w-xs-100">${item.carries}</p>
                            <p class="mb-1 text-white w-10 w-xs-100">${item.totalWinners}</p>

                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#captainContent').html(activityTemplateHtml)
}

const loadFlushData = async () => {
    const ACTIVITY_EVENT = 'onFlush' //'onPurchase'
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
                obj.tron = parseFloat(obj.result.tron)
                obj.bnkr = parseFloat(obj.result.bnkr)
                obj.bonus = parseInt(obj.result.bonus)
                obj.multiplier = obj.result.multiplier
                //obj.round = obj.result.round
                //obj.incomingtron = Math.floor(obj.result.incomingtron / SUN_IN_TRX)
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })
        activityDbData = _.filter(activityDbData, (obj) => {
            return obj.tron > 0;
        })

        activityDbData = _.slice(activityDbData, 0, 50)

        updateFlushUI(activityDbData)
    } catch (e) {
        console.log(e)
    }

}



const updateFlushUI = async (newData) => {
    // const MAX_LENGTH = 50

    // activityData = newData.concat(activityData)
    // if (activityData.length > MAX_LENGTH) {
    //     activityData = activityData.slice(0, MAX_LENGTH + 1)
    // }

    if (!newData.length){
        return;
    }

    activityData = newData

    let lastFlush = activityData[0]

    $('#won-bnkr').html(`${formatSun(lastFlush.bnkr)}`)
    $('#last-minted').text(`${shortId(lastFlush.player,3)}`)

    const activityTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="w-20 w-xs-100">    
                            Player
                        </div>
                        <p class="mb-1 text-white w-15 w-xs-100">Fuel</p>
                        <p class="mb-1 text-white w-15 w-xs-100">BNKR</p>
                        <p class="mb-1 text-white w-15 w-xs-100">Bonus</p>
                        <p class="mb-1 text-white w-15 w-xs-100">Multiplier</p>
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
                            <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.tron)}</p>
                            <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.bnkr)}</p>
                            <p class="mb-1 text-${item.bonus ? 'success':'danger'} w-15 w-xs-100">${item.bonus}</p>
                            <p class="mb-1 text-white w-15 w-xs-100">${item.multiplier}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#activityContent2').html(activityTemplateHtml)
}


async function pullRoundData() {
    let pages = 0
    let repeats = 0
    let lastMin = 0
    let startTime = Math.floor(Date.now()/1000) - (86400 * 1.1) // a little over 1 day in the past
    let fingerprint = await loadData(null, startTime)
    let breaker = {rank:0, min:0}
    //players = {} //reset players
    while (fingerprint){
        fingerprint = await loadData(fingerprint, startTime)
        breaker = await updateRoundPlayers()
        pages++
    }
    updateRoundPlayers()
}

const updateRoundPlayers = async () => {

    let playerRes = _.values(players)


    let round = (await rocket.round().call()).toNumber().toString()

    if (round > maxRound) {
        maxRound = round
        updateCountDown()
    }

    playerRes  =  _.filter (playerRes, (player) => {
        return player.round == maxRound
    })

    if (!playerRes.length){
        return;
    }


    playerRes = _.orderBy(playerRes, ['carries'], ['desc'])


    let rank = 1
    let minimum = 0
    let playersList = _.map(playerRes, (obj) => {
        obj.rank = rank++
        return obj
    })

    playersList = _.slice(playersList, 0, 100)

    /*if (playersList.length == 100) {
        minimum = _.last(playersList).totalGallons
    }*/

    minimum = _.last(playersList).totalGallons

//  const tronscanPrefix = networkName === 'shasta' ? 'shasta.' : ''

    const leaderboardTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="mb-1 w-10 w-xs-100">Rank</div>
                        <div class="mb-1 w-20 w-xs-100">Player</div>
                        <div class="w-20 w-xs-100 text-white">
                            Carries
                        </div>
                        <div class="w-20 w-xs-100 text-white">
                            Fuel
                        </div>
                        <div class="w-20 w-xs-100">    
                            Rounds
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
        ${playersList.map((item) =>
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
                                ${item.carries}
                            </div>
                            <div class="w-20 w-xs-100 text-white">
                                ${formatTRX(item.gallons)}
                            </div>
                            
                            <div class="w-20 w-xs-100">
                                ${item.totalRounds}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#roundsContent').html(leaderboardTemplateHtml)
    return {rank:rank,min:minimum}
}


async function pullData() {
    let pages = 0
    let repeats = 0
    let lastMin = 0
    let startTime = Math.floor(Date.now()/1000) - (86400 * 1) //48 hours in the past
    let fingerprint = await loadData(null, startTime)
    let breaker = {rank:0, min:0}
    while (fingerprint){
        fingerprint = await loadData(fingerprint, startTime)
        breaker = await updateTopPlayers()
        pages++
        $("#loading").text(`Loading... ${pages}`)
    }
    updateTopPlayers()
    $("#loading").text('')
}


async function loadData(fingerprint = null, startTime) {
    let requestObj = {size: 200, eventName: 'onPlayerSummary'}

    if (fingerprint != null) {
        requestObj.previousLastEventFingerprint = fingerprint
    }

    let res
    let lastTime = 0

    try {
        res = await tronWeb.getEventResult(contractAddress, requestObj)

        if (res.length) {
            fingerprint = res[res.length - 1].fingerprint
            _.forEach(res, async value => {
                let account
                let player = tronWeb.address.fromHex(value.result.player)


                let timestamp = Math.floor(value.timestamp/1000)
                lastTime = timestamp


                if (players[player] == null || players[player].timestamp < value.timestamp) {
                    account = {player: player, timestamp: value.timestamp}
                    account.gallons = parseFloat(value.result.gallons)
                    setTimeout(getCarries,0,player)
                    account.divs = parseFloat(value.result.divs)
                    account.round = parseFloat(value.result.round)
                    account.totalGallons = parseFloat(value.result.totalGallons)
                    account.totalWins = parseFloat(value.result.totalWins)
                    account.totalRounds = parseFloat(value.result.totalRounds)
                    account.totalWhaleDivs = parseFloat(value.result.totalWhaleDivs)
                    players[player] = account
                }

            })

            return lastTime > startTime ? fingerprint : false
        }

    } catch (e) {
        return false
    }



}

const updateTopPlayers = async () => {

    let playerRes = _.values(players)

    if (!playerRes.length){
        return;
    }

    playerRes = _.orderBy(playerRes, ['totalCarries'], ['desc'])

    let rank = 1
    let minimum = 0
    let playersList = _.map(playerRes, (obj) => {
        obj.rank = rank++
        return obj
    })

    playersList = _.slice(playersList, 0, 100)


    minimum = _.last(playersList).totalCarries

//  const tronscanPrefix = networkName === 'shasta' ? 'shasta.' : ''

    const leaderboardTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="mb-1 w-10 w-xs-100">Rank</div>
                        <div class="w-20 w-xs-100 text-white">
                            Wins
                        </div>
                        <div class="mb-1 w-20 w-xs-100">Player</div>
                        <div class="w-20 w-xs-100">    
                            Carries
                        </div>
                        <div class="w-20 w-xs-100 text-white">
                            Fuel
                        </div>
               
                        <div class="w-20 w-xs-100">    
                            Rounds
                        </div>
                         <div class="w-20 w-xs-100 text-white">
                            Captain's Rewards
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
        ${playersList.map((item) =>
            `<div class="row">
            <div class="col-12 list">
                <div class="card d-flex flex-row mb-3">
                    <div class="d-flex flex-grow-1 min-width-zero">
                        <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                            <div class="w-10 w-xs-100">
                                ${item.rank}
                            </div>
                            <p class="mb-1 text-white w-20 w-xs-100">${item.totalWins}</p>
                            <div class="w-20 w-xs-100">
                            <a class="pt-1 pb-1 btn btn-outline-primary text-center list-item-heading mb-2" onclick="clipCopy('${item.player}')">
                                ${shortId(item.player, 5)}
                            </a>
                            </div>
                            <div class="w-20 w-xs-100">
                                ${formatTRX(item.totalCarries)}
                            </div>
                            <div class="w-20 w-xs-100 text-white">
                                ${formatTRX(item.totalGallons)}
                            </div>
                    
                            <div class="w-20 w-xs-100">
                                ${item.totalRounds}
                            </div>
                            <p class="mb-1 text-white w-20 w-xs-100">${formatSun(item.totalWhaleDivs)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $('#innerLeaderContent').html(leaderboardTemplateHtml)
    return {rank:rank,min:minimum}
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
                //obj.player = obj.result.wallet && tronWeb.address.fromHex(obj.result.wallet)
                obj.whaleWinner = tronWeb.address.fromHex(obj.result.whaleWinner)
                obj.carryWhale = tronWeb.address.fromHex(obj.result.carryWhale)

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
                        <div class="w-10 w-xs-100">    
                            Lucky #
                        </div>
                        <div class="w-10 w-xs-100 text-white">    
                            Players
                        </div>
                        <div class="w-20 w-xs-100">
                            Fuel / BNKR
                        </div>
                        <div class="w-15 w-xs-100 text-white">
                            Last Captain
                        </div>
                        <div class="w-15 w-xs-100 text-white">
                            Carry
                        </div>
                        <!--<div class="w-10 w-xs-100">
                            Fuel
                        </div>-->
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
                            <div class="w-10 w-xs-100">
                                ${item.lucky}
                            </div>
                            <div class="w-10 w-xs-100 text-white">
                                ${item.totalPlayers}
                            </div>
                            <div class="w-20 w-xs-100">
                                ${formatTRX(item.totalGallons)} / ${formatSun(item.totalBNKR)}
                            </div>
                            <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-15 w-xs-100" onclick="clipCopy('${item.whaleWinner}')">
                                ${shortId(item.whaleWinner, 5)}
                            </a>
                             <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-15 w-xs-100" onclick="clipCopy('${item.carryWhale}')">
                                ${shortId(item.carryWhale, 5)}
                            </a>
                            <!--<div class="w-10 w-xs-100">
                                 ${formatTRX(item.whaleGallons)}
                            </div>-->
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
    loadFlushData()
    loadElectionData()
    //updateLeaderboard()
    loadNewHistoryData()
    pullRoundData()
    pullData()
    setInterval(loadElectionData,5000)
    setInterval(loadNewActivityData, 5000)
    setInterval(pullRoundData, 5000)
    setInterval(pullData, 15000)
    setInterval(loadFlushData, 5000)
    //setInterval(updateLeaderboard, 5000)
    setInterval(loadNewHistoryData, 5000)
}