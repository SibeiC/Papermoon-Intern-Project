export interface Token {
    readonly symbol: string;
    readonly name: string;
    readonly decimals: number;
    readonly address: `0x${string}`;
}

export interface Pair {
    readonly address: `0x${string}`;
    readonly token0: Token;
    readonly token1: Token;
    readonly reserve0: string;
    readonly reserve1: string;
}
