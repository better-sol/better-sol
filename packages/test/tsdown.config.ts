import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  outDir: "dist",
  format: "esm",
  platform: "node",
  fixedExtension: false,
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  clean: true,
});
