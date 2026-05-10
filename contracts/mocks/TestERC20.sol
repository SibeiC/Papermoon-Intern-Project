// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

// @title TestERC20 — configurable ERC-20 with a public capped faucet and an
//        owner-only uncapped mint for liquidity seeding.
// @notice Two minting paths intentional:
//          - `mint(amount)` is callable by anyone, capped by `mintCap` per call,
//            so any visitor can grab test balances without having to ask.
//          - `mintTo(to, amount)` is owner-only, uncapped, so the deploy script
//            can seed pool liquidity without looping the faucet.
//        Used for USDT / USDC / BTC mocks. SBC stays on its existing
//        owner-only `erc20.sol` SibeiCoin contract, which is already deployed.
contract TestERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public immutable mintCap;
    address public immutable owner;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 mintCap_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        mintCap = mintCap_;
        owner = msg.sender;
    }

    // --- minting ---

    // Public faucet, capped per call. No per-address rate-limit beyond the cap;
    // adequate for a Sepolia demo.
    function mint(uint256 amount) external {
        require(amount > 0 && amount <= mintCap, "TestERC20: AMOUNT");
        _mint(msg.sender, amount);
    }

    // Owner-only mint without the per-call cap, for liquidity seeding.
    function mintTo(address to, uint256 amount) external {
        require(msg.sender == owner, "TestERC20: NOT_OWNER");
        require(amount > 0, "TestERC20: AMOUNT");
        _mint(to, amount);
    }

    // --- ERC-20 surface ---

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= value;
        }
        _transfer(from, to, value);
        return true;
    }

    // --- internals ---

    function _mint(address to, uint256 value) private {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _transfer(address from, address to, uint256 value) private {
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
