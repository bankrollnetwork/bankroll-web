const tron_networks = {
  'mainnet': 'TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u',
  'shasta': 'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

const bnkrAddress = 'TVuYcDgE1hPDR78RR6T5CcFe2iyD5XKKQz'

var contractAddress
var tronWeb
var currentAddress
var network
var waiting


$(document).ready(async () => {
  setTimeout(checkTronWeb, 100);
})

const API_URL = 'https://api.bankroll.network/credits-tx'
//const API_URL = 'http://localhost:3003/credits-tx'

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

      // TODO: verify whether we need this initialization on transactions page
      setNetwork()


      console.log('found tronweb')
      currentAddress = tronWeb.defaultAddress['base58']
      console.log('current address', currentAddress)
      setInterval(watchSelectedWallet, 2000)
      try {
          await  main()
      } catch (e){}

      closeLoading()

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


const getNetworkName = () => {
  const url = tronWeb.currentProvider().fullNode.host
  const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
  return networkName
}

async function airdrop(send){
    const networkName = getNetworkName()

    const payoutMultiple = 30

    let players = await $.ajax({
        url: API_URL + '/all_players?network=' + networkName
    });

    let rank = 1
    players  = _.map(players, (obj) => {
        obj.rank = rank++;
        return obj
    })

    players = _.filter(players, (obj) => {
        if (obj.balance < 1000e6){
            return false
        }

        return true
    })
    let count = 0
    let total = 0
    players  = _.map(players, (obj) => {
        obj.rank = rank++;
        obj.trx = formatSun(obj.balance)
        obj.airdrop = payoutMultiple * Math.log10(obj.balance/1e6)
        //console.log(`${obj.player}, ${obj.trx}, ${obj.airdrop.toFixed(3)}`)
        count++
        total += obj.airdrop
        return obj
    })

    console.log('Welcome to the Bankroll Community Distribution of BNKR')
    console.log('Funds are being distributed from the Genesis block distro of 2.1M; zero dilution\n\n')
    console.log(`Eligible player count: ${count}`)
    console.log(`Allocation formula: 30 * log10(credits balance)`)
    console.log(`Total projected distribution: ${numeral(total).format('0,0.000 a').toUpperCase()}`)


    bnkr = await tronWeb.contract().at(bnkrAddress)

    console.log("\n")
    console.log("Distributing...")

    count = 0
    total = 0
    let exitCount = 3
    let errorCount = 0
    let completed = 0
    let tx
    let obj

    while (/*count < exitCount && */count < players.length -1) {
        obj = players[count]
        tx = 'fail'
        try{
            if (send) {
                tx = await bnkr.transfer(obj.player, tronWeb.toSun(Math.round(obj.airdrop))).send({callValue: 0, feeLimit: 5e6})
            } else {
                tx = 'dryrun'
            }
            completed += 1
            total += obj.airdrop
        } catch (e){
            console.log(e.message)
            errorCount++
            console.log(`error count = ${errorCount}`)
        } finally {
            console.log(`${obj.player}, ${obj.trx} credits, ${obj.airdrop.toFixed(3)} bnkr - ${tx}`)
            count++
        }
    }
    console.log('\n\n')
    console.log(`Completed ${completed} airdrops of BNKR`)
    console.log(`Total distribution: ${numeral(total).format('0,0.000 a').toUpperCase()} BNKR`)
    console.log(`Total of ${errorCount} errors`)
}

let csv = null

async function aircsv(send){

    if (csv === null){
        console.log("No CSV data founded")
        return
    }

    let rank = 1
    let count = 0
    let total = 0
    let players  = _.map(csv.split('\n'), (obj) => {
        let elems = obj.split(',')
        obj = {}
        obj.rank = rank++
        obj.player = elems[0]
        obj.trx = parseFloat(elems[1])
        obj.airdrop = parseFloat(elems[2])
        count++
        total += obj.airdrop
        return obj
    })

    console.log('Welcome to the Bankroll Community Distribution of BNKR')
    console.log('Funds are being distributed from the Genesis block distro of 2.1M; zero dilution\n\n')
    console.log(`Eligible player count: ${count}`)
    console.log(`Total projected distribution: ${numeral(total).format('0,0.000 a').toUpperCase()}`)


    bnkr = await tronWeb.contract().at(bnkrAddress)

    console.log("\n")
    console.log("Distributing...")

    count = 0
    total = 0
    let errorCount = 0
    let completed = 0
    let tx
    let obj

    while (count < players.length -1) {
        obj = players[count]
        tx = 'fail'
        try{
            if (send) {
                tx = await bnkr.transfer(obj.player, tronWeb.toSun(Math.round(obj.airdrop))).send({callValue: 0, feeLimit: 5e6})
            } else {
                tx = 'dryrun'
            }
            completed += 1
            total += obj.airdrop
        } catch (e){
            console.log(e.message)
            errorCount++
            console.log(`error count = ${errorCount}`)
        } finally {
            console.log(`${obj.player}, ${obj.trx} trx, ${obj.airdrop.toFixed(3)} bnkr - ${tx}`)
            count++
        }
    }
    console.log('\n\n')
    console.log(`Completed ${completed} airdrops of BNKR`)
    console.log(`Total distribution: ${numeral(total).format('0,0.000 a').toUpperCase()} BNKR`)
    console.log(`Total of ${errorCount} errors`)
}



const updateTopPlayers = async() => {
  const networkName = getNetworkName()

  let playersRes = await $.ajax({
    url: API_URL + '/players_list?network=' + networkName // + '&limit=' + TOP_PLAYERS_NUMBER
  });

  let rank = 1
  let playersList = _.map(playersRes, (obj) => {
      obj.rank = rank++;
      return obj
  })

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
                      <p class="mb-1 text-white w-30 w-xs-100">Balance</p>

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
}

async function main() {
  showWalletInfo()

  updateTopPlayers()

  setInterval(updateTopPlayers, 60000)
}




