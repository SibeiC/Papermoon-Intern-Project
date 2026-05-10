import { etherscanAddressUrl, etherscanTxUrl } from "../utils/address.ts";

interface Props {
    value: string;
    kind?: "address" | "tx";
    className?: string;
}

export default function EtherscanIconLink({ value, kind = "address", className = "" }: Props) {
    const href = kind === "tx" ? etherscanTxUrl(value) : etherscanAddressUrl(value);
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            title="Open on Sepolia etherscan"
            aria-label="Open on Sepolia etherscan"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center transition-colors ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
        </a>
    );
}
