import { useState } from "react";
import type { Token } from "../types/token.ts";

interface Props {
    token: Token;
    size?: number;
    className?: string;
}

interface LogoConfig {
    src: string;
    badge?: string; // small letter overlay (e.g. "W" on WETH)
    fallback: { bg: string; fg: string; glyph: string };
}

// Real brand logos served locally from /public/tokens. We use <img> (not inline
// SVG / dangerouslySetInnerHTML) so any markup inside the SVGs is sandboxed by
// the browser and cannot execute scripts. If the image fails to load (e.g. a
// future token without a file), we fall back to a coloured monogram.
const LOGOS: Readonly<Record<string, LogoConfig>> = {
    SBC: {
        src: "/tokens/sbc.png",
        fallback: { bg: "#7c3aed", fg: "#fafafa", glyph: "S" },
    },
    ETH: {
        src: "/tokens/eth.svg",
        fallback: { bg: "#627eea", fg: "#ffffff", glyph: "Ξ" },
    },
    WETH: {
        src: "/tokens/eth.svg",
        badge: "W",
        fallback: { bg: "#3b4a8a", fg: "#ffffff", glyph: "Ξ" },
    },
    BTC: {
        src: "/tokens/btc.svg",
        fallback: { bg: "#f7931a", fg: "#ffffff", glyph: "₿" },
    },
    USDT: {
        src: "/tokens/usdt.svg",
        fallback: { bg: "#26a17b", fg: "#ffffff", glyph: "₮" },
    },
    USDC: {
        src: "/tokens/usdc.svg",
        fallback: { bg: "#2775ca", fg: "#ffffff", glyph: "$" },
    },
};

const FALLBACK_DEFAULT: LogoConfig["fallback"] = {
    bg: "#475569",
    fg: "#f1f5f9",
    glyph: "?",
};

export default function TokenLogo({ token, size = 24, className }: Props) {
    const cfg = LOGOS[token.symbol];
    const [errored, setErrored] = useState(false);
    const fallback = cfg?.fallback ?? FALLBACK_DEFAULT;
    const showImage = !!cfg && !errored;

    // Outer wrapper is NOT overflow-hidden so the badge can extend past the
    // circle. The inner wrapper handles the rounded-full clip for the image.
    const badgeSize = Math.max(10, Math.round(size * 0.42));

    return (
        <span
            className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
            style={{ width: size, height: size }}
        >
            <span
                className="block overflow-hidden rounded-full"
                style={{ width: size, height: size }}
            >
                {showImage ? (
                    <img
                        src={cfg.src}
                        alt={`${token.symbol} logo`}
                        width={size}
                        height={size}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onError={() => setErrored(true)}
                        className="block h-full w-full select-none"
                    />
                ) : (
                    <Monogram size={size} {...fallback} />
                )}
            </span>
            {showImage && cfg.badge && (
                <span
                    aria-hidden="true"
                    className="absolute inline-flex items-center justify-center rounded-full bg-violet-500 font-bold text-white ring-2 ring-slate-950"
                    style={{
                        width: badgeSize,
                        height: badgeSize,
                        right: -Math.round(badgeSize * 0.15),
                        bottom: -Math.round(badgeSize * 0.15),
                        fontSize: Math.max(7, Math.round(badgeSize * 0.6)),
                        lineHeight: 1,
                    }}
                >
                    {cfg.badge}
                </span>
            )}
        </span>
    );
}

interface MonogramProps {
    size: number;
    bg: string;
    fg: string;
    glyph: string;
}

function Monogram({ size, bg, fg, glyph }: MonogramProps) {
    const fontSize = Math.round(size * 0.46);
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
            <circle cx="12" cy="12" r="12" fill={bg} />
            <text
                x="12"
                y="12"
                textAnchor="middle"
                dominantBaseline="central"
                fill={fg}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontSize={fontSize}
                fontWeight="700"
                style={{ letterSpacing: "-0.02em" }}
            >
                {glyph}
            </text>
        </svg>
    );
}
