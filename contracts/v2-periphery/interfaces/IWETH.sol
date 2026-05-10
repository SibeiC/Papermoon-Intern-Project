// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

// WETH9 surface needed by the Router for ETH wrap/unwrap.
interface IWETH {
    function deposit() external payable;

    function withdraw(uint256 amount) external;

    function transfer(address to, uint256 value) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 value) external returns (bool);
}
