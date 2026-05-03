import { useState } from "react";
import Card from "../components/Card.tsx";
import SlippageControl, { DEFAULT_AUTO_BPS } from "../components/SlippageControl.tsx";
import TokenInput from "../components/TokenInput.tsx";
import TokenSelect from "../components/TokenSelect.tsx";
import { TOKENS } from "../data/tokens.ts";
import { addLiquidity, removeLiquidity } from "../services/liquidity.ts";
import { isPositiveAmount, sanitizeAmountInput } from "../utils/amount.ts";
import type { Token } from "../types/token.ts";

type Mode = "add" | "remove";

const DEFAULT_A: Token = TOKENS[1]!; // ETH
const DEFAULT_B: Token = TOKENS[5]!; // USDC

export default function PoolPage() {
    const [mode, setMode] = useState<Mode>("add");
    const [tokenA, setTokenA] = useState<Token>(DEFAULT_A);
    const [tokenB, setTokenB] = useState<Token>(DEFAULT_B);
    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    const [liquidity, setLiquidity] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    const [slippageBps, setSlippageBps] = useState(DEFAULT_AUTO_BPS);

    const canSubmit =
        tokenA.symbol !== tokenB.symbol &&
        (mode === "add"
            ? isPositiveAmount(amountA) && isPositiveAmount(amountB)
            : isPositiveAmount(liquidity));

    async function handleSubmit() {
        setError(null);
        setPending(true);
        try {
            if (mode === "add") {
                await addLiquidity({ tokenA, tokenB, amountA, amountB, slippageBps });
            } else {
                await removeLiquidity({ tokenA, tokenB, liquidity, slippageBps });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setPending(false);
        }
    }

    return (
        <Card
            title="Pool"
            subtitle="Provide or withdraw liquidity (placeholder — not wired yet)"
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
                        disabledTokens={[tokenB.symbol]}
                        onAmountChange={setAmountA}
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
                        disabledTokens={[tokenA.symbol]}
                        onAmountChange={setAmountB}
                        onTokenChange={setTokenB}
                    />
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
                                    disabledTokens={[tokenB.symbol]}
                                    onChange={setTokenA}
                                    ariaLabel="Token A"
                                />
                                <span className="text-slate-500 text-sm">/</span>
                                <TokenSelect
                                    token={tokenB}
                                    disabledTokens={[tokenA.symbol]}
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
                {pending
                    ? "Submitting…"
                    : tokenA.symbol === tokenB.symbol
                      ? "Select different tokens"
                      : mode === "add"
                        ? "Supply liquidity"
                        : "Withdraw liquidity"}
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
