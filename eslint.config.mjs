import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

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

  // ── Accessibility (jsx-a11y) ──────────────────────────────────────────────
  // Rules that are already at zero violations are enforced as "error" so
  // regressions can't land. Rules with an existing backlog stay at "warn" so
  // they surface in PRs without blocking the build; promote each to "error" as
  // it is driven to zero.
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      // Enforced (zero violations — keep them at zero).
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",

      // Backlog (existing violations — surface as warnings, promote when clean).
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-has-content": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/aria-role": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/heading-has-content": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
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
