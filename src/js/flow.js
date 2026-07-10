//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const tron_networks = {
    'mainnet': 'TUBA2HhtN7xxEZ8mYwAk26kNEfwKVcSJNS',
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
var buddyRefAddress
var custodyAddress = 'TPmqRz2HmrUDVDRgGxhZv4yAKBRWsRex4E'
const buddyAddress = 'TLiPH8Z9xUK57hxhuYvXrZQATZovFq7kfQ'
const bnkrxAddress = 'TKSLNVrDjb7xCiAySZvjXB9SxxVFieZA7C'
const airdropAddress = 'TX61Yh6pBCQRRDTHj68Yo2JtSk1kL3NEnu'
const swapxAddress = 'TB4S2pvyX8uQsBPrTDWYCuSDfYSg6tMJm7'
var network
var tronLinkUrlPrefix
let buddy, bnkrx, flow, airdrop, swapx
var waiting = 0
let buyAmountInp, dropAmountInp, transferAmountInp, estimateAmount, sellEstimate, transferEstimate, prices, log_viewer

var players = {}, airdrop_campaign = null, campaign_log = null, delivering = false

var balanceFeed = []
let balanceChart, tronLocal

const flowOrgAPI = 'https://flowbot-dot-bankroll-5a78d.uc.r.appspot.com' //'https://flow-info-xe7v2z5oaa-uc.a.run.app'
//const flowOrgAPI = 'http://localhost:3300'


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
        console.warn('Could not connect to TronLink.')
        setTimeout(main, 100);
        return;
    } else {

        tronWeb = window.tronWeb

        setNetwork()
        bindUI()

        detectBuddyRef()

        prices = await getPrices()





        flow = await tronWeb.contract().at(contractAddress)
        fastContract = await tronWeb.contract().at(fastAddress)
        buddy = await tronWeb.contract().at(buddyAddress)
        bnkrx = await tronWeb.contract().at(bnkrxAddress)
        airdrop = await tronWeb.contract().at(airdropAddress)
        swapx = await tronWeb.contract().at(swapxAddress)

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

        // Schedule loops
        setInterval(mainLoop, 5000)
        setInterval(showStats, 60000)
        setInterval(watchSelectedWallet, 2000)

        loadTabsData()

    }

}


function bindUI() {
    let options = {
        theme: "bootstrap",
        minimumResultsForSearch: Infinity,
        //placeholder: "",
        //maximumSelectionSize: 6,
        containerCssClass: ":all:"
      }
    $('#min-directs').select2(options)
    $('#min-deposits').select2(options)
    $('#min-depth').select2(options)
    $('#max-recipients').select2(options)

    $('#contract-url').attr('href', `https://tronscan.org/#/contract/${contractAddress}`)
    $('#contract-url').text(`https://tronscan.org/#/contract/${shortId(contractAddress, 5)}`)

    $('#stakingChb').change(async (e) => {
        let isStaking = $(e.currentTarget).prop('checked')
        console.log('Enable Staking: ', isStaking)
        if (isStaking) {
            enableStake()
        } else {
            disableStake()
        }
    })

    
    log_viewer = $('#campaign-log')
    dropAmountInp = $('#dropAmount')
    estimateAmount = $('#estimateAmount')

    let calcBudget = async (e) => {
        let amount = Number.parseFloat(dropAmountInp.val().trim())
        if (amount < 1 || !isFinite(amount) || amount === '') {
            return
        }
        
        amount = tronWeb.toSun(amount)
        let balance = (await bnkrx.balanceOf(currentAddress).call()).toNumber()
        let message = ''

        if (airdrop_campaign == null || airdrop_campaign.total_recipients == 0){
            message = "Run a successful campaign first"
            estimateAmount.text(message)
            return
        }

        
        if (balance < amount){
            message = 'Insufficient balance to run campaign'
            estimateAmount.text(message)
            return
        }      

        let perPerson = Math.floor(amount / airdrop_campaign.total_recipients)

        if (perPerson < 1e6){
            message = `Increase budget.<br> ${formatSun(perPerson)} BNKRX per recipient`
            estimateAmount.html(message)
            return
        } else {
            message = `Reward per recipient:<br> ${formatSun(perPerson)} BNKRX`
            estimateAmount.html(message)
            return
        }
        
        
        
    }

    dropAmountInp.on("change paste keyup", _.debounce(calcBudget, 250))

}

async function isStakeEnabled() {
    let allowance = await bnkrx.allowance(currentAddress, contractAddress).call()

    if (allowance['remaining'] && allowance['remaining']['_hex'] != null) {
        allowance = tronWeb.toBigNumber(allowance.remaining._hex)
    }
    let balance = (await bnkrx.balanceOf(currentAddress).call())
    return allowance.gte(balance)
}


async function enableStake() {
    amount = await bnkrx.MAX_INT().call()
    bnkrx.approve(contractAddress, amount).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function disableStake() {
    bnkrx.approve(contractAddress, 0).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function isAirdropEnabled() {
    let allowance = await bnkrx.allowance(currentAddress, contractAddress).call()

    if (allowance['remaining'] && allowance['remaining']['_hex'] != null) {
        allowance = tronWeb.toBigNumber(allowance.remaining._hex)
    }
    let balance = (await bnkrx.balanceOf(currentAddress).call())
    //console.log('isTokenApproved', allowance.toString(), balance.toString())
    return allowance.gte(balance)
}


async function enableAirdrop() {
    amount = await bnkrx.MAX_INT().call()
    bnkrx.approve(contractAddress, amount).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function disableAidrop() {
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
    Promise.all([showWalletInfo(), showUserStats()])
}

async function getReferrer() {
    return await buddy.myBuddy().call()
}

function formatSun(sun) {
    return numeral(tronWeb.fromSun(sun)).format('0,0.000 a').toUpperCase()
}

const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}


function detectBuddyRef() {
    var url_string = window.location.href
    var url = new URL(url_string)
    var address = url.searchParams.get("buddy")

    if (address !== null) {
        address = cleanAddress(address)
        if (!tronWeb.isAddress(address)) {
            buddyRefAddress = zeroAddress
        } else {
            buddyRefAddress = address
        }
    } else {

        buddyRefAddress = zeroAddress
    }
}

async function showWalletInfo() {
    try {
        $('#network').text(network)
        $('#walletAddress').text(`${shortId(currentAddress, 5)}`)

        showReferral(currentAddress)
        $('#walletBalanceValue').text(formatSun(await fastContract.balanceOf(currentAddress).call()))
        $('#walletBalanceValue-bnkrx').text(formatSun(await bnkrx.balanceOf(currentAddress).call()))


        let info = await flow.userInfo(currentAddress).call()
        var ref = tronWeb.address.fromHex(info.upline)

        if (ref != zeroAddress || currentAddress == custodyAddress) {
            $('#buddy-input').hide()
        }

        if (buddyRefAddress != zeroAddress) {

        } else {
            $('#buddy-ref').hide()
        }

        var buddy = tronWeb.address.fromHex(await getReferrer())

        ref = (ref != zeroAddress) ? ref : buddy
        ref = (ref == zeroAddress) ? 'None' : ref
        $('#current-buddy').text(ref)
    } catch (e) {
        console.warn(e)
    }
}

async function showStats() {
    try {

        let info = await flow.contractInfo().call()

        let price =  await swapx.getTokenToTrxInputPrice(1e6).call()


        //uint256 _total_users, uint256 _total_deposited, uint256 _total_withdraw, uint256 _total_bnkr,  uint256 _total_txs


        $('#referral').html(`<span class="text-white">Earn 10% on referrals!</span><br><br><a class="btn btn-outline-semi-light default mb-2" onclick="clipCopy('${currentAddress}');">Click to copy your address</a>
        &nbsp;&nbsp;&nbsp;&nbsp;<a class="btn btn-outline-semi-light default mb-2" onclick="clipCopy('https://bankroll.network/flow.html?buddy=${currentAddress}');">Click to copy your referral link</a>
        `)

        $('#bnkrx-price').text(`${formatSun(price)}`)
        $('#totalTxs').text(numeral(info._total_txs.toNumber()).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text(info._total_users.toNumber())
        $('#contractBalance').text(formatSun(info._total_deposited.toNumber()))
        $('#contractBalance-usdt').html(`${approxStr} ${formatSun(info._total_deposited.toNumber() * prices.bnkrx)} USDT`)
        $('#totalBNKR').text(formatSun(info._total_bnkr.toNumber()))
    } catch (e) { }
}

function useBuddyRef() {
    $('#recipient').val(buddyAddress)
}


async function showUserStats() {


    let infoTotals = await flow.userInfoTotals(currentAddress).call()

    let info = await flow.userInfo(currentAddress).call()
    let pay = await flow.payoutOf(currentAddress).call()

    pay.payout = pay.payout.toNumber()
    pay.max_payout = pay.max_payout.toNumber()



    let isStaking = await isStakeEnabled()
    let isAirdrop = await isAirdropEnabled()
    let user_balance = (await bnkrx.balanceOf(currentAddress).call()).toNumber()

    $('.user-balance').text(`${formatSun(user_balance)} BNKRX`)
    $('#staking-status').text(isStaking ? 'Deposits enabled' : 'Deposits disabled')
    $('#stakingChb').prop('checked', isStaking)

    $('#airdrop-status').text(isAirdrop ? 'Airdrop enabled' : 'Airdrop disabled')
    $('#airdropChb').prop('checked', isAirdrop)

    $('#user-divs').text(formatSun(pay.payout))
    $('#user-divs-usdt').html(`${approxStr} ${formatSun(pay.payout * prices.bnkrx)} USDT`)

    $('#user-balance').text(formatSun(info.deposit_amount.toNumber()))
    $('#user-balance-usdt').html(`${approxStr} ${formatSun(info.deposit_amount.toNumber() * prices.bnkrx)} USDT`)

    $('#user-claimed').text(formatSun(infoTotals.total_payouts.toNumber()))

    $('#user-direct').text(formatSun(info.direct_bonus.toNumber()))
    $('#user-match').text(formatSun(info.match_bonus.toNumber()))

    $('#user-referrals').text(infoTotals.referrals.toNumber())
    $('#user-structure').text(infoTotals.total_structure.toNumber())
    $('#user-max').text(formatSun(pay.max_payout))

}

async function showPlayer(player) {
    let info = await flow.userInfoTotals(player).call()

    let deposits = info.total_deposits.toNumber()
    let payouts = info.total_payouts.toNumber()
    let directs = info.referrals.toNumber()
    let team = info.total_structure.toNumber()

}

async function showOrg() {
    try {

        var address = cleanAddress($('#org-leader').val())

        if (!tronWeb.isAddress(address)) {
            $('#invalidAddressModal').modal()
            return null
        } else {
            $('#org-viewer').html('<h2>Loading...</h2>')
            let response = null, retry = 0
            while (retry < 5) {
                try {
                    response = await axios.get(`${flowOrgAPI}/org/${address}`)
                } catch (e) {
                    retry++
                    console.error('tree failed', e)
                    await timeout(500)
                    continue
                }
                break
            }
            if (response) {
                var wrapper = document.getElementById("org-viewer");
                $('#org-viewer').html('')
                jsonTree.create(response.data, wrapper)
                return address
            } else {
                $('#org-viewer').html('<h2>Service unavailable, try again later...</h2>')
            }

            return null

        }
    } catch (e) {
        return null
    }
}

async function suggestBuddy(){
    
    let address = await showOrg()
    campaign_log = []
    let response = null, retry = 0, children

    if (address){

        let current = await fillPlayer(address, 0)

        //If the lead does have a full roster
        if (current.directs >= 15){
            
        //Grab his org
        while (retry < 5) {
            try {
                response = await axios.get(`${flowOrgAPI}/org/${address}`)
            } catch (e) {
                retry++
                console.error('tree failed', e)
                await timeout(500)
                continue
            }
            break
        }

        //Fill subs if they have less than 15
        let result = await pluckBuddy(response.data,2, 0, null)
        if (!_.isEmpty(result.children)){
           children = _.filter(result.children, (child) => {
            return child.directs == 0 //lets get players that haven't maxed out directs
            })  
            if (!_.isEmpty(children)){

                children = _.orderBy(children, ['directs', 'deposits'], ['asc', 'desc']);
                address = children[0].player
                console.log('suggested', children[0])
            } 
        }
        }

        $('#suggested-buddy').html(`<a class="btn btn-outline-semi-light default mb-2" onclick="clipCopy('${address}');">${address}</a>`)

        
    }


}

async function showAirdrop() {

    airdrop_campaign = null
    campaign_log = []

    let directs = Number.parseInt($('#min-directs').val())
    let deposit_limit = Number.parseInt($('#min-deposits').val())
    let depth = Number.parseInt($('#min-depth').val())
    let max_recipients = Number.parseInt($('#max-recipients').val())
    let player = cleanAddress($('#org-leader-drop').val())
   


    if (!tronWeb.isAddress(player)) {
        $('#invalidAddressModal').modal()
    } else {
        $('#org-viewer-drop').html('<h2>Loading...</h2>')
        let response = null, retry = 0
        campaign_log.push(`Loading: ${player}`)
        flushLog()
        while (retry < 5) {
            try {
                response = await axios.get(`${flowOrgAPI}/org/${player}`)
                
            } catch (e) {
                retry++
                console.error('tree failed', e)
                await timeout(500)
                continue
            }
            break
        }


        if (response) {
            campaign_log.push(`\nFinding eligible players:`)
            campaign_log.push(`directs - ${directs}`)
            campaign_log.push(`net deposits - ${deposit_limit} BNKRX`)
            campaign_log.push(`maximum recipients - ${(!max_recipients) ? 'All': max_recipients}`)
            flushLog()

            getEligiblePlayers(response.data,directs,deposit_limit,depth,max_recipients)
           
        } else {
            $('#org-viewer-drop').html('<h2>Service unavailable, try again later...</h2>')
        }
    }

}

async function sendAirdrop() {

    let message = ''

    if (airdrop_campaign == null || airdrop_campaign.total_recipients == 0){
        message = "Run a successful campaign first"
        showAlert('Airdrop Error!', message)
        return
    }

    let amount = Number.parseFloat(dropAmountInp.val().trim())
    amount = tronWeb.toSun(amount)
    let balance = (await bnkrx.balanceOf(currentAddress).call()).toNumber()
    
    
    if (amount < 1 || !isFinite(amount) || amount === '') {
        message = "Set a budget for the campaign"
        showAlert('Airdrop Error!', message)
        return
    }

    
    if (balance < amount){
        message = 'Insufficient balance to run campaign'
        showAlert('Airdrop Error!', message)
        return
    }      

    let perPerson = Math.floor(amount / airdrop_campaign.total_recipients)

    if (perPerson < 1e6){
        message = `Increase budget.<br> ${formatSun(perPerson)} BNKRX per recipient`
        showAlert('Airdrop Error!', message)
        return
    } 

    deliverAirdrop(perPerson)

}

function searchAirdrop() {
    let player = cleanAddress($('#airdrop-search-address').val())

    if (!tronWeb.isAddress(player)) {
        $('#invalidAddressModal').modal()
    } else {
        $('#search-results').html('<h2>Loading...</h2>')

        let filter  = {}
        let direction = $('#search-address-option > .btn.active > input').val()
        filter[`${direction}`] = player

        loadNewActivityData('#search-results',filter)

    }
}

function myAirdrop(){
    $('#org-leader-drop').val(currentAddress)
}

function myAirdropSearch(){
    $('#airdrop-search-address').val(currentAddress)
}

function myTeamView(){
    $('#org-leader').val(currentAddress)
}

function flushLog(){
    log_viewer.val(campaign_log.join('\n'))
}

function copyLog(){
    // Select text inside element
    log_viewer.select();
    // Copy text to clipboard
    document.execCommand('copy');

    $.notify({
        message: `<span class="text-white">Copied Log</span>`
    }, {
        type: 'dark',
        delay: 2000,
        allow_dismiss: false
    });
}

async function deliverAirdrop(perPerson){

    if (delivering){
        return
    }

    let isAirdrop = await isAirdropEnabled()

    if (!isAirdrop) {
        showAlert('Enable Airdrops', 'Airdrops are not enabled.  Look for the toggle and make sure it is on (purple)!')
        return false;
    }

    delivering = true

    let players = _.keys(airdrop_campaign.recipients)

    campaign_log.push(`\nAirdropping ${formatSun(perPerson)} BNKRX per recipient:\n`)

    let player, tx

    let sendConsole = $('#send-console')

    try {

        for (i = 0; i < players.length; i++) {
            //Retry
            while (true) {
                player = players[i];
                tx = null
    
                try {
                    tx = await flow.airdrop(player, perPerson).send({ callValue: 0, feeLimit: feeLimit })
                    campaign_log.push(`${player}  ${tx}`)
                    sendConsole.text(`Sending to ${shortId(player,5)}`)
                    console.log('payout', player, tx)
                    if (i % 10 == 0){
                        flushLog()
                    }
                } catch (e) {
                    console.error('payout fail', player)
                    continue
                }
                break
            }
    
        }
        flushLog()
        sendConsole.text('Airdrop Complete')
        refresh(tx)

    }catch(e){

    } finally {
        delivering = false
    }
}

async function getEligiblePlayers(player, directs, deposit_limit,depth, max_recipients){
    
    campaign_log.push('\nFinding players:')
    let result = await pluckAirdrop(player,depth, directs, null)

    result.eligible = _.filter(result.children, (child) => {
        return child.directs >= directs && child.deposits >= deposit_limit
    }) 

    //pick winners
    if (!max_recipients){
        result.recipients = result.eligible 
    } else {
        result.recipients = _.sampleSize(result.eligible, max_recipients)
    }

    let finalResult = {total_candidates: result.raw_count, total_eligible: result.eligible.length, total_recipients: result.recipients.length, recipients:{}}
    
    _.each(result.recipients, (child) => {
        finalResult.recipients[child.player] = _.omit(child, ['player'])
    })

    campaign_log.push(`\nCampaign results:`)
    campaign_log.push(`total candidates - ${finalResult.total_candidates}`)
    campaign_log.push(`total eligible - ${finalResult.total_eligible}`)
    campaign_log.push(`total recipients - ${finalResult.total_recipients}`)
    campaign_log.push(`\nReady to send...`)
    flushLog()
    

    airdrop_campaign = finalResult

    var wrapper = document.getElementById("org-viewer-drop");
    $('#org-viewer-drop').html('')

    jsonTree.create(finalResult, wrapper)
} 



async function pluckAirdrop(player, depth, directs, result,log) {
    if (result == null) {
        result = { parent: _.keys(player)[0], max_depth: depth, children: {}, raw_count: 0, total_count: 0 }
        depth = 0
        campaign_log.push(``)
    }
    
    console.log('plucking', player)

    if (depth < result.max_depth) {
        depth++
        let current = _.keys(player)[0]
        let children = _.keys(player[current])
        let viewer = $('.org-viewer-monitor')

        if (children.length) {
            result.total_count += children.length

            //Log (maybe too expensive)
            if (log){
                campaign_log[campaign_log.length - 1] = `Loading... ${result.total_count}`
                flushLog()
            }

            let child
            
            for (let i=0; i < children.length; i++){

                result.raw_count++
                viewer.html(`<h2>Loading... ${result.raw_count} / ${result.total_count}</h2>`)

                //Only fill if directs are viable
                let child_directs = _.keys(player[current][children[i]]).length
                console.log('child_directs', children[i], child_directs)
                if ( child_directs >= directs){
                    child = await fillPlayer(children[i],0)
                    child.upline = current
                    result.children[child.player] = child
                    console.log('init player', child)
                }

                //Walk this child's children; make a synthetic top level object
                let next = {}
                next[children[i]] = player[current][children[i]]
                await pluckAirdrop(next, depth, directs, result)
            }
            
        }
    } else {
        return result
    }

    return result
}

async function pluckBuddy(player, depth, directs, result) {
    if (result == null) {
        result = { parent: _.keys(player)[0], max_depth: depth, children: {}, raw_count: 0, total_count: 0 }
        depth = 0
        campaign_log.push(``)
    }
    
    console.log('plucking', player)

    if (depth < result.max_depth) {
        depth++
        let current = _.keys(player)[0]
        let children = _.keys(player[current])
        let viewer = $('.org-viewer-buddy')

        if (children.length) {
            result.total_count += children.length

            let child
            
            for (let i=0; i < children.length; i++){

                result.raw_count++
                viewer.html(`<h2>Loading... ${result.raw_count} / ${result.total_count}</h2>`)

                //Only fill if directs are viable
                let child_directs = _.keys(player[current][children[i]]).length
                console.log('child_directs', children[i], child_directs)
                
                if ( child_directs){
                    child = {player: children[i], directs: child_directs, deposits: 0}
                } else {
                    child = await fillPlayer(children[i],0)
                }

                child.upline = current
                result.children[child.player] = child
                console.log('init player', child)

                //Walk this child's children; make a synthetic top level object
                let next = {}
                next[children[i]] = player[current][children[i]]
                await pluckBuddy(next, depth, directs, result)
            }
            
        }
    } else {
        return result
    }

    return result
}

async function fillPlayer(player, retry) {
    try {
        info = await flow.userInfoTotals(player).call()

        let deposits = info.total_deposits.toNumber()
        let payouts = info.total_payouts.toNumber()
        let directs = info.referrals.toNumber()

        return { player: player, directs: directs, deposits: Math.floor((deposits - payouts) / 1e6) }
    } catch (e) {
        console.error(e)
        await timeout(100)
        if (retry < 5) {
            return await fillPlayer(player, retry++)
        }
    }
}

async function playerLookup() {

    var player = cleanAddress($('#player-lookup').val())

    if (!tronWeb.isAddress(player)) {
        $('#invalidAddressModal').modal()
    } else {
        let info = await flow.userInfoTotals(player).call()
        let airdropInfo = await airdrop.userInfo(player).call()

        let deposits = info.total_deposits.toNumber()
        let payouts = info.total_payouts.toNumber()
        let directs = info.referrals.toNumber()
        let team = info.total_structure.toNumber()

        let airdrops = airdropInfo._airdrops.toNumber()
        let received = airdropInfo._received.toNumber()
        let last = airdropInfo.last_airdrop.toNumber()

        $('#player-directs').text(directs)
        $('#player-team').text(team)
        $('#player-deposits').text(`${formatSun(deposits - payouts)} BNKRX`)
        $('#player-airdrop').text(`${formatSun(airdrops)} / ${formatSun(received)} BNKRX`)
        $('#player-airdrop-time').text((last == 0) ? 'Never' : moment.unix(last).fromNow())


    }
}

function useCustodyAddressOrg() {
    $('#org-leader').val(custodyAddress)
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
    setTimeout(mainLoop, 2000)
}

function txError(error) {
    var msg = error.message
    $('#txErrorId').text(msg)
    $('#txErrorModal').modal()
    setTimeout(mainLoop, 2000)
}

function showAlert(title, msg) {
    $('#alertTitle').text(title)
    $('#alertId').html(msg)
    $('#alertModal').modal()
}

function showError(msg) {
    $('#errorId').text(msg)
    $('#errorModal').modal()
    setTimeout(mainLoop, 2000)
}

function shortId(str, size) {
    return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

/************ Chain Functions *******************/


async function claim() {

    let pay = await flow.payoutOf(currentAddress).call()

    if (!pay.payout.toNumber()) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first! Make a deposit')
        return
    }

    flow.claim().send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('claim', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })

    return false;
}

async function roll() {

    let pay = await flow.payoutOf(currentAddress).call()

    if (!pay.payout.toNumber()) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first! Make a deposit')
        return
    }

    flow.roll().send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('roll', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })

    return false;
}

async function deposit() {
    
    let currentInfo
    let info = await flow.userInfo(currentAddress).call()

    currentInfo = info

    var ref = tronWeb.address.fromHex(info.upline)

    var buddy = tronWeb.address.fromHex(await getReferrer())

    ref = (ref != zeroAddress) ? ref : buddy

    if (ref == zeroAddress) {
        showAlert('NO BUDDY!!!', 'You need to have a buddy! Scroll down and add your referral or support marketing/development. Thanks')
        return false;
    }

    info = await flow.userInfo(ref).call()

    if (info.deposit_time.toNumber() == 0 && currentAddress != custodyAddress) {
        showAlert('BAD BUDDY!!!', `Your buddy hasn't joined yet, however you can still get started TODAY! Scroll down and support marketing/development. 
        You EARN by getting YOUR OWN direct referrals, so all good!`)
        return false;
    }

    let isStaking = await isStakeEnabled()

    if (!isStaking) {
        showAlert('Enable Deposits', 'Deposits are not enabled.  Look for the toggle and make sure it is on (purple)!')
        return false;
    }

    let pay = await flow.payoutOf(currentAddress).call()

    if (pay.payout.toNumber() > 5e5) {
        let tx = await flow.roll().send({ callValue: 0, feeLimit: feeLimit })
        console.log('roll', tx)
    }

    var amount = Number.parseFloat($('#stakeAmount').val().trim())
    if (amount < 1 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {

        if (currentInfo.deposit_time.toNumber() == 0 && amount < 10){
            showAlert('Initial Deposit!!!', 'You need to deposit a minimum of 10 BNKRX to start.  Thanks')
            return false;
        }

        let balance = await bnkrx.balanceOf(currentAddress).call()
        amount = tronWeb.toBigNumber(amount * Math.pow(10, 6))

        //The solution to the decimals bug
        console.log(balance.toString(10), amount.toString(10), amount.gt(balance))
        amount = (amount.gt(balance)) ? balance : amount

        let amount_hex = `0x${tronWeb.toBigNumber(amount).toString(16)}`
        console.log('calctokens', amount, amount_hex)

        flow.deposit(ref, amount_hex).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('deposit', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })

    }

    return false;
}

async function supportMarketingingDev() {
    buddy.updateBuddy(custodyAddress).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
        console.log('updateBuddy dev', custodyAddress, tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })

    return false;
}

async function updateBuddy() {
    var address = cleanAddress($('#recipient').val())

    if (!tronWeb.isAddress(address) || address == currentAddress) {
        $('#invalidAddressModal').modal()
    } else {
        // withdrawals ha now been zerod out and it is safe to transfer
        buddy.updateBuddy(address).send({ callValue: 0, feeLimit: feeLimit }).then(tx => {
            console.log('updateBuddy', address, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }

    return false;
}

const loadNewActivityData = async (target, filter) => {
    const ACTIVITY_EVENT = 'NewAirdrop' //'onPurchase'
    let requestObj = {size: 100, eventName: ACTIVITY_EVENT, sinceTimestamp: Date.now() - 84600 * 2 * 1000}

    let result = []
    let res
    let fingerPrint 
    
    try {
        
        while (true) {
            res = await tronWeb.getEventResult(contractAddress, requestObj)
            fingerprint = (res.length == 100) ? res[res.length - 1].fingerprint : null
            result = result.concat(res)

            if (fingerprint){
                requestObj.previousLastEventFingerprint = fingerprint
            } else {
                break
            }
         
        }

        //res = await processEvents(result, 'onAirdrop')

        let activityDbData = _.map(result, (obj) => {
            obj.timestamp = new Date(obj.timestamp)
            obj.event = obj.name
            delete obj.name
            if (obj.result) {
                obj.from = tronWeb.address.fromHex(obj.result.from)
                obj.to = tronWeb.address.fromHex(obj.result.to)
                obj.value = parseFloat(obj.result.amount)
                //obj.incomingtron = Math.floor(obj.result.incomingtron / SUN_IN_TRX)
            }

            delete obj.result
            delete obj.resourceNode
            return obj
        })

        if (filter != null){
            activityDbData = _.filter(activityDbData, (obj) => {
                 if (filter.to){
                     return obj.to == filter.to
                 } 

                 return filter.from == obj.from
            })
        }
        activityDbData = _.filter(activityDbData)


        activityDbData = _.slice(activityDbData, 0, 50)

        updateActivityUI(activityDbData, target)
    } catch (e) {
        console.log(e)
    }
}

async function processEvents(events, eventName){
    for (i = 0; i < events.length; i++) {
        while(true){
            try{
                let event = events[i]
                if (_.isEmpty(event.result)){
                    let localEvents = await tronWeb.getEventByTransactionID(event.transaction_id)
                    console.log('missing result', event.transaction_id, localEvents)
                    for(j=0; j < localEvents.length; j++){
                        if (localEvents[j].name == eventName){
                            event.result = localEvents[j].result
                            break
                        }
                    }     
                }
                console.log('event', event)
            } catch(e){
                console.error('getEvent fail', even.transaction_id, e)
                continue
            }
            break
        }

    }

    return events;

 }  


let activityData = []

const updateActivityUI = async (newData, target) => {


    activityData = newData

    const activityTemplateHtml =
        `<div class="row">
            <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <div class="w-20 w-xs-100">    
                            From
                        </div>
                         <div class="w-20 w-xs-100">    
                            To
                        </div>
                        <p class="mb-1 w-15 w-xs-100">Amount (BNKRX)</p>             
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
                            <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.from}')">
                            ${item.from == zeroAddress ? 'Mined' : shortId(item.from, 5)}
                            </a>
                            <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.to}')">
                            ${item.to == zeroAddress ? 'Burned' : shortId(item.to, 5)}
                            </a>
                            <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.value)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        ).join('')}`

    $(target).html(activityTemplateHtml)
}


async function loadTabsData() {
    loadNewActivityData('#airdropActivity-ui',null)
    //setInterval(() => {loadNewActivityData('#airdropActivity',null)}, 5000)
}







