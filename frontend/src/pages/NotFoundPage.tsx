import { Link } from "react-router-dom";

export default function NotFoundPage() {
    return (
        <div className="text-center py-20">
            <h1 className="text-2xl font-semibold text-white">404</h1>
            <p className="mt-1 text-sm text-slate-400">That page doesn’t exist.</p>
            <Link
                to="/swap"
                className="inline-block mt-4 rounded-md bg-violet-500 hover:bg-violet-400 px-3 py-1.5 text-sm font-medium text-white"
            >
                Go to swap
            </Link>
        </div>
    );
}
