/*const tron_networks = {
    'mainnet': 'TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u',
    'shasta': 'TDfkwkxmwbgLJNS7RsFdcgJcjEWt2X8NdG'//'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}*/

tron_networks.mainnet = ''//'TXhbZUj93e35vrsBhiarTcmgTSd27KokuL' //'TQDXUksSH9MjxzR6PyCx5DRDbFtidsJow8'//'TQTH2zyouhT4b2j7Dv6kwsBRRvcio7MLow'

tron_networks.shasta =  'TLjB7fUBs42xngtH6qXkj7Xqh7rHdG1xLY'//'TS5RDEonZ3Xq89Fau7N7r72G6vUL6Nj6aZ' //'TBW1rx9UZigmkcQn1HfSamhWxFeGATVKHZ' //'TVKAvXP9F82wxJdwvHLTBvySC7djJGb81d' //'TDR3oTBmpuwPrq6j3iBcaWfhugLF3oHDDH'

const waitInterval = 2000
const retryInterval = 1000
const errorMax= 20
let errorCount = 0
let rolls = 0
let distribution = []
let autoRoll = false
let isSoundOn = true
var currentAddress
var network

let slowTransactionsArr = []

let luck
let startTime
let jackpotTimestamp

let selectedNumber = 50
let selectedNumberLbl =  $('#selectedNumber')
let betAmountInp = $('#betAmount')
let _globalMaxWager

function refreshLuckEvent(tx) {
    $('#txIdLuck').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#txModalLuck').modal()
    //setTimeout(mainLoop)
}

function showAlert(title, msg){
    $('#alertTitle').text(title)
    $('#alertId').text(msg)
    $('#alertModal').modal()
}

function showError(msg){
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


function trust(addr){
    luck.updateTrust(addr).send().then(console.log).catch(console.error);
}

const API_URL = 'https://api.bankroll.network/luck'   //   http://localhost:3003/luck

const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}

const updateTopPlayers = async() => {
    const networkName = getNetworkName()
    let topPLayersRes
    try {
       topPLayersRes = await $.ajax({
            url: API_URL + '/top_win_players?network=' + networkName
        });
    } catch (e) {
        console.log(e)
        topPLayersRes = []
    }

    // topPLayersRes = _.map(topPLayersRes, (obj) => {
    //     obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
    //     return obj
    // })



    const topPlayersContent = `${topPLayersRes.map((item) =>
        `<div class="card-body p-1">
            <div class="row">
                <div class="col-sm-2">
                    <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate d-block" onclick="clipCopy('${item.cur_player}')">
                    ${shortId(item.cur_player, 5)}
                    </a>
                </div>
                <div class="col-sm-10">
                    <div class="row">
                        <div class="col-3">
                            <div class="pl-2 text-white">
                                ${formatSun(item.sum_profit)}
                            </div>
                        </div>
                        <div class="col-2">
                          <span>${formatSun(item.sum_lose)}</span>
                        </div>
                        <div class="col-3"><span class="text-white">${formatSun(item.pure_profit)}</span></div>
                        <div class="col-2"><span>${item.win_count}</span></div>
                        <div class="col-2"><span>${item.lose_count}</span></div>
                    </div>
                </div>
            </div>
        </div>`
    ).join('')}`


    $('#topPlayersContent').html(topPlayersContent)
}


async function getCurrentTimestamp (){
    let block = await tronWeb.trx.getCurrentBlock()
    //return block
    return block.block_header.raw_data.timestamp
}

async function main() {

    luck = await tronWeb.contract().at(contractAddress)
    jackpotTimestamp = await getCurrentTimestamp()
    setNetwork()



    setInterval(updateTopPlayers, 15000)

    updateTopPlayers()

}

function mainLoop (){

}

async function updateEnergy(privateKey){
    let trans = await  tronWeb.transactionBuilder.updateSetting(tronWeb.address.toHex('TQDXUksSH9MjxzR6PyCx5DRDbFtidsJow8'),20)
    let signed = await tronWeb.trx.sign(trans)
    console.log(trans, signed, await tronWeb.trx.sendRawTransaction(signed))

}

function showEnergy(){
    tronWeb.trx.getAccountResources('TQDXUksSH9MjxzR6PyCx5DRDbFtidsJow8').then(console.log).catch(console.log)
}
