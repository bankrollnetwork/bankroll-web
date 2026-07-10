//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'THjY7rDKfjMiyCFMoCMCXdQAtRakD21RZQ',//'TXKaJj4ce3CMsvCo2FXMdkbzt5Rb4C16Mw',
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

let fastContract

var contractAddress
var tronWeb
var currentAddress
var mintAddress = 'TFMcU3QBGVB5ghtYw8g9wMV3rTFdkH2avv'
var custodyAddress = 'TPmqRz2HmrUDVDRgGxhZv4yAKBRWsRex4E'
var network
var tronLinkUrlPrefix
let credits, bnkrMint
var waiting = 0
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate, prices

var players = {}

var balanceFeed = []
let balanceChart, tronLocal


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
        bnkrMint = await tronWeb.contract().at(mintAddress)
        fastContract = await tronWeb.contract().at(fastAddress)

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
        setInterval(mainLoop, 5000)
        setInterval(showStats, 5000)
        setInterval(watchSelectedWallet, 2000)

        loadTabsData()
        pullData()
        initChart()
        loadChartData()
    }

}

function bindUI(){
    buyAmountInp = $('#buyAmount')
    sellAmountInp = $('#sellAmount')
    transferAmountInp = $('#transferAmount')
    buyEstimate = $('#buy-estimate')
    sellEstimate = $('#sell-estimate')
    transferEstimate = $('#transfer-estimate')

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
    Promise.all([showWalletInfo(),showUserStats()])
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
        $('#walletBalanceValue').text(formatSun(await fastContract.balanceOf(currentAddress).call()))
    } catch(e){
        console.error(e)
    }
}

async function showStats() {
    try {

        let [totalTxs, players, tronBalance, totalBNKR] =
            await Promise.all(
                [
                    credits.totalTxs().call(),
                    credits.players().call(),
                    credits.totalTronBalance().call(),
                    credits.totalMinted().call()
                ]
            )

        $('#totalTxs').text(numeral(totalTxs.toNumber()).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text(players.toNumber())
        $('#contractBalance').text(formatSun(tronBalance))
        $('#contractBalance-usdt').html(`${approxStr} ${formatSun(tronBalance * prices.usdt)} USDT`)
        $('#totalBNKR').text(formatSun(totalBNKR.toNumber()))
    }catch(e){}
}


async function showUserStats() {
    let [difficulty, stats, divs, level, efficiency, estimate] =
        await Promise.all(
            [
                bnkrMint.mintingDifficulty().call(),
                credits.statsOf(currentAddress).call(),
                credits.availableMint().call(),
                credits.fundingLevel(currentAddress).call(),
                credits.fundingScale(currentAddress).call(),
                credits.dailyEstimate(currentAddress).call()
            ]
        )

    difficulty = difficulty.toNumber()
    let balance = stats[0].toNumber()
    let referrals = stats[4].toNumber()
    let txs = stats[9].toNumber()
        divs = divs.toNumber()
    //referrals = referrals.toNumber()
    level = level.toNumber()
    estimate = estimate.toNumber()
    efficiency = efficiency.toNumber() / difficulty


    let rewards = 100 * (referrals/divs)


    $('#user-level').text(level)
    $('#user-txs').text(`${numeral(txs).format('0.000')}`)
    $('#user-mint').text(formatSun(stats[3].toNumber()))
    $('#user-bonus').text(formatSun(balance))
    $('#user-bonus-usdt').html(`${approxStr} ${formatSun(balance * prices.usdt)} USDT`)

    $('#user-vault').text(formatSun(divs))
    $('#user-vault-usdt').html(divs > 0 ? `${approxStr} ${formatSun(divs * prices.bnkr)} USDT` :'')
    $('#user-buddy').text(formatSun(referrals))
    $('#user-estimate').html(estimate ? `&#8776; ${formatSun(estimate)} BNKR daily  <small>*</small>` : 'Reliable BNKR Earnings with Zero Risk')
    $('#user-estimate-usdt').html(estimate ? `&#8776; ${formatSun(estimate * prices.bnkr)} USDT`:'')
    $('#user-return').text(`${numeral(efficiency).format('0.000')} %`)
    $('#user-rewards').text(`${numeral(rewards).format('0.000')} %`)

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



async function sell() {
    if (!await checkResources()){
        return
    }
    let tokens = tronWeb.fromSun((await credits.balanceOf(currentAddress).call()).toNumber())
    let amount = $('#sellAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        amount = Math.floor(Math.min(amount, tokens))
        $.notify({
            message: `<span class="text-white">The TRX has been sent to your wallet</span>`
        }, {
            type: 'dark',
            delay: 5000,
            allow_dismiss: true
        })
        credits.unfreeze(tronWeb.toSun(amount)).send({callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('unfreeze', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }

    return false;
}

async function claim() {

    if (!((await credits.availableMint().call()).toNumber())){
        showAlert('NO DIVS!!!','Slow down there buddy, you need to have some divs first!')
        return
    }

    var referrer = getReferrer()
    credits.claim(referrer).send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('claim', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })

    return false;
}

async function buy() {

    var amount = $('#buyAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        credits.freeze().send({callValue: tronWeb.toSun(amount), feeLimit: feeLimit}).then(tx => {
            console.log('freeze', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }

    return false;
}

async function pullData() {
    let pages = 0
    let repeats = 0
    let lastMin = 0
    let startTime = Math.floor(Date.now()/1000) - (86400 * 30) //48 hours in the past
    let fingerprint = await loadData(null, startTime)
    let breaker = {rank:0, min:0}
    while (fingerprint && (breaker.rank < 150 ? true : repeats < 40)){
        fingerprint = await loadData(fingerprint, startTime)
        breaker = await updateTopPlayers()
        if (breaker.min == lastMin) {
            repeats++
        } else {
            repeats = 0
            lastMin = breaker.min
        }
        pages++
        $("#loading").text(`Loading... ${pages}`)
    }
    updateTopPlayers()
    $("#loading").text('')
}

async function loadData(fingerprint = null, startTime) {
    let requestObj = {size: 200, eventName: 'onBalance'}

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
                let player = tronWeb.address.fromHex(value.result.customerAddress)

                let timestamp = Math.floor(value.timestamp/1000)
                lastTime = timestamp


                if (players[player] == null) {
                    account = {player: player}
                    account.tronBalance = parseFloat(value.result.tronBalance)
                    account.bnkrMinted = parseFloat(value.result.bnkrMinted)
                    players[player] = account
                } else {
                    account = players[player];
                    account.bnkrMinted = Math.max(account.bnkrMinted, parseFloat(value.result.bnkrMinted))
                }
            })

            return lastTime > startTime ? fingerprint : null
        }

    } catch (e) {
    }

    return null;

}

const updateTopPlayers = async () => {

    let playerRes = _.values(players)

    playerRes = _.orderBy(playerRes, ['tronBalance'], ['desc'])

    let rank = 1
    let minimum
    let playersList = _.map(playerRes, (obj) => {
        obj.rank = rank++
        return obj
    })

    playersList = _.slice(playersList, 0, 100)

    if (playersList.length == 100) {
        minimum = _.last(playersList).tronBalance
    }

//  const tronscanPrefix = networkName === 'shasta' ? 'shasta.' : ''

    const investTemplateHtml = `
  <div class="row">
      <div class="col-12 list">
          <div class="card d-flex flex-row mb-3">
              <div class="d-flex flex-grow-1 min-width-zero">
                  <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                      <div class="mb-1 w-10 w-xs-100">Rank</div>

                      <div class="w-30 w-xs-100">    
                        Player
                      </div>
                      <p class="mb-1 text-white w-15 w-xs-100">TRX</p>
                      <p class="mb-1  w-15 w-xs-100">BNKR (mined)</p>
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
                      <div class="w-30 w-xs-100">
                      <a class="pt-1 pb-1 btn btn-outline-primary text-center list-item-heading mb-2 pr-5 pl-5" onclick="clipCopy('${item.player}')">
                          ${shortId(item.player, 5)}
                      </a>
                      </div>
                      <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.tronBalance)}</p> 
                      <p class="mb-1 w-15 w-xs-100">${formatSun(item.bnkrMinted)}</p>
                  </div>
              </div>
          </div>
      </div>
    </div>`
    ).join('')}`
    $('#innerLeaderActivityContent').html(investTemplateHtml)
    return {rank:rank,min:minimum}
}

async function loadTabsData() {

    let loadPumps = () => {
        loadNewActivityData('onFreeze', 'buyActivityContent')
    }

    let loadDumps = () => {
        loadNewActivityData('onUnfreeze', 'dumpActivityContent')
    }

    let loadClaims = () => {
        loadNewActivityData('onClaim', 'claimActivityContent')
    }
    loadPumps()
    loadDumps()
    loadClaims()
    setInterval(loadPumps, 5000)
    setInterval(loadDumps, 5000)
    setInterval(loadClaims, 5000)
}

const loadNewActivityData = async (activity, content) => {
    const ACTIVITY_EVENT = activity //'onPurchase'
    let requestObj = {size: (activity == 'onClaim')? 200 : 50, eventName: ACTIVITY_EVENT}

    let res
    try {
        res = await tronWeb.getEventResult(contractAddress, requestObj)
        let activityDbData = _.map(res, (obj) => {
            obj.timestamp = new Date(obj.timestamp)
            obj.event = obj.name
            delete obj.name
            if (obj.result) {
                obj.player = tronWeb.address.fromHex(obj.result.customerAddress)
                if (activity == 'onClaim'){
                    obj.bnkr = parseFloat(obj.result.bnkr)
                } else {
                    obj.tron = parseFloat(obj.result.tron)
                }
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })

        if (activity == 'onClaim'){
            activityDbData = _.filter(activityDbData, (obj) =>{
                return obj.player != custodyAddress;
            })
        }

        activityDbData = _.slice(activityDbData, 0, 50)

        updateActivityUI(activity,content,activityDbData)
    } catch (e) {
        console.log(e)
    }

}


const updateActivityUI = async (activity, tab, activityData) => {


    const activityTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="w-20 w-xs-100">    
                            Address
                        </div>
                        <div class="w-15 w-xs-100">    
                            ${(activity == 'onClaim')? 'BNKR': 'TRX'}
                        </div>       
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
                            <div class="mb-1 text-white w-15 w-xs-100 ">${formatSun((activity == 'onClaim')? item.bnkr: item.tron)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $(`#${tab}`).html(activityTemplateHtml)
}



async function initChart() {
    /* 03.01. Getting Colors from CSS */
    var rootStyle = getComputedStyle(document.body);
    var themeColor1 = rootStyle.getPropertyValue("--theme-color-1").trim();
    var themeColor2 = rootStyle.getPropertyValue("--theme-color-2").trim();
    var themeColor3 = rootStyle.getPropertyValue("--theme-color-3").trim();
    var themeColor4 = rootStyle.getPropertyValue("--theme-color-4").trim();
    var themeColor5 = rootStyle.getPropertyValue("--theme-color-5").trim();
    var themeColor6 = rootStyle.getPropertyValue("--theme-color-6").trim();
    var themeColor1_10 = rootStyle
        .getPropertyValue("--theme-color-1-10")
        .trim();
    var themeColor2_10 = rootStyle
        .getPropertyValue("--theme-color-2-10")
        .trim();
    var themeColor3_10 = rootStyle
        .getPropertyValue("--theme-color-3-10")
        .trim();
    var themeColor4_10 = rootStyle
        .getPropertyValue("--theme-color-4-10")
        .trim();

    var themeColor5_10 = rootStyle
        .getPropertyValue("--theme-color-5-10")
        .trim();
    var themeColor6_10 = rootStyle
        .getPropertyValue("--theme-color-6-10")
        .trim();
    var primaryColor = rootStyle.getPropertyValue("--primary-color").trim();
    var foregroundColor = rootStyle
        .getPropertyValue("--foreground-color")
        .trim();
    var separatorColor = rootStyle.getPropertyValue("--separator-color").trim();

    Chart.defaults.global.defaultFontFamily = "'Nunito', sans-serif";

    var balanceTooltip = {
        backgroundColor: foregroundColor,
        titleFontColor: primaryColor,
        borderColor: separatorColor,
        borderWidth: 0.5,
        bodyFontColor: primaryColor,
        bodySpacing: 10,
        xPadding: 15,
        yPadding: 15,
        cornerRadius: 0.15,
        displayColors: false,
        mode: 'index',
        callbacks: {
            label: function (tooltipItem, myData) {
                var label = myData.datasets[tooltipItem.datasetIndex].label || '';
                if (label) {
                    label += ': ';
                }
                label = numeral(tooltipItem.yLabel).format('0.000 a').toUpperCase() + ' TRX' // parseFloat(tooltipItem.value).toFixed(2);
                return label;
            }
        }
    };

    Chart.defaults.LineWithShadow = Chart.defaults.line;
    Chart.controllers.LineWithShadow = Chart.controllers.line.extend({
        draw: function(ease) {
            Chart.controllers.line.prototype.draw.call(this, ease);
            var ctx = this.chart.ctx;
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.15)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 10;
            ctx.responsive = true;
            ctx.stroke();
            Chart.controllers.line.prototype.draw.apply(this, arguments);
            ctx.restore();
        }
    });

    var ctx = document.getElementById("balanceChart").getContext("2d");
    balanceChart = new Chart(ctx, {
        type: "LineWithShadow",
        options: {
            plugins: {
                datalabels: {
                    display: false
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                yAxes: [
                    {
                        scaleLabel: {
                            display: true,
                            labelString: 'TRX'
                        },
                        gridLines: {
                            display: true,
                            lineWidth: 1,
                            color: "rgba(0,0,0,0.1)",
                            drawBorder: false
                        },
                        ticks: {
                            callback: function (label, index, labels) {
                                return numeral(label).format('0.0 a').toUpperCase();
                            },
                            beginAtZero: true,
                            // stepSize: 100,
                            // min: 300,
                            // max: 800,
                            //padding: 20
                        }
                    }
                ],
                xAxes: [
                    {
                        type: 'time',
                        distribution: 'series',
                        offset: true,
                        gridLines: {
                            display: false
                        },
                        time: {
                            displayFormats: {
                                'millisecond': 'MMM D, ha',
                                'second': 'MMM D, ha',
                                'minute': 'MMM D, ha',
                                'hour': 'MMM D, ha',
                                'day': 'MMM D, ha',
                            }
                        },
                        ticks: {
                            source: 'data',
                            autoSkip: true,
                        }
                    }
                ]
            },
            legend: {
                display: false
            },
            tooltips: balanceTooltip
        },
        data: {
            labels: [],
            datasets: [
                {
                    label: [],
                    data: [],
                    borderColor: themeColor1,
                    pointBackgroundColor: foregroundColor,
                    pointBorderColor: themeColor1,
                    pointHoverBackgroundColor: themeColor1,
                    pointHoverBorderColor: foregroundColor,
                    pointRadius: 2,
                    pointBorderWidth: 2,
                    pointHoverRadius: 8,
                    fill: false
                }
            ]
        }
    });

}

async function loadChartData() {
    let pages = 0

    balanceFeed = []

    let startTime = Math.floor(Date.now()/1000) - (86400 * 30) //48 hours in the past
    let fingerprint = await loadPriceData(null, startTime)
    while (fingerprint){
        fingerprint = await loadPriceData(fingerprint, startTime)
        pages++
        $("#chart-loading").text(`Loading... ${pages}`)
    }

    balanceChart.data.datasets[0].data = balanceFeed
    $("#chart-loading").text('')
}


async function loadPriceData(fingerprint = null, startTime) {

    let requestObj = {size: 200, eventName: 'onContractBalance'}

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


                let timestamp = Math.floor(value.timestamp)
                let balance = (value.result.balance / 1e6).toFixed(3)

                balanceFeed.push({y:balance,t:timestamp})
            })

            return fingerprint //lastTime > startTime ? fingerprint : null
        }

    } catch (e) {
    }

    return null;

}



