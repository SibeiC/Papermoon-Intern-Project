// Reads deployments/<network>.json and submits each deployed contract to
// Etherscan for source verification. Already-verified contracts emit a
// non-fatal error which we swallow.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function safeVerify(label, address, constructorArguments) {
    process.stdout.write(`Verifying ${label} (${address})... `);
    try {
        await hre.run("verify:verify", { address, constructorArguments });
        console.log("OK");
    } catch (err) {
        const msg = err?.message || String(err);
        if (/already verified/i.test(msg)) {
            console.log("already verified");
        } else {
            console.log(`FAILED — ${msg.split("\n")[0]}`);
        }
    }
}

async function main() {
    const networkName = hre.network.name;
    const deploymentsPath = path.join(__dirname, "..", "deployments", `${networkName}.json`);
    if (!fs.existsSync(deploymentsPath)) {
        throw new Error(`No deployments file at ${deploymentsPath}`);
    }
    const d = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

    console.log(`Network: ${networkName} (chainId ${d.chainId})`);
    console.log(`Verifying contracts from ${deploymentsPath}\n`);

    // Test tokens (USDT, USDC, BTC) — constructor args: name, symbol, decimals, mintCap.
    for (const sym of ["USDT", "USDC", "BTC"]) {
        const t = d.tokens[sym];
        await safeVerify(`TestERC20 (${sym})`, t.address, [
            t.name,
            sym,
            t.decimals,
            t.faucetCap,
        ]);
    }

    // Factory — constructor: feeToSetter (the deployer).
    await safeVerify("UniswapV2Factory", d.factory, [d.deployer]);

    // Router — constructor: factory, weth.
    await safeVerify("UniswapV2Router", d.router, [d.factory, d.weth]);

    // Verify one pair to trigger Etherscan's CREATE2-sibling auto-verification.
    if (d.pairs.length > 0) {
        await safeVerify(`UniswapV2Pair (${d.pairs[0].tokenA}/${d.pairs[0].tokenB})`, d.pairs[0].address, []);
    }

    console.log("\nDone.");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
