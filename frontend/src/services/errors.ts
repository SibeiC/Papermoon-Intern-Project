export class NotImplementedError extends Error {
    constructor(feature: string) {
        super(`${feature} is not implemented — contracts not yet wired up.`);
        this.name = "NotImplementedError";
    }
}

// Thrown when the user dismisses the wallet popup (EIP-1193 code 4001 or
// viem's UserRejectedRequestError). The page layer can detect via instanceof
// and show a quiet "cancelled" instead of a stack-traced error toast.
export class UserRejectedError extends Error {
    constructor() {
        super("Transaction cancelled");
        this.name = "UserRejectedError";
    }
}

// Re-throws a wallet-rejection error as our friendly subclass; lets every
// other error propagate untouched. Walks the `cause` chain because viem
// typically wraps UserRejectedRequestError inside a ContractFunctionExecution-
// or BaseError, so a flat `.name === "UserRejectedRequestError"` check on
// the outermost error misses the rejection. The depth cap prevents
// pathological cycles.
export function rethrowFriendly(err: unknown): never {
    let cur: unknown = err;
    for (let depth = 0; depth < 8 && cur != null; depth++) {
        const e = cur as { code?: number; name?: string; cause?: unknown };
        if (e.code === 4001 || e.name === "UserRejectedRequestError") {
            throw new UserRejectedError();
        }
        cur = e.cause;
    }
    throw err;
}
