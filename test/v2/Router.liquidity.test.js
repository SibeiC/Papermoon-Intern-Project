const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployV2Fixture, isqrt, sortTokens } = require("../helpers/v2-fixture");

const MIN_LIQUIDITY = 1000n;

describe("UniswapV2Router — liquidity", function () {
    async function approved() {
        const f = await deployV2Fixture();
        const routerAddr = await f.router.getAddress();
        await f.tokenA.approve(routerAddr, ethers.MaxUint256);
        await f.tokenB.approve(routerAddr, ethers.MaxUint256);
        await f.tokenC.approve(routerAddr, ethers.MaxUint256);
        return f;
    }

    async function getDeadline(offset = 600) {
        const block = await ethers.provider.getBlock("latest");
        return BigInt(block.timestamp) + BigInt(offset);
    }

    describe("addLiquidity (first deposit)", function () {
        it("auto-creates the pair, deposits both desired amounts, mints sqrt(a*b) - 1000 to caller", async function () {
            const { router, factory, tokenA, tokenB, deployer } = await loadFixture(approved);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            const aIn = ethers.parseUnits("1000", 18);
            const bIn = ethers.parseUnits("1000", 6);

            expect(await factory.getPair(a, b)).to.equal(ethers.ZeroAddress);

            const tx = await router.addLiquidity(
                a,
                b,
                aIn,
                bIn,
                0,
                0,
                deployer.address,
                await getDeadline(),
            );
            await tx.wait();

            const pairAddr = await factory.getPair(a, b);
            expect(pairAddr).to.not.equal(ethers.ZeroAddress);
            const pair = await ethers.getContractAt("UniswapV2Pair", pairAddr);
            const [token0Addr] = sortTokens(a, b);
            const token0IsA = BigInt(token0Addr) === BigInt(a);
            const [a0, a1] = token0IsA ? [aIn, bIn] : [bIn, aIn];
            const expectedLp = isqrt(a0 * a1) - MIN_LIQUIDITY;
            expect(await pair.balanceOf(deployer.address)).to.equal(expectedLp);
        });
    });

    describe("addLiquidity (subsequent deposit, ratio enforcement)", function () {
        it("uses quote(B|A) when amountBOptimal <= amountBDesired", async function () {
            const { router, tokenA, tokenB, deployer, alice } = await loadFixture(approved);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            // Seed the pool 1:1 (in their decimals)
            await router.addLiquidity(
                a,
                b,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
                0,
                0,
                deployer.address,
                await getDeadline(),
            );

            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
            await tokenB.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

            // Alice supplies 100 TKA + 200 TKB at the 1:1 pool. Router should
            // pull 100 TKA + 100 TKB (matching the ratio) and skip the surplus.
            const aDesired = ethers.parseUnits("100", 18);
            const bDesired = ethers.parseUnits("200", 6);
            const aBefore = await tokenA.balanceOf(alice.address);
            const bBefore = await tokenB.balanceOf(alice.address);
            await router
                .connect(alice)
                .addLiquidity(
                    a,
                    b,
                    aDesired,
                    bDesired,
                    0,
                    0,
                    alice.address,
                    await getDeadline(),
                );
            const aAfter = await tokenA.balanceOf(alice.address);
            const bAfter = await tokenB.balanceOf(alice.address);
            expect(aBefore - aAfter).to.equal(aDesired);
            expect(bBefore - bAfter).to.equal(ethers.parseUnits("100", 6));
        });

        it("reverts INSUFFICIENT_B_AMOUNT when the optimal B is below user min", async function () {
            const { router, tokenA, tokenB, deployer, alice } = await loadFixture(approved);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            await router.addLiquidity(
                a,
                b,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
                0,
                0,
                deployer.address,
                await getDeadline(),
            );
            await tokenA.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);
            await tokenB.connect(alice).approve(await router.getAddress(), ethers.MaxUint256);

            // Alice asks for too high a B-min; ratio gives 100 but min is 200.
            await expect(
                router.connect(alice).addLiquidity(
                    a,
                    b,
                    ethers.parseUnits("100", 18),
                    ethers.parseUnits("200", 6),
                    ethers.parseUnits("100", 18), // amountAMin
                    ethers.parseUnits("200", 6), // amountBMin (too high)
                    alice.address,
                    await getDeadline(),
                ),
            ).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_B_AMOUNT");
        });
    });

    describe("removeLiquidity", function () {
        it("returns proportional reserves and burns LP", async function () {
            const { router, factory, tokenA, tokenB, deployer } = await loadFixture(approved);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            await router.addLiquidity(
                a,
                b,
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("1000", 6),
                0,
                0,
                deployer.address,
                await getDeadline(),
            );

            const pairAddr = await factory.getPair(a, b);
            const pair = await ethers.getContractAt("UniswapV2Pair", pairAddr);
            const lpBalance = await pair.balanceOf(deployer.address);
            await pair.approve(await router.getAddress(), lpBalance);

            const aBefore = await tokenA.balanceOf(deployer.address);
            const bBefore = await tokenB.balanceOf(deployer.address);

            await router.removeLiquidity(
                a,
                b,
                lpBalance,
                0,
                0,
                deployer.address,
                await getDeadline(),
            );

            const aAfter = await tokenA.balanceOf(deployer.address);
            const bAfter = await tokenB.balanceOf(deployer.address);
            // Get back ~all minus the locked MINIMUM_LIQUIDITY share.
            expect(aAfter - aBefore).to.be.closeTo(
                ethers.parseUnits("1000", 18),
                ethers.parseUnits("0.001", 18),
            );
            expect(bAfter - bBefore).to.be.closeTo(
                ethers.parseUnits("1000", 6),
                ethers.parseUnits("0.001", 6),
            );
            // LP burned to zero for the user.
            expect(await pair.balanceOf(deployer.address)).to.equal(0n);
        });
    });

    describe("deadline enforcement", function () {
        it("reverts EXPIRED when deadline is in the past", async function () {
            const { router, tokenA, tokenB, deployer } = await loadFixture(approved);
            const block = await ethers.provider.getBlock("latest");
            const pastDeadline = BigInt(block.timestamp) - 1n;
            await expect(
                router.addLiquidity(
                    await tokenA.getAddress(),
                    await tokenB.getAddress(),
                    ethers.parseUnits("100", 18),
                    ethers.parseUnits("100", 6),
                    0,
                    0,
                    deployer.address,
                    pastDeadline,
                ),
            ).to.be.revertedWith("UniswapV2Router: EXPIRED");
        });
    });
});
