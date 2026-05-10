const { ethers } = require("hardhat");

const SBC = "0xd6f9e7be37ec0d952c01448bd6a4e176641e519d";

async function main() {
    const [deployer] = await ethers.getSigners();
    const eth = await ethers.provider.getBalance(deployer.address);
    const sbc = await ethers.getContractAt("SibeiCoin", SBC);
    const sbcBal = await sbc.balanceOf(deployer.address);
    const owner = await sbc.owner();
    console.log("Deployer  :", deployer.address);
    console.log("ETH       :", ethers.formatEther(eth));
    console.log("SBC       :", ethers.formatUnits(sbcBal, 18));
    console.log("SBC owner :", owner);
    console.log("Is owner  :", owner.toLowerCase() === deployer.address.toLowerCase());
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
