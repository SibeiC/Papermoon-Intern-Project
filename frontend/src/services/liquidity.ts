import type { Token } from "../types/token.ts";
import { NotImplementedError } from "./errors.ts";

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

// TODO: call Router.addLiquidity(...) — the periphery handles pair creation
// via Factory.createPair when the pool does not yet exist.
export async function addLiquidity(_params: AddLiquidityParams): Promise<string> {
    throw new NotImplementedError("addLiquidity");
}

// TODO: call Router.removeLiquidity(...) after LP-token approval.
export async function removeLiquidity(_params: RemoveLiquidityParams): Promise<string> {
    throw new NotImplementedError("removeLiquidity");
}
