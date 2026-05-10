const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("TestERC20", function () {
    async function deployFixture() {
        const [deployer, alice] = await ethers.getSigners();
        const TestERC20 = await ethers.getContractFactory("TestERC20");
        // Cap = 1000 TKN with 18dp.
        const token = await TestERC20.deploy(
            "Test Token",
            "TKN",
            18,
            ethers.parseUnits("1000", 18),
        );
        return { token, deployer, alice };
    }

    describe("metadata", function () {
        it("exposes name/symbol/decimals/cap as set in the constructor", async function () {
            const { token } = await loadFixture(deployFixture);
            expect(await token.name()).to.equal("Test Token");
            expect(await token.symbol()).to.equal("TKN");
            expect(await token.decimals()).to.equal(18);
            expect(await token.mintCap()).to.equal(ethers.parseUnits("1000", 18));
        });
    });

    describe("public faucet mint(amount)", function () {
        it("mints up to the cap", async function () {
            const { token, alice } = await loadFixture(deployFixture);
            await token.connect(alice).mint(ethers.parseUnits("1000", 18));
            expect(await token.balanceOf(alice.address)).to.equal(
                ethers.parseUnits("1000", 18),
            );
        });

        it("reverts AMOUNT when above the cap", async function () {
            const { token, alice } = await loadFixture(deployFixture);
            await expect(
                token.connect(alice).mint(ethers.parseUnits("1001", 18)),
            ).to.be.revertedWith("TestERC20: AMOUNT");
        });

        it("reverts AMOUNT when zero", async function () {
            const { token, alice } = await loadFixture(deployFixture);
            await expect(token.connect(alice).mint(0)).to.be.revertedWith("TestERC20: AMOUNT");
        });

        it("multiple users can mint independently", async function () {
            const { token, deployer, alice } = await loadFixture(deployFixture);
            const amt = ethers.parseUnits("500", 18);
            await token.connect(alice).mint(amt);
            await token.connect(deployer).mint(amt);
            expect(await token.balanceOf(alice.address)).to.equal(amt);
            expect(await token.balanceOf(deployer.address)).to.equal(amt);
        });
    });

    describe("owner-only mintTo(address, amount)", function () {
        it("lets the owner mint above the cap", async function () {
            const { token, deployer, alice } = await loadFixture(deployFixture);
            const big = ethers.parseUnits("1000000", 18);
            await token.connect(deployer).mintTo(alice.address, big);
            expect(await token.balanceOf(alice.address)).to.equal(big);
        });

        it("reverts NOT_OWNER for non-owners", async function () {
            const { token, alice } = await loadFixture(deployFixture);
            await expect(
                token
                    .connect(alice)
                    .mintTo(alice.address, ethers.parseUnits("1000", 18)),
            ).to.be.revertedWith("TestERC20: NOT_OWNER");
        });
    });
});
