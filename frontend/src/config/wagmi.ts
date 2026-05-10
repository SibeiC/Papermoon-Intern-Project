import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
if (!rpcUrl) {
    // Public Sepolia endpoints exist but are heavily rate-limited; warn so the
    // dev knows why pair-list reads stutter.
    // eslint-disable-next-line no-console
    console.warn(
        "[wagmi] VITE_SEPOLIA_RPC_URL is not set; falling back to the public " +
            "Sepolia RPC. Multicalls and the Pairs page will be slow.",
    );
}

export const wagmiConfig = createConfig({
    chains: [sepolia],
    connectors: [injected()],
    transports: {
        // useReadContracts batches at the wagmi layer; transport-level batch
        // options vary across wagmi versions, so we keep the transport simple.
        [sepolia.id]: http(rpcUrl),
    },
    ssr: false,
});

declare module "wagmi" {
    interface Register {
        config: typeof wagmiConfig;
    }
}
