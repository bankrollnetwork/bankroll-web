//410000000000000000000000000000000000000000
const zeroAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

const trustProxy = 'TL54vny2PGBWvxaVXCb9PZTdWz2fRmpdu2'
const donationPool = 'TRepyJ3eTRPWE8X4xQfiReQvW95SWztnzt'

const tron_networks = {
    'mainnet': {
        mint: 'TFMcU3QBGVB5ghtYw8g9wMV3rTFdkH2avv',
        token: 'TNo59Khpq46FGf4sD7XSWYFNfYfbc8CqNK',
        stake: 'TXwYAQ9y9r8u4E2o6KrdeELMr5x6NFekge',
        trxStake: 'TLrxkiYqWtbZdETvR1p38UE91pRKNNN3ie',  //TYjjuostnDCT8vxhkTsUUZ1txHb1TnmUzV
        legacyToken: 'TVuYcDgE1hPDR78RR6T5CcFe2iyD5XKKQz'
    },
    'shasta': {mint: 'TVGkcBivhgaHWHEoMmm6aYJz9DMpEDRSVJ', token: '', stake: ''}
}
/*const tron_networks = {
    'mainnet': {mint:'TUGupyq3CikMHGGiyAidJnBZb1jWXr2JWi', token: 'TVuYcDgE1hPDR78RR6T5CcFe2iyD5XKKQz', stake:'', legacyToken:'TVuYcDgE1hPDR78RR6T5CcFe2iyD5XKKQz', loopback:'TCCsRSdHWqmPB8iyZrcjRGz83T1QELwv6E'}, //old TNNRoS84SiJPUCavxSd4icCtBQiSQhTSzs
    'shasta': {mint:'TVGkcBivhgaHWHEoMmm6aYJz9DMpEDRSVJ', token:'', stake:''}
}*/

const feeLimit = 150e6
const DEFAULT_AUTOROLL_INTERVAL = 5
const REF_API_URL = 'https://api.bankroll.network/credits-tx'

let autoRollInterval = DEFAULT_AUTOROLL_INTERVAL
let autoRoll = false
let maxRound = 0


var contractAddress
var swapInterval = false
var mintAddress
var stakeAddress
var stakeTrxAddress
var legacyAddress
var tronWeb
var currentAddress
var network
var tronLinkUrlPrefix
var bnkr
var bnkrLegacy
var bnkrMint
var bnkrStake
var bnkrTrxStake
var waiting = 0
let supply = 1
let buyAmountInp, sellAmountInp, transferAmountInp, buyEstimate, sellEstimate, transferEstimate, numberSlider, prices


let sleep = ms => new Promise(resolve => setTimeout(resolve,ms))

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

$(document).ready(async () => {
    initConnect(main);
})

async function main() {

    tronWeb = window.tronWeb
    setNetwork()

    prices = await getPrices()

    bnkr = await tronWeb.contract().at(contractAddress)
    bnkrMint = await tronWeb.contract().at(mintAddress)
    bnkrStake = await tronWeb.contract().at(stakeAddress)
    bnkrTrxStake = await tronWeb.contract().at(stakeTrxAddress)
    bnkrLegacy = await tronWeb.contract().at(legacyAddress)
    console.log('found tronweb')
    currentAddress = tronWeb.defaultAddress['base58']
    console.log('current address', currentAddress)
    userTag(currentAddress)

    bindUI()

    //First UI render
    await Promise.all([mainLoop()])
    closeLoading()

    //Detect new account

    // Schedule loops
    //setInterval(mainLoop, 5000)
    //setInterval(showStats, 5000)
    setInterval(watchSelectedWallet, 5000)
    updateCountDown()
    updateCountDownTRX()

}

function bindUI() {
    transferAmountInp = $('#transferAmount')
    transferEstimate = $('#transfer-estimate')

    $('#stakingChb').change(async (e) => {
        let isStaking = $(e.currentTarget).prop('checked')
        console.log('Enable Staking: ', isStaking)
        if (isStaking) {
            enableStake()
        } else {
            disableStake()
        }
    })

    $('#stakingTRXChb').change(async (e) => {
        let isStaking = $(e.currentTarget).prop('checked')
        console.log('Enable TRX Staking: ', isStaking)
        if (isStaking) {
            enableTRXStake()
        } else {
            disableTRXStake()
        }
    })

    /*transferAmountInp.on("change paste keyup", (e) => {
        let amount = Number.parseInt(transferAmountInp.val().trim())
        transferEstimate.text(`${numeral(amount * 0.95).format('0.000 a').toUpperCase()} BNKR`)
    })*/
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
    await showWalletInfo()
    await showUserStats()
    await showStats()
    await updateCountDown()
    await updateCountDownTRX()
}

function formatSun(sun) {
    return numeral(tronWeb.fromSun(sun)).format('0,0.000 a').toUpperCase()
}

function formatTRXCurTickets(trx) {
    return numeral(trx).format('0,0.000 a').toUpperCase()
}

function formatTRX(trx) {
    return numeral(trx).format('0,0.000 a').toUpperCase()
}

async function checkResources() {
    var useProtection = $('#walletProtection').is(':checked')

    if (!useProtection) {
        return true
    }

    var balance = tronWeb.fromSun(await tronWeb.trx.getBalance())
    var bandwidth = await tronWeb.trx.getBandwidth()
    var result = await tronWeb.trx.getAccountResources()
    var energy = result.EnergyLimit - result.EnergyUsed

    if (balance < 10 && energy < 2000) {
        showError(`Low energy and unsafe TRX balance for transaction processing: ${balance} (minimum 10 TRX) , ${energy} (minimum 2000)`)
        return false
    }

    return true
}

async function updateSwap() {

    if (swapInterval) {
        clearInterval(swapInterval)
    }

    let update = async () => {

        let balance = await bnkrLegacy.balanceOf(currentAddress).call()
        let allowance = await bnkrLegacy.allowance(currentAddress, contractAddress).call()
        let msg = ''

        if (balance > 0n) {
            if (allowance < balance) {
                msg = 'Allowance is insufficient; please click the approve button'
            } else {
                msg = `Address: ${currentAddress} Balance: ${formatSun(balance)} BNKR; please click the swap button`
            }
        } else {
            msg = `Address: ${currentAddress} Balance: 0 BNKR; All Set!!!`
        }

        $('#legacy-balance').text(msg)
    }

    await update();
    swapInterval = setInterval(update, 2000)

}

function stopSwap() {
    clearInterval(swapInterval);
}

async function showSwap() {
    updateSwap()
    $('#swapModal').modal()
}

async function approveLegacy() {
    bnkrLegacy.approve(contractAddress, 21e12).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        alert(`Transaction processed: ${tx}`)
    }).catch(e => {
        alert(`Error: ${e.message}`)
    })
}

async function swap() {
    let balance = await bnkrLegacy.balanceOf(currentAddress).call()
    let allowance = await bnkrLegacy.allowance(currentAddress, contractAddress).call()

    if (balance > 0n) {
        if (allowance < balance) {
            alert('Allowance is insufficient')
            return
        }

        bnkrMint.swap(balance).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
            alert(`Transaction processed: ${tx}`)
        })
    } else {
        alert('All Set! Nothing to do!')
        return
    }

}

async function showWalletInfo() {
    try {
        $('#network').text(network)
        $('#walletAddress').text(`${shortId(currentAddress, 5)}`)
        var bandwidth = await tronWeb.trx.getBandwidth()
        $('#getBandwidth').text(numeral(bandwidth).format('0,0 a').toUpperCase())
        var result = await tronWeb.trx.getAccountResources()
        var net = result.EnergyLimit - result.EnergyUsed
        $('#getEnergy').text(numeral(net).format('0,0 a').toUpperCase())
        $('#walletBalanceValue').text(formatSun(await bnkr.balanceOf(currentAddress).call()))
    } catch (e) {
    }
}

async function showStats() {
    try {
        let difficulty = Number(await bnkrMint.mintingDifficulty().call())
        difficulty = 100 / difficulty;
        $('#totalTxs').text(numeral(Number(await bnkr.totalTxs().call())).format('0,0.000 a').toUpperCase())
        $('#players').text((await bnkr.players().call()).toString())
        let mined = await bnkr.mintedSupply().call()
        $('#total-mined').text(formatSun(mined))
        // prices.bnkr is double-1e6-scaled (bnkr_raw * usdt_raw from getPrices), so /1e12 before formatSun.
        $('#total-mined-usdt').html(`${approxStr} ${formatSun(mined * prices.bnkr / 1000000000000n)} USDT`)
        $('#stage').text(Number(mined / 1000000000000n).toString())
        $('#total-supply').text(formatSun(await bnkr.totalSupply().call()))
        $('#total-remaining').text(formatSun(await bnkr.remainingMintableSupply().call()))
        let frozen = await bnkr.balanceOf(stakeAddress).call()
        $('#total-frozen').text(formatSun(frozen))
        $('#total-frozen-usdt').html(`${approxStr} ${formatSun(frozen * prices.bnkr / 1000000000000n)} USDT`)
        let depot = await bnkr.balanceOf(stakeTrxAddress).call()
        $('#total-frozen-trx').text(formatSun(depot))
        $('#total-frozen-trx-usdt').html(`${approxStr} ${formatSun(depot * prices.bnkr / 1000000000000n)} USDT`)
        $('#min-bnkr').text(formatSun(await bnkrMint.minimumMintBalance().call()))
        let poolBalance = await bnkrTrxStake.totalBalance().call()
        $('#poolBalance').text(formatSun(poolBalance))
        // prices.usdt is single-1e6-scaled, so /1e6.
        $('#poolBalance-usdt').html(`${approxStr} ${formatSun(poolBalance * prices.usdt / 1000000n)} USDT`)
        $('#difficulty').text(`${numeral(difficulty).format('0.000')} %`)
    } catch (e) {
        console.error('showStats error', e)
    }
}

async function isStakeEnabled() {
    let allowance = await bnkr.allowance(currentAddress, stakeAddress).call();
    return allowance > BigInt(21e12)
}

function enableStake() {
    bnkr.approve(stakeAddress, 100e12).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function disableStake() {
    bnkr.approve(stakeAddress, 0).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function isTRXStakeEnabled() {
    let allowance = await bnkr.allowance(currentAddress, stakeTrxAddress).call();
    return allowance > BigInt(21e12)
}

function enableTRXStake() {
    bnkr.approve(stakeTrxAddress, 100e12).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

function disableTRXStake() {
    bnkr.approve(stakeTrxAddress, 0).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}


async function showUserStats() {
    try {
        let isStaking = await isStakeEnabled()
        let isTRXStaking = await isTRXStakeEnabled()
        let difficulty = Number(await bnkrMint.mintingDifficulty().call())
        let stats = await bnkr.statsOf(currentAddress).call()
        let stakingStats = await bnkrStake.statsOf(currentAddress).call()
        let levelInfo = await bnkrStake.levelOf(currentAddress).call()
        let eligible = await bnkr.airdropEligible(currentAddress).call()
        let mintedBy = await bnkr.mintedBy(currentAddress).call()
        let minimumMint = await bnkrMint.minimumMintBalance().call()
        let availableMint = await bnkrStake.availableMint().call()
        let tokenCount = await bnkrMint.airdropTokens().call()
        let dailyEstimate = (Number(levelInfo[1]) / 100) * (1 / difficulty) * Number(stakingStats[0])
        let efficiency = Number(levelInfo[1]) / difficulty;

        let divsTRX = await bnkrTrxStake.myDividends().call()
        let balanceTRX = await bnkrTrxStake.myTokens().call()
        let statsTRX = await bnkrTrxStake.statsOf(currentAddress).call()
        let percentage = await bnkrTrxStake.percentage(currentAddress).call()


        $('#staking-status').text(isStaking ? 'Staking enabled' : 'Staking disabled')
        $('#staking-status-trx').text(isTRXStaking ? 'Depot enabled' : 'Depot disabled')
        $('#stakingChb').prop('checked', isStaking)
        $('#stakingTRXChb').prop('checked', isTRXStaking)
        $('#user-divs').text(formatSun(availableMint))
        // prices.bnkr is double-1e6-scaled (bnkr_raw * usdt_raw); /1e12 before formatSun.
        $('#user-divs-usdt').html(availableMint > 0n ? `${approxStr} ${formatSun(availableMint * prices.bnkr / 1000000000000n)} USDT` : '')
        $('.user-balance').text(formatSun(stats[0]))
        $('#user-frozen').text(formatSun(stakingStats[0]))
        $('#user-frozen-usdt').html(`${approxStr} ${formatSun(stakingStats[0] * prices.bnkr / 1000000000000n)} USDT`)
        $('#user-estimate').text(formatSun(BigInt(Math.floor(dailyEstimate))))
        $('#user-txs').text(stats[1].toString())
        $('#user-rolls').text(stakingStats[4].toString())
        $('#user-level').text(levelInfo[0].toString())
        $('#powerup-cost').text(numeral(Number(levelInfo[2]) / 1e6).format('0 a').toUpperCase() + ' TRX')
        $('#user-mined').text(formatSun(stats[2]))
        $('#user-return').text(`${numeral(efficiency).format('0.000')} %`)

        //Depot//
        $('#user-divs-trx').text(formatSun(divsTRX))
        $('#user-frozen-trx').text(formatSun(balanceTRX))
        $('#user-frozen-trx-usdt').html(`${approxStr} ${formatSun(balanceTRX * prices.bnkr / 1000000000000n)} USDT`)
        $('#user-withdrawn-trx').text(formatSun(statsTRX[2]))
        $('#user-reinvested-trx').text(formatSun(statsTRX[3]))
        $('#total-mined-trx').text(formatSun(statsTRX[4]))
        $('#user-percentage').text(percentage.toString())



        if (dailyEstimate > 0) {
            const dailyEstimateBig = BigInt(Math.floor(dailyEstimate))
            $('#airdrop-eligibility').html(`&#8776; ${formatSun(dailyEstimateBig)} BNKR daily`)
            $('#airdrop-eligibility-usdt').html(`${approxStr} ${formatSun(dailyEstimateBig * prices.bnkr / 1000000000000n)} USDT`)
        } else {
            $('#airdrop-eligibility').text(eligible ? `${tokenCount} BNKR bonus available` : `Stake & Spread the Word`)
            $('#airdrop-eligibility-usdt').text('')
        }
        if (eligible) {
            $('#airdrop-button').show()
            if (mintedBy < minimumMint) {
                $('#airdrop-message').show()
                $('#airdrop-button').hide()
                $('#airdrop-message').html(`<h3 class="text-center text-white-50">${formatSun(minimumMint - mintedBy)} BNKR left to mine before bonus</h3>`)
            } else {
                $('#airdrop-button').show()
                $('#airdrop-message').hide()
            }
        } else {
            $('#airdrop-button').hide()
        }

        if (levelInfo[0] === 6n) {
            $('#powerup-cost').hide()
            $('#powerup-button').hide()
        }
    } catch (e) {
        console.error('showUserStats error', e)
    }
}


async function updateCountDown() {
    try {
        let time = Number(await bnkrStake.timeLeft().call())
        let balance = await bnkrStake.balanceOf(currentAddress).call()
        let available = await bnkrStake.availableMint().call()
        let levelInfo = await bnkrStake.levelOf(currentAddress).call()
        //console.log('time-left', time)
        let date = moment().add(time, 'seconds').toDate()

        if (levelInfo[0] > 0n) {
            if (balance) {
                if (available || time) {
                    if (time) {

                        $('#time-left').countdown(date).on('update.countdown', function (event) {
                            var format = 'Staking ready in %H:%M:%S';
                            $(this).text(event.strftime(format));
                        })
                            .on('finish.countdown', function (event) {
                                $(this).text('Staking is Ready!!!')
                            })
                    } else {
                        $('#time-left').text('Staking is Ready!!!')
                    }
                } else {
                    $('#time-left').text('No divs currently available')
                }

            } else {
                $('#time-left').text('Deposit BNKR to get started!')
            }

        } else {
            $('#time-left').text('Powerup to get started!')
        }

    } catch (e){}


}

async function updateCountDownTRX() {
    try {
    let time = Number(await bnkrTrxStake.timeLeft().call())
    let timeRelease = Number(await bnkrTrxStake.releaseTimeLeft().call())
    let balance = await bnkrTrxStake.balanceOf(currentAddress).call()
    let divs = await bnkrTrxStake.myDividends().call()
    //console.log('time-left', time)
    let date = moment().add(time, 'seconds').toDate()
    let dateRelease = moment().add(timeRelease, 'seconds').toDate()

    $('#time-release').countdown(dateRelease).on('update.countdown', function (event) {
        var format = 'Next payout in %H:%M:%S';
        $(this).text(event.strftime(format));
    })
        .on('finish.countdown', function (event) {
            $(this).text('Depot is Ready!!!')
        })

        if (balance) {
            if (divs || time) {
                if (time) {

                    $('#time-left-trx').countdown(date).on('update.countdown', function (event) {
                        var format = 'Depot ready in %H:%M:%S';
                        $(this).text(event.strftime(format));
                    })
                        .on('finish.countdown', function (event) {
                            $(this).text('Depot is Ready!!!')
                        })
                } else {
                    $('#time-left-trx').text('Depot is Ready!!!')
                }
            } else {
                $('#time-left-trx').text('No divs currently available')
            }

        } else {
            $('#time-left-trx').text('Deposit BNKR to activate Depot!')
        }

    } catch (e){}

}

function cleanAddress(address) {
    return address.trim().replace(/[^\u0000-\u007E]/g, "")
}

function setNetwork() {
    var url = tronWeb.currentProvider().fullNode.host
    if (url.indexOf('shasta') != -1) {
        network = 'Shasta'
        contractAddress = tron_networks['shasta']['token']
        mintAddress = tron_networks['shasta']['mint']
        stakeAddress = tron_networks['shasta']['stake']
        stakeTrxAddress = tron_networks['shasta']['trxStake']
        legacyAddress = tron_networks['shasta']['legacyToken']
        tronLinkUrlPrefix = 'https://shasta.tronscan.org/#/transaction/'
    } else {
        network = 'Mainnet'
        contractAddress = tron_networks['mainnet']['token']
        mintAddress = tron_networks['mainnet']['mint']
        stakeAddress = tron_networks['mainnet']['stake']
        stakeTrxAddress = tron_networks['mainnet']['trxStake']
        legacyAddress = tron_networks['mainnet']['legacyToken']
        tronLinkUrlPrefix = 'https://tronscan.org/#/transaction/'
    }

    console.log('network detected', network, contractAddress)
}

function refresh(tx) {
    $('#txId').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#txModal').modal()
    setTimeout(mainLoop)
}

function autoRefresh(tx) {
    $('#autotxId').html(`<a href="${tronLinkUrlPrefix}${tx}">${shortId(tx, 5)}</a>`)
    $('#autotxModal').modal()
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

async function selectRandomReferral() {
    const networkName = getNetworkName()
    let rewardsData = await $.ajax({
        url: REF_API_URL + '/rewards_info?walletId=' + currentAddress + '&network=' + networkName
    });
    if (rewardsData.length) {
        let curReferral = rewardsData[Math.floor(Math.random() * rewardsData.length)];
        $('#recipient').val(curReferral.customer_address);
    } else {
        $.notify({
            message: '<span class="text-white">No referrals found...</span>'
        }, {
            type: 'dark',
            delay: 1000,
            allow_dismiss: false,
            placement: {from: 'bottom', align: 'left'}
        });
    }
}

/************ Chain Functions *******************/

async function airdrop() {

    if (!await checkResources()) {
        return
    }
    let remaining = await bnkr.remainingMintableSupply().call()

    if (remaining < 25000000n) {
        showAlert('Awwwww!!!', 'Looks like we have run out of BNKR to mine!!!')
        return
    }

    if (!(await bnkrMint.airdropEligible().call())) {
        let details = await bnkrMint.airdropDetails().call();

        if (!details[0]) {
            showAlert('Not so fast!', 'Looks like this account has already been awarded an airdrop!')
            return
        }
        if (!details[1]) {
            showAlert('NOT Enough Mined BNKR!?', `Slow down there buddy, you need to have mined a minimum of ${formatSun(details[3])} BNKR to claim a bonus!  You currently have mined ${formatSun(details[2])}`)
            return
        }

        showAlert('No Soup for you ', 'Looks like we are having an issue now with your eligibility.  Apologies!')
        return
    }

    bnkrMint.airdrop().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        console.log('airdrop', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function powerup() {

    let levelInfo = await bnkrStake.levelOf(currentAddress).call()

    bnkrStake.purchaseLevel().send({callValue: Number(levelInfo[2]), feeLimit: feeLimit}).then(tx => {
        console.log('powerup', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })

}

async function unfreeze() {

    let time = await bnkrStake.timeLeft().call()

    if (time) {
        showAlert('Wait a sec!', `Staking actions aren't ready yet`)
        return
    }

    bnkrStake.unfreeze().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        console.log('unfreeze', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function roll() {

    let time = await bnkrStake.timeLeft().call()

    if (time) {
        showAlert('Wait a sec!', `Staking actions aren't ready yet`)
        return
    }

    let availableMint = await bnkrStake.availableMint().call()

    if (availableMint == 0n) {
        showAlert('Wait a sec!', `You don't have anything to roll`)
        return
    }

    bnkrStake.roll().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        console.log('roll', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function withdraw() {

    let time = await bnkrStake.timeLeft().call()

    if (time) {
        showAlert('Wait a sec!', `Staking actions aren't ready yet`)
        return
    }

    let availableMint = await bnkrStake.availableMint().call()

    if (availableMint == 0n) {
        showAlert('Wait a sec!', `You don't have anything to withdraw`)
        return
    }

    bnkrStake.withdraw().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        console.log('withdraw', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function freeze() {

    var amount = $('#stakeAmount').val().trim()

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {

        let levelInfo = await bnkrStake.levelOf(currentAddress).call()

        if (levelInfo[0] == 0n) {
            showAlert('Wait a sec!', 'You have to purchase a Power Up before freezing BNKR!')
            return
        }

        amount = tronWeb.toSun(amount)
        let balance = await bnkr.balanceOf(currentAddress).call()

        if (BigInt(amount) > balance) {
            showAlert('Wait a sec!', 'The amount you are freezing is greater than your balance!')
            return
        }

        let availableMint = await bnkrStake.availableMint().call()

        if (availableMint > 1000000n) {
            let time = await bnkrStake.timeLeft().call()

            if (time) {
                showAlert('Wait a sec!', `Staking actions aren't ready yet and you need to roll first`)
                return
            } else {
                bnkrStake.roll().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
                    console.log('roll', tx)
                    // withdrawals ha now been zeroed out and it is safe to transfer

                    bnkrStake.freeze(amount).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
                        console.log('freeze', amount, tx)
                        refresh(tx)
                    }).catch(e => {
                        txError(e)
                    })

                }).catch(e => {
                    txError(e)
                })
            }
        } else {

            // withdrawals ha now been zeroed out and it is safe to transfer
            bnkrStake.freeze(amount).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
                console.log('freeze', amount, tx)
                refresh(tx)
            }).catch(e => {
                txError(e)
            })
        }

    }
}

/* TRX Staking */

async function unfreezeTRX() {

    let balance = await bnkrTrxStake.myTokens().call()

    if (balance == 0n) {
        showAlert('Wait a sec!', `You don't have BNKR to unfreeze in the Depot!`)
        return
    }

    let time = await bnkrTrxStake.timeLeft().call()

    if (time) {
        showAlert('Wait a sec!', `You can't unfreeze until the Depot is ready!`)
        return
    }

    bnkrTrxStake.unfreeze().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        console.log('unfreeze', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function rollTRX() {

    let availableWithdraw = await bnkrTrxStake.myDividends().call()

    if (availableWithdraw == 0n) {
        showAlert('Wait a sec!', `You don't have anything to roll`)
        return
    }

    bnkrTrxStake.reinvest().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        console.log('roll', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function withdrawTRX() {

    let availableWithdraw = await bnkrTrxStake.myDividends().call()

    if (availableWithdraw == 0n) {
        showAlert('Wait a sec!', `You don't have anything to withdraw`)
        return
    }

    bnkrTrxStake.withdraw().send({callValue: 0, feeLimit: feeLimit}).then(tx => {
        console.log('withdraw', tx)
        refresh(tx)
    }).catch(e => {
        txError(e)
    })
}

async function freezeTRX() {

    var amount = $('#stakeAmountTRX').val().trim()

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {


        amount = tronWeb.toSun(amount)
        let balance = await bnkr.balanceOf(currentAddress).call()

        if (BigInt(amount) > balance) {
            showAlert('Wait a sec!', 'The amount you are freezing is greater than your balance!')
            return
        }

        // withdrawals ha now been zeroed out and it is safe to transfer
        bnkrTrxStake.freeze(amount).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
            console.log('freeze', amount, tx)
            refresh(tx)
        }).catch(e => {
            txError(e)
        })
    }
}

async function bulkTransfer() {

    var amount = $('#bulkTransferAmount').val().trim()

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var addresses = cleanAddress($('#recipients').val())

        addresses = addresses.split('\n').map((value => {return value.trim()}))
        addresses = _.filter(addresses, (value) =>{
            return value.length;
        })

        addresses = _.uniq(addresses)

        var pass = true
        var badAddress;
        _.each(addresses, (value) => {
            if (!tronWeb.isAddress(value)){
                console.log('Address?',value)
                pass = false
                badAddress = value
                console.log('Bad address',address)
            }
        })

        if (!pass) {
            $('#invalidAddressModal').modal()
        } else {
            var lastTx =  ''

            let payouts = []
            for (var index in addresses) {
                // withdrawals ha now been zerod out and it is safe to transfer
                try {
                    lastTx = await bnkr.transfer(addresses[index], tronWeb.toSun(amount)).send({callValue: 0, feeLimit: feeLimit})
                    console.log('transfer', addresses[index], amount, lastTx)
                    payouts.push(`${addresses[index]} ${amount} ${lastTx}`)
                    await sleep(2500)

                } catch(e) {
                    console.log('transfer', 'fail',addresses[index])
                }
            }

            console.log(`Payout Complete - ${new Date().toLocaleString()}\n\n${payouts.join('\n')}`)
        }
    }
}

async function transfer() {
    if (!await checkResources()) {
        return
    }

    var amount = $('#transferAmount').val().trim()

    if (amount <= 0 || !isFinite(amount) || amount === '') {
        $('#invalidAmountModal').modal()
    } else {
        var address = cleanAddress($('#recipient').val())
        if (!tronWeb.isAddress(address)) {
            $('#invalidAddressModal').modal()
        } else {
            // withdrawals ha now been zerod out and it is safe to transfer
            bnkr.transfer(address, tronWeb.toSun(amount)).send({callValue: 0, feeLimit: feeLimit}).then(tx => {
                console.log('transfer', address, amount, tx)
                refresh(tx)
            }).catch(e => {
                txError(e)
            })
        }
    }
}

const getNetworkName = () => {
    const url = tronWeb.currentProvider().fullNode.host
    const networkName = (url.indexOf('shasta') != -1) ? 'shasta' : 'main'
    return networkName
}

