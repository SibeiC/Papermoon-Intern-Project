// Imports the deployment manifest written by scripts/deploy.js. The path
// resolves via the @deployments alias (configured in vite.config.ts +
// tsconfig.app.json) so we don't have to traverse `../../../`.

// During local dev with Hardhat we point at hardhat.json; for Sepolia we
// point at sepolia.json. Switch the import below to swap targets — Vite
// only one-of resolves at build time.
import sepolia from "@deployments/sepolia.json";

export const ADDRESSES = sepolia;
export type DeploymentAddresses = typeof ADDRESSES;

export type TokenSymbol = keyof typeof ADDRESSES.tokens;
export type TokenInfo = (typeof ADDRESSES.tokens)[TokenSymbol];

export const FACTORY_ADDRESS = ADDRESSES.factory as `0x${string}`;
export const ROUTER_ADDRESS = ADDRESSES.router as `0x${string}`;
export const WETH_ADDRESS = ADDRESSES.weth as `0x${string}`;
