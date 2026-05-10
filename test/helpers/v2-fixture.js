const { ethers } = require("hardhat");

const MAX_UINT256 = (1n << 256n) - 1n;

// Pure-JS mirror of Library.getAmountOut so tests can assert exact expected values.
function getAmountOut(amountIn, reserveIn, reserveOut) {
    const amountInWithFee = amountIn * 997n;
    return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}

// Pure-JS mirror of Library.getAmountIn (with the +1 round-up).
function getAmountIn(amountOut, reserveIn, reserveOut) {
    const numerator = reserveIn * amountOut * 1000n;
    const denominator = (reserveOut - amountOut) * 997n;
    return numerator / denominator + 1n;
}

// Babylonian sqrt for predicting first-mint LP amounts.
function isqrt(n) {
    if (n < 2n) return n;
    let x = n;
    let y = (n + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (n / y + y) / 2n;
    }
    return x;
}

function sortTokens(a, b) {
    return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

// Deploys a fresh V2 stack: factory, MockWETH, three mock ERC-20s, and a
// router pointing at the local MockWETH. Returns all handles plus signers
// and pre-funds each test signer with a generous mock-token balance.
async function deployV2Fixture() {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    const weth = await MockWETH.deploy();

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    // Three mocks with mixed decimals so we exercise non-18-decimal paths.
    const tokenA = await TestERC20.deploy("Token A", "TKA", 18, ethers.parseUnits("1000", 18));
    const tokenB = await TestERC20.deploy("Token B", "TKB", 6, ethers.parseUnits("1000", 6));
    const tokenC = await TestERC20.deploy("Token C", "TKC", 8, ethers.parseUnits("1000", 8));

    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = await Factory.deploy(deployer.address);

    const Router = await ethers.getContractFactory("UniswapV2Router");
    const router = await Router.deploy(await factory.getAddress(), await weth.getAddress());

    // Pre-mint generous balances to deployer + each test signer.
    const bigA = ethers.parseUnits("1000000", 18);
    const bigB = ethers.parseUnits("1000000", 6);
    const bigC = ethers.parseUnits("1000", 8);
    for (const who of [deployer, alice, bob, carol]) {
        await tokenA.mintTo(who.address, bigA);
        await tokenB.mintTo(who.address, bigB);
        await tokenC.mintTo(who.address, bigC);
    }

    return {
        deployer,
        alice,
        bob,
        carol,
        weth,
        tokenA,
        tokenB,
        tokenC,
        factory,
        router,
    };
}

// Helper: approve a spender for max on multiple tokens, from a single signer.
async function approveAll(signer, tokens, spender) {
    for (const t of tokens) {
        await t.connect(signer).approve(spender, MAX_UINT256);
    }
}

// Helper: returns block.timestamp + offset seconds, formatted for a deadline arg.
async function deadlineFromNow(offsetSeconds = 600) {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block.timestamp) + BigInt(offsetSeconds);
}

module.exports = {
    deployV2Fixture,
    approveAll,
    deadlineFromNow,
    getAmountOut,
    getAmountIn,
    isqrt,
    sortTokens,
    MAX_UINT256,
};
