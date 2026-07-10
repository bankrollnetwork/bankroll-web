// Regenerates bankroll-web/src/js/vault-abi.js from the bankroll-contracts Hardhat artifacts.
const fs = require("fs");
const path = require("path");

// bankroll-contracts is a sibling checkout of this repo (override via CONTRACTS env var).
const CONTRACTS = process.env.CONTRACTS || path.join(__dirname, "..", "..", "bankroll-contracts");
const OUT = path.join(__dirname, "..", "src", "js", "vault-abi.js");

const vault = JSON.parse(fs.readFileSync(path.join(CONTRACTS, "artifacts/contracts/VltUsdcVault.sol/VltUsdcVault.json"))).abi;
const zap = JSON.parse(fs.readFileSync(path.join(CONTRACTS, "artifacts/contracts/ZapHelper.sol/ZapHelper.json"))).abi;

// ERC20 slice used by the test client (USDC/VLT share these signatures), from the vault's own fragments.
const ERC20_NAMES = ["allowance", "approve", "balanceOf", "decimals", "symbol"];
const erc20 = ERC20_NAMES.map((n) => vault.find((e) => e.type === "function" && e.name === n));

const header = `// AUTO-GENERATED ABI globals for the vault test client (src/vltUSDC.html).
// Source: the sibling bankroll-contracts repo's Hardhat artifacts for {VltUsdcVault,ZapHelper}.sol.
// Regenerate after any contract ABI change: in bankroll-contracts run \`npx hardhat compile\`,
// then in this repo run \`node tools/gen-vault-abi.js\`. Do NOT hand-edit: web3 1.10's decoder
// needs the full {name,type} param structure. ERC20_ABI is extracted from the vault's own
// canonical ERC20 fragments (USDC/VLT share these signatures).
`;

const body =
  header +
  "\nvar VAULT_ABI = " + JSON.stringify(vault, null, 2) + ";\n" +
  "\nvar ZAPHELPER_ABI = " + JSON.stringify(zap, null, 2) + ";\n" +
  "\nvar ERC20_ABI = " + JSON.stringify(erc20, null, 2) + ";\n";

fs.writeFileSync(OUT, body);
console.log("wrote", OUT, body.length, "bytes");
