import { useQuery } from "@tanstack/react-query";
import { useConfig } from "wagmi";

import TokenLogo from "../components/TokenLogo.tsx";
import { listPairs } from "../services/pairs.ts";

export default function PairsPage() {
    const config = useConfig();
    const {
        data: pairs,
        error,
        isLoading,
    } = useQuery({
        queryKey: ["pairs"],
        queryFn: () => listPairs(config),
        staleTime: 30_000, // re-fetch at most every 30s
    });

    return (
        <section style={{ animation: "fade-in 180ms ease-out" }}>
            <header className="mb-4 flex items-end justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-white">Pairs</h1>
                    <p className="text-xs text-slate-400">
                        All pools indexed by the V2 Factory on Sepolia
                    </p>
                </div>
                <span className="text-xs text-slate-500">
                    {pairs ? `${pairs.length} pairs` : "—"}
                </span>
            </header>

            {error && (
                <div
                    role="alert"
                    className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                    {error instanceof Error ? error.message : String(error)}
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
                <table className="w-full text-sm">
                    <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                            <th className="text-left px-4 py-2 font-medium">Token 0</th>
                            <th className="text-left px-4 py-2 font-medium">Token 1</th>
                            <th className="text-right px-4 py-2 font-medium">Reserve 0</th>
                            <th className="text-right px-4 py-2 font-medium">Reserve 1</th>
                            <th className="text-right px-4 py-2 font-medium">Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && !error && (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                                    Loading…
                                </td>
                            </tr>
                        )}
                        {pairs?.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                                    No pairs found.
                                </td>
                            </tr>
                        )}
                        {pairs?.map((p, i) => (
                            <tr
                                key={`${p.address}-${i}`}
                                className="border-t border-white/5 transition-colors duration-100 hover:bg-white/5"
                            >
                                <td className="px-4 py-2.5 font-medium text-white">
                                    <span className="inline-flex items-center gap-2">
                                        <TokenLogo token={p.token0} size={20} />
                                        <span>{p.token0.symbol}</span>
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 font-medium text-white">
                                    <span className="inline-flex items-center gap-2">
                                        <TokenLogo token={p.token1} size={20} />
                                        <span>{p.token1.symbol}</span>
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">
                                    {formatReserve(p.reserve0)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">
                                    {formatReserve(p.reserve1)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                                    {shortAddr(p.address)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function shortAddr(addr: string): string {
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Format a numeric string with thousands separators, preserving the exact
// fractional part (we never coerce through Number to avoid precision loss
// on token amounts that may exceed Number.MAX_SAFE_INTEGER).
function formatReserve(value: string): string {
    const [intPart = "0", fracPart] = value.split(".");
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return fracPart === undefined ? withCommas : `${withCommas}.${fracPart}`;
}
