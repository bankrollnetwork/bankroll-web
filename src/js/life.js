var currentAddress
var contractAddress
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate

$(document).ready(() => {
    initEthConnect(main)
})

async function main() {
    console.log('bootstrapping ui')

    bindUI()

    currentAddress = window.ethDefaultAddress
    contractAddress = BANKROLL[BANKROLL.network].Stack

    userTag(currentAddress)
    console.log('current address', currentAddress)

    try {
        await mainLoop()
        await showStats()
    } catch (e) {
        console.error('initial render fail', e)
    }

    setInterval(mainLoop, 60000)
    setInterval(showStats, 60000)
    setInterval(watchSelectedWallet, 2000)
}

function bindUI() {
    buyAmountInp = $('#buyAmount')
    sellAmountInp = $('#sellAmount')
    transferAmountInp = $('#transferAmount')
    buyEstimate = $('#buy-estimate')
    sellEstimate = $('#sell-estimate')
    transferEstimate = $('#transfer-estimate')


    buyAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseFloat(buyAmountInp.val().trim())
        buyEstimate.text(`${numeral(amount * 0.90).format('0.00000 a').toUpperCase()} LIFE`)
    })

    sellAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseFloat(sellAmountInp.val().trim())
        sellEstimate.text(`${numeral(amount * 0.90).format('0.00000 a').toUpperCase()} ETH`)
    })

    transferAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseFloat(transferAmountInp.val().trim())
        transferEstimate.text(`${numeral(amount).format('0.00000 a').toUpperCase()} LIFE`)
    })


}

async function watchSelectedWallet() {
    // Lowercase both — web3 returns EIP-55 checksummed addresses while
    // currentAddress is lowercase from eth_requestAccounts. See stack-vlt.js
    // for the bug this was causing (reload-after-connect loop).
    const current = (await window.web3.eth.getAccounts())[0] || ''
    if (current.toLowerCase() !== (currentAddress || '').toLowerCase()) {
        location.reload()
    }
}



async function mainLoop() {
    setTimeout(showWalletInfo,0)
    setTimeout(showUserStats,0)
}

function formatSun(sun) {
    return numeral(convertWeiToEth(sun)).format('0,0.00000 a').toUpperCase()
}


async function showWalletInfo() {
    try {
        let web3js = getWeb3()

        $('#network').text(BANKROLL.network)
        $('#walletAddress').text(`${shortId(currentAddress, 5)}`)

        $('#walletBalanceValue').text(formatSun(await web3js.eth.getBalance(currentAddress)))
    } catch (e) {
        console.error(e)
    }
}

async function showStats() {
    try {

        let [totalTxs, players, ethBalance, totalSupply, dividendBalance, vltBalance, totalVLT, price_eth] =
            await Promise.all(
                [
                    life.methods.totalTxs().call(),
                    life.methods.players().call(),
                    life.methods.totalEthBalance().call(),
                    life.methods.totalSupply().call(),
                    life.methods.dividendBalance_().call(),
                    life.methods.swapBalance_().call(),
                    life.methods.totalClaims().call(),
                    getETHUSDC()
                ]
            )

        $('#totalTxs').text(numeral(totalTxs).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text(players)
        $('#contractBalance').text(formatSun(ethBalance))
        $('#contractBalance-usdt').html(`${approxStr} ${formatSun(ethBalance * price_eth)} USDT`)
        $('#totalSupply').text(formatSun(totalSupply))
        $('#dividendPool').text(formatSun(dividendBalance))
        $('#vltPool').text(formatSun(vltBalance))
        $('#totalVLT').text(formatSun(totalVLT))
    } catch (e) {
        console.error(e)
    }
}


async function showUserStats() {
    let [stats, balance, divs, rewards, estimate, claimEstimate, totalSupply] =
        await Promise.all(
            [
                life.methods.statsOf(currentAddress).call(),
                life.methods.myTokens().call(),
                life.methods.myDividends().call(),
                life.methods.myClaims().call(),
                life.methods.dailyEstimate(currentAddress).call(),
                life.methods.dailyClaimEstimate(currentAddress).call(),
                life.methods.totalSupply().call()

            ]
        )


    let withdrawn = formatSun(stats[1])
    let reinvested = formatSun(stats[12])


    let price_vlt = await getVLTUSDC()
    let price_eth = await getETHUSDC()


    $('#user-withdrawn').text(withdrawn)
    $('#user-reinvested').text(reinvested)
    $('#user-rolls').text(stats[13])
    $('#user-bonus').text(formatSun(balance))
    $('#user-bonus-usdt').html(`${approxStr} ${formatSun(balance * price_eth)} USDT`)

    $('#user-vault').text(formatSun(divs))
    $('#user-vault-usdt').html(divs > 0 ? `${approxStr} ${formatSun(divs * price_eth)} USDT` : '')

    $('#user-rewards').text(formatSun(rewards))
    $('#user-rewards-usdt').html(`${approxStr} ${formatSun(rewards * price_vlt)} USDT`)

}


function refresh(tx) {
    $('#txId').html(`<a href="${formatTxUrl(tx)}">${shortId(tx, 5)}</a>`)
    $('#txModal').modal()
    setTimeout(mainLoop)
}

function txError(error) {
    var msg = error.message
    $('#txErrorId').text(msg)
    $('#txErrorModal').modal()
    setTimeout(mainLoop)
}

function showAlert(title, msg) {
    $('#alertTitle').text(title)
    $('#alertId').text(msg)
    $('#alertModal').modal()
}

function showError(msg) {
    $('#errorId').text(msg)
    $('#errorModal').modal()
    setTimeout(mainLoop)
}

function shortId(str, size) {
    return str.substr(0, size) + '...' + str.substr(str.length - size, str.length);
}

/************ Chain Functions *******************/

async function transfer() {

    let web3js = getWeb3();


    var amount = Number.parseFloat($('#transferAmount').val().trim())
    let tokens = web3js.utils.fromWei(await life.methods.myTokens().call())

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var address = $('#recipient').val().trim()
        if (!web3js.utils.isAddress(address)) {
            $('#invalidAddressModal').modal()
        } else {
            // withdrawals ha now been zerod out and it is safe to transfer
            amount = Math.min(parseFloat(amount), parseFloat(tokens))
                life.methods.transfer(address, web3js.utils.toBN(web3js.utils.toWei(amount + ''))).send()
                    .on('transactionHash', (tx) => refresh(tx))
                    .on('error', (e) => txError(e))
        }
    }

    return false;
}

async function sell() {
    let web3js = getWeb3()

    let tokens = web3js.utils.fromWei(await life.methods.myTokens().call())
    let amount = $('#sellAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        amount = Math.min(parseFloat(amount), parseFloat(tokens))
        $.notify({
            message: `<span class="text-white">The ETH from your sale will  be deposited to your DIVS</span>`
        }, {
            type: 'dark',
            delay: 5000,
            allow_dismiss: true
        })
        life.methods.sell(web3js.utils.toBN(web3js.utils.toWei(amount + ''))).send()
            .on('transactionHash', (tx) => refresh(tx))
            .on('error', (e) => txError(e))
    }

    return false;
}

async function withdraw() {
    if (!(await life.methods.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    life.methods.withdraw().send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))

    return false;
}

async function claim() {
    if (!((await life.methods.myClaims().call()))){
        showAlert('NO DIVS!!!','Slow down there buddy, you need to have some divs first!')
        return
    }

    life.methods.claim().send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))

    return false;
}


async function reinvest() {

    if (!(await life.methods.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    life.methods.reinvest().send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))

    return false;
}

async function buy() {

    let web3js = getWeb3()


    var amount = $('#buyAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        life.methods.buy().send({value: web3js.utils.toBN(web3js.utils.toWei(amount + ''))})
            .on('transactionHash', (tx) => refresh(tx))
            .on('error', (e) => txError(e))

    }

    return false;
}
