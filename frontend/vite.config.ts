import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        strictPort: false,
    },
    resolve: {
        alias: {
            // Lets the frontend import deployment addresses from the repo-root
            // `deployments/` folder without an ugly relative path.
            "@deployments": fileURLToPath(new URL("../deployments", import.meta.url)),
        },
    },
    build: {
        // Split web3 deps into their own chunk so the main bundle only ships
        // app code on first load. Cuts initial JS by roughly half on mobile
        // and keeps the chunk-size warning quiet.
        rollupOptions: {
            output: {
                manualChunks: {
                    web3: ["wagmi", "viem", "@tanstack/react-query"],
                },
            },
        },
    },
});
