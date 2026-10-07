



// `@typescript-eslint/no-explicit-any` de código legado). Ligá-lo no gate



















import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "build", "node_modules", "backend", "e2e"] },
  // Comentário inline NÃO desliga este gate: `eslint-disable` referenciando

  // mais importante — um `eslint-disable react-hooks/rules-of-hooks` solto

  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: false } },
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: { "react-hooks": reactHooks },

    rules: { "react-hooks/rules-of-hooks": "error" },
  },
);
