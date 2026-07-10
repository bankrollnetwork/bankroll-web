const tron_networks = {
  'mainnet': 'TFLibm6RFRdebUobotPt2CrzpfCnujvxLr',//'TXx1M5d6WaD87PZwTcHGA9wMb9uqsazhw6',
  'shasta': 'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

var contractAddress
var tronWebLocal
var currentAddress
var network
var waiting
var stakeAddress = 'TXwYAQ9y9r8u4E2o6KrdeELMr5x6NFekge'
var bnkrStake, luck
var players = {}

let startTime = Date.now() - 172800


$(document).ready(async () => {
  checkTronWeb()
})

const API_URL = 'https://api.bankroll.network/credits-tx'

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

function setNetwork() {
  var url = tronWebLocal.currentProvider().fullNode.host
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
  $('#walletBalanceValue').text(formatSun(await tronWebLocal.trx.getBalance()))
  var bandwidth = await tronWebLocal.trx.getBandwidth()
  $('#getBandwidth').text(numeral(bandwidth).format('0,0 a').toUpperCase())
  var result = await tronWebLocal.trx.getAccountResources()
  var net = result.EnergyLimit - result.EnergyUsed
  $('#getEnergy').text(numeral(net).format('0,0 a').toUpperCase())

}

async function checkTronWeb() {
      // TODO: verify whether we need this initialization on transactions page
    try {
      tronWebLocal = new TronWeb({
          fullNode: 'https://api.trongrid.io',
          solidityNode: 'https://api.trongrid.io',
          eventServer: 'https://api.trongrid.io/'
      })

        tronWebLocal.setAddress('TVJ6njG5EpUwJt4N9xjTrqU5za78cgadS2');
      setNetwork()

      console.log('found tronweb')
      luck = await tronWebLocal.contract().at(contractAddress)
      currentAddress = tronWebLocal.defaultAddress['base58']
      console.log('current address', currentAddress)

          await  main()
      } catch (e){
        $('#elog').text(`${e.message} ${e.stack ? e.stack : ''}`)
    }

}


function shortId(str, size) {
  return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

function formatSun(sun) {
  return numeral(tronWebLocal.fromSun(sun)).format('0,0.000 a').toUpperCase()
}

async function pullData(){
    let pages = 0
    let startTime = Math.floor(Date.now()/1000) - (86400 * 2) //48 hours in the past
    let fingerprint = await loadData(null, startTime)
    while (fingerprint){
        fingerprint = await loadData(fingerprint, startTime)
        await updateTopPlayers()
        pages++
        $("#loading").text(`Loading... ${pages}`)
    }
    await updateTopPlayers()
    $("#loading").text('')
}


async function loadData(fingerprint = null, startTime){
    let requestObj = {size: 200, eventName: 'onRoll'}

    if (fingerprint != null){
        requestObj.previousLastEventFingerprint = fingerprint
    }



    let res
    let lastTime = 0

    try {
        res = await tronWebLocal.getEventResult(contractAddress, requestObj)

        if (res.length) {
            fingerprint = res[res.length-1].fingerprint
            _.forEach(res, value => {
                let account
                let from = tronWebLocal.address.fromHex(value.result.player)
                let timestamp = Math.floor(value.timestamp/1000)

                //console.log(from, value.result.bnkr, timestamp)

                if (players[from] == null){
                    account = {player:from, balance:parseFloat(value.result.bnkr), timestamp:timestamp}
                    players[from] = account
                } else {
                    account = players[from]
                    account.balance += parseFloat(value.result.bnkr)
                    account.timestamp = timestamp
                }
                lastTime = timestamp
            })

            //console.log(lastTime, startTime, lastTime.toString().length, startTime.toString().length)
            //return fingerprint
            return lastTime > startTime ? fingerprint : null
        }

    } catch (e){
        console.error(e)
    }

    return null

}

const getNetworkName = () => {
  const url = tronWebLocal.currentProvider().fullNode.host
  const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
  return networkName
}

const updateTopPlayers = async() => {

  let playerRes = _.values(players)

  playerRes = _.orderBy(playerRes, ['balance'], ['desc'])

  playerRes = _.filter(playerRes, value => {return value.balance > 0} )

  let rank = 1
  let playersList = _.map(playerRes, (obj) => {
      obj.rank = rank++;
      return obj
  })

  playersList = _.slice(playersList,0,100)

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
                      <p class="mb-1 text-white w-30 w-xs-100">BNKR</p>

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
                      <p class="mb-1 text-white w-30 w-xs-100">${formatSun(item.balance)}</p>
                  </div>
              </div>
          </div>
      </div>
    </div>`
  ).join('')}`
  $('#investContent').html(investTemplateHtml)
 return rank
}

 function main() {
  showWalletInfo()
     pullData()
}




