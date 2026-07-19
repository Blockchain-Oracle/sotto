import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.daml/**",
      "**/dist/**",
      ".thoughts/**",
      "node_modules/**",
      // Generated Next.js / Fumadocs output only — never blanket-disable.
      "**/.next/**",
      "apps/docs/.source/**",
      "apps/site/out/**",
      "apps/*/next-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
