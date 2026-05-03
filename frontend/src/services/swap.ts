import type { Token } from "../types/token.ts";
import { NotImplementedError } from "./errors.ts";

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

// TODO: read reserves from Pair contract via Factory.getPair(tokenA, tokenB)
// and apply the constant-product formula to compute amountOut.
export async function getSwapQuote(_params: SwapParams): Promise<SwapQuote> {
    throw new NotImplementedError("getSwapQuote");
}

// TODO: call Router.swapExactTokensForTokens (or ETH variant) with deadline.
export async function executeSwap(_params: SwapParams): Promise<string> {
    throw new NotImplementedError("executeSwap");
}
