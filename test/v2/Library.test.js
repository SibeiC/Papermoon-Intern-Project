const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployV2Fixture, getAmountOut, getAmountIn } = require("../helpers/v2-fixture");

// Library functions are internal to the contract, so we exercise them by
// going through the Router (which calls them on every swap/quote path).
describe("UniswapV2Library (via Router)", function () {
    describe("getAmountsOut", function () {
        it("matches the JS-mirror getAmountOut for a single-hop pool", async function () {
            const { factory, router, tokenA, tokenB, deployer } = await loadFixture(
                deployV2Fixture,
            );
            // Seed TKA/TKB with 1000 / 1000 (different decimals, so different units).
            const aSeed = ethers.parseUnits("1000", 18);
            const bSeed = ethers.parseUnits("1000", 6);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();

            await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
            await tokenB.approve(await router.getAddress(), ethers.MaxUint256);

            const block = await ethers.provider.getBlock("latest");
            const deadline = BigInt(block.timestamp) + 600n;
            await router.addLiquidity(a, b, aSeed, bSeed, 0, 0, deployer.address, deadline);

            // Now the swap path is exact-input on a known pool. Library.getAmountsOut
            // should match our JS mirror.
            const amountIn = ethers.parseUnits("1", 18);
            const expectedOut = getAmountOut(amountIn, aSeed, bSeed);

            // We can't call the library directly — instead, do a static call to
            // swapExactTokensForTokens at amountOutMin=0 and check the returned
            // amounts from the router's perspective via a static call on the math.
            // Simpler: just send the swap and check the recipient's balance change.
            const balBefore = await tokenB.balanceOf(deployer.address);
            await router.swapExactTokensForTokens(
                amountIn,
                0,
                [a, b],
                deployer.address,
                deadline,
            );
            const balAfter = await tokenB.balanceOf(deployer.address);
            expect(balAfter - balBefore).to.equal(expectedOut);
            // Sanity: factory should've created the pair on first addLiquidity.
            expect(await factory.getPair(a, b)).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("getAmountIn (exact-output)", function () {
        it("matches the JS-mirror getAmountIn", async function () {
            const { router, tokenA, tokenB, deployer } = await loadFixture(deployV2Fixture);
            const aSeed = ethers.parseUnits("1000", 18);
            const bSeed = ethers.parseUnits("1000", 6);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();

            await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
            await tokenB.approve(await router.getAddress(), ethers.MaxUint256);

            const block = await ethers.provider.getBlock("latest");
            const deadline = BigInt(block.timestamp) + 600n;
            await router.addLiquidity(a, b, aSeed, bSeed, 0, 0, deployer.address, deadline);

            // Want exactly 5 TKB out. JS mirror tells us the required input.
            const amountOut = ethers.parseUnits("5", 6);
            const expectedIn = getAmountIn(amountOut, aSeed, bSeed);

            const balABefore = await tokenA.balanceOf(deployer.address);
            await router.swapTokensForExactTokens(
                amountOut,
                ethers.MaxUint256,
                [a, b],
                deployer.address,
                deadline,
            );
            const balAAfter = await tokenA.balanceOf(deployer.address);
            // The amount actually pulled equals expectedIn.
            expect(balABefore - balAAfter).to.equal(expectedIn);
        });
    });

    describe("multi-hop path", function () {
        it("routes A -> B -> C and matches the chained JS-mirror calculation", async function () {
            const { router, tokenA, tokenB, tokenC, deployer } = await loadFixture(
                deployV2Fixture,
            );
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            const c = await tokenC.getAddress();

            await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
            await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
            await tokenC.approve(await router.getAddress(), ethers.MaxUint256);

            const block = await ethers.provider.getBlock("latest");
            const deadline = BigInt(block.timestamp) + 600n;

            // Pool 1: A/B with reserves 1000/1000 (in their respective decimals)
            // Pool 2: B/C with reserves 500/100  (TKB has 6dp, TKC has 8dp)
            await router.addLiquidity(
                a,
                b,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
                0,
                0,
                deployer.address,
                deadline,
            );
            await router.addLiquidity(
                b,
                c,
                ethers.parseUnits("500", 6),
                ethers.parseUnits("100", 8),
                0,
                0,
                deployer.address,
                deadline,
            );

            const amountIn = ethers.parseUnits("10", 18);
            const out1 = getAmountOut(
                amountIn,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
            );
            const expectedOut = getAmountOut(
                out1,
                ethers.parseUnits("500", 6),
                ethers.parseUnits("100", 8),
            );

            const balCBefore = await tokenC.balanceOf(deployer.address);
            await router.swapExactTokensForTokens(
                amountIn,
                0,
                [a, b, c],
                deployer.address,
                deadline,
            );
            const balCAfter = await tokenC.balanceOf(deployer.address);
            expect(balCAfter - balCBefore).to.equal(expectedOut);
        });
    });
});
