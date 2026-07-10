const tron_networks = {
  'mainnet': 'TSzoRNQxgFhPZFXB4zA3C2voP7U38r8b5u',
  'shasta': 'TTEULtpjMtVgmRo4KjYvx6VTztZABCSCKQ'//'TNVYQKhigG7YfJqV6jMkPWnDBYtQceFszH'
}

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

async function selectRandomReferral(){
  const networkName = getNetworkName()
  let rewardsData = await $.ajax({
    url: API_URL + '/rewards_info?walletId=' + currentAddress + '&network=' + networkName
  });
  if (rewardsData.length){
    let curReferral = rewardsData[Math.floor(Math.random()*rewardsData.length)];
    clipCopy(curReferral.customer_address)
  }
}

async function main() {

  await showWalletInfo()
  const networkName = getNetworkName()

  let investRes = await $.ajax({
      url: API_URL + '/token_purchased?walletId=' + currentAddress + '&network=' + networkName
  });
  //console.log('investRes', investRes)
  investRes = _.map(investRes, (obj) => {
      //obj.amount = numeral(obj.amount /= 1000000).format('0,0.000 a').toUpperCase()
      obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
      return obj
  })

  const tronscanPrefix = networkName === 'shasta' ? 'shasta.' : ''

  const investTemplateHtml = `
  <div class="row">
      <div class="col-12 list">
          <div class="card d-flex flex-row mb-3">
              <div class="d-flex flex-grow-1 min-width-zero">
                  <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                      <div class="w-20 w-xs-100">    
                        Transaction
                      </div>
                      <p class="mb-1 text-white w-15 w-xs-100">Amount</p>
                      <div class="w-20 w-xs-100">
                        Time
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  ${investRes.map((item) =>
      `<div class="row">
      <div class="col-12 list">
          <div class="card d-flex flex-row mb-3">
              <div class="d-flex flex-grow-1 min-width-zero">
                  <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                      <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                        ${shortId(item.transaction, 5)}
                      </a>
                      <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.tokens_minted)}</p>
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



  let withdrawRes = await $.ajax({
    url: API_URL + '/withdraw_info?walletId=' + currentAddress + '&network=' + networkName
  });

  withdrawRes = _.map(withdrawRes, (obj) => {
      obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
      return obj
  })

  const withdrawTemplateHtml = `
  <div class="row">
    <div class="col-12 list">
      <div class="card d-flex flex-row mb-3">
          <div class="d-flex flex-grow-1 min-width-zero">
              <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                  <div class="w-20 w-xs-100">    
                    Transaction
                  </div>
                  <p class="mb-1 text-white w-15 w-xs-100">Amount</p>
                  <div class="w-20 w-xs-100">
                    Time
                  </div>
              </div>
          </div>
      </div>
    </div>
  </div>
  ${withdrawRes.map((item) =>
      `<div class="row">
      <div class="col-12 list">
          <div class="card d-flex flex-row mb-3">
              <div class="d-flex flex-grow-1 min-width-zero">
                  <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                      <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                        ${shortId(item.transaction, 5)}
                      </a>
                      <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.tron_withdrawn)}</p>
                      <div class="w-20 w-xs-100">
                          ${item.timestamp}
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>`
  ).join('')}`

  $('#withdrawContent').html(withdrawTemplateHtml)


  // rewardsData
  let rewardsData = await $.ajax({
      url: API_URL + '/rewards_info?walletId=' + currentAddress + '&network=' + networkName
  });

  rewardsData = _.map(rewardsData, (obj) => {
      obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
      return obj
  })

  const rewardTemplateHtml = 
    `<button type="button" class="btn btn-outline-semi-light default ml-4 mb-2" onclick="selectRandomReferral()">Select random referral</button>
      <div class="row">
      <div class="col-12 list">
        <div class="card d-flex flex-row mb-3">
            <div class="d-flex flex-grow-1 min-width-zero">
                <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                    <div class="w-20 w-xs-100">    
                      Transaction
                    </div>
                    <p class="mb-1 text-white w-15 w-xs-100">Amount</p>
                    <div class="w-20 w-xs-100">    
                      Address
                    </div>
                    <div class="w-20 w-xs-100">
                      Time
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
    ${rewardsData.map((item) =>
      `<div class="row">
      <div class="col-12 list">
          <div class="card d-flex flex-row mb-3">
              <div class="d-flex flex-grow-1 min-width-zero">
                  <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                      <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                        ${shortId(item.transaction, 5)}
                      </a>
                      <p class="mb-1 text-white w-15 w-xs-100">${formatSun(item.tokens_minted)}</p>
                      <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" onclick="clipCopy('${item.investor}')">
                        ${shortId(item.customer_address, 5)}
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

  $('#rewardContent').html(rewardTemplateHtml)



  //  transfer_info

  let transferData = await $.ajax({
    url: API_URL + '/transfer_info?walletId=' + currentAddress + '&network=' + networkName
  });

  transferData = _.map(transferData, (obj) => {
      obj.timestamp = moment(obj.timestamp).format('MM-DD hh:mm a')
      return obj
  })


  const INCOMING = 'Received'
  const OUTGOING = 'Sent'

  const walletId = currentAddress
  transferData = _.map(transferData, (obj) => {
      obj.fundDirection = obj.from_address === walletId ? OUTGOING : INCOMING
      obj.anotherPersonWalletId = obj.from_address === walletId ? obj.to_address : obj.from_address
      return obj
  })

  const transferTemplateHtml = `
  <div class="row">
      <div class="col-12 list">
          <div class="card d-flex flex-row mb-3">
              <div class="d-flex flex-grow-1 min-width-zero">
                  <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                      <div class="w-20 w-xs-100">    
                        Transaction
                      </div>
                      <p class="mb-1  w-15 w-xs-100"><span class="text-white">Amount</span></p>
                      <div class="w-10 w-xs-100 mb-2">
                        In/Out
                      </div>
                      <div class="w-20 w-xs-100">    
                        Address
                      </div>
                      <div class="w-20 w-xs-100">
                        Time
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  ${transferData.map((item) =>
      `<div class="row">
      <div class="col-12 list">
          <div class="card d-flex flex-row mb-3">
              <div class="d-flex flex-grow-1 min-width-zero">
                  <div class="card-body align-self-center d-flex flex-column flex-md-row justify-content-between min-width-zero align-items-md-center">
                      <a class="p-1 btn btn-outline-primary list-item-heading mb-2 truncate w-20 w-xs-100" href="https://${tronscanPrefix}tronscan.org/#/transaction/${item.transaction}">
                        ${shortId(item.transaction, 5)}
                      </a>
                      <p class="mb-1  w-15 w-xs-100"><span class="text-white">${formatSun(item.tokens)}</span></p>
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

  $('#transferContent').html(transferTemplateHtml)


}




