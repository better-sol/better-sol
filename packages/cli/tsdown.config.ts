import { defineConfig } from "tsdown";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8"));

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: "esm",
  platform: "node",
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: true,
  shims: true,
  define: {
    "process.env.BETTER_SOL_CLI_VERSION": JSON.stringify(pkg.version),
  },
});