import type { ReactNode } from "react";

interface Props {
    title?: string;
    subtitle?: string;
    children: ReactNode;
    actions?: ReactNode;
}

export default function Card({ title, subtitle, children, actions }: Props) {
    return (
        <section
            className="mx-auto max-w-md rounded-2xl bg-white/5 border border-white/10 p-5 shadow-xl"
            style={{ animation: "fade-in 180ms ease-out" }}
        >
            {(title || actions) && (
                <header className="flex items-start justify-between mb-4">
                    <div>
                        {title && <h1 className="text-lg font-semibold text-white">{title}</h1>}
                        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
                    </div>
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </header>
            )}
            {children}
        </section>
    );
}
