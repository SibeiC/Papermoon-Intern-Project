import { waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";

// Waits for the tx to mine and asserts that it didn't revert on-chain. Without
// this check, a reverted-but-mined tx would appear "successful" to the UI.
export async function awaitConfirmation(config: Config, hash: string): Promise<void> {
    const receipt = await waitForTransactionReceipt(config, {
        hash: hash as `0x${string}`,
    });
    if (receipt.status === "reverted") {
        throw new Error("Transaction reverted on-chain");
    }
}
