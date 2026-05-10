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
// other error propagate untouched. Detects both viem's named class AND the
// EIP-1193 numeric code so we don't break if the import alias drifts.
export function rethrowFriendly(err: unknown): never {
    const e = err as { code?: number; name?: string };
    if (e?.code === 4001 || e?.name === "UserRejectedRequestError") {
        throw new UserRejectedError();
    }
    throw err;
}
