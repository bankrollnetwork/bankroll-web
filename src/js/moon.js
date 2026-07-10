//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TJRq8Sc2Dnx2PJZYccr37BdHdqVt1X2j89',
    'shasta':'TVhi1n5iUEFZU3uJLKgm3efnQ4hKJuNskq'//'TGLxp46pmzPmR86uqbMYBwqho1neQFi2ZQ' //'TVhi1n5iUEFZU3uJLKgm3efnQ4hKJuNskq'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

const feeLimit = 150e6

const donationPoolAddress = 'TRepyJ3eTRPWE8X4xQfiReQvW95SWztnzt'
const luckAddress = ''

var contractAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
var moon
var waiting = 0
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate
var players = {}

var priceFeed = []
var balanceFeed = []
let priceChart, balanceChart, tronLocal


$(document).ready(async () => {
    main();
})


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

function dumpAlert(){
    $('#dumpModal').modal()
    setTimeout(mainLoop)
}

async function main() {

    if (!(window.tronWeb && window.tronWeb.ready)) {
        waiting += 1;
        console.log('waiting', waiting)
        if (waiting == 50) {
            $('#tronWebModal').modal()
            return
        }
        console.warn('Could not connect to TronLink.')
        setTimeout(main, 500);
        return;
    } else {

        tronWeb = window.tronWeb

        setNetwork()
        updateReferrer()
        bindUI()



        moon = await tronWeb.contract().at(contractAddress)
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

        loadTabsData()
        updateCountDown()
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

    let calcTokens = async (e) => {
        let amount = Number.parseInt(buyAmountInp.val().trim())
        amount = amount * 0.99;
        amount = tronWeb.toSun(amount)
        amount = (await moon.calculateTokensReceived(amount).call())
        console.log('amount-estimate', amount)
        buyEstimate.text(`${numeral(tronWeb.fromSun(amount)).format('0.000 a').toUpperCase()} MOON`)
    }



    buyAmountInp.on("change paste keyup", _.debounce(calcTokens, 250))

    sellAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseInt(sellAmountInp.val().trim())
        sellEstimate.text(`${numeral(amount * 0.90).format('0.000 a').toUpperCase()} TRX`)
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
    let investments =   (await moon.checkInvestments(currentAddress).call()).toNumber()
    let sponsorships = (await moon.checkCurrentSponsorships(currentAddress).call()).toNumber()
    let title, msg
    let withdrawals = (await moon.checkWithdrawals(currentAddress).call()).toNumber()

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
    var investments = tronWeb.fromSun((await moon.checkInvestments(currentAddress).call()).toNumber())
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
        $('#totalDumps').text(numeral((await moon.totalDumps().call()).toNumber()).format('0,0.000 a').toUpperCase())
        $('#supply').text(formatSun((await moon.totalSupply().call()).toNumber()))
        $('#totalTxs').text(numeral((await moon.totalTxs().call()).toNumber()).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text((await moon.players().call()).toNumber())
        $('#contractBalance').text(formatSun((await tronWeb.trx.getBalance(contractAddress))))
        $('.buy-price').text(formatSun((await moon.buyPrice().call()).toNumber()))
    }catch(e){}
}


async function showUserStats() {
    let stats = await moon.statsOf(currentAddress).call()
    let tokens = (await moon.myTokens().call()).toNumber()
    let balance = formatSun(tokens)
    let divs = formatSun((await moon.myDividends(true).call()).toNumber())
    //let referrals = formatSun((await moon.myReferrals().call()).toNumber())
    let totalReferrals = formatSun(stats[5].toNumber())
    let withdrawn = formatSun(stats[2].toNumber())
    let bnkr = formatSun(stats[7].toNumber())
    let availableDump = formatSun((await moon.availableDump().call()).toNumber())
    let availableDumpTRX = formatSun((await moon.availableDumpTRX().call()).toNumber())
    let dailyEstimate = (tokens > 0) ? ((await moon.calculateTronReceived(tokens).call()).toNumber()) : 0
    if (dailyEstimate > 0){
        $('#dailyEstimate').html(`&#8776; ${formatSun(dailyEstimate)} TRX`)
    } else {
        $('#dailyEstimate').text(`Buy MOON! Start earning TRX & BNKR divs TODAY!`)
    }
    $('#user-withdrawn').text(withdrawn)
    $('#user-sold').text(formatSun(stats[3].toNumber()))
    $('#user-bonus').text(balance)
    $('#user-vault').text(divs)
    $('#user-buddy').text(totalReferrals)
    $('#user-bnkr').text(bnkr)
    $('#availableDump').text(availableDump)
    $('#availableDumpTRX').text(availableDumpTRX)
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
    let endpoint = 'https://api.trongrid.io/'
    if (url.indexOf('shasta') != -1) {
        network = 'Shasta'
        contractAddress = tron_networks['shasta']
        tronLinkUrlPrefix = 'https://shasta.tronscan.org/#/transaction/'
        endpoint = 'https://api.shasta.trongrid.io'
    } else {
        network = 'Mainnet'
        contractAddress = tron_networks['mainnet']
        tronLinkUrlPrefix = 'https://tronscan.org/#/transaction/'
    }

    /*tronLocal = new TronWeb({
        fullNode: endpoint,
        solidityNode: endpoint,
        eventServer: endpoint
    })

    tronLocal.setAddress(tronWeb.defaultAddress['base58']);*/

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

async function dump() {

    let time = (await moon.timeLeft().call()).toNumber()

    if (time) {
        showAlert('Wait a sec!', `You aren't ready to DUMP yet`)
        return
    }

    let tokens = tronWeb.fromSun((await moon.myTokens().call()).toNumber())

    if (!tokens) {
        showAlert('NO MOON!!!','Slow down there buddy, you need to have MOON first!')
        return;
    } else {

        moon.dump().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('dump', tx)
            refresh(tx)
            setTimeout(updateCountDown, 5000)
        }).catch(e => {
            txError(e)
        })
    }
}

async function withdraw() {
    if (!((await moon.myDividends(true).call()).toNumber())){
        showAlert('NO DIVS!!!','Slow down there buddy, you need to have some divs first!')
        return
    }


    if (!await checkResources()){
        return
    }

    moon.withdraw().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('withdraw', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function reinvest() {

    if (!((await moon.myDividends(true).call()).toNumber())){
        showAlert('NO DIVS!!!','Slow down there buddy, you need to have some divs first!')
        return
    }

    moon.reinvest().send({callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('reinvest', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function buy() {

    var amount = $('#buyAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {

        moon.buy().send({callValue: tronWeb.toSun(amount), feeLimit: feeLimit }).then(tx => {
            console.log('buy', amount, tx)
            refresh(tx)
            showStats()
            setTimeout(updateCountDown, 5000)
        }).catch(e => {
            txError(e)
        })

    }
}

const loadNewActivityData = async (activity, content) => {
    const ACTIVITY_EVENT = activity //'onPurchase'
    let requestObj = {size: 50, eventName: ACTIVITY_EVENT}

    let res
    try {
        res = await tronWeb.getEventResult(contractAddress, requestObj)
        let activityDbData = _.map(res, (obj) => {
            obj.timestamp = new Date(obj.timestamp)
            obj.event = obj.name
            delete obj.name
            if (obj.result) {
                obj.player = tronWeb.address.fromHex(obj.result.customerAddress)
                obj.moon = parseFloat(obj.result.tokens)
                obj.bnkr = parseFloat(obj.result.bnkr)
                obj.price = parseFloat(obj.result.price)
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })

        let price  = Number.MAX_VALUE;

        _.eachRight(res, (obj) => {
            if (obj.price > price){
                obj.up = true
            }

            price = obj.price
        })



        activityDbData = _.slice(activityDbData, 0, 50)

        updateActivityUI(content,activityDbData)
    } catch (e) {
        console.log(e)
    }

}


const updateActivityUI = async (tab, activityData) => {


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
                            Price
                        </div>
                        <div class="w-15 w-xs-100">    
                            MOON
                        </div>
                        <div class="w-15 w-xs-100">    
                            BNKR
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
                            <div class="mb-1 text-${item.up ? 'success':'danger'} w-15 w-xs-100 ">${formatSun(item.price)}</div>
                            <div class="mb-1 text-white w-15 w-xs-100 ">${formatSun(item.moon)}</div>
                            <div class="mb-1 text-white w-15 w-xs-100 ">${formatSun(item.bnkr)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $(`#${tab}`).html(activityTemplateHtml)
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
    let requestObj = {size: 200, eventName: 'onLeaderBoard'}

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
                    account.tokens = parseFloat(value.result.tokens)
                    account.bnkr = parseFloat(value.result.bnkr)
                    account.soldTokens = parseFloat(value.result.soldTokens)
                    players[player] = account
                } else {
                    account = players[player];
                    account.bnkr = Math.max(account.bnkr, parseFloat(value.result.bnkr))
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

    playerRes = _.orderBy(playerRes, ['tokens'], ['desc'])

    let rank = 1
    let minimum
    let playersList = _.map(playerRes, (obj) => {
        obj.rank = rank++
        return obj
    })

    playersList = _.slice(playersList, 0, 100)

    if (playersList.length == 100) {
        minimum = _.last(playersList).tokens
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
                      <p class="mb-1 text-white w-15 w-xs-100">MOON</p>
                      <p class="mb-1  w-15 w-xs-100">BNKR (mined)</p>
                       <p class="mb-1  w-15 w-xs-100">MOON (dumped)</p> 
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
                      <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.tokens)}</p>
                      <p class="mb-1 w-15 w-xs-100">${formatSun(item.bnkr)}</p>
                      <p class="mb-1 w-15 w-xs-100">${formatSun(item.soldTokens)}</p>
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
        loadNewActivityData('onTokenPurchase', 'buyActivityContent')
    }

    let loadDumps = () => {
        loadNewActivityData('onTokenSell', 'dumpActivityContent')
    }
    loadPumps()
    loadDumps()
    setInterval(loadPumps, 5000)
    setInterval(loadDumps(), 5000)
}

async function updateCountDown() {
    let time = (await moon.timeLeft().call()).toNumber()
    let available  = (await moon.availableDump().call()).toNumber()
    console.log('time-left', time)
    let date = moment().add(time, 'seconds').toDate()

        if (available) {
                if (time) {

                    $('#time-left').countdown(date).on('update.countdown', function (event) {
                        var format = 'Ready to DUMP in %D days %H:%M:%S';
                        $(this).text(event.strftime(format));
                    })
                        .on('finish.countdown', function (event) {
                            $(this).text('Ready to DUMP!!!')
                        })
                } else {
                    $('#time-left').text('Ready to DUMP!!!')
                }


        } else {
            $('#time-left').text('Got to go to the MOON to DUMP')
        }



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

    var chartTooltip = {
        backgroundColor: foregroundColor,
        titleFontColor: primaryColor,
        borderColor: separatorColor,
        borderWidth: 0.5,
        bodyFontColor: primaryColor,
        bodySpacing: 10,
        xPadding: 15,
        yPadding: 15,
        cornerRadius: 0.15,
        displayColors: false
    };

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

    var chartTooltip = {
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
                label = numeral(tooltipItem.yLabel).format('0.000 a').toUpperCase() + ' MOON/TRX' // parseFloat(tooltipItem.value).toFixed(2);
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

    var ctx = document.getElementById("priceChart").getContext("2d");
    priceChart = new Chart(ctx, {
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
                            labelString: 'MOON / TRX'
                        },
                        gridLines: {
                            display: true,
                            lineWidth: 1,
                            color: "rgba(0,0,0,0.1)",
                            drawBorder: false
                        },
                        ticks: {
                            beginAtZero: true
                            /*stepSize: 5,
                            padding: 20*/
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
            tooltips: chartTooltip
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

    priceFeed = []
    balanceFeed = []

    let startTime = Math.floor(Date.now()/1000) - (86400 * 30) //48 hours in the past
    let fingerprint = await loadPriceData(null, startTime)
    while (fingerprint){
        fingerprint = await loadPriceData(fingerprint, startTime)
        pages++
        $("#chart-loading").text(`Loading... ${pages}`)
    }

    priceChart.data.datasets[0].data = priceFeed
    balanceChart.data.datasets[0].data = balanceFeed
    $("#chart-loading").text('')
}


async function loadPriceData(fingerprint = null, startTime) {
    /*

    event onPrice(
        uint256 price,
        uint256 tokenSupply,
        uint256 balance
    );
     */

    let requestObj = {size: 200, eventName: 'onPrice'}

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
                let price = (value.result.price / 1e6).toFixed(3)
                let balance = (value.result.balance / 1e6).toFixed(3)

                priceFeed.push({y:price,t:timestamp})
                balanceFeed.push({y:balance,t:timestamp})
            })

            return lastTime > startTime ? fingerprint : null
        }

    } catch (e) {
    }

    return null;

}






