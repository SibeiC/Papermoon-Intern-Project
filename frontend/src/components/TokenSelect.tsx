import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Token } from "../types/token.ts";
import { TOKENS } from "../data/tokens.ts";
import TokenLogo from "./TokenLogo.tsx";

interface Props {
    token: Token;
    disabledTokens?: readonly string[];
    onChange: (next: Token) => void;
    ariaLabel?: string;
}

// Custom dropdown — native <select> can't render images per option.
// Implements the WAI-ARIA listbox pattern (button + role=listbox/option),
// with click-outside, Escape, and Enter/Arrow keyboard support.
export default function TokenSelect({ token, disabledTokens = [], onChange, ariaLabel }: Props) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(() =>
        Math.max(
            0,
            TOKENS.findIndex((t) => t.symbol === token.symbol),
        ),
    );
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const listboxId = useId();

    useEffect(() => {
        if (!open) return;
        // Focus listbox on open so arrow-key navigation works immediately.
        listRef.current?.focus();
        function handlePointer(e: MouseEvent) {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        }
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                buttonRef.current?.focus();
            }
        }
        window.addEventListener("mousedown", handlePointer);
        window.addEventListener("keydown", handleKey);
        return () => {
            window.removeEventListener("mousedown", handlePointer);
            window.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    function pick(t: Token): void {
        if (disabledTokens.includes(t.symbol)) return;
        onChange(t);
        setOpen(false);
        buttonRef.current?.focus();
    }

    function handleButtonKey(e: ReactKeyboardEvent<HTMLButtonElement>): void {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
        }
    }

    function handleListKey(e: ReactKeyboardEvent<HTMLUListElement>): void {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => nextEnabled(i, 1, disabledTokens));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => nextEnabled(i, -1, disabledTokens));
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const t = TOKENS[activeIndex];
            if (t) pick(t);
        }
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-label={ariaLabel ?? `Select token (current: ${token.symbol})`}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={handleButtonKey}
                className="flex w-28 items-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 active:bg-white/20 px-2.5 py-1.5 text-sm font-semibold text-white border border-white/10 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
            >
                <TokenLogo token={token} size={20} />
                <span className="flex-1 text-left leading-none">{token.symbol}</span>
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
                >
                    <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
            </button>
            {open && (
                <ul
                    id={listboxId}
                    ref={listRef}
                    role="listbox"
                    tabIndex={-1}
                    onKeyDown={handleListKey}
                    aria-activedescendant={`${listboxId}-${activeIndex}`}
                    style={{ animation: "pop-in 140ms ease-out" }}
                    className="absolute right-0 top-full z-30 mt-2 w-48 max-h-72 overflow-auto rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50 py-1 origin-top-right focus:outline-none"
                >
                    {TOKENS.map((t, i) => {
                        const disabled = disabledTokens.includes(t.symbol);
                        const selected = t.symbol === token.symbol;
                        const active = i === activeIndex;
                        return (
                            <li
                                id={`${listboxId}-${i}`}
                                key={t.symbol}
                                role="option"
                                aria-selected={selected}
                                aria-disabled={disabled}
                                onMouseEnter={() => setActiveIndex(i)}
                                onClick={() => pick(t)}
                                className={[
                                    "flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors duration-100",
                                    disabled
                                        ? "opacity-40 cursor-not-allowed"
                                        : active
                                          ? "bg-white/10 text-white"
                                          : "text-slate-200 hover:bg-white/5",
                                    selected ? "font-semibold" : "",
                                ].join(" ")}
                            >
                                <TokenLogo token={t} size={22} />
                                <span className="flex-1">
                                    <span className="block leading-tight">{t.symbol}</span>
                                    <span className="block text-xs text-slate-400 leading-tight">
                                        {t.name}
                                    </span>
                                </span>
                                {selected && (
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 14 14"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M2 7.5l3 3 7-7"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            fill="none"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function nextEnabled(fromIdx: number, direction: 1 | -1, disabled: readonly string[]): number {
    const n = TOKENS.length;
    for (let step = 1; step <= n; step++) {
        const i = (fromIdx + direction * step + n) % n;
        const t = TOKENS[i];
        if (t && !disabled.includes(t.symbol)) return i;
    }
    return fromIdx;
}
