import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  // tsup's dts worker injects a legacy baseUrl; TypeScript 6 deprecates it.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  platform: "neutral",
  sourcemap: true,
  target: "es2023",
  treeshake: true,
});
