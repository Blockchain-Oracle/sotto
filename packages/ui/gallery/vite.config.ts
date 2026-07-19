import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Dev-only harness for @sotto/ui specimens. Run with:
 *   mise exec node@24.18.0 -- pnpm --filter @sotto/ui gallery
 * Never part of build outputs.
 */
export default defineConfig({
  plugins: [react()],
});
