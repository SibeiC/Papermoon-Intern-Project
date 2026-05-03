// Permissive numeric input cleaner: keeps a single decimal point, drops
// non-digits, prevents NaN/negative/exponent values from reaching the UI.
export function sanitizeAmountInput(raw: string, maxDecimals = 18): string {
    if (raw === "") return "";

    let cleaned = raw.replace(/[^0-9.]/g, "");

    const firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) {
        const head = cleaned.slice(0, firstDot + 1);
        const tail = cleaned.slice(firstDot + 1).replace(/\./g, "");
        cleaned = head + tail.slice(0, maxDecimals);
    }

    if (cleaned.length > 1 && cleaned.startsWith("0") && cleaned[1] !== ".") {
        cleaned = cleaned.replace(/^0+/, "") || "0";
    }

    return cleaned;
}

export function isPositiveAmount(value: string): boolean {
    if (value === "" || value === ".") return false;
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
}
