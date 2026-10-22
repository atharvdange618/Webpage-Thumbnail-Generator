import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["public/script.js", "node_modules"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers in template strings (`${secs}s`) are fine
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["src/client/**/*.ts"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { project: "./tsconfig.client.json", projectService: false },
    },
  },
  {
    files: ["src/**/*.ts", "*.config.ts"],
    ignores: ["src/client/**"],
    languageOptions: { globals: globals.node },
  }
);
