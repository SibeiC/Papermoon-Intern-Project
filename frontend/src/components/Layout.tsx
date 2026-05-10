import { NavLink, Outlet } from "react-router-dom";
import ConnectWalletButton from "./ConnectWalletButton.tsx";
import NetworkBanner from "./NetworkBanner.tsx";

const navItems = [
    { to: "/swap", label: "Swap" },
    { to: "/pool", label: "Pool" },
    { to: "/pairs", label: "Pairs" },
    { to: "/faucet", label: "Faucet" },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }): string {
    // Tighter horizontal padding on mobile so all four items + the connect
    // button fit within a 360px viewport.
    const base =
        "px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition whitespace-nowrap";
    return isActive
        ? `${base} bg-white/10 text-white`
        : `${base} text-slate-400 hover:text-white hover:bg-white/5`;
}

export default function Layout() {
    return (
        <div className="min-h-full flex flex-col">
            <header className="border-b border-white/10">
                <div className="mx-auto max-w-5xl flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3">
                    <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                        {/* Brand hides below sm so the nav + connect button fit. */}
                        <span className="hidden sm:inline-block text-base font-semibold tracking-tight whitespace-nowrap">
                            Sibei's Uniswap V2 Setup
                        </span>
                        <nav className="flex items-center gap-0.5 sm:gap-1">
                            {navItems.map((item) => (
                                <NavLink key={item.to} to={item.to} className={navLinkClass}>
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                    <ConnectWalletButton />
                </div>
            </header>
            <NetworkBanner />
            <main className="flex-1">
                <div className="mx-auto max-w-5xl px-4 py-8">
                    <Outlet />
                </div>
            </main>
            <footer className="border-t border-white/10">
                <div className="mx-auto max-w-5xl px-4 py-3 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span>
                        © {new Date().getFullYear()} Sibei Chen. Uniswap V2 study build — UI
                        scaffold, no contracts wired.
                    </span>
                    <span className="flex items-center gap-3">
                        <a
                            href="https://www.gnu.org/licenses/gpl-3.0.html"
                            target="_blank"
                            rel="noreferrer noopener"
                            className="hover:text-slate-300 underline-offset-2 hover:underline"
                        >
                            GPL-3.0
                        </a>
                        <span aria-hidden="true">·</span>
                        <a
                            href="/tokens/NOTICE.txt"
                            target="_blank"
                            rel="noreferrer noopener"
                            className="hover:text-slate-300 underline-offset-2 hover:underline"
                            title="Token logos served under CC-BY-4.0"
                        >
                            Logo attributions
                        </a>
                    </span>
                </div>
            </footer>
        </div>
    );
}
