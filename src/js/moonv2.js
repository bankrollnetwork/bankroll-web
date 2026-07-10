var currentAddress
var contractAddress
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate, symbol

$(document).ready(() => {
    initEthConnect(main)
})

async function main() {
    console.log('bootstrapping ui')

    currentAddress = window.ethDefaultAddress
    contractAddress = BANKROLL[BANKROLL.network].Moon[REWARD_SYMBOL].contract
    symbol = REWARD_SYMBOL

    userTag(currentAddress)
    console.log('current address', currentAddress)

    bindUI()

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

    $('#contract-url').attr('href', `https://etherscan.io/address/${contractAddress}`)
    $('#contract-url').text(`https://etherscan.io/address/${shortId(contractAddress, 5)}`)
    $('#tutorial-url').attr('href', `#`)


    let calcTokens = async (e) => {
        let web3js = getWeb3()
        let amount = Number.parseFloat(buyAmountInp.val().trim())
        amount = web3js.utils.toBN(web3js.utils.toWei(amount + ''))
        amount = await moon.methods.calculateTokensReceived(amount).call()
        console.log('amount-estimate', amount)
        buyEstimate.text(`${formatSun(amount)} MOON`)
    }



    buyAmountInp.on("change paste keyup", _.debounce(calcTokens, 250))


    sellAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseFloat(sellAmountInp.val().trim())
        sellEstimate.text(`${numeral(amount * 0.90).format('0.000 a').toUpperCase()} VLT`)
    })

    transferAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseFloat(transferAmountInp.val().trim())
        transferEstimate.text(`${numeral(amount).format('0.000 a').toUpperCase()} MOON`)
    })

}

async function watchSelectedWallet() {
    // Lowercase both — web3 returns EIP-55 checksummed addresses while
    // currentAddress is lowercase from eth_requestAccounts.
    const current = (await window.web3.eth.getAccounts())[0] || ''
    if (current.toLowerCase() !== (currentAddress || '').toLowerCase()) {
        location.reload()
    }
}

async function mainLoop() {
    setTimeout(showWalletInfo, 0)
    setTimeout(showUserStats, 0)
}

function formatSun(sun) {
    return numeral(convertWeiToEth(sun)).format('0,0.000 a').toUpperCase()
}

function formatReward(sun) {
    //console.log('reward-decimals',sun, BANKROLL[BANKROLL.network].Moon[REWARD_SYMBOL].decimals, sun/1e9)
    return numeral(sun / (10 ** BANKROLL[BANKROLL.network].Moon[REWARD_SYMBOL].decimals)).format('0,0.000 a').toUpperCase()
}

function formatSimple(amount) {
    return numeral(amount).format('0,0.000 a').toUpperCase()
}


async function showWalletInfo() {
    let web3js = getWeb3()
    try {
        $('#network').text(BANKROLL.network)
        $('#walletAddress').text(`${shortId(currentAddress, 5)}`)

        $('#walletBalanceValue').text(formatSun(await web3js.eth.getBalance(currentAddress)))
    } catch (e) {
        console.error(e)
    }
}

async function showStats() {
    try {

        let [totalTxs, players, tokenBalance, totalSupply, dividendBalance, price_vlt, totalVLT] =
            await Promise.all(
                [
                    moon.methods.totalTxs().call(),
                    moon.methods.players().call(),
                    moon.methods.totalTokenBalance().call(),
                    moon.methods.totalSupply().call(),
                    moon.methods.totalRewardTokenBalance().call(),
                    getVLTUSDC(),
                    moon.methods.totalClaims().call()
                ]
            )

        $('#totalTxs').text(numeral(totalTxs).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text(players)
        $('#contractBalance').text(formatSun(tokenBalance))
        $('#contractBalance-usdt').html(`${approxStr} ${formatSun(tokenBalance * price_vlt)} USDT`)
        $('#totalSupply').text(formatSun(totalSupply))
        $('#dividendPool').text(formatReward(dividendBalance))
        $('#dividendPool-usdt').html(`${approxStr} ${formatSimple(await getRewardUSDC(dividendBalance))} *`)
        $('#totalVLT').text(formatSun(totalVLT))
    } catch (e) {
        console.error(e)
    }
}


async function showUserStats() {
    try {
        let [stats, balance, divs, estimate, totalSupply] =
            await Promise.all(
                [
                    moon.methods.statsOf(currentAddress).call(),
                    moon.methods.myTokens().call(),
                    moon.methods.myDividends().call(),
                    moon.methods.dailyEstimate(currentAddress).call(),
                    moon.methods.totalSupply().call(),

                ]
            )


        let stakePercent = balance / totalSupply * 100


        let withdrawn = formatSun(stats[1])
        let reinvested = formatSun(stats[12])

        let price_vlt = await getVLTUSDC()


        $('#user-percentage').text(numeral(stakePercent).format('0.000') + ' %')

        $('#user-withdrawn').text(withdrawn)
        $('#user-reinvested').text(reinvested)
        $('#user-rolls').text(stats[13])
        $('#user-bonus').text(formatSun(balance))
        $('#user-bonus-usdt').html(`${approxStr} ${formatSun(balance * price_vlt)} USDT`)

        $('#user-vault').text(formatSun(divs))
        $('#user-vault-usdt').html(divs > 0 ? `${approxStr} ${formatSun(divs * price_vlt)} USDT` : '')
    } catch (e) {
        console.error(e)
    }

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
    let tokens = web3js.utils.fromWei(await moon.methods.myTokens().call())

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var address = $('#recipient').val().trim()
        if (!web3js.utils.isAddress(address)) {
            $('#invalidAddressModal').modal()
        } else {
            // withdrawals ha now been zerod out and it is safe to transfer
            amount = Math.min(parseFloat(amount), parseFloat(tokens))
            moon.methods.transfer(address, web3js.utils.toBN(web3js.utils.toWei(amount + ''))).send()
                .on('transactionHash', (tx) => refresh(tx))
                .on('error', (e) => txError(e))
        }
    }

    return false;
}

async function sell() {
    let web3js = getWeb3()

    let tokens = web3js.utils.fromWei(await moon.methods.myTokens().call())
    let amount = $('#sellAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        amount = Math.min(parseFloat(amount), parseFloat(tokens))
        $.notify({
            message: `<span class="text-white">The VLT from your sale will  be deposited to your DIVS</span>`
        }, {
            type: 'dark',
            delay: 5000,
            allow_dismiss: true
        })
        moon.methods.sell(web3js.utils.toBN(web3js.utils.toWei(amount + ''))).send()
            .on('transactionHash', (tx) => refresh(tx))
            .on('error', (e) => txError(e))
    }

    return false;
}

async function withdraw() {
    if (!(await moon.methods.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    moon.methods.withdraw().send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))

    return false;
}


async function reinvest() {

    if (!(await moon.methods.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    moon.methods.reinvest().send()
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
        let prepamount = web3js.utils.toWei(amount + '')
        amount = web3js.utils.toBN(prepamount)
        console.log('amount-buy', prepamount, prepamount / 1e18)
        moon.methods.buy().send({ value: amount })
            .on('transactionHash', (tx) => refresh(tx))
            .on('error', (e) => txError(e))

    }

    return false;
}
