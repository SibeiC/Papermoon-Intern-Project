const { expect } = require("chai");
const { ethers } = require("hardhat");

// Initial pool seed per the spec: 1000 SBC + 1 ETH.
const INITIAL_SBC = ethers.parseEther("1000");
const INITIAL_ETH = ethers.parseEther("1");
const MINIMUM_LIQUIDITY = 1000n;

// Replicates the on-chain getAmountOut formula so tests can assert exact expected values.
// amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
function getAmountOut(amountIn, reserveIn, reserveOut) {
    const amountInWithFee = amountIn * 997n;
    return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}

// Integer sqrt (Babylonian), mirroring the contract, used only to predict LP token math.
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

describe("SimpleCPAMM", function () {
    let owner, alice, bob;
    let sbc, weth, amm;
    let sbcAddr, wethAddr, ammAddr;

    beforeEach(async function () {
        [owner, alice, bob] = await ethers.getSigners();

        const SBC = await ethers.getContractFactory("SibeiCoin");
        sbc = await SBC.deploy();
        sbcAddr = await sbc.getAddress();

        const WETH = await ethers.getContractFactory("MockWETH");
        weth = await WETH.deploy();
        wethAddr = await weth.getAddress();

        // Give owner enough SBC to seed the pool AND have spare for later tests.
        await sbc.mint(owner.address, INITIAL_SBC * 10n);

        const AMM = await ethers.getContractFactory("SimpleCPAMM");
        amm = await AMM.deploy(sbcAddr, wethAddr);
        ammAddr = await amm.getAddress();

        // Seed the pool via the normal addLiquidity path (Uniswap V2 style: deploy empty,
        // then bootstrap). Owner wraps ETH to WETH, approves both tokens, and adds.
        await weth.deposit({ value: INITIAL_ETH });
        await sbc.approve(ammAddr, INITIAL_SBC);
        await weth.approve(ammAddr, INITIAL_ETH);
        await amm.addLiquidity(INITIAL_SBC, INITIAL_ETH);
    });

    describe("deployment / seeding", function () {
        it("records token addresses and seeded reserves", async function () {
            expect(await amm.token0()).to.equal(sbcAddr);
            expect(await amm.token1()).to.equal(wethAddr);
            expect(await amm.reserve0()).to.equal(INITIAL_SBC);
            expect(await amm.reserve1()).to.equal(INITIAL_ETH);
        });

        it("wraps seeded ETH into WETH held by the pool", async function () {
            expect(await weth.balanceOf(ammAddr)).to.equal(INITIAL_ETH);
            expect(await sbc.balanceOf(ammAddr)).to.equal(INITIAL_SBC);
        });

        it("mints initial LP = sqrt(x*y) - MINIMUM_LIQUIDITY to deployer", async function () {
            const expectedTotal = isqrt(INITIAL_SBC * INITIAL_ETH);
            const expectedOwner = expectedTotal - MINIMUM_LIQUIDITY;

            expect(await amm.totalSupply()).to.equal(expectedTotal);
            expect(await amm.balanceOf(owner.address)).to.equal(expectedOwner);
            // MINIMUM_LIQUIDITY permanently locked at address(1).
            expect(await amm.balanceOf("0x0000000000000000000000000000000000000001")).to.equal(
                MINIMUM_LIQUIDITY,
            );
        });
    });

    describe("swap math (x * y = k with 0.3% fee)", function () {
        it("small swap: 0.01 WETH -> ~9.87 SBC (matches exact formula)", async function () {
            const amountIn = ethers.parseEther("0.01");
            const expectedOut = getAmountOut(amountIn, INITIAL_ETH, INITIAL_SBC);

            // Alice needs WETH to swap in.
            await weth.connect(alice).deposit({ value: amountIn });
            await weth.connect(alice).approve(ammAddr, amountIn);

            const quoted = await amm.getAmountOut(wethAddr, amountIn);
            expect(quoted).to.equal(expectedOut);

            const sbcBefore = await sbc.balanceOf(alice.address);
            await amm.connect(alice).swap(wethAddr, amountIn, 0);
            const sbcAfter = await sbc.balanceOf(alice.address);

            expect(sbcAfter - sbcBefore).to.equal(expectedOut);
            // Roughly ~9.87 SBC for the curious reader.
            expect(expectedOut).to.be.closeTo(
                ethers.parseEther("9.87"),
                ethers.parseEther("0.01"),
            );
        });

        it("k grows slightly on every swap due to fee accrual", async function () {
            const kBefore = (await amm.reserve0()) * (await amm.reserve1());

            const amountIn = ethers.parseEther("0.05");
            await weth.connect(alice).deposit({ value: amountIn });
            await weth.connect(alice).approve(ammAddr, amountIn);
            await amm.connect(alice).swap(wethAddr, amountIn, 0);

            const kAfter = (await amm.reserve0()) * (await amm.reserve1());
            expect(kAfter).to.be.gt(kBefore); // fee stays in the pool -> k ratchets up
        });

        it("reserves update consistently with swap output", async function () {
            const amountIn = ethers.parseEther("100"); // 100 SBC in
            const expectedOut = getAmountOut(amountIn, INITIAL_SBC, INITIAL_ETH);

            await sbc.mint(alice.address, amountIn);
            await sbc.connect(alice).approve(ammAddr, amountIn);
            await amm.connect(alice).swap(sbcAddr, amountIn, 0);

            expect(await amm.reserve0()).to.equal(INITIAL_SBC + amountIn);
            expect(await amm.reserve1()).to.equal(INITIAL_ETH - expectedOut);
        });
    });

    describe("slippage demo (price impact grows with trade size)", function () {
        it("0.5 WETH in moves the price far more than 0.01 WETH in", async function () {
            const small = ethers.parseEther("0.01");
            const large = ethers.parseEther("0.5");

            const smallOut = await amm.getAmountOut(wethAddr, small);
            const largeOut = await amm.getAmountOut(wethAddr, large);

            // Effective price = SBC received per WETH spent. Scale by 1e18 for integer math.
            const smallPrice = (smallOut * ethers.parseEther("1")) / small;
            const largePrice = (largeOut * ethers.parseEther("1")) / large;

            // Large trade should receive far fewer SBC per WETH than the small trade.
            expect(largePrice).to.be.lt(smallPrice);

            // Concrete demo of price impact: print something readable.
            const spotPrice = (INITIAL_SBC * ethers.parseEther("1")) / INITIAL_ETH;
            console.log(
                `      spot:  1 WETH -> ${ethers.formatEther(spotPrice)} SBC\n` +
                    `      0.01:  1 WETH -> ${ethers.formatEther(smallPrice)} SBC (effective)\n` +
                    `      0.50:  1 WETH -> ${ethers.formatEther(largePrice)} SBC (effective)`,
            );
        });

        it("reverts when output is below minAmountOut", async function () {
            const amountIn = ethers.parseEther("0.1");
            const expectedOut = await amm.getAmountOut(wethAddr, amountIn);

            await weth.connect(alice).deposit({ value: amountIn });
            await weth.connect(alice).approve(ammAddr, amountIn);

            await expect(
                amm.connect(alice).swap(wethAddr, amountIn, expectedOut + 1n),
            ).to.be.revertedWith("SLIPPAGE_EXCEEDED");
        });
    });

    describe("addLiquidity / removeLiquidity", function () {
        it("mints proportional LP when adding in the current ratio", async function () {
            // Current ratio: 1000 SBC : 1 WETH. Double the pool by adding the same amounts.
            const addSBC = ethers.parseEther("1000");
            const addWETH = ethers.parseEther("1");

            await sbc.mint(alice.address, addSBC);
            await weth.connect(alice).deposit({ value: addWETH });
            await sbc.connect(alice).approve(ammAddr, addSBC);
            await weth.connect(alice).approve(ammAddr, addWETH);

            const lpBefore = await amm.totalSupply();
            await amm.connect(alice).addLiquidity(addSBC, addWETH);
            const lpAfter = await amm.totalSupply();

            // Doubling the pool should roughly double totalSupply.
            expect(lpAfter).to.equal(lpBefore * 2n);
            expect(await amm.reserve0()).to.equal(INITIAL_SBC * 2n);
            expect(await amm.reserve1()).to.equal(INITIAL_ETH * 2n);
        });

        it("returns pro-rata reserves when removing all of the deployer's LP", async function () {
            const ownerLP = await amm.balanceOf(owner.address);
            const totalSupply = await amm.totalSupply();
            const expectedSBCOut = (ownerLP * INITIAL_SBC) / totalSupply;
            const expectedWETHOut = (ownerLP * INITIAL_ETH) / totalSupply;

            const sbcBefore = await sbc.balanceOf(owner.address);
            const wethBefore = await weth.balanceOf(owner.address);

            await amm.removeLiquidity(ownerLP);

            expect((await sbc.balanceOf(owner.address)) - sbcBefore).to.equal(expectedSBCOut);
            expect((await weth.balanceOf(owner.address)) - wethBefore).to.equal(expectedWETHOut);
            expect(await amm.balanceOf(owner.address)).to.equal(0n);
            // MINIMUM_LIQUIDITY stays locked, so totalSupply can never return to zero.
            expect(await amm.totalSupply()).to.equal(MINIMUM_LIQUIDITY);
        });

        it("fee-accrued pool returns MORE tokens per LP after swaps", async function () {
            // Alice adds liquidity, Bob swaps (accruing fees), Alice removes and should get more out.
            const addSBC = ethers.parseEther("1000");
            const addWETH = ethers.parseEther("1");
            await sbc.mint(alice.address, addSBC);
            await weth.connect(alice).deposit({ value: addWETH });
            await sbc.connect(alice).approve(ammAddr, addSBC);
            await weth.connect(alice).approve(ammAddr, addWETH);
            await amm.connect(alice).addLiquidity(addSBC, addWETH);
            const aliceLP = await amm.balanceOf(alice.address);

            // Bob swaps back and forth to accrue fees in the pool.
            const tradeETH = ethers.parseEther("0.1");
            for (let i = 0; i < 3; i++) {
                await weth.connect(bob).deposit({ value: tradeETH });
                await weth.connect(bob).approve(ammAddr, tradeETH);
                await amm.connect(bob).swap(wethAddr, tradeETH, 0);

                const bobSBC = await sbc.balanceOf(bob.address);
                await sbc.connect(bob).approve(ammAddr, bobSBC);
                await amm.connect(bob).swap(sbcAddr, bobSBC, 0);
            }

            // Alice removes: her share of the pool should redeem for strictly more
            // than her deposit of (1000 SBC + 1 WETH) in some combined sense.
            const sbcBefore = await sbc.balanceOf(alice.address);
            const wethBefore = await weth.balanceOf(alice.address);
            await amm.connect(alice).removeLiquidity(aliceLP);
            const sbcGained = (await sbc.balanceOf(alice.address)) - sbcBefore;
            const wethGained = (await weth.balanceOf(alice.address)) - wethBefore;

            // Express value in WETH terms using current spot price. Should beat original deposit.
            const reserve0After = await amm.reserve0();
            const reserve1After = await amm.reserve1();
            // Guard against divide-by-zero in degenerate cases (won't happen here).
            const originalValueInWETH =
                addWETH + (addSBC * reserve1After) / (reserve0After + addSBC);
            const finalValueInWETH =
                wethGained + (sbcGained * reserve1After) / (reserve0After + sbcGained);
            expect(finalValueInWETH).to.be.gt(originalValueInWETH);
        });
    });

    describe("edge cases", function () {
        it("rejects swap of an unrelated token", async function () {
            const random = ethers.Wallet.createRandom().address;
            await expect(amm.swap(random, 1, 0)).to.be.revertedWith("INVALID_TOKEN");
        });

        it("rejects zero-amount swap", async function () {
            await expect(amm.swap(wethAddr, 0, 0)).to.be.revertedWith("INSUFFICIENT_INPUT");
        });

        it("rejects addLiquidity with zero on either side", async function () {
            await expect(amm.addLiquidity(0, 1)).to.be.revertedWith("INSUFFICIENT_AMOUNT");
            await expect(amm.addLiquidity(1, 0)).to.be.revertedWith("INSUFFICIENT_AMOUNT");
        });

        it("rejects removeLiquidity exceeding caller's LP balance", async function () {
            const ownerLP = await amm.balanceOf(owner.address);
            await expect(amm.removeLiquidity(ownerLP + 1n)).to.be.revertedWith(
                "INSUFFICIENT_LP_BALANCE",
            );
        });

        it("rejects constructing a pool with identical tokens", async function () {
            const AMM = await ethers.getContractFactory("SimpleCPAMM");
            await expect(AMM.deploy(sbcAddr, sbcAddr)).to.be.revertedWith("IDENTICAL_TOKENS");
        });
    });
});
