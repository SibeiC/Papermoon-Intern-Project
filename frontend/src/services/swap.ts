import { parseUnits, formatUnits } from "viem";
import { readContract, writeContract, getAccount } from "wagmi/actions";
import type { Config } from "wagmi";

import type { Token } from "../types/token.ts";
import { ROUTER_ADDRESS } from "../contracts/addresses.ts";
import { UNISWAP_V2_ROUTER_ABI } from "../contracts/abis/UniswapV2Router.ts";
import { TEST_ERC20_ABI } from "../contracts/abis/TestERC20.ts";
import { buildSwapPath } from "../utils/path.ts";
import { NotImplementedError, rethrowFriendly } from "./errors.ts";

export interface SwapQuote {
    readonly amountOut: string;
    readonly priceImpactPct: number;
    readonly minReceived: string;
    readonly route: readonly Token[];
}

export interface SwapParams {
    readonly tokenIn: Token;
    readonly tokenOut: Token;
    readonly amountIn: string;
    readonly slippageBps: number;
}

const DEADLINE_SECONDS = 20 * 60; // 20 minutes
const MAX_UINT256 = (1n << 256n) - 1n;

function deadline(): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
}

function applySlippage(amount: bigint, bps: number): bigint {
    return (amount * (10000n - BigInt(bps))) / 10000n;
}

// Reads the on-chain getAmountsOut for the resolved path, returning a quote
// the UI can display before the user signs anything.
export async function getSwapQuote(config: Config, params: SwapParams): Promise<SwapQuote> {
    const { tokenIn, tokenOut, amountIn, slippageBps } = params;
    const path = buildSwapPath(tokenIn, tokenOut);
    const amountInRaw = parseUnits(amountIn, tokenIn.decimals);

    const amounts = (await readContract(config, {
        address: ROUTER_ADDRESS,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountInRaw, path],
    })) as readonly bigint[];

    const amountOutRaw = amounts[amounts.length - 1] ?? 0n;
    const minRaw = applySlippage(amountOutRaw, slippageBps);

    return {
        amountOut: formatUnits(amountOutRaw, tokenOut.decimals),
        // Real price-impact would compare effective price vs spot price for
        // each hop; left at 0 for v1 since the UI doesn't surface it numerically.
        priceImpactPct: 0,
        minReceived: formatUnits(minRaw, tokenOut.decimals),
        route: [tokenIn, tokenOut], // displayed only; actual hops are in `path`
    };
}

// Executes the swap. Branches on native-ETH involvement to pick the right
// Router function. Issues an approval first when needed.
export async function executeSwap(config: Config, params: SwapParams): Promise<string> {
    const { tokenIn, tokenOut, amountIn, slippageBps } = params;
    const account = getAccount(config);
    if (!account.address) throw new Error("Wallet not connected");

    const path = buildSwapPath(tokenIn, tokenOut);
    const amountInRaw = parseUnits(amountIn, tokenIn.decimals);

    // Pull the quote ourselves so the swap and the displayed amounts match.
    const amounts = (await readContract(config, {
        address: ROUTER_ADDRESS,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountInRaw, path],
    })) as readonly bigint[];
    const amountOutRaw = amounts[amounts.length - 1] ?? 0n;
    const amountOutMin = applySlippage(amountOutRaw, slippageBps);

    try {
        // ETH → ERC20 path: no approval, msg.value carries the input.
        if (tokenIn.isNative) {
            return await writeContract(config, {
                address: ROUTER_ADDRESS,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: "swapExactETHForTokens",
                args: [amountOutMin, path, account.address, deadline()],
                value: amountInRaw,
            });
        }

        // For ERC20 inputs, ensure the Router has allowance covering amountIn.
        await ensureAllowance(config, tokenIn.address, account.address, amountInRaw);

        // ERC20 → ETH path: final hop is router → unwrap → user.
        if (tokenOut.isNative) {
            return await writeContract(config, {
                address: ROUTER_ADDRESS,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: "swapExactTokensForETH",
                args: [amountInRaw, amountOutMin, path, account.address, deadline()],
            });
        }

        // Pure ERC20 → ERC20.
        return await writeContract(config, {
            address: ROUTER_ADDRESS,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [amountInRaw, amountOutMin, path, account.address, deadline()],
        });
    } catch (err) {
        rethrowFriendly(err);
    }
}

async function ensureAllowance(
    config: Config,
    token: `0x${string}`,
    owner: `0x${string}`,
    needed: bigint,
): Promise<void> {
    const current = (await readContract(config, {
        address: token,
        abi: TEST_ERC20_ABI,
        functionName: "allowance",
        args: [owner, ROUTER_ADDRESS],
    })) as bigint;
    if (current >= needed) return;
    // Always approve max so future swaps don't require a second signature.
    await writeContract(config, {
        address: token,
        abi: TEST_ERC20_ABI,
        functionName: "approve",
        args: [ROUTER_ADDRESS, MAX_UINT256],
    });
}

// Re-export so existing imports don't break if anyone imports it for catches.
export { NotImplementedError };
