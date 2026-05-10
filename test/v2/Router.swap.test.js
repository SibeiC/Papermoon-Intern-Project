const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployV2Fixture, getAmountOut, getAmountIn } = require("../helpers/v2-fixture");

describe("UniswapV2Router — token-only swaps", function () {
    async function seeded() {
        const f = await deployV2Fixture();
        const routerAddr = await f.router.getAddress();
        for (const t of [f.tokenA, f.tokenB, f.tokenC]) {
            await t.approve(routerAddr, ethers.MaxUint256);
        }
        const block = await ethers.provider.getBlock("latest");
        const deadline = BigInt(block.timestamp) + 600n;
        // A/B at 1:1, B/C at 500:100 — sets up multi-hop.
        await f.router.addLiquidity(
            await f.tokenA.getAddress(),
            await f.tokenB.getAddress(),
            ethers.parseUnits("1000", 18),
            ethers.parseUnits("1000", 6),
            0,
            0,
            f.deployer.address,
            deadline,
        );
        await f.router.addLiquidity(
            await f.tokenB.getAddress(),
            await f.tokenC.getAddress(),
            ethers.parseUnits("500", 6),
            ethers.parseUnits("100", 8),
            0,
            0,
            f.deployer.address,
            deadline,
        );
        return f;
    }

    async function getDeadline(offset = 600) {
        const block = await ethers.provider.getBlock("latest");
        return BigInt(block.timestamp) + BigInt(offset);
    }

    describe("swapExactTokensForTokens (single hop)", function () {
        it("matches Library.getAmountOut for the swap output", async function () {
            const { router, tokenA, tokenB, alice } = await loadFixture(seeded);
            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

            const amountIn = ethers.parseUnits("10", 18);
            const expectedOut = getAmountOut(
                amountIn,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
            );

            const balBefore = await tokenB.balanceOf(alice.address);
            await router
                .connect(alice)
                .swapExactTokensForTokens(
                    amountIn,
                    0,
                    [await tokenA.getAddress(), await tokenB.getAddress()],
                    alice.address,
                    await getDeadline(),
                );
            const balAfter = await tokenB.balanceOf(alice.address);
            expect(balAfter - balBefore).to.equal(expectedOut);
        });

        it("reverts INSUFFICIENT_OUTPUT_AMOUNT when amountOutMin is too high", async function () {
            const { router, tokenA, tokenB, alice } = await loadFixture(seeded);
            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
            const amountIn = ethers.parseUnits("10", 18);
            const expectedOut = getAmountOut(
                amountIn,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
            );
            // Ask for 1 wei more than possible.
            await expect(
                router.connect(alice).swapExactTokensForTokens(
                    amountIn,
                    expectedOut + 1n,
                    [await tokenA.getAddress(), await tokenB.getAddress()],
                    alice.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
        });
    });

    describe("swapTokensForExactTokens (exact-output)", function () {
        it("pulls exactly Library.getAmountIn from caller", async function () {
            const { router, tokenA, tokenB, alice } = await loadFixture(seeded);
            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

            const amountOut = ethers.parseUnits("5", 6);
            const expectedIn = getAmountIn(
                amountOut,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
            );

            const aBefore = await tokenA.balanceOf(alice.address);
            await router
                .connect(alice)
                .swapTokensForExactTokens(
                    amountOut,
                    ethers.MaxUint256,
                    [await tokenA.getAddress(), await tokenB.getAddress()],
                    alice.address,
                    await getDeadline(),
                );
            const aAfter = await tokenA.balanceOf(alice.address);
            expect(aBefore - aAfter).to.equal(expectedIn);
        });

        it("reverts EXCESSIVE_INPUT_AMOUNT when amountInMax is too tight", async function () {
            const { router, tokenA, tokenB, alice } = await loadFixture(seeded);
            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
            const amountOut = ethers.parseUnits("5", 6);
            const expectedIn = getAmountIn(
                amountOut,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
            );
            await expect(
                router.connect(alice).swapTokensForExactTokens(
                    amountOut,
                    expectedIn - 1n,
                    [await tokenA.getAddress(), await tokenB.getAddress()],
                    alice.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("UniswapV2Router: EXCESSIVE_INPUT_AMOUNT");
        });
    });

    describe("swapExactTokensForTokens (multi-hop A->B->C)", function () {
        it("matches the chained JS-mirror calculation", async function () {
            const { router, tokenA, tokenB, tokenC, alice } = await loadFixture(seeded);
            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

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

            const balCBefore = await tokenC.balanceOf(alice.address);
            await router
                .connect(alice)
                .swapExactTokensForTokens(
                    amountIn,
                    0,
                    [
                        await tokenA.getAddress(),
                        await tokenB.getAddress(),
                        await tokenC.getAddress(),
                    ],
                    alice.address,
                    await getDeadline(),
                );
            const balCAfter = await tokenC.balanceOf(alice.address);
            expect(balCAfter - balCBefore).to.equal(expectedOut);
        });
    });
});
