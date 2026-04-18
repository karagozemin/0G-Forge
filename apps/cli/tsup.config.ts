import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/template-utils.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  target: "es2022",
  noExternal: ["@og/core", "@og/compute-client", "@og/storage", "@og/deploy-vercel"]
});
