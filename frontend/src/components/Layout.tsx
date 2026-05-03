import { NavLink, Outlet } from "react-router-dom";

const navItems = [
    { to: "/swap", label: "Swap" },
    { to: "/pool", label: "Pool" },
    { to: "/pairs", label: "Pairs" },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }): string {
    const base = "px-3 py-1.5 rounded-md text-sm font-medium transition";
    return isActive
        ? `${base} bg-white/10 text-white`
        : `${base} text-slate-400 hover:text-white hover:bg-white/5`;
}

export default function Layout() {
    return (
        <div className="min-h-full flex flex-col">
            <header className="border-b border-white/10">
                <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-6">
                        <span className="text-base font-semibold tracking-tight">
                            Sibei's Uniswap V2 Setup
                        </span>
                        <nav className="flex items-center gap-1">
                            {navItems.map((item) => (
                                <NavLink key={item.to} to={item.to} className={navLinkClass}>
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                    <button
                        type="button"
                        className="rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-300 shadow-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled
                        title="Wallet connection — not yet implemented"
                    >
                        <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Connect Wallet
                        </span>
                    </button>
                </div>
            </header>
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
