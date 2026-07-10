var currentAddress
var contractAddress
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate

$(document).ready(() => {
    initEthConnect(main)
})

async function main() {
    // initEthConnect awaited eth_requestAccounts, ran networkReady + initContracts
    // before calling us, so the globals are ready.
    console.log('bootstrapping ui')

    bindUI()

    currentAddress = window.ethDefaultAddress
    contractAddress = BANKROLL[BANKROLL.network].Stack

    userTag(currentAddress)
    console.log('current address', currentAddress)

    // First UI render — sequential per the load-discipline pattern.
    try {
        await mainLoop()
        await showStats()
    } catch (e) {
        console.error('initial render fail', e)
    }

    // RPC-firing intervals at 60s; watchSelectedWallet is a local check.
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
        buyEstimate.text(`${numeral(amount * 0.90).format('0.000 a').toUpperCase()} STCK`)
    })

    sellAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseFloat(sellAmountInp.val().trim())
        sellEstimate.text(`${numeral(amount * 0.90).format('0.000 a').toUpperCase()} VLT`)
    })

    transferAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseFloat(transferAmountInp.val().trim())
        transferEstimate.text(`${numeral(amount).format('0.000 a').toUpperCase()} STCK`)
    })

    $('#stakingChb').change(async (e) => {
        let isStaking = $(e.currentTarget).prop('checked')
        console.log('Enable Staking: ', isStaking)
        if (isStaking) {
            enableStake()
        } else {
            disableStake()
        }
    })
}

async function watchSelectedWallet() {
    // Lowercase both sides — web3.eth.getAccounts() returns EIP-55 checksummed
    // ('0xAbC...') while currentAddress comes from eth_requestAccounts as
    // lowercase. A case-sensitive `!=` would fire on every poll tick.
    const current = (await window.web3.eth.getAccounts())[0] || ''
    if (current.toLowerCase() !== (currentAddress || '').toLowerCase()) {
        location.reload()
    }
}

async function isStakeEnabled() {
    let allowance = await vlt.methods.allowance(currentAddress, contractAddress).call();
    return allowance > 0 ? true : false
}

async function enableStake() {
    let web3js = getWeb3()
    vlt.methods.approve(contractAddress, web3js.utils.toBN(await vlt.methods.totalSupply().call())).send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))
}

async function disableStake() {
    let web3js = getWeb3()
    vlt.methods.approve(contractAddress, web3js.utils.toBN(0)).send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))

}


async function mainLoop() {
    setTimeout(showWalletInfo, 0)
    setTimeout(showUserStats, 0)
}

function formatSun(sun) {
    return numeral(convertWeiToEth(sun)).format('0,0.000 a').toUpperCase()
}


async function showWalletInfo() {
    try {
        $('#network').text(BANKROLL.network)
        $('#walletAddress').text(`${shortId(currentAddress, 5)}`)

        $('#walletBalanceValue').text(formatSun(await vlt.methods.balanceOf(currentAddress).call()))
    } catch (e) {
        console.error(e)
    }
}

async function showStats() {
    try {

        let [totalTxs, players, tokenBalance, totalSupply, dividendBalance, totalVLT, price_vlt] =
            await Promise.all(
                [
                    stack.methods.totalTxs().call(),
                    stack.methods.players().call(),
                    stack.methods.totalTokenBalance().call(),
                    stack.methods.totalSupply().call(),
                    stack.methods.dividendBalance_().call(),
                    stack.methods.totalClaims().call(),
                    getVLTUSDC()
                ]
            )

        $('#totalTxs').text(numeral(totalTxs).format('0,0.000 a').toUpperCase())
        $('#getTotalMembers').text(players)
        $('#contractBalance').text(formatSun(tokenBalance))
        $('#contractBalance-usdt').html(`${approxStr} ${formatSun(tokenBalance * price_vlt)} USDT`)
        $('#totalSupply').text(formatSun(totalSupply))
        $('#dividendPool').text(formatSun(dividendBalance))
        $('#totalVLT').text(formatSun(totalVLT))
    } catch (e) {
        console.error(e)
    }
}


async function showUserStats() {
    let [stats, balance, divs, estimate, totalSupply, allowance] =
        await Promise.all(
            [
                stack.methods.statsOf(currentAddress).call(),
                stack.methods.myTokens().call(),
                stack.methods.myDividends().call(),
                stack.methods.dailyEstimate(currentAddress).call(),
                stack.methods.totalSupply().call(),
                vlt.methods.allowance(currentAddress, contractAddress).call()

            ]
        )


    let stakePercent = balance / totalSupply * 100


    let withdrawn = formatSun(stats[1])
    let reinvested = formatSun(stats[12])

    let isStaking = await isStakeEnabled()

    let price_vlt = await getVLTUSDC()


    $('#staking-status').text(isStaking ? `Staking enabled (${formatSun(allowance)} allowance)` : `Staking disabled (${formatSun(allowance)} allowance)`)
    $('#stakingChb').prop('checked', isStaking)
    $('#user-percentage').text(numeral(stakePercent).format('0.000') + ' %')

    $('#user-withdrawn').text(withdrawn)
    $('#user-reinvested').text(reinvested)
    $('#user-rolls').text(stats[13])
    $('#user-bonus').text(formatSun(balance))
    $('#user-bonus-usdt').html(`${approxStr} ${formatSun(balance * price_vlt)} USDT`)

    $('#user-vault').text(formatSun(divs))
    $('#user-vault-usdt').html(divs > 0 ? `${approxStr} ${formatSun(divs * price_vlt)} USDT` : '')

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
    let tokens = web3js.utils.fromWei(await stack.methods.myTokens().call())

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var address = $('#recipient').val().trim()
        if (!web3js.utils.isAddress(address)) {
            $('#invalidAddressModal').modal()
        } else {
            // withdrawals ha now been zerod out and it is safe to transfer
            amount = Math.min(parseFloat(amount), parseFloat(tokens))
            stack.methods.transfer(address, web3js.utils.toBN(web3js.utils.toWei(amount + ''))).send()
                .on('transactionHash', (tx) => refresh(tx))
                .on('error', (e) => txError(e))
        }
    }

    return false;
}

async function sell() {
    let web3js = getWeb3()

    let isStaking = await isStakeEnabled()

    if (!isStaking) {
        showAlert('Enable Staking', 'Staking is not enabled.  Look for the toggle and make sure it is on (purple)!')
        return
    }

    let tokens = web3js.utils.fromWei(await stack.methods.myTokens().call())
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
        stack.methods.sell(web3js.utils.toBN(web3js.utils.toWei(amount + ''))).send()
            .on('transactionHash', (tx) => refresh(tx))
            .on('error', (e) => txError(e))
    }

    return false;
}

async function withdraw() {
    if (!(await stack.methods.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    stack.methods.withdraw().send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))

    return false;
}


async function reinvest() {

    if (!(await stack.methods.myDividends().call())) {
        showAlert('NO DIVS!!!', 'Slow down there buddy, you need to have some divs first!')
        return
    }

    stack.methods.reinvest().send()
        .on('transactionHash', (tx) => refresh(tx))
        .on('error', (e) => txError(e))

    return false;
}

async function buy() {

    let web3js = getWeb3()

    let isStaking = await isStakeEnabled()

    if (!isStaking) {
        showAlert('Enable Staking', 'Staking is not enabled.  Look for the toggle and make sure it is on (purple)!')
        return
    }

    var amount = $('#buyAmount').val().trim()
    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        stack.methods.buy(web3js.utils.toBN(web3js.utils.toWei(amount + ''))).send()
            .on('transactionHash', (tx) => refresh(tx))
            .on('error', (e) => txError(e))

    }

    return false;
}
