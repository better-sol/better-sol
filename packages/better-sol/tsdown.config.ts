import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    program: "src/program.ts",
    codec: "src/codec.ts",
    "wallets/wallet-adapter": "src/wallets/wallet-adapter.ts",
    "wallets/reown": "src/wallets/reown.ts",
    "wallets/privy": "src/wallets/privy.ts",
    "wallets/dynamic": "src/wallets/dynamic.ts",
  },
  outDir: "dist",
  format: "esm",
  platform: "neutral",
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ["@solana/web3.js", "node:fs/promises", "node:path"],
  },
  inputOptions: {
    resolve: {
      mainFields: ["module", "main"],
    },
  },
});