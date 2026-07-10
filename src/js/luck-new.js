/*const tron_networks = {
    'mainnet': 'TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u',
    'shasta': 'TDfkwkxmwbgLJNS7RsFdcgJcjEWt2X8NdG'//'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}*/

tron_networks.mainnet_prev = 'TGayzfTYaPHcX9myXUK18TETmYurn9aSu3'
    tron_networks.mainnet = 'TUxeCSq2GGwLWyBE7Q32g5G6f7LkVPh6zu' //'TFLibm6RFRdebUobotPt2CrzpfCnujvxLr'//'TCSrbAQXwhuQf52Vn952wr9VMunPnmQUbo'//'TQaVYricNwsxKpeETcKxDr3KQB53mymsUv'//'TXx1M5d6WaD87PZwTcHGA9wMb9uqsazhw6' //'TW8joYEHfT25eUj3CmWQGYo4XmzXNp1Do6'//'TKjoHFN8cjfAcg5tsFMhpgRZGH6UvmtPXz'//'TCEFmxFvwuMo7mKWnJqx6gA23CQSY9XcLF' //'TRytotemxQqCUD4J5PxqGxsRm5Y8rvmVZX' //'TGayzfTYaPHcX9myXUK18TETmYurn9aSu3'//'TXhbZUj93e35vrsBhiarTcmgTSd27KokuL' //'TQDXUksSH9MjxzR6PyCx5DRDbFtidsJow8'//'TQTH2zyouhT4b2j7Dv6kwsBRRvcio7MLow'

tron_networks.shasta = 'TMWK2ay5ETwRfYeGX29NPPqFeE1GuNCi2M'//'TBpKhMEQSEeXmWkgTnGbSUJW1sA6ixzdQB'//'TY8MRhk1vTnsD97aAFcQ7Ci6TPyJJeYrSF' //'TQTzkSgYBMJDen2ycXgxTwZEZDTcYpU8ep'//'TMUYz2XBnDnmrweQijW1h8ucQgb6w7hARi'//'TLjB7fUBs42xngtH6qXkj7Xqh7rHdG1xLY'//'TQ7bx9Zi5DpRt2DSf4uHaV89GVRGBgPghf'////'TS5RDEonZ3Xq89Fau7N7r72G6vUL6Nj6aZ' //'TBW1rx9UZigmkcQn1HfSamhWxFeGATVKHZ' //'TVKAvXP9F82wxJdwvHLTBvySC7djJGb81d' //'TDR3oTBmpuwPrq6j3iBcaWfhugLF3oHDDH'
//tron_networks.shasta = 'TBW1rx9UZigmkcQn1HfSamhWxFeGATVKHZ'
let luckProxyAddress = 'TRuHayEZR3oN6VTRG7ZF1kVBmYGg5TsDKS'

const dailyAddress = 'THVYLtjFbXNcXwDvZcwCGivS95Wtd4juFn'
const creditsAddress = 'TUTik4srgKuzgXoL4KfV75foQbYuP8SirY'

let dailyContract
let creditsContract

const feeLimit = 150e6
const waitInterval = 1000
const retryInterval = 1000
const errorMax = 20
const minimumBet = 10
let errorCount = 0
let rolls = 0
let rollHung = false;

let distribution = []
let autoRoll = false
let isSoundOn = false
var currentAddress
var network

let slowTransactionsArr = []

let luck
let startTime
let jackpotTimestamp

let selectedNumber = 50
let selectedNumberLbl = $('#selectedNumber')
let betAmountInp = $('#betAmount')
let _globalMaxWager = 20

let buyAmountInp, buyEstimate

const sleep = m => new Promise(r => setTimeout(r, m))

async function checkBalances() {
    let day = (await dailyContract.myTokens().call()).toNumber()/1e6
    let credits = (await creditsContract.myTokens().call()).toNumber()/1e6
    let ok = day >= 100 && credits >= 100
    console.log('balances', {credits:credits, day:day, ok})
    return ok
}

function refreshLuckEvent(tx) {
    $('#txIdLuck').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#txModalLuck').modal()
    //setTimeout(mainLoop)
}

function showAlert(title, msg) {
    $('#alertTitle').text(title)
    $('#alertId').text(msg)
    $('#alertModal').modal()
}

function showError(msg) {
    $('#errorId').text(msg)
    $('#errorModal').modal()
    //setTimeout(mainLoop)
}

function shortId(str, size) {
    return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

function formatSun(sun) {
    return numeral(tronWeb.fromSun(sun)).format('0,0.000 a').toUpperCase()
}

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

async function donate() {
    if (!await checkResources()) {
        return
    }

    let amount = $('#donateAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        luck.donate().send({callValue: tronWeb.toSun(amount), feeLimit: feeLimit }).then(tx => {
            console.log('donate', amount, tx)
            refreshLocal(tx)
        }).catch(e => {
            txError(e)
        })
    }
}


$('#first-tab,#second-tab').click(() => {
    $('#dateColTitle').hide()
    $('#dateColTitle').css('margin-left', '0px')
    $('#tableTitleRow').show()
})

$('#third-tab,#fourth-tab,#fifth-tab,#eights-tab,#ninth-tab').click(() => {
    $('#tableTitleRow').hide()
})

$('#sixth-tab,#seventh-tab').click(() => {
    $('#dateColTitle').show()
    $('#dateColTitle').css('margin-left', '-30px')
    $('#tableTitleRow').show()
})

function refreshLocal(tx) {
    $('#txId').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#txModal').modal()
}

const roll = _.debounce(rollImpl, 300, {
    'leading': true,
    'trailing': false
})

async function rollImpl() {

    if (!await checkBalances()){
        showAlert('NOT SO FAST!!!', 'You need to funds Credits and Daily+ with 100 Credits/Day before playing Rocket & Luck. Play to Win!!!')
        return;
    }

    rolls++

    rollHung = false;

    let amount = $('#buyAmount').val().trim()
    if (amount < minimumBet || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        tronWeb.setDefaultBlock('latest');

        try {

            $('#luckyNumberLbl').addClass('rolling-text')

            startTime = Date.now()


            await fastPlay(amount)


        } catch (e) {
            errorCount++
            if (autoRoll && errorCount < errorMax) {
                setTimeout(roll, 0)
            } else {
                txError(e)
            }
        }
    }
}

async function fastPlay(amount) {
    try {
        $.notify({
            message: `<span class="text-white">ROLLING...</span>`
        }, {
            type: 'dark',
            delay: 1000,
            allow_dismiss: false,
            placement: {from:'bottom', align: 'left'}
        })
        let tx = await luck.roll().send({callValue: tronWeb.toSun(amount), feeLimit: feeLimit })
        setTimeout(checkTxStatus, waitInterval, tx, 0)
    } catch (e) {
        resetRollBoxUI()
    }
}



async function waitForTx(tx, confirmed) {
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


function resetRollBoxUI() {
    $('#autoRollChb').prop('checked', false)
    autoRoll = false
    $('#luckyNumberLbl').removeClass('rolling-text')
}

async function checkTxStatus(tx, count) {

    tronWeb.getEventByTransactionID(tx).then(events => {
        //Update Wallet
        showWalletInfo()
        if (events.length) {
            console.log('events', events)


            events = _.filter(events, (event) => {
                return event.name == 'onRoll'
            })

            if (events.length) {
                distribution.push(parseInt(events[0].result.roll))
                console.log('roll complete', rolls, (Date.now() - startTime) / 1000, events[0].result.roll, _.mean(distribution))

                $('#luckyNumberLbl').removeClass('rolling-text')


                // UPDATE MY BETS TAB
                const curTimeISO = new Date().toISOString()

                const logObj = {
                    player: currentAddress,
                    timestamp: curTimeISO,
                    roll: events[0].result.roll,
                    deposit: events[0].result.deposit,
                    bnkr: events[0].result.bnkr
                }

                rollOnUI(logObj)


                showUserStats()
            }

            //console.log('events', events)
            if (autoRoll) {
                roll()
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


$.fn.addCommas = function (nStr) {
    nStr += "";
    var x = nStr.split(".");
    var x1 = x[0];
    var x2 = x.length > 1 ? "." + x[1] : "";
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
        x1 = x1.replace(rgx, "$1" + "," + "$2");
    }
    return x1 + x2;
};


function bindUI() {


// Binding signature

    buyAmountInp = $('#buyAmount')

    buyEstimate = $('#buy-estimate')


    buyAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseInt(buyAmountInp.val().trim())
        let share = 2 * Math.max(amount / 100, 1)
        buyEstimate.text(`${numeral(amount - share).format('0.000 a').toUpperCase()} Credits`)
    })


    $('#autoRollChb').change(async (e) => {
        autoRoll = $(e.currentTarget).prop('checked')
        console.log('AUTO ROLL IS SET TO: ', autoRoll)
        if (!autoRoll) {
            await complete()
        }
    })


    $('#soundChb').change((e) => {
        isSoundOn = $(e.currentTarget).prop('checked')
        console.log('SOUND IS SET TO: ', isSoundOn)
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

    const isWin = randomNumber > 0

    const firstNumber = isWin ? randomNumber : 0

    const animationTime = isWin ? '1800' : '900'

    $('#lines')
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
                $('#won-bnkr').html(`<span class="text-success">${formatSun(event.bnkr)}</span><br>BNKR`)
            }
        );

    if (!isWin) {
        $('#lines')
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
                    $('#won-bnkr').html(`<span class="text-danger">${formatSun(event.bnkr)}</span><br>BNKR`)
                }
            );
    }

    if (isWin){
        $.notify({
            message: `<span class="text-white">+ ${formatSun(event.bnkr)} BNKR</span>`
        }, {
            type: 'success',
            delay: 1000,
            allow_dismiss: false,
            placement: {from:'bottom', align: 'left'}
        })
    }


}

async function showStats() {
    try {

        $('#totalBNKR').text(formatSun((await luck.totalBNKR().call()).toNumber()))
        $('#totalTxs').text(numeral((await luck.totalTxs().call())).format('0,0.000 a').toUpperCase())
        $('#totalCredits').text(formatSun((await luck.totalDeposits().call()).toNumber()))
        $('#getTotalMembers').text((await luck.players().call()))
        $('#contractBalance').text(formatSun((await tronWeb.trx.getBalance(contractAddress))))
    } catch(e){}

}

async function showUserStats() {
    let stats = await luck.statsOf(currentAddress).call()

    $('#user-rolls').text(numeral(stats[2].toNumber()).format('0.000 a').toUpperCase())
    $('#user-bnkr').text(formatSun(stats[1].toNumber()))
    $('#user-deposits').text(formatSun(stats[0].toNumber()))

}


function trust(addr) {
    luck.updateTrust(addr).send().then(console.log).catch(console.error);
}

const WIN_CLASS = 'success'
const LOSE_CLASS = 'danger'
const HYPHEN = '-'

let allBetsData = []

const updateAllBetsUI = (newData) => {
    const MAX_LENGTH = 50
    allBetsData = newData.concat(allBetsData)
    if (allBetsData.length > MAX_LENGTH) {
        allBetsData = allBetsData.slice(0, MAX_LENGTH + 1)
    }

    const allBetsTemplateHtml = `${allBetsData.map((item) =>
        `<div class="row">
        <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.player}')">
                        ${shortId(item.player, 5)}
                        </a>
                            <div class="w-15 w-xs-100 mb-2">
                                 <span class="text-${item.roll > 0 ? WIN_CLASS : LOSE_CLASS}">${item.roll}</span>
                            </div>
                            <div class="w-15 w-xs-100 mb-2">
                                ${formatSun(item.deposit)}
                            </div>
                            <p class="mb-1  w-15 w-xs-100  pl-0 pr-0"><span class="text-white">${formatSun(item.bnkr)}</span></p>
                    </div>
                </div>
            </div>
         </div>
    </div>`
    ).join('')}`

    $('#allBetsContent').html(allBetsTemplateHtml)
}

const loadNewAllBetsData = async () => {
    const ROLL_EVENT = 'onRoll'
    let requestObj = {size: 50, eventName: ROLL_EVENT}

    let res
    try {
        res = await tronWeb.getEventResult(contractAddress, requestObj)

        //const rawRollDbData = _.filter(res, obj => obj.name === ROLL_EVENT);


        const rollDbData = _.map(res, (obj) => {
            obj.timestamp = new Date(obj.timestamp)
            obj.event = obj.name
            delete obj.name
            // ! TODO: verify path to 'player' in luck event content
            if (obj.result) {
                obj.player = obj.result.player && tronWeb.address.fromHex(obj.result.player)
                obj.deposit = obj.result.deposit
                obj.roll = obj.result.roll
                obj.bnkr = obj.result.bnkr
            }


            delete obj.result
            delete obj.resourceNode
            return obj
        })

        updateAllBetsUI(rollDbData)
    } catch (e) {
        console.log(e)
    }

}

const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}


async function getCurrentTimestamp() {
    let block = await tronWeb.trx.getCurrentBlock()
    //return block
    return block.block_header.raw_data.timestamp
}

async function main() {

    luck = await tronWeb.contract().at(contractAddress)
    dailyContract = await tronWeb.contract().at(dailyAddress)
    creditsContract = await tronWeb.contract().at(creditsAddress)

    jackpotTimestamp = 0
    setNetwork()
    bindUI()

    //showWalletInfo()

    // return

    await Promise.all([showUserStats(), showStats(),loadNewAllBetsData()])


    setInterval(loadNewAllBetsData, 5000)
    setInterval(showStats, 5000)
    setInterval(showUserStats, 15000)

}

function mainLoop() {

}



