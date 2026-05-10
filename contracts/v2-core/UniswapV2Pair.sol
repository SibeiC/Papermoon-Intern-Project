// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IUniswapV2Pair } from "./interfaces/IUniswapV2Pair.sol";
import { UniswapV2ERC20 } from "./UniswapV2ERC20.sol";

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
}

// @title UniswapV2Pair — constant-product AMM with 0.3% fee.
// @notice Deployed by UniswapV2Factory via CREATE2; tokens set once via
//         initialize(). Holds reserves (uint112 each) and a uint32 timestamp
//         in a single storage slot. Mint/burn/swap are low-level: the Router
//         is responsible for transferring tokens IN before calling, and the
//         Pair derives amounts from the resulting balance delta.
contract UniswapV2Pair is IUniswapV2Pair, UniswapV2ERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    address public factory;
    address public token0;
    address public token1;

    // Packed in one slot.
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    // TWAP cumulative prices; uint224 wraparound is load-bearing — see _update.
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    // Reserved for protocol-fee accounting; left at 0 since feeTo == address(0).
    uint256 public kLast;

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "UniswapV2: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
    }

    // Called by Factory once, immediately after CREATE2 deployment.
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "UniswapV2: FORBIDDEN");
        require(token0 == address(0), "UniswapV2: ALREADY_INITIALIZED");
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves()
        public
        view
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    // --- low-level mint/burn/swap (Router pulls tokens IN before calling) ---

    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            // Lock the first MINIMUM_LIQUIDITY of LP forever to prevent the
            // share-price-manipulation attack on a freshly drained pool.
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            uint256 liq0 = (amount0 * _totalSupply) / _reserve0;
            uint256 liq1 = (amount1 * _totalSupply) / _reserve1;
            liquidity = liq0 < liq1 ? liq0 : liq1;
        }
        require(liquidity > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20Minimal(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(_token1).balanceOf(address(this));
        // Caller (Router) pre-transferred its LP to this pair before calling burn.
        uint256 liquidity = balanceOf[address(this)];

        uint256 _totalSupply = totalSupply;
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(address(this), liquidity);
        _safeTransfer(_token0, to, amount0);
        _safeTransfer(_token1, to, amount1);

        balance0 = IERC20Minimal(_token0).balanceOf(address(this));
        balance1 = IERC20Minimal(_token1).balanceOf(address(this));
        _update(balance0, balance1, _reserve0, _reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    // Low-level swap: Router computes amount0Out/amount1Out (exactly one is nonzero
    // for a normal swap) and pre-transfers the input token in. We optimistically
    // send `to` the requested output, then enforce the K invariant *with fee*
    // against the actual balance deltas. Reverts if K shrinks.
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata // data — flash-swap callback omitted in v1
    ) external lock {
        require(amount0Out > 0 || amount1Out > 0, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        require(
            amount0Out < _reserve0 && amount1Out < _reserve1,
            "UniswapV2: INSUFFICIENT_LIQUIDITY"
        );

        uint256 balance0;
        uint256 balance1;
        {
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "UniswapV2: INVALID_TO");
            if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out);
            if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out);
            balance0 = IERC20Minimal(_token0).balanceOf(address(this));
            balance1 = IERC20Minimal(_token1).balanceOf(address(this));
        }

        uint256 amount0In = balance0 > _reserve0 - amount0Out
            ? balance0 - (_reserve0 - amount0Out)
            : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out
            ? balance1 - (_reserve1 - amount1Out)
            : 0;
        require(amount0In > 0 || amount1In > 0, "UniswapV2: INSUFFICIENT_INPUT_AMOUNT");

        // Fee-aware K invariant in the * 1000 scaled domain. The 0.3% fee is
        // deducted from inputs FOR THE CHECK ONLY — the fee stays in the pool.
        {
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require(
                balance0Adjusted * balance1Adjusted >=
                    uint256(_reserve0) * uint256(_reserve1) * (1000 ** 2),
                "UniswapV2: K"
            );
        }

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // Force balances to match reserves (donate any surplus to caller).
    function skim(address to) external lock {
        address _token0 = token0;
        address _token1 = token1;
        _safeTransfer(_token0, to, IERC20Minimal(_token0).balanceOf(address(this)) - reserve0);
        _safeTransfer(_token1, to, IERC20Minimal(_token1).balanceOf(address(this)) - reserve1);
    }

    // Force reserves to match balances (commit any donation into the pool).
    function sync() external lock {
        _update(
            IERC20Minimal(token0).balanceOf(address(this)),
            IERC20Minimal(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }

    // --- internals ---

    function _update(
        uint256 balance0,
        uint256 balance1,
        uint112 _reserve0,
        uint112 _reserve1
    ) private {
        require(
            balance0 <= type(uint112).max && balance1 <= type(uint112).max,
            "UniswapV2: OVERFLOW"
        );
        // V2 timestamp uses a uint32 (mod 2^32); wraps every ~136 years.
        // The unchecked block covers two intentional wraparounds:
        //   1. timeElapsed: after the timestamp wraps, the uint32 subtraction
        //      wraps too — which gives the correct elapsed time.
        //   2. price{0,1}CumulativeLast: uint256 (effective uint224) wraparound
        //      is load-bearing for TWAP — consumers reconstruct deltas mod 2^224.
        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        unchecked {
            uint32 timeElapsed = blockTimestamp - blockTimestampLast;
            if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
                price0CumulativeLast +=
                    uint256(_uqdiv(uint224(_reserve1), _reserve0)) *
                    timeElapsed;
                price1CumulativeLast +=
                    uint256(_uqdiv(uint224(_reserve0), _reserve1)) *
                    timeElapsed;
            }
        }
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    // UQ112.112: encode `y` as uint224 in the high 112 bits, divide by x.
    function _uqdiv(uint224 y, uint112 x) private pure returns (uint224) {
        return (y << 112) / x;
    }

    // Low-level transfer that handles non-standard ERC20s (USDT-style returns
    // no value). Accepts either no return or `true`.
    function _safeTransfer(address token, address to, uint256 value) private {
        // selector for transfer(address,uint256)
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, value)
        );
        require(
            ok && (data.length == 0 || abi.decode(data, (bool))),
            "UniswapV2: TRANSFER_FAILED"
        );
    }

    // Babylonian sqrt; same approach as SimpleCPAMM.
    function _sqrt(uint256 y) private pure returns (uint256 z) {
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
