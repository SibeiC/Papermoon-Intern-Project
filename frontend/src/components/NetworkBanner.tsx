import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

export default function NetworkBanner() {
    const { isConnected, chainId } = useAccount();
    const { switchChain, isPending } = useSwitchChain();

    if (!isConnected || chainId === sepolia.id) return null;

    return (
        <div
            role="status"
            className="border-b border-amber-500/30 bg-amber-500/10 text-amber-200"
            style={{ animation: "fade-in 160ms ease-out" }}
        >
            <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-4 text-xs">
                <span>
                    Wrong network. This DEX is deployed on{" "}
                    <span className="font-medium text-amber-100">Sepolia</span>{" "}
                    (chainId {sepolia.id}). You're on chainId {chainId ?? "?"}.
                </span>
                <button
                    type="button"
                    onClick={() => switchChain({ chainId: sepolia.id })}
                    disabled={isPending}
                    className="rounded-md bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 border border-amber-500/40 px-2.5 py-1 font-medium text-amber-100 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Switching…" : "Switch to Sepolia"}
                </button>
            </div>
        </div>
    );
}
