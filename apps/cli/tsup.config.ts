import { defineConfig } from "tsup";

const shared = {
  entry: ["src/index.ts", "src/template-utils.ts"],
  outDir: "dist",
  target: "es2022",
  noExternal: [
    "@og/core",
    "@og/compute-client",
    "@og/storage",
    "@og/storage-0g",
    "@og/deploy-vercel"
  ]
} as const;

export default defineConfig([
  {
    ...shared,
    format: ["esm"],
    // Bundled CJS deps (e.g. ws via the 0G storage SDK) call require() at
    // runtime; esbuild's ESM output throws "Dynamic require is not supported"
    // without this shim.
    banner: {
      js: "import { createRequire as __ogCreateRequire } from 'node:module';\nconst require = __ogCreateRequire(import.meta.url);"
    }
  },
  {
    ...shared,
    format: ["cjs"]
  }
]);
