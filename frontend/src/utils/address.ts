export function shortenAddress(addr: string): string {
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function etherscanAddressUrl(addr: string): string {
    return `https://sepolia.etherscan.io/address/${addr}`;
}

export function etherscanTxUrl(hash: string): string {
    return `https://sepolia.etherscan.io/tx/${hash}`;
}
