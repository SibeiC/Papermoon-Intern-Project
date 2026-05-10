import type { Token } from "../types/token.ts";
import { ADDRESSES, WETH_ADDRESS } from "../contracts/addresses.ts";

// All addresses come from the deployment manifest. ETH is a UI-level token
// that lives at the WETH address but is flagged native — the service layer
// uses that flag to pick the ETH-variant Router functions.
export const TOKENS: readonly Token[] = [
    {
        symbol: "SBC",
        name: ADDRESSES.tokens.SBC.name,
        decimals: ADDRESSES.tokens.SBC.decimals,
        address: ADDRESSES.tokens.SBC.address as `0x${string}`,
    },
    {
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        address: WETH_ADDRESS,
        isNative: true,
    },
    {
        symbol: "WETH",
        name: ADDRESSES.tokens.WETH.name,
        decimals: ADDRESSES.tokens.WETH.decimals,
        address: WETH_ADDRESS,
    },
    {
        symbol: "BTC",
        name: ADDRESSES.tokens.BTC.name,
        decimals: ADDRESSES.tokens.BTC.decimals,
        address: ADDRESSES.tokens.BTC.address as `0x${string}`,
    },
    {
        symbol: "USDT",
        name: ADDRESSES.tokens.USDT.name,
        decimals: ADDRESSES.tokens.USDT.decimals,
        address: ADDRESSES.tokens.USDT.address as `0x${string}`,
    },
    {
        symbol: "USDC",
        name: ADDRESSES.tokens.USDC.name,
        decimals: ADDRESSES.tokens.USDC.decimals,
        address: ADDRESSES.tokens.USDC.address as `0x${string}`,
    },
] as const;

export function findTokenBySymbol(symbol: string): Token | undefined {
    return TOKENS.find((t) => t.symbol === symbol);
}
