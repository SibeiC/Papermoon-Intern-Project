import { useState } from "react";
import { formatUnits, parseEther } from "viem";
import { useAccount, useConfig } from "wagmi";
import { writeContract } from "wagmi/actions";
import { sepolia } from "wagmi/chains";
import { useQueryClient } from "@tanstack/react-query";

import TokenLogo from "../components/TokenLogo.tsx";
import { ADDRESSES } from "../contracts/addresses.ts";
import { TEST_ERC20_ABI } from "../contracts/abis/TestERC20.ts";
import { WETH_ABI } from "../contracts/abis/WETH.ts";
import { UserRejectedError, rethrowFriendly } from "../services/errors.ts";
import { awaitConfirmation } from "../utils/tx.ts";

type Phase = "idle" | "signing" | "confirming";

interface FaucetEntry {
    readonly symbol: string;
    readonly address: `0x${string}`;
    readonly decimals: number;
    readonly action:
        | { kind: "erc20-faucet"; amount: bigint }
        | { kind: "wrap-eth"; amount: bigint }
        | { kind: "owner-only" };
}

const WRAP_AMOUNT = parseEther("0.01");

function buildFaucetList(): readonly FaucetEntry[] {
    const out: FaucetEntry[] = [];
    for (const sym of Object.keys(ADDRESSES.tokens) as (keyof typeof ADDRESSES.tokens)[]) {
        const t = ADDRESSES.tokens[sym];
        if (t.mintMode === "faucet" && "faucetCap" in t) {
            out.push({
                symbol: sym,
                address: t.address as `0x${string}`,
                decimals: t.decimals,
                action: { kind: "erc20-faucet", amount: BigInt(t.faucetCap) },
            });
        } else if (t.mintMode === "wrap") {
            out.push({
                symbol: sym,
                address: t.address as `0x${string}`,
                decimals: t.decimals,
                action: { kind: "wrap-eth", amount: WRAP_AMOUNT },
            });
        } else {
            out.push({
                symbol: sym,
                address: t.address as `0x${string}`,
                decimals: t.decimals,
                action: { kind: "owner-only" },
            });
        }
    }
    return out;
}

export default function FaucetPage() {
    const config = useConfig();
    const queryClient = useQueryClient();
    const { isConnected, chainId } = useAccount();
    const onSepolia = chainId === sepolia.id;
    const [busy, setBusy] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [error, setError] = useState<string | null>(null);
    const [lastTx, setLastTx] = useState<string | null>(null);

    const entries = buildFaucetList();

    async function fire(entry: FaucetEntry): Promise<void> {
        setBusy(entry.symbol);
        setPhase("signing");
        setError(null);
        try {
            let hash: string;
            try {
                if (entry.action.kind === "erc20-faucet") {
                    hash = await writeContract(config, {
                        address: entry.address,
                        abi: TEST_ERC20_ABI,
                        functionName: "mint",
                        args: [entry.action.amount],
                    });
                } else if (entry.action.kind === "wrap-eth") {
                    hash = await writeContract(config, {
                        address: entry.address,
                        abi: WETH_ABI,
                        functionName: "deposit",
                        args: [],
                        value: entry.action.amount,
                    });
                } else {
                    throw new Error("Owner-only token");
                }
            } catch (e) {
                rethrowFriendly(e);
            }
            setLastTx(hash);
            setPhase("confirming");
            await awaitConfirmation(config, hash);
            // Refresh balances on the Swap/Pool pages too.
            await queryClient.invalidateQueries();
        } catch (e) {
            if (e instanceof UserRejectedError) setError(e.message);
            else setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
            setPhase("idle");
        }
    }

    return (
        <section style={{ animation: "fade-in 180ms ease-out" }}>
            <header className="mb-4">
                <h1 className="text-lg font-semibold text-white">Faucet</h1>
                <p className="text-xs text-slate-400">
                    Mint test tokens to your wallet so you can try the swap and pool flows.
                    Each call grants the per-call cap shown below.
                </p>
            </header>

            {!isConnected && (
                <div
                    role="status"
                    className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                    Connect your wallet to mint.
                </div>
            )}
            {isConnected && !onSepolia && (
                <div
                    role="status"
                    className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                    Switch to Sepolia to mint.
                </div>
            )}
            {error && (
                <div
                    role="alert"
                    className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                    {error}
                </div>
            )}
            {lastTx && (
                <div
                    role="status"
                    className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
                >
                    Submitted:{" "}
                    <a
                        href={`https://sepolia.etherscan.io/tx/${lastTx}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-mono underline-offset-2 hover:underline"
                    >
                        {lastTx.slice(0, 10)}…{lastTx.slice(-8)}
                    </a>
                </div>
            )}

            <ul className="grid gap-3 sm:grid-cols-2">
                {entries.map((e) => {
                    const disabled =
                        !isConnected ||
                        !onSepolia ||
                        busy !== null ||
                        e.action.kind === "owner-only";
                    let btnLabel: string;
                    if (e.action.kind === "owner-only") {
                        btnLabel = "Owner-only mint";
                    } else if (busy === e.symbol && phase === "signing") {
                        btnLabel = "Confirm in wallet…";
                    } else if (busy === e.symbol && phase === "confirming") {
                        btnLabel = "Confirming…";
                    } else if (e.action.kind === "wrap-eth") {
                        btnLabel = `Wrap ${formatUnits(e.action.amount, 18)} ETH`;
                    } else {
                        btnLabel = `Get ${formatUnits(e.action.amount, e.decimals)} ${e.symbol}`;
                    }

                    return (
                        <li
                            key={e.symbol}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
                        >
                            <span className="inline-flex items-center gap-3">
                                <TokenLogo
                                    token={{
                                        symbol: e.symbol,
                                        name: e.symbol,
                                        decimals: e.decimals,
                                        address: e.address,
                                    }}
                                    size={28}
                                />
                                <span>
                                    <span className="block text-sm font-semibold text-white">
                                        {e.symbol}
                                    </span>
                                    <span className="block text-xs text-slate-500 font-mono">
                                        {e.address.slice(0, 6)}…{e.address.slice(-4)}
                                    </span>
                                </span>
                            </span>
                            <button
                                type="button"
                                onClick={() => fire(e)}
                                disabled={disabled}
                                className="rounded-md bg-violet-500 hover:bg-violet-400 active:bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                            >
                                {btnLabel}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
