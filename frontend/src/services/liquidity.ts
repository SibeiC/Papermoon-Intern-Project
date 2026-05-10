import { parseUnits } from "viem";
import { readContract, writeContract, getAccount } from "wagmi/actions";
import type { Config } from "wagmi";

import type { Token } from "../types/token.ts";
import { FACTORY_ADDRESS, ROUTER_ADDRESS } from "../contracts/addresses.ts";
import { UNISWAP_V2_FACTORY_ABI } from "../contracts/abis/UniswapV2Factory.ts";
import { UNISWAP_V2_ROUTER_ABI } from "../contracts/abis/UniswapV2Router.ts";
import { UNISWAP_V2_PAIR_ABI } from "../contracts/abis/UniswapV2Pair.ts";
import { TEST_ERC20_ABI } from "../contracts/abis/TestERC20.ts";
import { rethrowFriendly } from "./errors.ts";

export interface AddLiquidityParams {
    readonly tokenA: Token;
    readonly tokenB: Token;
    readonly amountA: string;
    readonly amountB: string;
    readonly slippageBps: number;
}

export interface RemoveLiquidityParams {
    readonly tokenA: Token;
    readonly tokenB: Token;
    readonly liquidity: string;
    readonly slippageBps: number;
}

const DEADLINE_SECONDS = 20 * 60;
const MAX_UINT256 = (1n << 256n) - 1n;

function deadline(): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
}

function applySlippage(amount: bigint, bps: number): bigint {
    return (amount * (10000n - BigInt(bps))) / 10000n;
}

// Pulls both tokens to the pair (or wraps ETH on one side via addLiquidityETH)
// and mints LP to the user. Auto-creates the pair if it doesn't exist.
export async function addLiquidity(
    config: Config,
    params: AddLiquidityParams,
): Promise<string> {
    const { tokenA, tokenB, amountA, amountB, slippageBps } = params;
    const account = getAccount(config);
    if (!account.address) throw new Error("Wallet not connected");

    const aRaw = parseUnits(amountA, tokenA.decimals);
    const bRaw = parseUnits(amountB, tokenB.decimals);
    const aMin = applySlippage(aRaw, slippageBps);
    const bMin = applySlippage(bRaw, slippageBps);

    try {
        // Native ETH on either side routes through addLiquidityETH; the other
        // side becomes the "token" arg.
        if (tokenA.isNative) {
            await ensureAllowance(config, tokenB.address, account.address, bRaw);
            return await writeContract(config, {
                address: ROUTER_ADDRESS,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: "addLiquidityETH",
                args: [tokenB.address, bRaw, bMin, aMin, account.address, deadline()],
                value: aRaw,
            });
        }
        if (tokenB.isNative) {
            await ensureAllowance(config, tokenA.address, account.address, aRaw);
            return await writeContract(config, {
                address: ROUTER_ADDRESS,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: "addLiquidityETH",
                args: [tokenA.address, aRaw, aMin, bMin, account.address, deadline()],
                value: bRaw,
            });
        }

        // Pure ERC20 / ERC20.
        await ensureAllowance(config, tokenA.address, account.address, aRaw);
        await ensureAllowance(config, tokenB.address, account.address, bRaw);
        return await writeContract(config, {
            address: ROUTER_ADDRESS,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: "addLiquidity",
            args: [
                tokenA.address,
                tokenB.address,
                aRaw,
                bRaw,
                aMin,
                bMin,
                account.address,
                deadline(),
            ],
        });
    } catch (err) {
        rethrowFriendly(err);
    }
}

// Burns LP for proportional share of both reserves. Uses the ETH-variant if
// either token is native (so the user gets ETH not WETH back). The expected
// output amounts are derived from the live reserves and total supply, then
// reduced by slippageBps to set the on-chain minimums.
export async function removeLiquidity(
    config: Config,
    params: RemoveLiquidityParams,
): Promise<string> {
    const { tokenA, tokenB, liquidity, slippageBps } = params;
    const account = getAccount(config);
    if (!account.address) throw new Error("Wallet not connected");

    // LP token is 18-decimal regardless of underlying.
    const liqRaw = parseUnits(liquidity, 18);

    const pairAddress = (await readContract(config, {
        address: FACTORY_ADDRESS,
        abi: UNISWAP_V2_FACTORY_ABI,
        functionName: "getPair",
        args: [tokenA.address, tokenB.address],
    })) as `0x${string}`;
    if (!pairAddress || pairAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error("Pair does not exist for this token combination");
    }

    // Compute expected output amounts so we can set tight, slippage-aware
    // minimums on the burn. Reads reserves + totalSupply + token0 in parallel.
    const [reservesTuple, totalSupplyRaw, token0Addr] = (await Promise.all([
        readContract(config, {
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves",
        }),
        readContract(config, {
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "totalSupply",
        }),
        readContract(config, {
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token0",
        }),
    ])) as [readonly [bigint, bigint, number], bigint, `0x${string}`];

    const [reserve0, reserve1] = reservesTuple;
    if (totalSupplyRaw === 0n) throw new Error("Pool is empty");
    const tokenAIsToken0 = tokenA.address.toLowerCase() === token0Addr.toLowerCase();
    const reserveA = tokenAIsToken0 ? reserve0 : reserve1;
    const reserveB = tokenAIsToken0 ? reserve1 : reserve0;
    const expectedA = (liqRaw * reserveA) / totalSupplyRaw;
    const expectedB = (liqRaw * reserveB) / totalSupplyRaw;
    const aMin = applySlippage(expectedA, slippageBps);
    const bMin = applySlippage(expectedB, slippageBps);

    try {
        // Approve the Router to pull the LP token.
        const lpAllowance = (await readContract(config, {
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "allowance",
            args: [account.address, ROUTER_ADDRESS],
        })) as bigint;
        if (lpAllowance < liqRaw) {
            await writeContract(config, {
                address: pairAddress,
                abi: UNISWAP_V2_PAIR_ABI,
                functionName: "approve",
                args: [ROUTER_ADDRESS, MAX_UINT256],
            });
        }

        if (tokenA.isNative) {
            return await writeContract(config, {
                address: ROUTER_ADDRESS,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: "removeLiquidityETH",
                args: [tokenB.address, liqRaw, bMin, aMin, account.address, deadline()],
            });
        }
        if (tokenB.isNative) {
            return await writeContract(config, {
                address: ROUTER_ADDRESS,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: "removeLiquidityETH",
                args: [tokenA.address, liqRaw, aMin, bMin, account.address, deadline()],
            });
        }
        return await writeContract(config, {
            address: ROUTER_ADDRESS,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: "removeLiquidity",
            args: [
                tokenA.address,
                tokenB.address,
                liqRaw,
                aMin,
                bMin,
                account.address,
                deadline(),
            ],
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
    await writeContract(config, {
        address: token,
        abi: TEST_ERC20_ABI,
        functionName: "approve",
        args: [ROUTER_ADDRESS, MAX_UINT256],
    });
}
