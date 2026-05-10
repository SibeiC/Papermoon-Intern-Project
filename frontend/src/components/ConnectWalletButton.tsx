import { useAccount, useConnect, useDisconnect } from "wagmi";

import EtherscanIconLink from "./EtherscanIconLink.tsx";
import { shortenAddress } from "../utils/address.ts";

export default function ConnectWalletButton() {
    const { address, isConnected } = useAccount();
    const { connect, connectors, isPending } = useConnect();
    const { disconnect } = useDisconnect();

    const injected = connectors[0]; // wagmiConfig declares only the injected connector

    if (isConnected && address) {
        return (
            <span className="inline-flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => disconnect()}
                    title={`${address} — click to disconnect`}
                    className="rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 shadow-sm transition-colors duration-150"
                >
                    <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span className="font-mono text-xs">{shortenAddress(address)}</span>
                    </span>
                </button>
                <EtherscanIconLink
                    value={address}
                    className="text-slate-400 hover:text-white"
                />
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={() => injected && connect({ connector: injected })}
            disabled={!injected || isPending}
            className="rounded-md bg-violet-500 hover:bg-violet-400 active:bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
        >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                        isPending ? "bg-amber-300 animate-pulse" : "bg-amber-400"
                    }`}
                />
                {isPending ? (
                    "Connecting…"
                ) : (
                    <>
                        <span className="sm:hidden">Connect</span>
                        <span className="hidden sm:inline">Connect Wallet</span>
                    </>
                )}
            </span>
        </button>
    );
}
