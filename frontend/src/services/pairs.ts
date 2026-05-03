import type { Pair } from "../types/token.ts";
import { MOCK_PAIRS } from "../data/tokens.ts";

// TODO: replace with Factory.allPairsLength() + Factory.allPairs(i) reads,
// then call Pair.getReserves() on each. Cache aggressively.
export async function listPairs(): Promise<readonly Pair[]> {
    // Returning mock data so the page renders. Once the Factory is deployed,
    // this becomes a real on-chain read.
    return MOCK_PAIRS;
}
