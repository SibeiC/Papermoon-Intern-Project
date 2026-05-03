import type { Pair, Token } from "../types/token.ts";

// Placeholder addresses — will be replaced once contracts are deployed.
// We use distinct fake addresses so React keys stay stable and so wiring the
// real Factory.getPair lookups later only requires editing this file.
function placeholder(suffix: number): `0x${string}` {
    const body = suffix.toString(16).padStart(40, "0");
    return `0x${body}` as `0x${string}`;
}

export const TOKENS: readonly Token[] = [
    { symbol: "SBC", name: "SibeiCoin", decimals: 18, address: placeholder(0x01) },
    { symbol: "ETH", name: "Ether", decimals: 18, address: placeholder(0x02) },
    { symbol: "WETH", name: "Wrapped Ether", decimals: 18, address: placeholder(0x03) },
    { symbol: "BTC", name: "Bitcoin", decimals: 8, address: placeholder(0x04) },
    { symbol: "USDT", name: "Tether USD", decimals: 6, address: placeholder(0x05) },
    { symbol: "USDC", name: "USD Coin", decimals: 6, address: placeholder(0x06) },
] as const;

export function findTokenBySymbol(symbol: string): Token | undefined {
    return TOKENS.find((t) => t.symbol === symbol);
}

// Mock pair data so the Pairs page renders something. Replace with real
// Factory.allPairs() reads when contracts are wired up.
export const MOCK_PAIRS: readonly Pair[] = [
    {
        address: placeholder(0x101),
        token0: TOKENS[2]!, // WETH
        token1: TOKENS[5]!, // USDC
        reserve0: "1250.45",
        reserve1: "4125300.12",
    },
    {
        address: placeholder(0x102),
        token0: TOKENS[2]!, // WETH
        token1: TOKENS[3]!, // BTC
        reserve0: "842.10",
        reserve1: "32.7",
    },
    {
        address: placeholder(0x103),
        token0: TOKENS[5]!, // USDC
        token1: TOKENS[4]!, // USDT
        reserve0: "2010500.00",
        reserve1: "2009870.20",
    },
    {
        address: placeholder(0x104),
        token0: TOKENS[0]!, // SBC
        token1: TOKENS[2]!, // WETH
        reserve0: "9500000.00",
        reserve1: "12.5",
    },
] as const;
