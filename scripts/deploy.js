// Deploys the V2 stack and seeds liquidity on the active Hardhat network.
// On Sepolia, attaches to the canonical WETH and the pre-deployed SibeiCoin;
// on the local hardhat network, deploys fresh stand-ins so the script stays
// self-contained and can be dry-run before spending Sepolia ETH.

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// --- Per-network constants ---------------------------------------------------

const SEPOLIA_CHAIN_ID = 11155111n;

// Canonical Sepolia addresses we attach to instead of redeploying.
const SEPOLIA_WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const SEPOLIA_SBC = "0xd6f9e7be37ec0d952c01448bd6a4e176641e519d";

// Per-token decimals.
const DECIMALS = { SBC: 18, WETH: 18, USDT: 6, USDC: 6, BTC: 8 };

// Per-token public faucet caps (in raw units).
const FAUCET_CAPS = {
    USDT: ethers.parseUnits("1000", DECIMALS.USDT), // 1,000 USDT/call
    USDC: ethers.parseUnits("1000", DECIMALS.USDC), // 1,000 USDC/call
    BTC: ethers.parseUnits("1", DECIMALS.BTC), //     1 BTC/call
};

// Mock prices: 1 SBC = $0.50, 1 ETH = $3,000, 1 BTC = $60,000.
// Pool sizes are intentionally small so the script works on a Sepolia wallet
// holding only ~1 ETH. Scale up by editing SBC_PER_PAIR (every pair carries
// the same SBC notional, so all four pairs scale together).
//
// Raw amounts are computed as BigInts directly to dodge JS-float precision:
// e.g. 2500/60000 BTC ≈ 0.041666666666666664 has too many fractional digits
// for parseUnits at 8 decimals. Integer division truncates cleanly.
const SBC_PER_PAIR = ethers.parseUnits("5000", DECIMALS.SBC); // 5000 SBC = $2500 worth
const TOTAL_SBC_NEEDED = SBC_PER_PAIR * 4n;

// Counter-side seeds — each is "$2500 worth" of the respective token.
const SEED = {
    // 5000 SBC * $0.50 = $2500 → 2500/3000 ETH = 5/6 ETH
    WETH: (5n * 10n ** BigInt(DECIMALS.WETH)) / 6n,
    // $2500 in USDT (6dp) = 2500 * 10^6
    USDT: ethers.parseUnits("2500", DECIMALS.USDT),
    USDC: ethers.parseUnits("2500", DECIMALS.USDC),
    // 2500/60000 BTC = 1/24 BTC at 8dp = 10^8 / 24 (truncated)
    BTC: 10n ** BigInt(DECIMALS.BTC) / 24n,
};

// --- Helpers -----------------------------------------------------------------

function log(...args) {
    console.log(...args);
}

function fmt(v, decimals) {
    return ethers.formatUnits(v, decimals);
}

async function getDeadline(offset = 600) {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block.timestamp) + BigInt(offset);
}

async function approveMax(token, spender) {
    const tx = await token.approve(spender, ethers.MaxUint256);
    await tx.wait();
}

// --- Main --------------------------------------------------------------------

async function main() {
    const [deployer] = await ethers.getSigners();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const isSepolia = chainId === SEPOLIA_CHAIN_ID;

    log("==============================================");
    log(`Network    : ${network.name} (chainId ${chainId})`);
    log(`Deployer   : ${deployer.address}`);
    const deployerBal = await ethers.provider.getBalance(deployer.address);
    log(`Balance    : ${ethers.formatEther(deployerBal)} ETH`);
    if (deployerBal < ethers.parseEther("0.05")) {
        throw new Error("Insufficient deployer ETH balance (< 0.05 ETH)");
    }
    log("==============================================");

    // 1. Resolve / deploy SBC + WETH per network.
    let sbcAddr, wethAddr, sbc, weth;
    if (isSepolia) {
        sbcAddr = SEPOLIA_SBC;
        wethAddr = SEPOLIA_WETH;
        sbc = await ethers.getContractAt("SibeiCoin", sbcAddr);
        weth = await ethers.getContractAt("MockWETH", wethAddr); // surface-compatible
        log(`SBC        : ${sbcAddr} (pre-deployed)`);
        log(`WETH       : ${wethAddr} (canonical Sepolia)`);
    } else {
        // Local hardhat: deploy fresh SBC + WETH for self-contained dry-runs.
        const SibeiCoin = await ethers.getContractFactory("SibeiCoin");
        sbc = await SibeiCoin.deploy();
        await sbc.waitForDeployment();
        sbcAddr = await sbc.getAddress();

        const MockWETH = await ethers.getContractFactory("MockWETH");
        weth = await MockWETH.deploy();
        await weth.waitForDeployment();
        wethAddr = await weth.getAddress();
        log(`SBC        : ${sbcAddr} (local deploy)`);
        log(`WETH       : ${wethAddr} (local MockWETH)`);
    }

    // 2. Deploy Factory.
    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = await Factory.deploy(deployer.address);
    await factory.waitForDeployment();
    const factoryAddr = await factory.getAddress();
    log(`Factory    : ${factoryAddr}`);

    // 3. Deploy three TestERC20s for USDT / USDC / BTC mocks.
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const usdt = await TestERC20.deploy("Tether USD", "USDT", DECIMALS.USDT, FAUCET_CAPS.USDT);
    await usdt.waitForDeployment();
    const usdc = await TestERC20.deploy("USD Coin", "USDC", DECIMALS.USDC, FAUCET_CAPS.USDC);
    await usdc.waitForDeployment();
    const btc = await TestERC20.deploy(
        "Wrapped Bitcoin (Mock)",
        "BTC",
        DECIMALS.BTC,
        FAUCET_CAPS.BTC,
    );
    await btc.waitForDeployment();
    const usdtAddr = await usdt.getAddress();
    const usdcAddr = await usdc.getAddress();
    const btcAddr = await btc.getAddress();
    log(`USDT       : ${usdtAddr}`);
    log(`USDC       : ${usdcAddr}`);
    log(`BTC        : ${btcAddr}`);

    // 4. Deploy Router.
    const Router = await ethers.getContractFactory("UniswapV2Router");
    const router = await Router.deploy(factoryAddr, wethAddr);
    await router.waitForDeployment();
    const routerAddr = await router.getAddress();
    log(`Router     : ${routerAddr}`);
    log("");

    // 5. Seed deployer's wallet.
    log("Seeding deployer balances...");

    // 5a. SBC: top up via SibeiCoin.mint (owner-only). On Sepolia the deployer
    // wallet IS the SBC owner; if not, this will revert with a clear message.
    const sbcBalance = await sbc.balanceOf(deployer.address);
    log(
        `  SBC balance: ${fmt(sbcBalance, DECIMALS.SBC)}, ` +
            `need ${fmt(TOTAL_SBC_NEEDED, DECIMALS.SBC)}`,
    );
    if (sbcBalance < TOTAL_SBC_NEEDED) {
        const topUp = TOTAL_SBC_NEEDED - sbcBalance;
        log(`  Minting ${fmt(topUp, DECIMALS.SBC)} SBC to deployer...`);
        const tx = await sbc.mint(deployer.address, topUp);
        await tx.wait();
    }

    // 5b. USDT/USDC/BTC: owner-mint full pair amounts (uncapped, deployer-only).
    log(`  Minting ${fmt(SEED.USDT, DECIMALS.USDT)} USDT...`);
    await (await usdt.mintTo(deployer.address, SEED.USDT)).wait();
    log(`  Minting ${fmt(SEED.USDC, DECIMALS.USDC)} USDC...`);
    await (await usdc.mintTo(deployer.address, SEED.USDC)).wait();
    log(`  Minting ${fmt(SEED.BTC, DECIMALS.BTC)} BTC...`);
    await (await btc.mintTo(deployer.address, SEED.BTC)).wait();
    log("");

    // 6. Approve router for max on every token (the SBC/WETH pair seeds via
    // addLiquidityETH so WETH approval is unnecessary, but the others all
    // route through addLiquidity).
    log("Approving router (max) on all tokens...");
    await approveMax(sbc, routerAddr);
    await approveMax(usdt, routerAddr);
    await approveMax(usdc, routerAddr);
    await approveMax(btc, routerAddr);
    log("");

    // 7. Create pairs + seed liquidity. Every pair includes SBC, so any
    // non-SBC ↔ non-SBC swap forces a multi-hop via SBC.
    const pairsCreated = [];

    log("Seeding pairs...");

    // SBC / WETH via addLiquidityETH (wraps msg.value automatically).
    log(
        `  SBC/WETH: ${fmt(SBC_PER_PAIR, DECIMALS.SBC)} SBC + ` +
            `${ethers.formatEther(SEED.WETH)} ETH`,
    );
    {
        const tx = await router.addLiquidityETH(
            sbcAddr,
            SBC_PER_PAIR,
            0,
            0,
            deployer.address,
            await getDeadline(),
            { value: SEED.WETH },
        );
        await tx.wait();
        const pairAddr = await factory.getPair(sbcAddr, wethAddr);
        pairsCreated.push({ address: pairAddr, tokenA: "SBC", tokenB: "WETH" });
    }

    // SBC / USDT.
    log(
        `  SBC/USDT: ${fmt(SBC_PER_PAIR, DECIMALS.SBC)} SBC + ` +
            `${fmt(SEED.USDT, DECIMALS.USDT)} USDT`,
    );
    {
        const tx = await router.addLiquidity(
            sbcAddr,
            usdtAddr,
            SBC_PER_PAIR,
            SEED.USDT,
            0,
            0,
            deployer.address,
            await getDeadline(),
        );
        await tx.wait();
        const pairAddr = await factory.getPair(sbcAddr, usdtAddr);
        pairsCreated.push({ address: pairAddr, tokenA: "SBC", tokenB: "USDT" });
    }

    // SBC / USDC.
    log(
        `  SBC/USDC: ${fmt(SBC_PER_PAIR, DECIMALS.SBC)} SBC + ` +
            `${fmt(SEED.USDC, DECIMALS.USDC)} USDC`,
    );
    {
        const tx = await router.addLiquidity(
            sbcAddr,
            usdcAddr,
            SBC_PER_PAIR,
            SEED.USDC,
            0,
            0,
            deployer.address,
            await getDeadline(),
        );
        await tx.wait();
        const pairAddr = await factory.getPair(sbcAddr, usdcAddr);
        pairsCreated.push({ address: pairAddr, tokenA: "SBC", tokenB: "USDC" });
    }

    // SBC / BTC.
    log(
        `  SBC/BTC : ${fmt(SBC_PER_PAIR, DECIMALS.SBC)} SBC + ` +
            `${fmt(SEED.BTC, DECIMALS.BTC)} BTC`,
    );
    {
        const tx = await router.addLiquidity(
            sbcAddr,
            btcAddr,
            SBC_PER_PAIR,
            SEED.BTC,
            0,
            0,
            deployer.address,
            await getDeadline(),
        );
        await tx.wait();
        const pairAddr = await factory.getPair(sbcAddr, btcAddr);
        pairsCreated.push({ address: pairAddr, tokenA: "SBC", tokenB: "BTC" });
    }
    log("");

    // 8. Write deployments JSON for the frontend to consume.
    const deployment = {
        chainId: Number(chainId),
        network: network.name,
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        factory: factoryAddr,
        router: routerAddr,
        weth: wethAddr,
        tokens: {
            SBC: {
                address: sbcAddr,
                decimals: DECIMALS.SBC,
                name: "SibeiCoin",
                mintMode: "owner",
                preDeployed: isSepolia,
            },
            WETH: {
                address: wethAddr,
                decimals: DECIMALS.WETH,
                name: "Wrapped Ether",
                mintMode: "wrap",
            },
            USDT: {
                address: usdtAddr,
                decimals: DECIMALS.USDT,
                name: "Tether USD",
                mintMode: "faucet",
                faucetCap: FAUCET_CAPS.USDT.toString(),
            },
            USDC: {
                address: usdcAddr,
                decimals: DECIMALS.USDC,
                name: "USD Coin",
                mintMode: "faucet",
                faucetCap: FAUCET_CAPS.USDC.toString(),
            },
            BTC: {
                address: btcAddr,
                decimals: DECIMALS.BTC,
                name: "Wrapped Bitcoin (Mock)",
                mintMode: "faucet",
                faucetCap: FAUCET_CAPS.BTC.toString(),
            },
        },
        pairs: pairsCreated,
    };

    const outDir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${network.name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(deployment, null, 4) + "\n");
    log(`Wrote ${outPath}`);
    log("");

    // 9. Summary.
    log("==============================================");
    log("Deployment summary");
    log("==============================================");
    log(`Factory : ${factoryAddr}`);
    log(`Router  : ${routerAddr}`);
    log(`SBC     : ${sbcAddr}`);
    log(`WETH    : ${wethAddr}`);
    log(`USDT    : ${usdtAddr}`);
    log(`USDC    : ${usdcAddr}`);
    log(`BTC     : ${btcAddr}`);
    log("Pairs   :");
    for (const p of pairsCreated) {
        log(`  ${p.tokenA}/${p.tokenB}: ${p.address}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
