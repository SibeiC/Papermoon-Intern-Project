import { useState } from "react";
import Card from "../components/Card.tsx";
import SlippageControl, { DEFAULT_AUTO_BPS } from "../components/SlippageControl.tsx";
import TokenInput from "../components/TokenInput.tsx";
import { TOKENS } from "../data/tokens.ts";
import { executeSwap } from "../services/swap.ts";
import { isPositiveAmount } from "../utils/amount.ts";
import type { Token } from "../types/token.ts";

const DEFAULT_IN: Token = TOKENS[0]!; // SBC
const DEFAULT_OUT: Token = TOKENS[1]!; // ETH

export default function SwapPage() {
    const [tokenIn, setTokenIn] = useState<Token>(DEFAULT_IN);
    const [tokenOut, setTokenOut] = useState<Token>(DEFAULT_OUT);
    const [amountIn, setAmountIn] = useState("");
    const [amountOut, setAmountOut] = useState("");
    const [slippageBps, setSlippageBps] = useState(DEFAULT_AUTO_BPS);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [flipNonce, setFlipNonce] = useState(0);

    const canSubmit = isPositiveAmount(amountIn) && tokenIn.symbol !== tokenOut.symbol;

    function handleFlip() {
        setTokenIn(tokenOut);
        setTokenOut(tokenIn);
        setAmountIn(amountOut);
        setAmountOut(amountIn);
        setError(null);
        setFlipNonce((n) => n + 1);
    }

    async function handleSwap() {
        setError(null);
        setPending(true);
        try {
            await executeSwap({ tokenIn, tokenOut, amountIn, slippageBps });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setPending(false);
        }
    }

    return (
        <Card title="Swap" subtitle="Trade tokens via the V2 Router (placeholder — not wired yet)">
            <div className="relative space-y-2">
                <TokenInput
                    label="From"
                    amount={amountIn}
                    token={tokenIn}
                    disabledTokens={[tokenOut.symbol]}
                    onAmountChange={setAmountIn}
                    onTokenChange={setTokenIn}
                />
                <div className="relative flex justify-center">
                    <button
                        type="button"
                        onClick={handleFlip}
                        key={flipNonce}
                        className="absolute -top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-300 shadow-md transition-all duration-200 hover:bg-slate-800 hover:text-white hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
                        style={{ animation: "pop-in 200ms ease-out" }}
                        aria-label="Swap input and output tokens"
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                            <path
                                d="M4 2v8M4 10l-2-2m2 2l2-2M10 12V4M10 4l-2 2m2-2l2 2"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>
                <TokenInput
                    label="To (estimated)"
                    amount={amountOut}
                    token={tokenOut}
                    disabledTokens={[tokenIn.symbol]}
                    onAmountChange={setAmountOut}
                    onTokenChange={setTokenOut}
                    readOnly
                />
            </div>

            <div className="mt-4 space-y-2 text-xs text-slate-400">
                <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
                <dl className="space-y-1">
                    <div className="flex justify-between">
                        <dt>Price impact</dt>
                        <dd>—</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt>Route</dt>
                        <dd>
                            {tokenIn.symbol} → {tokenOut.symbol}
                        </dd>
                    </div>
                </dl>
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
                onClick={handleSwap}
                disabled={!canSubmit || pending}
                className="mt-4 w-full rounded-xl bg-violet-500 hover:bg-violet-400 active:bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none disabled:hover:scale-100"
            >
                {pending
                    ? "Submitting…"
                    : !isPositiveAmount(amountIn)
                      ? "Enter an amount"
                      : tokenIn.symbol === tokenOut.symbol
                        ? "Select different tokens"
                        : "Swap"}
            </button>
        </Card>
    );
}
