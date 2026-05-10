const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployV2Fixture, getAmountOut } = require("../helpers/v2-fixture");

describe("UniswapV2Router — ETH variants", function () {
    async function approved() {
        const f = await deployV2Fixture();
        const routerAddr = await f.router.getAddress();
        await f.tokenA.approve(routerAddr, ethers.MaxUint256);
        return f;
    }

    async function getDeadline(offset = 600) {
        const block = await ethers.provider.getBlock("latest");
        return BigInt(block.timestamp) + BigInt(offset);
    }

    describe("addLiquidityETH", function () {
        it("wraps msg.value to WETH and seeds the pair", async function () {
            const { router, factory, tokenA, weth, deployer } = await loadFixture(approved);
            const tokenAmount = ethers.parseUnits("100", 18);
            const ethAmount = ethers.parseEther("1");

            await router.addLiquidityETH(
                await tokenA.getAddress(),
                tokenAmount,
                0,
                0,
                deployer.address,
                await getDeadline(),
                { value: ethAmount },
            );

            const pairAddr = await factory.getPair(
                await tokenA.getAddress(),
                await weth.getAddress(),
            );
            expect(pairAddr).to.not.equal(ethers.ZeroAddress);
            // Pair holds the WETH and the token.
            expect(await weth.balanceOf(pairAddr)).to.equal(ethAmount);
            expect(await tokenA.balanceOf(pairAddr)).to.equal(tokenAmount);
        });

        it("refunds dust ETH when ratio resolution lowers amountETH", async function () {
            const { router, tokenA, deployer } = await loadFixture(approved);
            // First seed at 100 TKA / 1 ETH so the ratio is 100:1.
            await router.addLiquidityETH(
                await tokenA.getAddress(),
                ethers.parseUnits("100", 18),
                0,
                0,
                deployer.address,
                await getDeadline(),
                { value: ethers.parseEther("1") },
            );

            // Now try to add 50 TKA + 1 ETH (ratio gives 0.5 ETH; should refund 0.5).
            const before = await ethers.provider.getBalance(deployer.address);
            const tx = await router.addLiquidityETH(
                await tokenA.getAddress(),
                ethers.parseUnits("50", 18),
                0,
                0,
                deployer.address,
                await getDeadline(),
                { value: ethers.parseEther("1") },
            );
            const receipt = await tx.wait();
            const gas = receipt.gasUsed * receipt.gasPrice;
            const after = await ethers.provider.getBalance(deployer.address);
            // Net ETH spent should be 0.5 ETH + gas (the other 0.5 was refunded).
            const netSpent = before - after - gas;
            expect(netSpent).to.equal(ethers.parseEther("0.5"));
        });
    });

    describe("removeLiquidityETH", function () {
        it("unwraps WETH back to ETH for the recipient", async function () {
            const { router, factory, tokenA, weth, deployer } = await loadFixture(approved);
            await router.addLiquidityETH(
                await tokenA.getAddress(),
                ethers.parseUnits("100", 18),
                0,
                0,
                deployer.address,
                await getDeadline(),
                { value: ethers.parseEther("1") },
            );

            const pairAddr = await factory.getPair(
                await tokenA.getAddress(),
                await weth.getAddress(),
            );
            const pair = await ethers.getContractAt("UniswapV2Pair", pairAddr);
            const lpBalance = await pair.balanceOf(deployer.address);
            await pair.approve(await router.getAddress(), lpBalance);

            const ethBefore = await ethers.provider.getBalance(deployer.address);
            const aBefore = await tokenA.balanceOf(deployer.address);
            const tx = await router.removeLiquidityETH(
                await tokenA.getAddress(),
                lpBalance,
                0,
                0,
                deployer.address,
                await getDeadline(),
            );
            const receipt = await tx.wait();
            const gas = receipt.gasUsed * receipt.gasPrice;

            const ethAfter = await ethers.provider.getBalance(deployer.address);
            const aAfter = await tokenA.balanceOf(deployer.address);
            // Token side returned ~all of the original (minus tiny MIN_LIQUIDITY share).
            expect(aAfter - aBefore).to.be.closeTo(
                ethers.parseUnits("100", 18),
                ethers.parseUnits("0.001", 18),
            );
            // ETH side: net change == returned ETH - gas. Returned ~1 ETH.
            const netReceived = ethAfter - ethBefore + gas;
            expect(netReceived).to.be.closeTo(
                ethers.parseEther("1"),
                ethers.parseEther("0.001"),
            );
        });
    });

    describe("swapExactETHForTokens", function () {
        it("requires path[0] == WETH", async function () {
            const { router, tokenA, deployer } = await loadFixture(approved);
            // Seed something just so the pool exists.
            await router.addLiquidityETH(
                await tokenA.getAddress(),
                ethers.parseUnits("1000", 18),
                0,
                0,
                deployer.address,
                await getDeadline(),
                { value: ethers.parseEther("10") },
            );
            const aAddr = await tokenA.getAddress();
            await expect(
                router.swapExactETHForTokens(
                    0,
                    [aAddr, aAddr], // wrong: doesn't start with WETH
                    deployer.address,
                    await getDeadline(),
                    { value: ethers.parseEther("0.1") },
                ),
            ).to.be.revertedWith("UniswapV2Router: INVALID_PATH");
        });

        it("swaps ETH for tokens at the pool's effective price", async function () {
            const { router, tokenA, weth, deployer, alice } = await loadFixture(approved);
            const tokenSeed = ethers.parseUnits("1000", 18);
            const ethSeed = ethers.parseEther("10");
            await router.addLiquidityETH(
                await tokenA.getAddress(),
                tokenSeed,
                0,
                0,
                deployer.address,
                await getDeadline(),
                { value: ethSeed },
            );

            const ethIn = ethers.parseEther("0.1");
            // Pool reserves are now wethReserve / tokenReserve, but we need to
            // know which is reserveIn vs reserveOut for path[0]=WETH, path[1]=tokenA.
            // Library.getReserves orders by the input pair, so reserveIn=WETH, reserveOut=tokenA.
            const expectedOut = getAmountOut(ethIn, ethSeed, tokenSeed);

            const balBefore = await tokenA.balanceOf(alice.address);
            await router
                .connect(alice)
                .swapExactETHForTokens(
                    0,
                    [await weth.getAddress(), await tokenA.getAddress()],
                    alice.address,
                    await getDeadline(),
                    { value: ethIn },
                );
            const balAfter = await tokenA.balanceOf(alice.address);
            expect(balAfter - balBefore).to.equal(expectedOut);
        });
    });

    describe("swapExactTokensForETH", function () {
        it("requires path[last] == WETH", async function () {
            const { router, tokenA, deployer } = await loadFixture(approved);
            const aAddr = await tokenA.getAddress();
            await expect(
                router.swapExactTokensForETH(
                    1n,
                    0,
                    [aAddr, aAddr], // wrong: doesn't end with WETH
                    deployer.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("UniswapV2Router: INVALID_PATH");
        });

        it("returns ETH (not WETH) to the recipient", async function () {
            const { router, tokenA, weth, deployer, alice } = await loadFixture(approved);
            const tokenSeed = ethers.parseUnits("1000", 18);
            const ethSeed = ethers.parseEther("10");
            await router.addLiquidityETH(
                await tokenA.getAddress(),
                tokenSeed,
                0,
                0,
                deployer.address,
                await getDeadline(),
                { value: ethSeed },
            );

            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
            const amountIn = ethers.parseUnits("10", 18);
            // reserveIn = tokenA, reserveOut = WETH
            const expectedEthOut = getAmountOut(amountIn, tokenSeed, ethSeed);

            const ethBefore = await ethers.provider.getBalance(alice.address);
            const tx = await router
                .connect(alice)
                .swapExactTokensForETH(
                    amountIn,
                    0,
                    [await tokenA.getAddress(), await weth.getAddress()],
                    alice.address,
                    await getDeadline(),
                );
            const receipt = await tx.wait();
            const gas = receipt.gasUsed * receipt.gasPrice;
            const ethAfter = await ethers.provider.getBalance(alice.address);
            const netReceived = ethAfter - ethBefore + gas;
            expect(netReceived).to.equal(expectedEthOut);
        });
    });
});
