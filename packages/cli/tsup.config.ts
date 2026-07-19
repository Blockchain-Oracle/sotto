import { defineConfig } from "tsup";

// The published tarball is self-contained: the shared purchasing core is
// bundled in, so `npm install` of the packed artifact needs no registry.
const shared = {
  noExternal: ["@sotto/purchase-client"],
  platform: "node" as const,
  sourcemap: true,
  splitting: false,
  target: "node20" as const,
  treeshake: true,
};

export default defineConfig([
  {
    ...shared,
    clean: true,
    // tsup's dts worker injects a legacy baseUrl; TypeScript 6 deprecates it.
    dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
  },
  {
    ...shared,
    clean: false,
    // The bin uses top-level await, which only the ESM format carries.
    entry: { bin: "src/bin.ts" },
    format: ["esm"],
  },
]);
