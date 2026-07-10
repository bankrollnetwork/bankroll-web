const tron_networks = {
    'mainnet': 'TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u',
    'shasta': 'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

var contractAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
var waiting

$(document).ready(async () => {
    setTimeout(checkTronWeb, 100);
})

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
    $('#walletBalanceValue').text(formatSun(await tronWeb.trx.getUnconfirmedBalance()))
    var bandwidth = await tronWeb.trx.getBandwidth()
    $('#getBandwidth').text(numeral(bandwidth).format('0,0 a').toUpperCase())
    var result = await tronWeb.trx.getAccountResources()
    var net = (result.EnergyUsed) ? result.EnergyLimit - result.EnergyUsed : result.EnergyLimit
    $('#getEnergy').text(numeral(net).format('0,0 a').toUpperCase())
    console.log('account-resources ', result)

}

async function checkTronWeb() {
    if (!(window.tronWeb && window.tronWeb.ready)) {
        console.log('Could not connect to TronLink.')
        waiting += 1;
        console.log('waiting', waiting)
        if (waiting == 50) {
            closeLoading()
            $('#tronWebModal').modal()
            return
        }
        setTimeout(checkTronWeb, 500);
        return;
    } else {
        tronWeb = window.tronWeb
        setNetwork()

        console.log('found tronweb')
        currentAddress = tronWeb.defaultAddress['base58']
        console.log('current address', currentAddress)
        userTag(currentAddress)

        setInterval(watchSelectedWallet, 2000)

        try {
            Promise.all([showWalletInfo(),main()])
        } catch (e) {

        } finally {
            closeLoading()
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

function shortId(str, size) {
    return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

function formatSun(sun) {
    return numeral(tronWeb.fromSun(sun)).format('0,0.000 a').toUpperCase()
}

function showError(msg){
    $('#errorId').text(msg)
    $('#errorModal').modal()
    setTimeout(mainLoop)
}

function txError(error) {
    var msg = error.message
    $('#txErrorId').text(msg)
    $('#txErrorModal').modal()
    setTimeout(mainLoop)
}

function refresh(tx) {
    $('#txId').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#txModal').modal()
    setTimeout(mainLoop)
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