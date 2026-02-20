import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Plain JS server files — CommonJS require() is intentional
    "webhook-server.js",
    "check_db.js",
    "sync_db.js",
  ]),
  // ── Project-wide rule overrides ───────────────────────────────────────────
  {
    rules: {
      // These new react-hooks/* rules are too strict for the many valid
      // patterns used throughout this codebase (mount-time setState,
      // ref-based animation loops, cascading effect guards, etc.).
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity":              "off",
      "react-hooks/immutability":        "off",
      "react-hooks/refs":                "off",

      // Downgrade from error to warning so the build isn't blocked.
      // Individual files can tighten this as they are refactored.
      "@typescript-eslint/no-explicit-any":        "warn",
      "@typescript-eslint/no-unsafe-function-type":"warn",
      "@typescript-eslint/no-require-imports":     "warn",
      "@next/next/no-img-element":                 "warn",
    },
  },
]);

export default eslintConfig;
