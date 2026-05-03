import { useId } from "react";
import type { Token } from "../types/token.ts";
import { sanitizeAmountInput } from "../utils/amount.ts";
import TokenSelect from "./TokenSelect.tsx";

interface Props {
    label: string;
    amount: string;
    token: Token;
    disabledTokens?: readonly string[];
    onAmountChange: (next: string) => void;
    onTokenChange: (next: Token) => void;
    readOnly?: boolean;
}

export default function TokenInput({
    label,
    amount,
    token,
    disabledTokens = [],
    onAmountChange,
    onTokenChange,
    readOnly = false,
}: Props) {
    const inputId = useId();

    return (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <label
                htmlFor={inputId}
                className="block text-xs uppercase tracking-wide text-slate-400 mb-2"
            >
                {label}
            </label>
            <div className="flex items-center gap-3">
                <input
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0.0"
                    value={amount}
                    readOnly={readOnly}
                    onChange={(e) =>
                        onAmountChange(sanitizeAmountInput(e.target.value, token.decimals))
                    }
                    className="min-w-0 flex-1 bg-transparent text-2xl font-medium text-white outline-none placeholder:text-slate-600 read-only:text-slate-300"
                    aria-label={`${label} amount`}
                />
                <TokenSelect
                    token={token}
                    disabledTokens={disabledTokens}
                    onChange={onTokenChange}
                    ariaLabel={`${label} token`}
                />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                    Balance: <span className="text-slate-400">— (connect wallet)</span>
                </span>
                <span className="font-mono text-slate-600">{token.name}</span>
            </div>
        </div>
    );
}
