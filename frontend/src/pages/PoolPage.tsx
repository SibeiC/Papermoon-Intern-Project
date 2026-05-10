import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useQueryClient } from "@tanstack/react-query";

import Card from "../components/Card.tsx";
import SlippageControl, { DEFAULT_AUTO_BPS } from "../components/SlippageControl.tsx";
import TokenInput from "../components/TokenInput.tsx";
import TokenSelect from "../components/TokenSelect.tsx";
import { TOKENS } from "../data/tokens.ts";
import { FACTORY_ADDRESS } from "../contracts/addresses.ts";
import { UNISWAP_V2_FACTORY_ABI } from "../contracts/abis/UniswapV2Factory.ts";
import { UNISWAP_V2_PAIR_ABI } from "../contracts/abis/UniswapV2Pair.ts";
import { addLiquidity, removeLiquidity } from "../services/liquidity.ts";
import { UserRejectedError } from "../services/errors.ts";
import { isPositiveAmount, sanitizeAmountInput } from "../utils/amount.ts";
import { aliasSymbols } from "../utils/path.ts";
import { awaitConfirmation } from "../utils/tx.ts";
import type { Token } from "../types/token.ts";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

type Mode = "add" | "remove";
type Phase = "idle" | "signing" | "confirming";

const DEFAULT_A: Token = TOKENS[0]!; // SBC (every pool seeded on Sepolia is SBC-paired)
const DEFAULT_B: Token = TOKENS[5]!; // USDC

export default function PoolPage() {
    const config = useConfig();
    const queryClient = useQueryClient();
    const { isConnected, chainId } = useAccount();
    const onSepolia = chainId === sepolia.id;

    const [mode, setMode] = useState<Mode>("add");
    const [tokenA, setTokenA] = useState<Token>(DEFAULT_A);
    const [tokenB, setTokenB] = useState<Token>(DEFAULT_B);
    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    // Tracks which side the user last typed in. The opposite side is
    // auto-populated from the pool ratio on every reserve/token change.
    const [lastEdited, setLastEdited] = useState<"A" | "B" | null>(null);
    const [liquidity, setLiquidity] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const pending = phase !== "idle";

    const [slippageBps, setSlippageBps] = useState(DEFAULT_AUTO_BPS);

    // --- pair / reserve reads (Add mode only) ---------------------------------

    const differentTokens = tokenA.symbol !== tokenB.symbol;
    const pairLookupEnabled = mode === "add" && differentTokens;

    const { data: pairAddrRaw } = useReadContract({
        address: FACTORY_ADDRESS,
        abi: UNISWAP_V2_FACTORY_ABI,
        functionName: "getPair",
        args: [tokenA.address, tokenB.address],
        query: { enabled: pairLookupEnabled },
    });
    const pairAddress =
        typeof pairAddrRaw === "string" && pairAddrRaw !== ZERO_ADDR
            ? (pairAddrRaw as `0x${string}`)
            : null;
    const pairExists = pairAddress !== null;

    const { data: reservesData } = useReadContract({
        address: pairAddress ?? ZERO_ADDR,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: "getReserves",
        query: { enabled: pairLookupEnabled && pairExists },
    });
    const { data: token0Addr } = useReadContract({
        address: pairAddress ?? ZERO_ADDR,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: "token0",
        query: { enabled: pairLookupEnabled && pairExists },
    });

    // Resolve reserves into the caller's (A, B) order. null means "can't
    // auto-populate yet" — the user has to provide both sides freely.
    const reserves = useMemo<{ a: bigint; b: bigint } | null>(() => {
        if (!reservesData || !token0Addr) return null;
        const tuple = reservesData as readonly [bigint, bigint, number];
        const [r0, r1] = tuple;
        if (r0 === 0n || r1 === 0n) return null;
        const aIs0 = tokenA.address.toLowerCase() === (token0Addr as string).toLowerCase();
        return aIs0 ? { a: r0, b: r1 } : { a: r1, b: r0 };
    }, [reservesData, token0Addr, tokenA.address]);

    const canAutoPopulate = pairLookupEnabled && pairExists && reserves !== null;

    function quoteOther(
        srcAmount: string,
        srcDecimals: number,
        dstDecimals: number,
        srcReserve: bigint,
        dstReserve: bigint,
    ): string {
        if (!isPositiveAmount(srcAmount)) return "";
        const srcRaw = parseUnits(srcAmount, srcDecimals);
        const dstRaw = (srcRaw * dstReserve) / srcReserve;
        return formatUnits(dstRaw, dstDecimals);
    }

    // A → B
    useEffect(() => {
        if (lastEdited !== "A" || !canAutoPopulate || !reserves) return;
        setAmountB(
            quoteOther(amountA, tokenA.decimals, tokenB.decimals, reserves.a, reserves.b),
        );
    }, [
        lastEdited,
        canAutoPopulate,
        reserves,
        amountA,
        tokenA.decimals,
        tokenB.decimals,
    ]);

    // B → A
    useEffect(() => {
        if (lastEdited !== "B" || !canAutoPopulate || !reserves) return;
        setAmountA(
            quoteOther(amountB, tokenB.decimals, tokenA.decimals, reserves.b, reserves.a),
        );
    }, [
        lastEdited,
        canAutoPopulate,
        reserves,
        amountB,
        tokenA.decimals,
        tokenB.decimals,
    ]);

    function onAmountAChange(next: string): void {
        setAmountA(next);
        setLastEdited("A");
    }
    function onAmountBChange(next: string): void {
        setAmountB(next);
        setLastEdited("B");
    }

    const canSubmit =
        isConnected &&
        onSepolia &&
        tokenA.symbol !== tokenB.symbol &&
        (mode === "add"
            ? isPositiveAmount(amountA) && isPositiveAmount(amountB)
            : isPositiveAmount(liquidity));

    async function handleSubmit() {
        setError(null);
        setPhase("signing");
        try {
            const hash =
                mode === "add"
                    ? await addLiquidity(config, {
                          tokenA,
                          tokenB,
                          amountA,
                          amountB,
                          slippageBps,
                      })
                    : await removeLiquidity(config, {
                          tokenA,
                          tokenB,
                          liquidity,
                          slippageBps,
                      });
            setPhase("confirming");
            await awaitConfirmation(config, hash);
            await queryClient.invalidateQueries();
            if (mode === "add") {
                setAmountA("");
                setAmountB("");
                setLastEdited(null);
            } else {
                setLiquidity("");
            }
        } catch (e) {
            if (e instanceof UserRejectedError) setError(e.message);
            else setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setPhase("idle");
        }
    }

    let buttonLabel: string;
    if (phase === "signing") buttonLabel = "Confirm in wallet…";
    else if (phase === "confirming") buttonLabel = "Confirming on-chain…";
    else if (!isConnected) buttonLabel = "Connect wallet";
    else if (!onSepolia) buttonLabel = "Switch to Sepolia";
    else if (tokenA.symbol === tokenB.symbol) buttonLabel = "Select different tokens";
    else buttonLabel = mode === "add" ? "Supply liquidity" : "Withdraw liquidity";

    return (
        <Card
            title="Pool"
            subtitle="Provide or withdraw liquidity on the Sepolia V2 Router"
            actions={
                <ModeToggle
                    mode={mode}
                    onChange={(m) => {
                        setMode(m);
                        setError(null);
                    }}
                />
            }
        >
            {mode === "add" ? (
                <div
                    className="relative space-y-2"
                    key="add"
                    style={{ animation: "fade-in 160ms ease-out" }}
                >
                    <TokenInput
                        label="Token A"
                        amount={amountA}
                        token={tokenA}
                        disabledTokens={aliasSymbols(tokenB)}
                        onAmountChange={onAmountAChange}
                        onTokenChange={setTokenA}
                    />
                    <div className="relative flex justify-center" aria-hidden="true">
                        <span className="absolute -top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-300 shadow-md">
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path
                                    d="M6 1v10M1 6h10"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </span>
                    </div>
                    <TokenInput
                        label="Token B"
                        amount={amountB}
                        token={tokenB}
                        disabledTokens={aliasSymbols(tokenA)}
                        onAmountChange={onAmountBChange}
                        onTokenChange={setTokenB}
                    />
                    {differentTokens && (
                        <p className="px-1 pt-1 text-[11px] text-slate-500">
                            {canAutoPopulate
                                ? "Auto-balanced to the current pool ratio. Edit either side."
                                : "First deposit — pick any ratio (it sets the price)."}
                        </p>
                    )}
                </div>
            ) : (
                <div
                    className="space-y-3"
                    key="remove"
                    style={{ animation: "fade-in 160ms ease-out" }}
                >
                    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <label
                                htmlFor="lp-amount"
                                className="block text-xs uppercase tracking-wide text-slate-400"
                            >
                                LP tokens to burn
                            </label>
                            <span className="text-xs text-slate-500">
                                Pair{" "}
                                <span className="text-slate-300 font-medium">
                                    {tokenA.symbol}/{tokenB.symbol}
                                </span>
                            </span>
                        </div>
                        <input
                            id="lp-amount"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="0.0"
                            value={liquidity}
                            onChange={(e) => setLiquidity(sanitizeAmountInput(e.target.value))}
                            className="w-full bg-transparent text-2xl font-medium text-white outline-none placeholder:text-slate-600"
                        />
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs text-slate-400">Select pair</span>
                            <div className="flex items-center gap-2">
                                <TokenSelect
                                    token={tokenA}
                                    disabledTokens={aliasSymbols(tokenB)}
                                    onChange={setTokenA}
                                    ariaLabel="Token A"
                                />
                                <span className="text-slate-500 text-sm">/</span>
                                <TokenSelect
                                    token={tokenB}
                                    disabledTokens={aliasSymbols(tokenA)}
                                    onChange={setTokenB}
                                    ariaLabel="Token B"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-4">
                <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
            </div>

            {error && (
                <div
                    role="alert"
                    className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                    style={{ animation: "fade-in 160ms ease-out" }}
                >
                    {error}
                </div>
            )}

            <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || pending}
                className="mt-4 w-full rounded-xl bg-violet-500 hover:bg-violet-400 active:bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none disabled:hover:scale-100"
            >
                {buttonLabel}
            </button>
        </Card>
    );
}

interface ModeToggleProps {
    mode: Mode;
    onChange: (m: Mode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
    const items: readonly Mode[] = ["add", "remove"];
    return (
        <div className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 text-xs">
            {items.map((m) => {
                const active = mode === m;
                return (
                    <button
                        key={m}
                        type="button"
                        onClick={() => onChange(m)}
                        className={[
                            "relative px-2.5 py-1 rounded-md transition-colors duration-150 capitalize",
                            active ? "text-white" : "text-slate-400 hover:text-white",
                        ].join(" ")}
                    >
                        {active && (
                            <span
                                aria-hidden="true"
                                className="absolute inset-0 rounded-md bg-white/10"
                                style={{ animation: "fade-in 140ms ease-out" }}
                            />
                        )}
                        <span className="relative">{m}</span>
                    </button>
                );
            })}
        </div>
    );
}
