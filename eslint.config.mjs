import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      ".output/**",
      ".tanstack/**",
      ".vinxi/**",
      "dist-server/**",
      "build/**",
      "node_modules/**",
      // Plain JS server files — CommonJS require() is intentional
      "webhook-server.cjs",
      "check_db.js",
      "sync_db.js",
    ],
  },

  // ── Base configs ──────────────────────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── React Hooks ───────────────────────────────────────────────────────────
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // These rules are too strict for the many valid patterns used
      // throughout this codebase (mount-time setState, ref-based animation
      // loops, cascading effect guards, etc.).
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },

  // ── Project-wide rule overrides ───────────────────────────────────────────
  {
    rules: {
      // Downgrade from error to warning so the build isn't blocked.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Downgrade pre-existing code quality issues to warnings.
      // Tighten these as the codebase is cleaned up.
      "prefer-const": "warn",
      "no-empty": "warn",
      "no-case-declarations": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      // Prevent debug console.log in production paths
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
