// Redeploys ONLY the Router (because the contract's external surface
// changed — added view-function wrappers). The Factory and existing pairs
// continue to work unchanged; the JSON is patched in place.

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const deploymentsPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
    if (!fs.existsSync(deploymentsPath)) {
        throw new Error(`No deployments file at ${deploymentsPath}`);
    }
    const d = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

    const [deployer] = await ethers.getSigners();
    console.log(`Network : ${network.name} (chainId ${d.chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Factory : ${d.factory} (existing)`);
    console.log(`WETH    : ${d.weth} (existing)`);
    console.log(`Old router: ${d.router}`);

    const Router = await ethers.getContractFactory("UniswapV2Router");
    const router = await Router.deploy(d.factory, d.weth);
    await router.waitForDeployment();
    const newAddr = await router.getAddress();
    console.log(`New router: ${newAddr}`);

    d.router = newAddr;
    d.deployedAt = new Date().toISOString();
    fs.writeFileSync(deploymentsPath, JSON.stringify(d, null, 4) + "\n");
    console.log(`Updated ${deploymentsPath}`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
