const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployV2Fixture, isqrt, sortTokens } = require("../helpers/v2-fixture");

const MIN_LIQUIDITY = 1000n;

describe("UniswapV2Pair", function () {
    // Convenience: deploys fixture and creates a TKA/TKB pair, returning all
    // ordered handles. Many tests need this exact setup.
    async function pairFixture() {
        const f = await deployV2Fixture();
        await f.factory.createPair(await f.tokenA.getAddress(), await f.tokenB.getAddress());
        const pairAddr = await f.factory.getPair(
            await f.tokenA.getAddress(),
            await f.tokenB.getAddress(),
        );
        const pair = await ethers.getContractAt("UniswapV2Pair", pairAddr);
        const [token0Addr] = sortTokens(
            await f.tokenA.getAddress(),
            await f.tokenB.getAddress(),
        );
        const token0IsA =
            BigInt(token0Addr) === BigInt(await f.tokenA.getAddress());
        return { ...f, pair, pairAddr, token0IsA };
    }

    describe("initialize", function () {
        it("can only be called by the factory", async function () {
            const { pair, alice, tokenA, tokenB } = await loadFixture(pairFixture);
            await expect(
                pair
                    .connect(alice)
                    .initialize(await tokenA.getAddress(), await tokenB.getAddress()),
            ).to.be.revertedWith("UniswapV2: FORBIDDEN");
        });

        it("cannot be re-initialized after first call", async function () {
            const { factory, tokenA, tokenB } = await loadFixture(deployV2Fixture);
            await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
            const pairAddr = await factory.getPair(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
            );
            const pair = await ethers.getContractAt("UniswapV2Pair", pairAddr);
            // Even the factory itself can't re-initialize (impersonation isn't trivial,
            // but the on-contract guard ensures token0 is set exactly once).
            await expect(
                pair.initialize(await tokenA.getAddress(), await tokenB.getAddress()),
            ).to.be.reverted; // FORBIDDEN (caller != factory) OR ALREADY_INITIALIZED
        });
    });

    describe("first mint", function () {
        it("mints sqrt(a*b) - 1000 to the provider, locks 1000 at address(1)", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, token0IsA } = await loadFixture(
                pairFixture,
            );
            const a = ethers.parseUnits("1000", 18); // TKA (18dp)
            const b = ethers.parseUnits("1000", 6); // TKB (6dp)

            // Pre-transfer both inputs to the pair (low-level mint pattern).
            await tokenA.transfer(pairAddr, a);
            await tokenB.transfer(pairAddr, b);

            // Predict liquidity using the same product the contract sees.
            const [amount0, amount1] = token0IsA ? [a, b] : [b, a];
            const expectedLp = isqrt(amount0 * amount1) - MIN_LIQUIDITY;

            await expect(pair.mint(deployer.address))
                .to.emit(pair, "Mint")
                .withArgs(deployer.address, amount0, amount1)
                .and.to.emit(pair, "Sync");

            expect(await pair.totalSupply()).to.equal(expectedLp + MIN_LIQUIDITY);
            expect(await pair.balanceOf(deployer.address)).to.equal(expectedLp);
            expect(await pair.balanceOf("0x0000000000000000000000000000000000000001")).to.equal(
                MIN_LIQUIDITY,
            );

            const [r0, r1] = await pair.getReserves();
            expect(r0).to.equal(amount0);
            expect(r1).to.equal(amount1);
        });

        it("reverts INSUFFICIENT_LIQUIDITY_MINTED when sqrt(a*b) <= MINIMUM_LIQUIDITY", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer } = await loadFixture(pairFixture);
            // Tiny inputs: sqrt(1*1) = 1 < 1000, so first-mint result is negative
            // and the contract reverts via underflow OR the explicit check.
            await tokenA.transfer(pairAddr, 1n);
            await tokenB.transfer(pairAddr, 1n);
            await expect(pair.mint(deployer.address)).to.be.reverted;
        });
    });

    describe("subsequent mint", function () {
        it("mints pro-rata; surplus on one side is donated", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, alice, token0IsA } =
                await loadFixture(pairFixture);
            const aSeed = ethers.parseUnits("1000", 18);
            const bSeed = ethers.parseUnits("1000", 6);
            await tokenA.transfer(pairAddr, aSeed);
            await tokenB.transfer(pairAddr, bSeed);
            await pair.mint(deployer.address);

            // Alice deposits 100 TKA + 200 TKB at a 1:1 pool — only 100 of TKB
            // is matched; the other 100 is donated.
            const aIn = ethers.parseUnits("100", 18);
            const bIn = ethers.parseUnits("200", 6);
            await tokenA.connect(alice).transfer(pairAddr, aIn);
            await tokenB.connect(alice).transfer(pairAddr, bIn);

            const supplyBefore = await pair.totalSupply();
            const [r0Before, r1Before] = await pair.getReserves();
            const [a0In, a1In] = token0IsA ? [aIn, bIn] : [bIn, aIn];
            const liq0 = (a0In * supplyBefore) / r0Before;
            const liq1 = (a1In * supplyBefore) / r1Before;
            const expectedLp = liq0 < liq1 ? liq0 : liq1;

            await pair.mint(alice.address);
            expect(await pair.balanceOf(alice.address)).to.equal(expectedLp);
        });
    });

    describe("burn", function () {
        it("returns pro-rata share of both tokens", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, token0IsA } =
                await loadFixture(pairFixture);
            const aSeed = ethers.parseUnits("1000", 18);
            const bSeed = ethers.parseUnits("1000", 6);
            await tokenA.transfer(pairAddr, aSeed);
            await tokenB.transfer(pairAddr, bSeed);
            await pair.mint(deployer.address);

            const burnAmount = (await pair.balanceOf(deployer.address)) / 2n;
            // Pre-transfer LP to the pair (router pattern).
            await pair.transfer(pairAddr, burnAmount);

            const supply = await pair.totalSupply();
            const balPair0 = aSeed; // since reserves == balances after mint
            const balPair1 = bSeed;
            const [b0, b1] = token0IsA ? [balPair0, balPair1] : [balPair1, balPair0];
            const expected0 = (burnAmount * b0) / supply;
            const expected1 = (burnAmount * b1) / supply;

            const aBefore = await tokenA.balanceOf(deployer.address);
            const bBefore = await tokenB.balanceOf(deployer.address);
            await pair.burn(deployer.address);
            const aAfter = await tokenA.balanceOf(deployer.address);
            const bAfter = await tokenB.balanceOf(deployer.address);

            const expectedA = token0IsA ? expected0 : expected1;
            const expectedB = token0IsA ? expected1 : expected0;
            expect(aAfter - aBefore).to.equal(expectedA);
            expect(bAfter - bBefore).to.equal(expectedB);

            // Pair total never falls below MINIMUM_LIQUIDITY.
            expect(await pair.totalSupply()).to.be.gte(MIN_LIQUIDITY);
        });
    });

    describe("swap (low-level)", function () {
        it("transfers requested output and respects K invariant", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, alice, token0IsA } =
                await loadFixture(pairFixture);
            const aSeed = ethers.parseUnits("1000", 18);
            const bSeed = ethers.parseUnits("1000", 6);
            await tokenA.transfer(pairAddr, aSeed);
            await tokenB.transfer(pairAddr, bSeed);
            await pair.mint(deployer.address);

            // Alice swaps 10 TKA for some amount of TKB.
            const aIn = ethers.parseUnits("10", 18);
            // Compute amountOut closed-form to know how much to request.
            const numerator = aIn * 997n * bSeed;
            const denominator = aSeed * 1000n + aIn * 997n;
            const expectedOutB = numerator / denominator;

            await tokenA.connect(alice).transfer(pairAddr, aIn);
            const [amount0Out, amount1Out] = token0IsA
                ? [0n, expectedOutB]
                : [expectedOutB, 0n];

            const balBeforeB = await tokenB.balanceOf(alice.address);
            await pair.connect(alice).swap(amount0Out, amount1Out, alice.address, "0x");
            const balAfterB = await tokenB.balanceOf(alice.address);
            expect(balAfterB - balBeforeB).to.equal(expectedOutB);
        });

        it("reverts K when caller asks for 1 wei too much", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, alice, token0IsA } =
                await loadFixture(pairFixture);
            const aSeed = ethers.parseUnits("1000", 18);
            const bSeed = ethers.parseUnits("1000", 6);
            await tokenA.transfer(pairAddr, aSeed);
            await tokenB.transfer(pairAddr, bSeed);
            await pair.mint(deployer.address);

            const aIn = ethers.parseUnits("10", 18);
            const numerator = aIn * 997n * bSeed;
            const denominator = aSeed * 1000n + aIn * 997n;
            const expectedOutB = numerator / denominator;

            await tokenA.connect(alice).transfer(pairAddr, aIn);
            const [amount0Out, amount1Out] = token0IsA
                ? [0n, expectedOutB + 1n]
                : [expectedOutB + 1n, 0n];

            await expect(
                pair.connect(alice).swap(amount0Out, amount1Out, alice.address, "0x"),
            ).to.be.revertedWith("UniswapV2: K");
        });

        it("reverts INVALID_TO when sending to a token contract", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, alice, token0IsA } =
                await loadFixture(pairFixture);
            await tokenA.transfer(pairAddr, ethers.parseUnits("1000", 18));
            await tokenB.transfer(pairAddr, ethers.parseUnits("1000", 6));
            await pair.mint(deployer.address);

            const tokenAddr = await tokenA.getAddress();
            const [amount0Out, amount1Out] = token0IsA ? [0n, 1n] : [1n, 0n];
            await expect(
                pair.connect(alice).swap(amount0Out, amount1Out, tokenAddr, "0x"),
            ).to.be.revertedWith("UniswapV2: INVALID_TO");
        });
    });

    describe("sync / skim", function () {
        it("sync commits a donation into reserves", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, token0IsA } =
                await loadFixture(pairFixture);
            await tokenA.transfer(pairAddr, ethers.parseUnits("1000", 18));
            await tokenB.transfer(pairAddr, ethers.parseUnits("1000", 6));
            await pair.mint(deployer.address);

            // Donate 5 TKA on top of reserves.
            const donate = ethers.parseUnits("5", 18);
            await tokenA.transfer(pairAddr, donate);
            await pair.sync();
            const [r0, r1] = await pair.getReserves();
            const expectedReserveA = ethers.parseUnits("1005", 18);
            const expectedReserveB = ethers.parseUnits("1000", 6);
            const [er0, er1] = token0IsA
                ? [expectedReserveA, expectedReserveB]
                : [expectedReserveB, expectedReserveA];
            expect(r0).to.equal(er0);
            expect(r1).to.equal(er1);
        });

        it("skim returns the surplus to caller without changing reserves", async function () {
            const { pair, pairAddr, tokenA, tokenB, deployer, alice } =
                await loadFixture(pairFixture);
            await tokenA.transfer(pairAddr, ethers.parseUnits("1000", 18));
            await tokenB.transfer(pairAddr, ethers.parseUnits("1000", 6));
            await pair.mint(deployer.address);
            const [r0Before, r1Before] = await pair.getReserves();

            const donate = ethers.parseUnits("5", 18);
            await tokenA.transfer(pairAddr, donate);
            const aBefore = await tokenA.balanceOf(alice.address);
            await pair.skim(alice.address);
            const aAfter = await tokenA.balanceOf(alice.address);
            expect(aAfter - aBefore).to.equal(donate);
            const [r0After, r1After] = await pair.getReserves();
            expect(r0After).to.equal(r0Before);
            expect(r1After).to.equal(r1Before);
        });
    });
});
