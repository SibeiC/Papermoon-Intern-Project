import { useId } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";

import type { Token } from "../types/token.ts";
import { sanitizeAmountInput } from "../utils/amount.ts";
import { TEST_ERC20_ABI } from "../contracts/abis/TestERC20.ts";
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

// Reserved gas budget when filling MAX on native ETH so the user still has
// enough to sign the transaction. 0.001 ETH is conservative on Sepolia.
const ETH_GAS_RESERVE_WEI = 1_000_000_000_000_000n; // 0.001 ETH

function formatBalance(raw: bigint, decimals: number): string {
    const formatted = formatUnits(raw, decimals);
    // Trim to up to 6 decimals for readability without coercing through Number.
    const [intPart, fracPart] = formatted.split(".");
    if (!fracPart) return intPart ?? "0";
    return `${intPart}.${fracPart.slice(0, 6).replace(/0+$/, "")}`.replace(/\.$/, "");
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
    const { address: userAddress, isConnected } = useAccount();

    // Native ETH balance comes from the JSON-RPC `eth_getBalance`, not an ERC20.
    const nativeBalance = useBalance({
        address: userAddress,
        query: { enabled: isConnected && !!token.isNative },
    });

    const erc20Balance = useReadContract({
        address: token.address,
        abi: TEST_ERC20_ABI,
        functionName: "balanceOf",
        args: userAddress ? [userAddress] : undefined,
        query: { enabled: isConnected && !!userAddress && !token.isNative },
    });

    const rawBalance: bigint | undefined = token.isNative
        ? nativeBalance.data?.value
        : (erc20Balance.data as bigint | undefined);

    const balanceLabel = (() => {
        if (!isConnected) return "— (connect wallet)";
        if (rawBalance === undefined) return "…";
        return formatBalance(rawBalance, token.decimals);
    })();

    function handleMax(): void {
        if (rawBalance === undefined) return;
        const useable = token.isNative
            ? rawBalance > ETH_GAS_RESERVE_WEI
                ? rawBalance - ETH_GAS_RESERVE_WEI
                : 0n
            : rawBalance;
        if (useable === 0n) {
            onAmountChange("");
            return;
        }
        // formatUnits returns a decimal string in the right precision; sanitize
        // it through the same input cleaner so trailing zeros / overflow get
        // normalized identically to user typing.
        onAmountChange(sanitizeAmountInput(formatUnits(useable, token.decimals), token.decimals));
    }

    const showMax = !readOnly && isConnected && rawBalance !== undefined && rawBalance > 0n;

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
                <span className="inline-flex items-center gap-2">
                    <span>
                        Balance: <span className="text-slate-300 tabular-nums">{balanceLabel}</span>
                    </span>
                    {showMax && (
                        <button
                            type="button"
                            onClick={handleMax}
                            className="rounded bg-violet-500/20 hover:bg-violet-500/30 active:bg-violet-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200 uppercase tracking-wide transition-colors"
                        >
                            Max
                        </button>
                    )}
                </span>
                <span className="font-mono text-slate-600">{token.name}</span>
            </div>
        </div>
    );
}
