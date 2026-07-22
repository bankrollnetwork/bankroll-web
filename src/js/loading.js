//const { TronWeb } = require("./vendor/tronweb")

const timeout = ms => new Promise(res => setTimeout(res, ms))

let closedLoader = false
let approxStr = '&#8776;'

let menu_system = ` 
    <li class="nav-item"><a href="/" class="notranslate">HOME</a>
    <li class="nav-item"></li>
    <li class="nav-item"><a href="https://x.com/Bankroll_Status" class="notranslate">X</a></li>
    <li class="nav-item"><a href="https://t.me/bankrollnetwork">TELEGRAM</a></li>
    <li class="nav-item"></li>
    <!-- <li class="nav-item"><a href="/" class="notranslate">VLT</a></li> -->
    <li class="nav-item"><a href="/purple-paper.html" class="notranslate">PURPLE PAPER</a></li>
    <li class="nav-item"><a href="/security.html" class="notranslate">SECURITY</a></li>
    <li class="nav-item"></li>
    <li class="nav-item"></li>
    <li class="nav-item"><a href="/archive.html" class="notranslate">ARCHIVE</a></li>
    <!--<li class="nav-item"><a href="https://teespring.com/stores/bankroll-network">SHOP</a></li>-->
`

let mobile_menu_html = `
<li class="nav-item">&nbsp;</li>
<!-- <li class="nav-item">
                <div class="dropdown d-inline-block">
                    <a class="dropdown-toggle mb-1 notranslate" id="dropdownMenuButtonMob"
                       data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        <span class="glyph-icon simple-icon-globe"></span>
                    </a>
                    <div class="dropdown-menu" aria-labelledby="dropdownMenuButtonMob">
                        <a onclick="setLanguageCookie('en');" href="javascript:void(0);" class="dropdown-item lang-en lang-select notranslate" data-lang="en">English</a>
                        <a onclick="setLanguageCookie('zh-CN');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="zh-CN">中文</a>
                        <a onclick="setLanguageCookie('ja');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="ja">日本人</a>
                        <a onclick="setLanguageCookie('ko');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="ko">한국어</a>
                        <a onclick="setLanguageCookie('es');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="es">Español</a>
                        <a onclick="setLanguageCookie('ru');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="ru">Русский</a>
                        <a onclick="setLanguageCookie('fr');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="fr">Français</a>
                    </div>
                </div>
            </li> -->   
            ${menu_system}
            
`

let desktop_menu_html = `
<li class="nav-item">
                        <div class="dropdown d-inline-block">
                            <a class="dropdown-toggle mb-1 notranslate" id="dropdownMenuButton"
                               data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <span class="glyph-icon simple-icon-globe"></span>
                            </a>
                            <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
                                <a onclick="setLanguageCookie('en');" href="javascript:void(0);" class="dropdown-item lang-en lang-select notranslate" data-lang="en">English</a>
                                <a onclick="setLanguageCookie('zh-CN');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="zh-CN">中文</a>
                                <a onclick="setLanguageCookie('ja');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="ja">日本人</a>
                                <a onclick="setLanguageCookie('ko');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="ko">한국어</a>
                                <a onclick="setLanguageCookie('es');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="es">Español</a>
                                <a onclick="setLanguageCookie('ru');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="ru">Русский</a>
                                <a onclick="setLanguageCookie('fr');" href="javascript:void(0);" class="dropdown-item lang-es lang-select notranslate" data-lang="fr">Français</a>
                            </div>
                        </div>
                    </li>
                    ${menu_system}
`

$(document).ready(async () => {

    $('#site-menu').html(mobile_menu_html)
    //$('#desktop-menu').html(desktop_menu_html)

    
})

function closeLoading() {
    return
}

function userTag(address) {
    if (typeof (gtag) != "undefined") {
        gtag('set', { 'user_id': address });
    }
}

function tronstack() {

    return window.tronWeb
}

function clipCopy(str) {
    // Create new element
    var el = document.createElement('textarea');
    // Set value (string to be copied)
    el.value = str;
    // Set non-editable to avoid focus and move outside of view
    el.setAttribute('readonly', '');
    el.style = { position: 'absolute', left: '-9999px' };
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

async function getBNKRPrice() {
    let swap = await tronWeb.contract().at('TRXYvAoYvCqmvZWpFCTLc4rdQ7KxbLsUSj')
    let temp = await swap.getTokenToTrxInputPrice(1e6).call()
    return temp
}

async function getBNKRXPrice() {
    let swap = await tronWeb.contract().at('TB4S2pvyX8uQsBPrTDWYCuSDfYSg6tMJm7')
    return (await swap.getTokenToTrxInputPrice(1e6).call())
}

async function getBTTPrice() {

    let swap = await tronWeb.contract().at('TLUMNucHbdVFuCGvhMrQY23G5e8pfJ6RsQ')
    return (await swap.getTokenToTrxInputPrice(1e6).call())

}

async function getUSDTPrice() {

    let swap = await tronWeb.contract().at('TQ5R1Cg1bGhAeGhWmAVLaW518YLM8hJctS')
    return (await swap.getTrxToTokenInputPrice(1e6).call())
        
}


async function getPrices() {
    let result = {}

    let complete = false
    let retries = 0

    let bnkr, btt, usdt, bnkrx

    /*
    while (!complete && retries < 5) {
        try {
            retries++
            bnkr = (bnkr) ? bnkr : await getBNKRPrice()
            bnkrx = (bnkrx) ? bnkrx : await getBNKRXPrice()
            btt = (btt) ? btt : await getBTTPrice()
            usdt = (usdt) ? usdt : await getUSDTPrice()
            complete = true

            result.bnkr = bnkr * usdt;
            result.bnkrx = bnkrx * usdt;
            result.btt = btt * usdt;
            result.usdt = usdt;
        } catch (e) {
            console.error('prices fail', e.toString())
        }
    }*/    

    bnkr = await getBNKRPrice()
    bnkrx = await getBNKRXPrice()
    btt = await getBTTPrice()
    usdt = await getUSDTPrice()

    result.bnkr = bnkr * usdt;
    result.bnkrx = bnkrx * usdt;
    result.btt = btt * usdt;
    result.usdt = usdt;    

    return result;
}
