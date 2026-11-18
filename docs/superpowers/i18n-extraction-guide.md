# i18n Extraction Guide — Per-Route-Group Loop

This guide captures the repeatable pattern for localizing a new route group (e.g., feed, games, library, news, profile). Follow these steps in order for each PR.

---

## Prerequisites

- You are in the repo root.

---

## The Loop

### Step 1 — Pick a route group

Choose one self-contained route group: its page file(s) under `app/` and its components under `components/<group>/`. Keep PRs scoped to a single group so diffs stay reviewable.

### Step 2 — Register a new namespace (if needed)

If this route group needs its own translation namespace (rather than `common`):

**`lib/i18n/config.ts`** — add the name to `NAMESPACES`:

```ts
export const NAMESPACES = ["common", "nav", "feed"] as const;
//                                               ^^^^^^ new
```

A namespace not listed there is never loaded. Nothing else is registered: `lib/i18n/resources.<locale>.ts` builds each locale's namespace map with `import.meta.glob` from whatever catalogs are on disk, so never import a locale JSON by hand.

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

**Why `defaultValue` matters:** `i18next-parser.config.js` sets `resetDefaultValueLocale: "en"`, so without `defaultValue` the parser resets the `en` value to the bare key string on every extract run; the `defaultValue` form preserves the English copy through re-extractions. It also sets `keepRemoved: true`: a key the parser cannot see (an aliased `t`, a key built at runtime) is kept rather than deleted, so a key that is no longer used has to be removed by hand.

### Step 4 — Extract

```bash
pnpm run i18n:extract
```

This runs `i18next-parser` over `app/**/*.{ts,tsx}` and `components/**/*.{ts,tsx}`, writing keys into `locales/en/<ns>.json` only. The other locales live on the `i18n/catalogs` branch and are never written by the extractor.

After extraction, open `locales/en/<ns>.json` and verify:
- Every key has its correct English string as the value (not a bare key).
- No unexpected keys were pruned.

If any value looks wrong, fix it in `locales/en/<ns>.json` directly, then adjust the `defaultValue` in the source and re-run.

### Step 5 — Translate

Nothing to do locally. Translation is the **i18n-translate** GitHub Action (`.github/workflows/i18n-translate.yml`), which a maintainer runs from the Actions tab after the English lands on `main`. It translates only keys in `locales/en` that are missing or changed, commits the result to the `i18n/catalogs` branch and redeploys. Until it runs, the new keys show English in every other locale. See [`docs/translations.md`](../translations.md).

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

Locally only `locales/en` is checked in; the non-English catalogs come from `pnpm i18n:pull`, and the workflow runs this test against them before it commits to `i18n/catalogs`. Do not add keys to other locales by hand to make it pass.

Also run lint to catch any stray import issues:

```bash
pnpm run lint
```

### Step 8 — Commit and open a PR

Stage only the files changed for this route group:

```bash
git add app/<group>/ components/<group>/ locales/en/ lib/i18n/config.ts
git commit -m "feat(i18n): localize <group> route group"
```

Open a PR scoped to this single route group. It carries English only: never commit a non-English catalog to `main`, and never open a translation PR. Keeping PRs small makes review easier and reduces merge conflicts with other i18n PRs.

---

## Quick Reference

| Command | What it does |
|---|---|
| `pnpm run i18n:extract` | Parse source files → populate `locales/en/<ns>.json` |
| i18n-translate workflow (Actions tab) | Translate missing/changed keys from `en` into the other shipped locales via DeepSeek, on `i18n/catalogs` |
| `./node_modules/.bin/vitest run lib/__tests__/i18n-catalogs.test.ts` | Assert the catalogs agree with `en` (needs `pnpm i18n:pull` for the other locales) |

## Common Mistakes

- **Missing namespace registration**: A `locales/en/<ns>.json` without its `NAMESPACES` entry in `lib/i18n/config.ts` is never loaded, and the UI silently serves its `defaultValue`s.
- **Omitting `defaultValue`**: The parser resets `en` values to bare keys on re-extraction. Always use `t("key", { defaultValue: "English text" })`.
- **Physical Tailwind utilities in new components**: Use logical equivalents (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`) from the start — retrofitting is error-prone.
- **Running `pnpm exec vitest`**: On this repo the vitest binary must be invoked directly via `./node_modules/.bin/vitest run`.
