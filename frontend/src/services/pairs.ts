import { formatUnits } from "viem";
import { readContract, readContracts } from "wagmi/actions";
import type { Config } from "wagmi";

import type { Pair, Token } from "../types/token.ts";
import { FACTORY_ADDRESS } from "../contracts/addresses.ts";
import { UNISWAP_V2_FACTORY_ABI } from "../contracts/abis/UniswapV2Factory.ts";
import { UNISWAP_V2_PAIR_ABI } from "../contracts/abis/UniswapV2Pair.ts";
import { TEST_ERC20_ABI } from "../contracts/abis/TestERC20.ts";
import { TOKENS } from "../data/tokens.ts";

// Resolve a known token by lowercased address. WETH and ETH share the address;
// pair listings should display "WETH" since that's the on-chain truth.
function resolveToken(addr: string): Token | undefined {
    const lower = addr.toLowerCase();
    return TOKENS.find((t) => !t.isNative && t.address.toLowerCase() === lower);
}

async function fetchUnknownTokenMeta(config: Config, addr: `0x${string}`): Promise<Token> {
    const [name, symbol, decimals] = (await Promise.all([
        readContract(config, {
            address: addr,
            abi: TEST_ERC20_ABI,
            functionName: "name",
        }),
        readContract(config, {
            address: addr,
            abi: TEST_ERC20_ABI,
            functionName: "symbol",
        }),
        readContract(config, {
            address: addr,
            abi: TEST_ERC20_ABI,
            functionName: "decimals",
        }),
    ])) as [string, string, number];
    return { address: addr, name, symbol, decimals };
}

// Reads every registered pair from the factory and returns them with reserves.
// Uses readContracts to batch reads — wagmi handles the request multiplexing.
export async function listPairs(config: Config): Promise<readonly Pair[]> {
    const length = (await readContract(config, {
        address: FACTORY_ADDRESS,
        abi: UNISWAP_V2_FACTORY_ABI,
        functionName: "allPairsLength",
    })) as bigint;

    if (length === 0n) return [];

    const indices = Array.from({ length: Number(length) }, (_, i) => BigInt(i));

    const pairAddrResults = await readContracts(config, {
        contracts: indices.map((i) => ({
            address: FACTORY_ADDRESS,
            abi: UNISWAP_V2_FACTORY_ABI,
            functionName: "allPairs" as const,
            args: [i] as const,
        })),
    });

    const pairAddresses = pairAddrResults
        .map((r) => (r.status === "success" ? (r.result as `0x${string}`) : null))
        .filter((a): a is `0x${string}` => !!a);

    if (pairAddresses.length === 0) return [];

    // Three reads per pair: token0, token1, getReserves.
    const detailReads = pairAddresses.flatMap((addr) => [
        {
            address: addr,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token0" as const,
        },
        {
            address: addr,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token1" as const,
        },
        {
            address: addr,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves" as const,
        },
    ]);
    const detailResults = await readContracts(config, { contracts: detailReads });

    const pairs: Pair[] = [];
    for (let i = 0; i < pairAddresses.length; i++) {
        const pairAddr = pairAddresses[i]!;
        const t0Result = detailResults[i * 3];
        const t1Result = detailResults[i * 3 + 1];
        const reservesResult = detailResults[i * 3 + 2];
        if (
            !t0Result ||
            !t1Result ||
            !reservesResult ||
            t0Result.status !== "success" ||
            t1Result.status !== "success" ||
            reservesResult.status !== "success"
        ) {
            continue;
        }

        const token0Addr = t0Result.result as `0x${string}`;
        const token1Addr = t1Result.result as `0x${string}`;
        const reservesTuple = reservesResult.result as readonly [bigint, bigint, number];

        let token0 = resolveToken(token0Addr);
        let token1 = resolveToken(token1Addr);
        if (!token0) token0 = await fetchUnknownTokenMeta(config, token0Addr);
        if (!token1) token1 = await fetchUnknownTokenMeta(config, token1Addr);

        pairs.push({
            address: pairAddr,
            token0,
            token1,
            reserve0: formatUnits(reservesTuple[0], token0.decimals),
            reserve1: formatUnits(reservesTuple[1], token1.decimals),
        });
    }

    return pairs;
}
