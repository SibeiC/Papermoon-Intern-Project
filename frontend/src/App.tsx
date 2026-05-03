import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import SwapPage from "./pages/SwapPage.tsx";
import PoolPage from "./pages/PoolPage.tsx";
import PairsPage from "./pages/PairsPage.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";

export default function App() {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<Navigate to="/swap" replace />} />
                <Route path="/swap" element={<SwapPage />} />
                <Route path="/pool" element={<PoolPage />} />
                <Route path="/pairs" element={<PairsPage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
