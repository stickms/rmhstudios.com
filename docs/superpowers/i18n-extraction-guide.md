# i18n Extraction Guide — Per-Route-Group Loop

This guide captures the repeatable pattern for localizing a new route group (e.g., feed, games, library, news, profile). Follow these steps in order for each PR.

---

## Prerequisites

- `DEEPSEEK_API_KEY` set in your environment for machine translation (step 5). Without it, `pnpm run i18n:translate` will still run but will skip every key with a warning.
- You are in the repo root.

---

## The Loop

### Step 1 — Pick a route group

Choose one self-contained route group: its page file(s) under `app/` and its components under `components/<group>/`. Keep PRs scoped to a single group so diffs stay reviewable.

### Step 2 — Register a new namespace (if needed)

If this route group needs its own translation namespace (rather than `common`):

**Both of these files must be updated or the namespace will not load.**

**`lib/i18n/config.ts`** — add the name to `NAMESPACES`:

```ts
export const NAMESPACES = ["common", "nav", "feed"] as const;
//                                               ^^^^^^ new
```

**`lib/i18n/resources.ts`** — add the JSON imports and `RESOURCES` entry for all three locales:

```ts
import enFeed from "@/locales/en/feed.json";
import zhFeed from "@/locales/zh/feed.json";
import arFeed from "@/locales/ar/feed.json";

export const RESOURCES = {
  en: { common: enCommon, nav: enNav, feed: enFeed },
  zh: { common: zhCommon, nav: zhNav, feed: zhFeed },
  ar: { common: arCommon, nav: arNav, feed: arFeed },
} as const;
```

The JSON files do not need to exist yet — `i18n:extract` creates them.

### Step 3 — Instrument components

In each component in the route group:

1. Import the hook: `import { useTranslation } from "react-i18next";`
2. Destructure inside the component: `const { t } = useTranslation("feed");`
3. Replace every hardcoded JSX string with a `t()` call, **always using the `defaultValue` form**:

```tsx
// Before
<button>Save</button>

// After
<button>{t("save", { defaultValue: "Save" })}</button>
```

For dynamic text use interpolation:

```tsx
{t("greeting", { name, defaultValue: "Hello, {{name}}!" })}
```

**Why `defaultValue` matters:** `i18next-parser.config.js` sets `keepRemoved: false` and `resetDefaultValueLocale: "en"`. Without `defaultValue`, the parser resets the `en` value to the bare key string on every extract run, and drops unreferenced keys. The `defaultValue` form preserves the English copy through re-extractions.

### Step 4 — Extract

```bash
pnpm run i18n:extract
```

This runs `i18next-parser` over `app/**/*.{ts,tsx}` and `components/**/*.{ts,tsx}`, writing keys into `locales/en/<ns>.json`, `locales/zh/<ns>.json`, and `locales/ar/<ns>.json`.

After extraction, open `locales/en/<ns>.json` and verify:
- Every key has its correct English string as the value (not a bare key).
- No unexpected keys were pruned.

If any value looks wrong, fix it in `locales/en/<ns>.json` directly, then adjust the `defaultValue` in the source and re-run.

### Step 5 — Translate

```bash
pnpm run i18n:translate
```

This calls `scripts/translate-locales.ts`, which is idempotent: it only (re)translates keys that are missing or whose English source has changed since the last run. Human edits to `zh`/`ar` catalogs survive because the script tracks source snapshots in `locales/<lng>/.sources.<ns>.json`.

Requires `DEEPSEEK_API_KEY`. Without it, every key is skipped with a warning and the `zh`/`ar` files remain unchanged.

### Step 6 — RTL audit

Arabic renders right-to-left. Review the components you changed and replace directional CSS utilities with their logical equivalents:

| Physical (avoid)          | Logical (use)         |
|---------------------------|-----------------------|
| `pl-`, `pr-`              | `ps-`, `pe-`          |
| `ml-`, `mr-`              | `ms-`, `me-`          |
| `left-`, `right-`         | `start-`, `end-`      |
| `text-left`, `text-right` | `text-start`, `text-end` |

For directional icons (arrows, chevrons) that must flip in RTL, add the `.rtl-flip` utility class. For anything that cannot be expressed with logical utilities, use a `[dir=rtl]:` variant:

```tsx
<div className="ps-4 [dir=rtl]:border-r-0 [dir=rtl]:border-l">
```

### Step 7 — Run tests

```bash
./node_modules/.bin/vitest run lib/__tests__/i18n-catalogs.test.ts
```

> Use `./node_modules/.bin/vitest run` directly, not `pnpm exec vitest`, on this repo.

The catalog test verifies that every key present in `en` is also present in `zh` and `ar`. Fix any missing keys before proceeding.

Also run lint to catch any stray import issues:

```bash
pnpm run lint
```

### Step 8 — Commit and open a PR

Stage only the files changed for this route group:

```bash
git add app/<group>/ components/<group>/ locales/ lib/i18n/config.ts lib/i18n/resources.ts
git commit -m "feat(i18n): localize <group> route group (en/zh/ar)"
```

Open a PR scoped to this single route group. Keeping PRs small makes translation review easier and reduces merge conflicts with other i18n PRs.

---

## Quick Reference

| Command | What it does |
|---|---|
| `pnpm run i18n:extract` | Parse source files → populate `locales/en/<ns>.json` (and stub zh/ar) |
| `pnpm run i18n:translate` | Translate missing/changed keys from en → zh and ar via DeepSeek |
| `./node_modules/.bin/vitest run lib/__tests__/i18n-catalogs.test.ts` | Assert key parity across all three locales |

## Common Mistakes

- **Missing namespace registration**: Adding a namespace to only `config.ts` or only `resources.ts` causes a silent load failure. Both files must be updated together.
- **Omitting `defaultValue`**: The parser resets `en` values to bare keys on re-extraction. Always use `t("key", { defaultValue: "English text" })`.
- **Physical Tailwind utilities in new components**: Use logical equivalents (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`) from the start — retrofitting is error-prone.
- **Running `pnpm exec vitest`**: On this repo the vitest binary must be invoked directly via `./node_modules/.bin/vitest run`.
