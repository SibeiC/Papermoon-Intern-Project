const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployV2Fixture, sortTokens } = require("../helpers/v2-fixture");

describe("UniswapV2Factory", function () {
    describe("createPair", function () {
        it("deploys a pair and registers it both directions in getPair", async function () {
            const { factory, tokenA, tokenB } = await loadFixture(deployV2Fixture);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();

            await expect(factory.createPair(a, b)).to.emit(factory, "PairCreated");

            const pairAB = await factory.getPair(a, b);
            const pairBA = await factory.getPair(b, a);
            expect(pairAB).to.not.equal(ethers.ZeroAddress);
            expect(pairAB).to.equal(pairBA);
            expect(await factory.allPairsLength()).to.equal(1n);
            expect(await factory.allPairs(0)).to.equal(pairAB);
        });

        it("initializes the pair with sorted token0/token1", async function () {
            const { factory, tokenA, tokenB } = await loadFixture(deployV2Fixture);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            const [expectedToken0, expectedToken1] = sortTokens(a, b);

            await factory.createPair(a, b);
            const pair = await ethers.getContractAt(
                "UniswapV2Pair",
                await factory.getPair(a, b),
            );
            expect(await pair.token0()).to.equal(expectedToken0);
            expect(await pair.token1()).to.equal(expectedToken1);
            expect(await pair.factory()).to.equal(await factory.getAddress());
        });

        it("reverts IDENTICAL_ADDRESSES when both tokens are the same", async function () {
            const { factory, tokenA } = await loadFixture(deployV2Fixture);
            const a = await tokenA.getAddress();
            await expect(factory.createPair(a, a)).to.be.revertedWith(
                "UniswapV2: IDENTICAL_ADDRESSES",
            );
        });

        it("reverts ZERO_ADDRESS when one token is zero", async function () {
            const { factory, tokenA } = await loadFixture(deployV2Fixture);
            await expect(
                factory.createPair(ethers.ZeroAddress, await tokenA.getAddress()),
            ).to.be.revertedWith("UniswapV2: ZERO_ADDRESS");
        });

        it("reverts PAIR_EXISTS on duplicate creation", async function () {
            const { factory, tokenA, tokenB } = await loadFixture(deployV2Fixture);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            await factory.createPair(a, b);
            await expect(factory.createPair(a, b)).to.be.revertedWith("UniswapV2: PAIR_EXISTS");
            await expect(factory.createPair(b, a)).to.be.revertedWith("UniswapV2: PAIR_EXISTS");
        });
    });

    describe("CREATE2 determinism", function () {
        it("the deployed pair address matches the off-chain CREATE2 prediction", async function () {
            const { factory, tokenA, tokenB } = await loadFixture(deployV2Fixture);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            const [token0, token1] = sortTokens(a, b);

            // Compute the predicted address using ethers' getCreate2Address.
            // salt   = keccak256(abi.encodePacked(token0, token1))
            // hash   = keccak256(creationCode)
            const salt = ethers.solidityPackedKeccak256(
                ["address", "address"],
                [token0, token1],
            );
            const PairFactory = await ethers.getContractFactory("UniswapV2Pair");
            const initCodeHash = ethers.keccak256(PairFactory.bytecode);
            const predicted = ethers.getCreate2Address(
                await factory.getAddress(),
                salt,
                initCodeHash,
            );

            await factory.createPair(a, b);
            const actual = await factory.getPair(a, b);
            expect(actual.toLowerCase()).to.equal(predicted.toLowerCase());
        });

        it("two different factories produce different addresses for the same token pair", async function () {
            const { tokenA, tokenB, deployer } = await loadFixture(deployV2Fixture);
            const Factory = await ethers.getContractFactory("UniswapV2Factory");
            const f1 = await Factory.deploy(deployer.address);
            const f2 = await Factory.deploy(deployer.address);
            const a = await tokenA.getAddress();
            const b = await tokenB.getAddress();
            await f1.createPair(a, b);
            await f2.createPair(a, b);
            // Same salt + init code, different deployer => different CREATE2 address.
            expect(await f1.getPair(a, b)).to.not.equal(await f2.getPair(a, b));
        });
    });

    describe("feeToSetter admin", function () {
        it("only feeToSetter can call setFeeTo", async function () {
            const { factory, alice } = await loadFixture(deployV2Fixture);
            await expect(factory.connect(alice).setFeeTo(alice.address)).to.be.revertedWith(
                "UniswapV2: FORBIDDEN",
            );
        });

        it("only feeToSetter can transfer the role", async function () {
            const { factory, alice } = await loadFixture(deployV2Fixture);
            await expect(
                factory.connect(alice).setFeeToSetter(alice.address),
            ).to.be.revertedWith("UniswapV2: FORBIDDEN");
        });
    });
});
