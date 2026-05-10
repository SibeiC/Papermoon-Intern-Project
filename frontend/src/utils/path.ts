import type { Token } from "../types/token.ts";
import { TOKENS, findTokenBySymbol } from "../data/tokens.ts";

// Returns every token symbol that shares the same on-chain address as the
// given token. Used by the swap/pool token selectors to disable both ETH and
// WETH on the opposite side: they're different UI entries (native vs wrapped)
// but the Router would route them through the same address, producing a
// nonsense path like [WETH, SBC, WETH].
export function aliasSymbols(token: Token): readonly string[] {
    const addr = token.address.toLowerCase();
    return TOKENS.filter((t) => t.address.toLowerCase() === addr).map((t) => t.symbol);
}

// Every seeded pair on Sepolia has SBC on one side, so any non-SBC ↔ non-SBC
// swap must route through SBC. A direct path is used only when one of the two
// tokens already IS SBC. The Router/Library reverts on missing pairs, so this
// function throws here for fast frontend feedback.
export function buildSwapPath(tokenIn: Token, tokenOut: Token): readonly `0x${string}`[] {
    if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
        // Catches both `same token twice` AND the ETH↔WETH alias case (same
        // address, different symbols) — neither is a real swap. Wrapping is
        // available on the Faucet page.
        throw new Error("Pick two different tokens (ETH and WETH share an address — wrap on the Faucet page).");
    }

    if (tokenIn.symbol === "SBC" || tokenOut.symbol === "SBC") {
        return [tokenIn.address, tokenOut.address];
    }

    const sbc = findTokenBySymbol("SBC");
    if (!sbc) throw new Error("SBC token missing from token list");
    return [tokenIn.address, sbc.address, tokenOut.address];
}
