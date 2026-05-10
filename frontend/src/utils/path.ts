import type { Token } from "../types/token.ts";
import { findTokenBySymbol } from "../data/tokens.ts";

// Every seeded pair on Sepolia has SBC on one side, so any non-SBC ↔ non-SBC
// swap must route through SBC. A direct path is used only when one of the two
// tokens already IS SBC. The Router/Library reverts on missing pairs, so this
// function throws here for fast frontend feedback.
export function buildSwapPath(tokenIn: Token, tokenOut: Token): readonly `0x${string}`[] {
    if (
        tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase() &&
        tokenIn.symbol === tokenOut.symbol
    ) {
        throw new Error("Cannot swap a token for itself");
    }

    if (tokenIn.symbol === "SBC" || tokenOut.symbol === "SBC") {
        return [tokenIn.address, tokenOut.address];
    }

    const sbc = findTokenBySymbol("SBC");
    if (!sbc) throw new Error("SBC token missing from token list");
    return [tokenIn.address, sbc.address, tokenOut.address];
}
