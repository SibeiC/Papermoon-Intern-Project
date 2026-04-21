// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Reference: https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol
// @title SimpleCPAMM - A Uniswap V2 style constant-product AMM (x * y = k) with 0.3% fee.
// @author Sibei Chen
// @notice Pairs two ERC20s (token0 / token1). The contract itself is the LP token:
//         adding liquidity mints SCPAMM-LP to the provider, removing liquidity burns it.
//         Deployment is empty — the first addLiquidity call bootstraps the pool.

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

contract SimpleCPAMM {
    // --- LP token metadata (the AMM contract IS the LP token) ---
    string public constant name = "SimpleCPAMM LP";
    string public constant symbol = "SCPAMM-LP";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // --- Pool state ---
    address public immutable token0; // SibeiCoin (or any ERC20)
    address public immutable token1; // WETH
    uint256 public reserve0;
    uint256 public reserve1;

    // Lock a tiny amount of LP forever so totalSupply can never return to zero
    // after the first deposit. Prevents the "donate to manipulate share price" attack.
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // 0.3% fee: amountIn * 997 / 1000 is the "effective" input for price calc.
    uint256 private constant FEE_NUMERATOR = 997;
    uint256 private constant FEE_DENOMINATOR = 1000;

    // Simple reentrancy guard
    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(
        address indexed sender,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity,
        address indexed to
    );
    event Swap(
        address indexed sender,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        address indexed to
    );
    event Sync(uint256 reserve0, uint256 reserve1);

    // Deployment is empty: first addLiquidity bootstraps the pool (Uniswap V2 pattern).
    constructor(address _token0, address _token1) {
        require(_token0 != address(0) && _token1 != address(0), "ZERO_ADDRESS");
        require(_token0 != _token1, "IDENTICAL_TOKENS");
        token0 = _token0;
        token1 = _token1;
    }

    // Preview the output of a swap without executing it.
    function getAmountOut(address tokenIn, uint256 amountIn) public view returns (uint256) {
        require(tokenIn == token0 || tokenIn == token1, "INVALID_TOKEN");
        require(amountIn > 0, "INSUFFICIENT_INPUT");
        (uint256 reserveIn, uint256 reserveOut) = tokenIn == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        return (amountInWithFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    // Add liquidity. Caller must approve both tokens beforehand. For deposits after
    // the first, the provider MUST supply the two tokens in the current pool ratio --
    // any excess on one side is effectively donated (LP minted = min of two sides).
    function addLiquidity(
        uint256 amount0,
        uint256 amount1
    ) external lock returns (uint256 liquidity) {
        require(amount0 > 0 && amount1 > 0, "INSUFFICIENT_AMOUNT");

        if (totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            uint256 liq0 = (amount0 * totalSupply) / reserve0;
            uint256 liq1 = (amount1 * totalSupply) / reserve1;
            liquidity = liq0 < liq1 ? liq0 : liq1;
        }
        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");

        require(IERC20(token0).transferFrom(msg.sender, address(this), amount0), "T0_PULL_FAILED");
        require(IERC20(token1).transferFrom(msg.sender, address(this), amount1), "T1_PULL_FAILED");

        _mint(msg.sender, liquidity);
        reserve0 += amount0;
        reserve1 += amount1;
        emit Sync(reserve0, reserve1);
        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    // Burn LP and receive pro-rata share of both reserves.
    function removeLiquidity(
        uint256 liquidity
    ) external lock returns (uint256 amount0, uint256 amount1) {
        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY");
        require(balanceOf[msg.sender] >= liquidity, "INSUFFICIENT_LP_BALANCE");

        amount0 = (liquidity * reserve0) / totalSupply;
        amount1 = (liquidity * reserve1) / totalSupply;
        require(amount0 > 0 && amount1 > 0, "INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(msg.sender, liquidity);
        reserve0 -= amount0;
        reserve1 -= amount1;

        require(IERC20(token0).transfer(msg.sender, amount0), "T0_SEND_FAILED");
        require(IERC20(token1).transfer(msg.sender, amount1), "T1_SEND_FAILED");

        emit Sync(reserve0, reserve1);
        emit Burn(msg.sender, amount0, amount1, liquidity, msg.sender);
    }

    // Swap exact `amountIn` of `tokenIn` for as much of the other token as possible.
    // Reverts if output would be below `minAmountOut` (slippage protection).
    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut
    ) external lock returns (uint256 amountOut) {
        require(tokenIn == token0 || tokenIn == token1, "INVALID_TOKEN");
        require(amountIn > 0, "INSUFFICIENT_INPUT");

        bool isToken0In = tokenIn == token0;
        (uint256 reserveIn, uint256 reserveOut) = isToken0In
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
        address tokenOut = isToken0In ? token1 : token0;

        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        amountOut =
            (amountInWithFee * reserveOut) /
            (reserveIn * FEE_DENOMINATOR + amountInWithFee);
        require(amountOut >= minAmountOut, "SLIPPAGE_EXCEEDED");
        require(amountOut > 0 && amountOut < reserveOut, "INSUFFICIENT_LIQUIDITY");

        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "TIN_FAILED");
        require(IERC20(tokenOut).transfer(msg.sender, amountOut), "TOUT_FAILED");

        if (isToken0In) {
            reserve0 += amountIn;
            reserve1 -= amountOut;
        } else {
            reserve1 += amountIn;
            reserve0 -= amountOut;
        }
        emit Sync(reserve0, reserve1);
        emit Swap(msg.sender, tokenIn, amountIn, amountOut, msg.sender);
    }

    // --- ERC20 LP token internals ---
    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= value;
        }
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }

    // Babylonian sqrt -- same approach as Uniswap V2.
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
