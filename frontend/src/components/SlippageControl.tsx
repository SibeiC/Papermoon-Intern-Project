import { useEffect, useId, useRef, useState } from "react";

interface Props {
    bps: number;
    onChange: (bps: number) => void;
    autoBps?: number;
}

export const DEFAULT_AUTO_BPS = 50; // 0.5%
const MAX_BPS = 5000; // 50%
const MIN_BPS = 1; // 0.01%
const HIGH_BPS = 500; // 5% — show warning
const LOW_BPS = 5; // 0.05% — show "may fail" warning

// Slippage tolerance picker. Auto pin uses the project default; custom input
// accepts a percent value (e.g. "0.5" = 0.5% = 50 bps), validated to a sane
// range with non-blocking warnings shown for unusually high/low values.
export default function SlippageControl({ bps, onChange, autoBps = DEFAULT_AUTO_BPS }: Props) {
    const inputId = useId();
    const [isAuto, setIsAuto] = useState(bps === autoBps);
    const [draft, setDraft] = useState(bps === autoBps ? "" : bpsToPercent(bps));
    // Tracks the last bps we emitted via onChange. The sync effect uses this
    // to tell internal-origin updates apart from external ones, so that
    // typing "1.50" doesn't get snapped back to "1.5" by our own re-render.
    const emittedRef = useRef(bps);

    useEffect(() => {
        if (bps === emittedRef.current) return; // we caused this update
        emittedRef.current = bps;
        if (bps === autoBps) {
            setIsAuto(true);
            setDraft("");
        } else {
            setIsAuto(false);
            setDraft(bpsToPercent(bps));
        }
    }, [bps, autoBps]);

    function emit(nextBps: number): void {
        emittedRef.current = nextBps;
        onChange(nextBps);
    }

    function pickAuto(): void {
        setIsAuto(true);
        setDraft("");
        emit(autoBps);
    }

    function applyDraft(next: string): void {
        const cleaned = sanitizePercent(next);
        setDraft(cleaned);
        if (cleaned === "" || cleaned === ".") {
            setIsAuto(false);
            return;
        }
        const pct = Number(cleaned);
        if (!Number.isFinite(pct)) return;
        const nextBps = Math.min(MAX_BPS, Math.max(MIN_BPS, Math.round(pct * 100)));
        setIsAuto(false);
        emit(nextBps);
    }

    function handleBlur(): void {
        if (!isAuto && (draft === "" || draft === ".")) {
            // Empty input on blur reverts to Auto rather than leaving an
            // ambiguous "no slippage tolerance" state.
            pickAuto();
        }
    }

    const warning =
        !isAuto && bps >= HIGH_BPS
            ? "High slippage — risk of front-running."
            : !isAuto && bps > 0 && bps < LOW_BPS
              ? "Very low slippage — transaction may revert."
              : null;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label htmlFor={inputId} className="text-xs text-slate-400">
                    Slippage tolerance
                </label>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={pickAuto}
                        aria-pressed={isAuto}
                        className={[
                            "rounded-md px-2 py-1 text-xs font-medium border transition-colors duration-150",
                            isAuto
                                ? "bg-violet-500/20 border-violet-500/40 text-violet-200"
                                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10",
                        ].join(" ")}
                    >
                        Auto
                    </button>
                    <div
                        className={[
                            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors duration-150",
                            isAuto
                                ? "border-white/10 bg-white/5 text-slate-500"
                                : "border-violet-500/40 bg-violet-500/10 text-white",
                        ].join(" ")}
                    >
                        <input
                            id={inputId}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={bpsToPercent(autoBps)}
                            value={isAuto ? "" : draft}
                            onChange={(e) => applyDraft(e.target.value)}
                            onBlur={handleBlur}
                            aria-label="Custom slippage tolerance in percent"
                            className="w-12 bg-transparent text-right tabular-nums outline-none placeholder:text-slate-600"
                        />
                        <span aria-hidden="true">%</span>
                    </div>
                </div>
            </div>
            {warning && (
                <p
                    role="status"
                    className="text-right text-[11px] text-amber-300"
                    style={{ animation: "fade-in 140ms ease-out" }}
                >
                    {warning}
                </p>
            )}
        </div>
    );
}

function bpsToPercent(bps: number): string {
    // Trim trailing zero on whole-number percents (50 bps -> "0.5", 100 bps -> "1")
    const pct = bps / 100;
    return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "");
}

// Two-decimal percent input cleaner. Mirrors sanitizeAmountInput but tighter.
function sanitizePercent(raw: string): string {
    if (raw === "") return "";
    let cleaned = raw.replace(/[^0-9.]/g, "");
    const firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) {
        const head = cleaned.slice(0, firstDot + 1);
        const tail = cleaned.slice(firstDot + 1).replace(/\./g, "");
        cleaned = head + tail.slice(0, 2);
    }
    if (cleaned.length > 1 && cleaned.startsWith("0") && cleaned[1] !== ".") {
        cleaned = cleaned.replace(/^0+/, "") || "0";
    }
    // Cap the integer part at 3 chars so users can type "100" and rely on the
    // bps clamp to bring it down to MAX_BPS. Anything longer is meaningless.
    const dotIdx = cleaned.indexOf(".");
    const intLen = dotIdx === -1 ? cleaned.length : dotIdx;
    if (intLen > 3) {
        cleaned = cleaned.slice(0, 3) + (dotIdx === -1 ? "" : cleaned.slice(dotIdx));
    }
    return cleaned;
}
