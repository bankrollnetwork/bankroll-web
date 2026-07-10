const tron_networks = {
    'mainnet': 'TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u',
    'shasta': 'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

var contractAddress
var tronWeb
var currentAddress
var network


$(document).ready(async () => {
    setTimeout(checkTronWeb, 100);
})

const API_URL = 'https://api.bankroll.network/tx'

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

async function showWalletInfo() {
    $('#network').text(network)
    $('#walletAddress').text(`${shortId(currentAddress, 5)}`)
    $('#walletBalanceValue').text(formatSun(await tronWeb.trx.getBalance()))
    var bandwidth = await tronWeb.trx.getBandwidth()
    $('#getBandwidth').text(numeral(bandwidth).format('0,0 a').toUpperCase())
    var result = await tronWeb.trx.getAccountResources()
    var net = result.EnergyLimit - result.EnergyUsed
    $('#getEnergy').text(numeral(net).format('0,0 a').toUpperCase())

}

async function checkTronWeb() {
    if (!(window.tronWeb && window.tronWeb.ready)) {
        console.log('Could not connect to TronLink.')
        setTimeout(checkTronWeb, 100);
        return;
    } else {

        tronWeb = window.tronWeb
        // TODO: verify whether we need this initialization on transactions page
        setNetwork()


        console.log('found tronweb')
        currentAddress = tronWeb.defaultAddress['base58']
        console.log('current address', currentAddress)
        setInterval(watchSelectedWallet, 2000)
        main()

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

function shortId(str, size) {
    return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

function formatSun(sun) {
    return numeral(tronWeb.fromSun(sun)).format('0,0.000 a').toUpperCase()
}

function clipCopy (str) {
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

const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}

async function main() {

    showWalletInfo()
    const networkName = getNetworkName()

    let transRes = await $.ajax({
        url: API_URL + '/investor?walletId=' + currentAddress + '&network=' + networkName
    });
//console.log('transRes', transRes)
    transRes = _.map(transRes, (obj) => {
        obj.amount = numeral(obj.amount /= 1000000).format('0,0.000 a').toUpperCase()
        obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
        return obj
    })

    const getEventData = (data, eventName) => {
        return _.filter(data, (obj) => {
            return obj.event === eventName
        })
    }


    const investData = getEventData(transRes, 'Invest')
    const withdrawData = getEventData(transRes, 'Withdraw')

    const tronscanPrefix = networkName === 'shasta' ? 'shasta.' : ''

    const investTemplateHtml = `${investData.map((item) =>
        `<div class="row">
        <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                          ${shortId(item.transaction, 5)}
                        </a>
                        <p class="mb-1 text-white w-15 w-xs-100">${item.amount}</p>
                        <div class="w-20 w-xs-100">
                            ${item.timestamp}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>`
    ).join('')}`

    const withdrawTemplateHtml = `${withdrawData.map((item) =>
        `<div class="row">
        <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                          ${shortId(item.transaction, 5)}
                        </a>
                        <p class="mb-1 text-white w-15 w-xs-100">${item.amount}</p>
                        <div class="w-20 w-xs-100">
                            ${item.timestamp}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>`
    ).join('')}`

    $('#investContent').html(investTemplateHtml)
    $('#withdrawContent').html(withdrawTemplateHtml)


    // sponsorship data
    let sponsorshipSent = await $.ajax({
        url: API_URL + '/sponsorship_sent?walletId=' + currentAddress + '&network=' + networkName
    });
    //console.log('sponsorshipSent', sponsorshipSent)
    let sponsorshipReceived = await $.ajax({
        url: API_URL + '/sponsorship_received?walletId=' + currentAddress + '&network=' + networkName
    });
    //console.log('sponsorshipReceived', sponsorshipReceived)
    // sponsorship data
    let sliceSent = await $.ajax({
        url: API_URL + '/slice_sent?walletId=' + currentAddress + '&network=' + networkName
    });
    //console.log('sliceSent', sliceSent)
    let sliceReceived = await $.ajax({
        url: API_URL + '/slice_received?walletId=' + currentAddress + '&network=' + networkName
    });

    let allSponsorshipData = sponsorshipSent.concat(sponsorshipReceived, sliceSent, sliceReceived)

    allSponsorshipData = _.map(allSponsorshipData, (obj) => {
        obj.amount = numeral(obj.amount /= 1000000).format('0,0.000 a').toUpperCase()
        obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
        return obj
    })

    //allSponsorshipData = _.sortBy(allSponsorshipData, [function(o) { return o.timestamp; }]);
    const sponsorshipRawData = _.orderBy(allSponsorshipData, ['timestamp'], ['desc']);
    //console.log('allSponsorshipData', allSponsorshipData)

    // TODO: integrate with logic below


    // sponsorship data filtering
    const FUNDED_TYPE = 'Funded'
    const CREDITED_TYPE = 'Credit'
    const SPONSORSHIP_EVENT = 'Sponsorship'
    const SLICE_EVENT = 'Slice'
    const INCOMING = 'Incoming'
    const OUTGOING = 'Outgoing'


    const walletId = currentAddress
    const sponsorshipData = _.map(sponsorshipRawData, (obj) => {
        obj.fundType = obj.event === SPONSORSHIP_EVENT ? FUNDED_TYPE : CREDITED_TYPE
        obj.fundDirection = obj.sender === walletId ? OUTGOING : INCOMING
        obj.anotherPersonWalletId = obj.sender === walletId ? obj.beneficiary : obj.sender
        return obj
    })


    const sponsorshipTemplateHtml = `${sponsorshipData.map((item) =>
        `<div class="row">
        <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                          ${shortId(item.transaction, 5)}
                        </a>
                        <p class="mb-1  w-15 w-xs-100"><span class="text-white">${item.amount}</span>&nbsp;&nbsp; <small class="text-muted">${item.fundType}</small></p>
                        <div class="w-10 w-xs-100 mb-2">
                            ${item.fundDirection}
                        </div>
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.anotherPersonWalletId}')">
                          ${shortId(item.anotherPersonWalletId, 5)}
                        </a>
                        <div class="w-20 w-xs-100">
                            ${item.timestamp}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>`
    ).join('')}`


    let donationRes = await $.ajax({
        url: API_URL + '/donation?walletId=' + currentAddress + '&network=' + networkName
    });

    donationRes = _.map(donationRes, (obj) => {
        obj.amount = numeral(obj.amount /= 1000000).format('0,0.000 a').toUpperCase()
        obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
        return obj
    })


    const donateTemplateHtml = `${donationRes.map((item) =>
        `<div class="row">
        <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                          ${shortId(item.transaction, 5)}
                        </a>
                        <p class="mb-1 text-white w-15 w-xs-100">${item.amount}</p>
                        <div class="w-20 w-xs-100">
                            ${item.timestamp}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>`
    ).join('')}`

    $('#sponsorshipContent').html(sponsorshipTemplateHtml)
    $('#donateContent').html(donateTemplateHtml)


    // Referrers tab logic

    let referrersRes = await $.ajax({
        url: API_URL + '/referrer?walletId=' + currentAddress + '&network=' + networkName
    });

    referrersRes = _.map(referrersRes, (obj) => {
        obj.amount = formatSun(obj.amount)
        obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
        return obj
    })
//console.log('referrersRes', referrersRes)


    const referrerTemplateHtml = `${referrersRes.map((item) =>
        `<div class="row">
        <div class="col-12 list">
            <div class="card d-flex flex-row mb-3">
                <div class="d-flex flex-grow-1 min-width-zero">
                    <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                          ${shortId(item.transaction, 5)}
                        </a>
                        <p class="mb-1 text-white w-15 w-xs-100">${item.amount}</p>
                        <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.investor}')">
                          ${shortId(item.investor, 5)}
                        </a>
                        <div class="w-20 w-xs-100">
                            ${item.timestamp}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>`
    ).join('')}`


    $('#referrerContent').html(referrerTemplateHtml)

}




