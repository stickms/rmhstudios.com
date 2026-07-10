# Site-wide i18n (Chinese + Arabic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user switch the entire site between English, Chinese (`zh`), and Arabic (`ar`), rendered correctly on first server paint, with full RTL layout for Arabic.

**Architecture:** Introduce `react-i18next` from scratch. A `rmh-lang` cookie is the source of truth, resolved server-side in the root loader so SSR renders in the chosen language. A per-request i18next instance is used on the server; a singleton on the client. `<html lang/dir>` is set server-side. Chinese/Arabic catalogs are AI-generated at build time by a committed, re-runnable script and committed to the repo. Strings are extracted route-group by route-group; this plan delivers the full infrastructure plus the nav/chrome group.

**Tech Stack:** TanStack Start, React 19, Vite, Tailwind v4, Zustand, Vitest (node env), `i18next`, `react-i18next`, `i18next-parser` (dev).

## Global Constraints

- Supported locales are exactly `en`, `zh`, `ar`. `en` is the fallback (`fallbackLng: "en"`) and the source of truth.
- `dir` is `rtl` for `ar`, `ltr` for everything else.
- The locale cookie name is exactly `rmh-lang`.
- Tests live under `lib/__tests__/**` (the only app path collected by `vitest.config.ts`) and run in the **node** environment — no jsdom, no `@testing-library`. Test pure functions; pass fake element/request objects rather than relying on a real DOM.
- Run tests with: `pnpm exec vitest run <file>`.
- Path alias `@` maps to the repo root (e.g. `@/lib/i18n/config`).
- Package manager is **pnpm**. Add dependencies with `pnpm add` / `pnpm add -D`.
- Follow the existing `themeStore` pattern for the locale store (plain Zustand `create`, no persist middleware).
- Commit after every task.

---

### Task 1: i18n core config + `dirFor`

**Files:**
- Create: `lib/i18n/config.ts`
- Test: `lib/__tests__/i18n-config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LOCALES = ["en","zh","ar"] as const`
  - `type Locale = (typeof LOCALES)[number]`
  - `DEFAULT_LOCALE: Locale = "en"`
  - `NAMESPACES = ["common","nav"] as const`
  - `LOCALE_LABELS: Record<Locale,string>` → `{ en:"English", zh:"中文", ar:"العربية" }`
  - `TRANSLATE_TARGETS: Record<Exclude<Locale,"en">,string>` → `{ zh:"Chinese (Simplified)", ar:"Arabic" }`
  - `isLocale(value: unknown): value is Locale`
  - `dirFor(locale: Locale): "ltr" | "rtl"`
  - `buildInitOptions(locale: Locale, resources: Record<string, any>): import("i18next").InitOptions` — returns `{ lng: locale, fallbackLng: "en", supportedLngs: [...LOCALES], ns: [...NAMESPACES], defaultNS: "common", resources, interpolation: { escapeValue: false }, returnNull: false }`

- [ ] **Step 1: Install dependencies**

Run:
```bash
pnpm add i18next react-i18next && pnpm add -D i18next-parser
```
Expected: packages added to `package.json`, no peer-dependency errors.

- [ ] **Step 2: Write the failing test**

Create `lib/__tests__/i18n-config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { dirFor, isLocale, DEFAULT_LOCALE, LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";

describe("i18n config", () => {
  it("marks Arabic as rtl and others as ltr", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    expect(dirFor("zh")).toBe("ltr");
  });
  it("validates locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
  it("exposes a label for every supported locale", () => {
    for (const l of LOCALES) expect(LOCALE_LABELS[l]).toBeTruthy();
  });
  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/i18n-config.test.ts`
Expected: FAIL — cannot resolve `@/lib/i18n/config`.

- [ ] **Step 4: Write the implementation**

Create `lib/i18n/config.ts`:
```ts
import type { InitOptions } from "i18next";

export const LOCALES = ["en", "zh", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const NAMESPACES = ["common", "nav"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ar: "العربية",
};

/** Human-readable target names passed to the AI translate helper. */
export const TRANSLATE_TARGETS: Record<Exclude<Locale, "en">, string> = {
  zh: "Chinese (Simplified)",
  ar: "Arabic",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function buildInitOptions(
  locale: Locale,
  resources: Record<string, any>,
): InitOptions {
  return {
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    ns: [...NAMESPACES],
    defaultNS: "common",
    resources,
    interpolation: { escapeValue: false },
    returnNull: false,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/i18n-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/i18n/config.ts lib/__tests__/i18n-config.test.ts
git commit -m "feat(i18n): add react-i18next deps and core locale config"
```

---

### Task 2: Server locale resolution

**Files:**
- Create: `lib/i18n/resolve.ts`
- Test: `lib/__tests__/i18n-resolve.test.ts`

**Interfaces:**
- Consumes: `Locale`, `DEFAULT_LOCALE`, `isLocale`, `LOCALES` from `@/lib/i18n/config`.
- Produces:
  - `LOCALE_COOKIE = "rmh-lang"`
  - `resolveLocale(input: { cookie?: string | null; acceptLanguage?: string | null }): Locale` — precedence: valid `rmh-lang` cookie value → first supported match in `Accept-Language` → `DEFAULT_LOCALE`.
  - `parseLocaleCookie(cookieHeader: string | null | undefined): string | null` — extracts the `rmh-lang` value from a raw `Cookie:` header.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/i18n-resolve.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveLocale, parseLocaleCookie } from "@/lib/i18n/resolve";

describe("resolveLocale", () => {
  it("prefers a valid cookie", () => {
    expect(resolveLocale({ cookie: "ar", acceptLanguage: "en-US,en" })).toBe("ar");
  });
  it("ignores an invalid cookie and falls back to Accept-Language", () => {
    expect(resolveLocale({ cookie: "fr", acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8" })).toBe("zh");
  });
  it("matches Accept-Language by base language", () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: "ar-EG,ar;q=0.9" })).toBe("ar");
  });
  it("defaults to en when nothing matches", () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: "de-DE,de" })).toBe("en");
  });
  it("defaults to en when no signal at all", () => {
    expect(resolveLocale({})).toBe("en");
  });
});

describe("parseLocaleCookie", () => {
  it("extracts rmh-lang from a cookie header", () => {
    expect(parseLocaleCookie("foo=1; rmh-lang=zh; bar=2")).toBe("zh");
  });
  it("returns null when absent", () => {
    expect(parseLocaleCookie("foo=1")).toBe(null);
    expect(parseLocaleCookie(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/i18n-resolve.test.ts`
Expected: FAIL — cannot resolve `@/lib/i18n/resolve`.

- [ ] **Step 3: Write the implementation**

Create `lib/i18n/resolve.ts`:
```ts
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "@/lib/i18n/config";

export const LOCALE_COOKIE = "rmh-lang";

export function parseLocaleCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((p) => p.split(";")[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
    const exact = (LOCALES as readonly string[]).find((l) => l === tag);
    if (exact) return exact as Locale;
  }
  return null;
}

export function resolveLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return matchAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/i18n-resolve.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/resolve.ts lib/__tests__/i18n-resolve.test.ts
git commit -m "feat(i18n): add cookie/Accept-Language locale resolution"
```

---

### Task 3: Seed message catalogs + parser config + extract script

**Files:**
- Create: `locales/en/common.json`, `locales/en/nav.json`
- Create: `locales/zh/common.json`, `locales/zh/nav.json`, `locales/ar/common.json`, `locales/ar/nav.json`
- Create: `i18next-parser.config.js`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: catalog files keyed by namespace; English values are real copy, `zh`/`ar` start as copies of English (to be overwritten by Task 5's translate script). Keys used by later tasks: `nav:home`, `nav:explore`, `nav:settings`, `nav:language`, `common:skipToContent`, `common:languageEnglish`, `common:languageChinese`, `common:languageArabic`.

- [ ] **Step 1: Create the English catalogs**

`locales/en/common.json`:
```json
{
  "skipToContent": "Skip to content",
  "languageEnglish": "English",
  "languageChinese": "Chinese",
  "languageArabic": "Arabic"
}
```

`locales/en/nav.json`:
```json
{
  "home": "Home",
  "explore": "Explore",
  "settings": "Settings",
  "language": "Language"
}
```

- [ ] **Step 2: Seed zh/ar catalogs as English copies**

Create `locales/zh/common.json`, `locales/ar/common.json` with the **same content** as `locales/en/common.json`, and `locales/zh/nav.json`, `locales/ar/nav.json` with the same content as `locales/en/nav.json`. (Task 5 overwrites these with translations; copying guarantees valid renders meanwhile.)

- [ ] **Step 3: Create the parser config**

`i18next-parser.config.js`:
```js
/** Extracts t("...") keys from the app into locales/<lng>/<ns>.json. */
export default {
  locales: ["en", "zh", "ar"],
  defaultNamespace: "common",
  namespaceSeparator: ":",
  keySeparator: false,
  input: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  output: "locales/$LOCALE/$NAMESPACE.json",
  sort: true,
  keepRemoved: false,
  createOldCatalogs: false,
  // Do not overwrite existing translated values with the key/default.
  resetDefaultValueLocale: "en",
};
```

- [ ] **Step 4: Add npm scripts**

In `package.json` `scripts`, add:
```json
"i18n:extract": "i18next 'app/**/*.{ts,tsx}' 'components/**/*.{ts,tsx}'",
"i18n:translate": "pnpm exec tsx scripts/translate-locales.ts"
```

- [ ] **Step 5: Verify extraction runs without clobbering**

Run: `pnpm run i18n:extract`
Expected: command exits 0; `locales/en/*.json` still contains the seeded keys (no keys deleted). It is fine if it reports parsed files; there are no `t()` calls yet beyond what later tasks add.

- [ ] **Step 6: Commit**

```bash
git add locales i18next-parser.config.js package.json
git commit -m "feat(i18n): seed catalogs, parser config, and i18n scripts"
```

---

### Task 4: Build-time translation script

**Files:**
- Create: `scripts/translate-locales.ts`
- Create: `lib/i18n/diff.ts`
- Test: `lib/__tests__/i18n-diff.test.ts`

**Interfaces:**
- Consumes: `translateText(text: string, target: string): Promise<string>` from `@/lib/ai/text.server`; `LOCALES`, `NAMESPACES`, `TRANSLATE_TARGETS` from `@/lib/i18n/config`.
- Produces (in `lib/i18n/diff.ts`):
  - `type Catalog = Record<string, string>`
  - `keysToTranslate(args: { source: Catalog; sources: Catalog; target: Catalog }): string[]` — returns keys where the target value is missing OR the recorded English source (`sources[key]`) differs from the current English `source[key]`. This is the pure logic the script uses; it lets humans hand-edit a translated value and keep it unless the English changes.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/i18n-diff.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { keysToTranslate } from "@/lib/i18n/diff";

describe("keysToTranslate", () => {
  it("includes keys missing from target", () => {
    const out = keysToTranslate({ source: { a: "A", b: "B" }, sources: {}, target: { a: "X" } });
    expect(out).toEqual(["b"]);
  });
  it("includes keys whose English source changed", () => {
    const out = keysToTranslate({
      source: { a: "A2" },
      sources: { a: "A1" },
      target: { a: "translated" },
    });
    expect(out).toEqual(["a"]);
  });
  it("skips keys already translated from the same English source", () => {
    const out = keysToTranslate({
      source: { a: "A" },
      sources: { a: "A" },
      target: { a: "translated" },
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/i18n-diff.test.ts`
Expected: FAIL — cannot resolve `@/lib/i18n/diff`.

- [ ] **Step 3: Implement the diff helper**

Create `lib/i18n/diff.ts`:
```ts
export type Catalog = Record<string, string>;

/**
 * Keys needing (re)translation: missing in target, or whose recorded English
 * source no longer matches the current English source. Human-edited target
 * values survive unless their English changes.
 */
export function keysToTranslate(args: {
  source: Catalog;
  sources: Catalog;
  target: Catalog;
}): string[] {
  const { source, sources, target } = args;
  return Object.keys(source).filter(
    (key) => !(key in target) || sources[key] !== source[key],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/i18n-diff.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the translation script**

Create `scripts/translate-locales.ts`:
```ts
/**
 * Generate zh/ar catalogs from the English source of truth.
 * Idempotent: only (re)translates missing or English-changed keys, and records
 * the English source it translated from in locales/<lng>/.sources.<ns>.json so
 * human edits survive. Requires the AI provider env vars used by translateText.
 *
 * Usage: pnpm run i18n:translate
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { translateText } from "@/lib/ai/text.server";
import { LOCALES, NAMESPACES, TRANSLATE_TARGETS } from "@/lib/i18n/config";
import { keysToTranslate, type Catalog } from "@/lib/i18n/diff";

const ROOT = join(process.cwd(), "locales");

function read(path: string): Catalog {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}
function write(path: string, data: Catalog) {
  writeFileSync(path, JSON.stringify(sortKeys(data), null, 2) + "\n");
}
function sortKeys(data: Catalog): Catalog {
  return Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
}

async function run() {
  for (const ns of NAMESPACES) {
    const source = read(join(ROOT, "en", `${ns}.json`));
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const target = read(join(ROOT, locale, `${ns}.json`));
      const sourcesPath = join(ROOT, locale, `.sources.${ns}.json`);
      const sources = read(sourcesPath);
      const todo = keysToTranslate({ source, sources, target });
      if (todo.length === 0) {
        console.log(`[i18n] ${locale}/${ns}: up to date`);
        continue;
      }
      console.log(`[i18n] ${locale}/${ns}: translating ${todo.length} key(s)`);
      for (const key of todo) {
        try {
          target[key] = await translateText(source[key], TRANSLATE_TARGETS[locale as "zh" | "ar"]);
          sources[key] = source[key];
        } catch (err) {
          console.warn(`[i18n]   skip "${key}": ${(err as Error).message}`);
        }
      }
      write(join(ROOT, locale, `${ns}.json`), target);
      write(sourcesPath, sources);
    }
  }
}

run().then(() => console.log("[i18n] done")).catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Generate the real translations**

Run: `pnpm run i18n:translate`
Expected: logs translating keys for `zh` and `ar`; `locales/zh/*.json` and `locales/ar/*.json` now contain non-English text; `.sources.*.json` files written. (Requires AI env vars; if unavailable in this environment, note it and leave the seeded English copies — the integrity test in Task 9 still passes.)

- [ ] **Step 7: Commit**

```bash
git add lib/i18n/diff.ts lib/__tests__/i18n-diff.test.ts scripts/translate-locales.ts locales
git commit -m "feat(i18n): add build-time AI translation script and generate zh/ar"
```

---

### Task 5: Client/server i18n instances + React provider

**Files:**
- Create: `lib/i18n/resources.ts`
- Create: `lib/i18n/instances.ts`
- Create: `lib/i18n/dom.ts`
- Create: `components/i18n/AppI18nProvider.tsx`
- Test: `lib/__tests__/i18n-dom.test.ts`

**Interfaces:**
- Consumes: `buildInitOptions`, `Locale`, `dirFor` from config; catalogs from `locales/`.
- Produces:
  - `RESOURCES` (in `resources.ts`) — `{ en: { common, nav }, zh: {...}, ar: {...} }` built from static JSON imports.
  - `getServerI18n(locale: Locale)` — returns a **new** initialized instance per call (SSR isolation).
  - `clientI18n` + `ensureClientLocale(locale: Locale)` (in `instances.ts`) — singleton, initialized once; `ensureClientLocale` calls `changeLanguage` if needed.
  - `applyHtmlLangDir(locale: Locale, el: { lang: string; setAttribute(n: string, v: string): void }): void` (in `dom.ts`) — sets `el.lang` and `dir` attribute. Pure/testable with a fake element.
  - `AppI18nProvider({ locale, children })` — wraps children in `<I18nextProvider>` using the server instance during SSR and the client singleton in the browser.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/i18n-dom.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applyHtmlLangDir } from "@/lib/i18n/dom";

function fakeEl() {
  const attrs: Record<string, string> = {};
  return {
    lang: "",
    setAttribute(n: string, v: string) { attrs[n] = v; },
    attrs,
  };
}

describe("applyHtmlLangDir", () => {
  it("sets lang and rtl dir for Arabic", () => {
    const el = fakeEl();
    applyHtmlLangDir("ar", el);
    expect(el.lang).toBe("ar");
    expect(el.attrs.dir).toBe("rtl");
  });
  it("sets ltr dir for Chinese", () => {
    const el = fakeEl();
    applyHtmlLangDir("zh", el);
    expect(el.lang).toBe("zh");
    expect(el.attrs.dir).toBe("ltr");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/i18n-dom.test.ts`
Expected: FAIL — cannot resolve `@/lib/i18n/dom`.

- [ ] **Step 3: Implement `dom.ts`**

Create `lib/i18n/dom.ts`:
```ts
import { dirFor, type Locale } from "@/lib/i18n/config";

export function applyHtmlLangDir(
  locale: Locale,
  el: { lang: string; setAttribute(name: string, value: string): void },
): void {
  el.lang = locale;
  el.setAttribute("dir", dirFor(locale));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/i18n-dom.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement resources + instances + provider**

Create `lib/i18n/resources.ts`:
```ts
import enCommon from "@/locales/en/common.json";
import enNav from "@/locales/en/nav.json";
import zhCommon from "@/locales/zh/common.json";
import zhNav from "@/locales/zh/nav.json";
import arCommon from "@/locales/ar/common.json";
import arNav from "@/locales/ar/nav.json";

export const RESOURCES = {
  en: { common: enCommon, nav: enNav },
  zh: { common: zhCommon, nav: zhNav },
  ar: { common: arCommon, nav: arNav },
} as const;
```

Create `lib/i18n/instances.ts`:
```ts
import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { buildInitOptions, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { RESOURCES } from "@/lib/i18n/resources";

/** Fresh instance per server request — never share mutable lng across requests. */
export function getServerI18n(locale: Locale): i18n {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init(buildInitOptions(locale, RESOURCES));
  return instance;
}

/** Singleton client instance, initialized once. */
export const clientI18n: i18n = i18next.createInstance();
let clientReady = false;

export function ensureClientLocale(locale: Locale): i18n {
  if (!clientReady) {
    clientI18n.use(initReactI18next).init(buildInitOptions(locale, RESOURCES));
    clientReady = true;
  } else if (clientI18n.language !== locale) {
    void clientI18n.changeLanguage(locale);
  }
  return clientI18n;
}

export { DEFAULT_LOCALE };
```

Create `components/i18n/AppI18nProvider.tsx`:
```tsx
import { type ReactNode, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import type { Locale } from "@/lib/i18n/config";
import { getServerI18n, ensureClientLocale } from "@/lib/i18n/instances";

/**
 * Provides an i18next instance to the tree. On the server a fresh per-request
 * instance is created (useMemo runs once per render = per request); on the
 * client the singleton is reused and switched to `locale`.
 */
export function AppI18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const instance = useMemo(
    () => (typeof window === "undefined" ? getServerI18n(locale) : ensureClientLocale(locale)),
    [locale],
  );
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
```

- [ ] **Step 6: Verify it type-checks and tests still pass**

Run: `pnpm exec vitest run lib/__tests__/i18n-dom.test.ts && pnpm run lint`
Expected: tests PASS; lint reports no errors for the new files. (JSON imports resolve via the `@` alias; if lint flags an unused export, remove it.)

- [ ] **Step 7: Commit**

```bash
git add lib/i18n/resources.ts lib/i18n/instances.ts lib/i18n/dom.ts components/i18n/AppI18nProvider.tsx lib/__tests__/i18n-dom.test.ts
git commit -m "feat(i18n): add server/client instances and React provider"
```

---

### Task 6: Wire locale through the root loader, document, and Providers

**Files:**
- Modify: `app/routes/__root.tsx`
- Modify: `components/Providers.tsx`

**Interfaces:**
- Consumes: `resolveLocale`, `parseLocaleCookie` from `@/lib/i18n/resolve`; `dirFor`, `type Locale` from config; `AppI18nProvider`.
- Produces: the root loader returns `{ user, locale }`; `RootDocument` renders `<html lang dir>`; `Providers` accepts a `locale` prop and wraps its tree in `AppI18nProvider`.

- [ ] **Step 1: Resolve locale in the root loader**

In `app/routes/__root.tsx`, change `getInitialUser` so the loader also returns the locale. Add a server fn (or extend the existing one) — replace the loader wiring:

Replace `loader: () => getInitialUser(),` with a loader that resolves both. Add near `getInitialUser`:
```ts
import { resolveLocale, parseLocaleCookie } from "@/lib/i18n/resolve";

const getInitialLocale = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookie = parseLocaleCookie(request.headers.get("cookie"));
  return resolveLocale({ cookie, acceptLanguage: request.headers.get("accept-language") });
});
```
And change the Route loader:
```ts
loader: async () => ({
  user: await getInitialUser(),
  locale: await getInitialLocale(),
}),
```

- [ ] **Step 2: Apply lang/dir on `<html>` and add the inline guard**

In `__root.tsx`, add an inline guard script constant next to `themeScript`:
```ts
const localeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )rmh-lang=([^;]+)/);var l=m?decodeURIComponent(m[1]):"en";if(["en","zh","ar"].indexOf(l)<0)l="en";document.documentElement.lang=l;document.documentElement.setAttribute("dir",l==="ar"?"rtl":"ltr")}catch(e){}})()`;
```
Add `{ children: localeScript }` to the non-Discord `scripts` array in `head`.

Update `RootDocument` to take the locale from loader data and the new `RootComponent` wiring. Change `RootDocument`'s signature and `<html>`:
```tsx
import { dirFor, type Locale } from "@/lib/i18n/config";

function RootDocument({ children }: { children: ReactNode }) {
  const data = Route.useLoaderData();
  const locale = (data?.locale ?? "en") as Locale;
  return (
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      {/* head + body unchanged */}
```
(Keep the existing `<head>`/`<body>` contents and the `bodyThemeScript`.)

> **Robustness note:** `RootDocument` is registered as `shellComponent`. If `Route.useLoaderData()` is not available in the shell in this TanStack Start version (verify in Step 5), it's acceptable to leave `<html lang="en" dir="ltr">` as the server default and rely on the `localeScript` guard (which runs in `<head>` before the body paints) to correct `lang`/`dir` pre-hydration. SSR-translated *text* does not depend on this — it comes from `AppI18nProvider` in `RootComponent`, which always has loader data.

- [ ] **Step 3: Pass locale into Providers**

In `RootComponent`, read the loader data shape (now `{ user, locale }`):
```tsx
const { user: initialUser, locale } = Route.useLoaderData();
// ...
return (
  <Providers initialUser={initialUser} locale={(locale ?? "en") as Locale}>
    <Outlet />
  </Providers>
);
```

- [ ] **Step 4: Wrap Providers tree in AppI18nProvider**

In `components/Providers.tsx`, import and use the provider. Add to the `Providers` props type a `locale: Locale` field, import:
```tsx
import { AppI18nProvider } from "@/components/i18n/AppI18nProvider";
import type { Locale } from "@/lib/i18n/config";
```
Wrap the **outermost** returned JSX (inside `QueryClientProvider` is fine, but `AppI18nProvider` should enclose the app UI) so all consumers can call `useTranslation`. Place `<AppI18nProvider locale={locale}>` immediately inside the top-level provider and close it at the end.

- [ ] **Step 5: Verify build/dev renders with correct lang/dir**

Run: `pnpm run lint`
Expected: no errors.
Manual check: start dev (`pnpm dev`), load the site. With no cookie, `<html>` shows `lang` matching your browser and `dir="ltr"`. Setting `document.cookie="rmh-lang=ar"` and reloading yields `<html lang="ar" dir="rtl">` with no English flash on first paint.

- [ ] **Step 6: Commit**

```bash
git add app/routes/__root.tsx components/Providers.tsx
git commit -m "feat(i18n): resolve locale server-side and provide it to the app"
```

---

### Task 7: Locale store + language switcher UI

**Files:**
- Create: `stores/localeStore.ts`
- Create: `components/site/LanguageSwitcher.tsx`
- Modify: `components/feed/LeftSidebar.tsx`
- Modify: `components/feed/MobileNav.tsx`
- Test: `lib/__tests__/locale-store.test.ts`

**Interfaces:**
- Consumes: `Locale`, `LOCALES`, `LOCALE_LABELS`, `dirFor` from config; `LOCALE_COOKIE` from resolve; `ensureClientLocale` from instances; `applyHtmlLangDir` from dom.
- Produces:
  - `writeLocaleCookie(locale: Locale, doc?: { cookie: string }): void` — writes `rmh-lang=<locale>; path=/; max-age=31536000; samesite=lax`. Accepts an injectable doc-like object for testing.
  - `useLocaleStore` — Zustand store `{ locale: Locale; setLocale(locale: Locale): void }`. `setLocale` writes the cookie, calls `ensureClientLocale`, applies `applyHtmlLangDir` to `document.documentElement`, and updates state. All DOM/i18n side effects guarded by `typeof window !== "undefined"`.
  - `LanguageSwitcher` — globe button opening a 3-option menu using `LOCALE_LABELS`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/locale-store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { writeLocaleCookie } from "@/stores/localeStore";

describe("writeLocaleCookie", () => {
  it("writes the rmh-lang cookie for the given locale", () => {
    const doc = { cookie: "" };
    writeLocaleCookie("ar", doc);
    expect(doc.cookie).toContain("rmh-lang=ar");
    expect(doc.cookie).toContain("path=/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/locale-store.test.ts`
Expected: FAIL — cannot resolve `@/stores/localeStore`.

- [ ] **Step 3: Implement the store**

Create `stores/localeStore.ts`:
```ts
import { create } from "zustand";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { LOCALE_COOKIE } from "@/lib/i18n/resolve";
import { ensureClientLocale } from "@/lib/i18n/instances";
import { applyHtmlLangDir } from "@/lib/i18n/dom";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function writeLocaleCookie(locale: Locale, doc: { cookie: string } = document) {
  doc.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleStore>((set) => ({
  locale: DEFAULT_LOCALE,
  setLocale: (locale) => {
    if (typeof window !== "undefined") {
      writeLocaleCookie(locale);
      ensureClientLocale(locale);
      applyHtmlLangDir(locale, document.documentElement);
    }
    set({ locale });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/locale-store.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Build the LanguageSwitcher**

Create `components/site/LanguageSwitcher.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useLocaleStore } from "@/stores/localeStore";

/** Compact language picker (globe + 3 options). */
export function LanguageSwitcher() {
  const { t } = useTranslation("nav");
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  return (
    <label className="flex items-center gap-2 text-sm" aria-label={t("language")}>
      <Globe className="h-4 w-4 shrink-0" aria-hidden />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-transparent outline-none cursor-pointer"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
        ))}
      </select>
    </label>
  );
}
```
(If `lucide-react` is not the icon set in use, match whatever `LeftSidebar.tsx` already imports for icons.)

- [ ] **Step 6: Mount it in the sidebar and mobile nav**

In `components/feed/LeftSidebar.tsx`, import `LanguageSwitcher` and render it near the bottom of the nav (e.g. beside or below the existing theme/style control). In `components/feed/MobileNav.tsx`, import and render it in the nav's overflow/menu area. Read each file first and follow its existing layout/spacing classes; insert `<LanguageSwitcher />` where the theme switcher or settings link lives.

- [ ] **Step 7: Initialize the store from the resolved locale**

So the switcher reflects the server-resolved locale on load, set the store's initial value after hydration. In `components/Providers.tsx`, inside the existing client effect area, add an effect:
```tsx
import { useLocaleStore } from "@/stores/localeStore";
// inside Providers component body:
useEffect(() => {
  useLocaleStore.setState({ locale });
}, [locale]);
```
(This syncs the store to the SSR-resolved `locale` without re-writing the cookie.)

- [ ] **Step 8: Verify**

Run: `pnpm exec vitest run lib/__tests__/locale-store.test.ts && pnpm run lint`
Expected: test PASS, lint clean.
Manual: in dev, the switcher appears in the sidebar and mobile nav; choosing 中文/العربية changes the visible nav strings live and (for Arabic) flips `<html dir="rtl">`; reloading preserves the choice via cookie.

- [ ] **Step 9: Commit**

```bash
git add stores/localeStore.ts components/site/LanguageSwitcher.tsx components/feed/LeftSidebar.tsx components/feed/MobileNav.tsx components/Providers.tsx lib/__tests__/locale-store.test.ts
git commit -m "feat(i18n): add locale store and language switcher in nav"
```

---

### Task 8: Language control on the settings page

**Files:**
- Modify: `app/routes/strategies/profile/settings.tsx`

**Interfaces:**
- Consumes: `useLocaleStore`, `LOCALES`, `LOCALE_LABELS`.

- [ ] **Step 1: Read the settings page**

Open `app/routes/strategies/profile/settings.tsx` and locate the existing timezone `<select>` block to mirror its label/markup conventions.

- [ ] **Step 2: Add the language select**

Beside the timezone control, add a language field mirroring the timezone block's structure:
```tsx
import { useLocaleStore } from "@/stores/localeStore";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useTranslation } from "react-i18next";
// ...
const { t } = useTranslation("nav");
const locale = useLocaleStore((s) => s.locale);
const setLocale = useLocaleStore((s) => s.setLocale);
// in JSX, mirroring the timezone field's wrapper/label classes:
<label>
  <span>{t("language")}</span>
  <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
    {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
  </select>
</label>
```
Use the same wrapper/label classNames the timezone control uses so it visually matches.

- [ ] **Step 3: Verify**

Run: `pnpm run lint`
Expected: clean.
Manual: the settings page shows a Language select; changing it updates the site language and stays in sync with the nav switcher (shared store).

- [ ] **Step 4: Commit**

```bash
git add app/routes/strategies/profile/settings.tsx
git commit -m "feat(i18n): add language selector to profile settings"
```

---

### Task 9: Catalog integrity test

**Files:**
- Test: `lib/__tests__/i18n-catalogs.test.ts`

**Interfaces:**
- Consumes: `LOCALES`, `NAMESPACES` from config; catalog JSON files.

- [ ] **Step 1: Write the test**

Create `lib/__tests__/i18n-catalogs.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES, NAMESPACES } from "@/lib/i18n/config";

function load(locale: string, ns: string): Record<string, string> {
  return JSON.parse(readFileSync(join(process.cwd(), "locales", locale, `${ns}.json`), "utf8"));
}

describe("catalog integrity", () => {
  for (const ns of NAMESPACES) {
    const en = Object.keys(load("en", ns)).sort();
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      it(`${locale}/${ns} has exactly the English key set`, () => {
        expect(Object.keys(load(locale, ns)).sort()).toEqual(en);
      });
    }
  }
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run lib/__tests__/i18n-catalogs.test.ts`
Expected: PASS — every `zh`/`ar` namespace has the same keys as `en`. (If it fails, run `pnpm run i18n:extract && pnpm run i18n:translate` to resync, then re-run.)

- [ ] **Step 3: Commit**

```bash
git add lib/__tests__/i18n-catalogs.test.ts
git commit -m "test(i18n): assert zh/ar catalogs match the English key set"
```

---

### Task 10: RTL base styles + chrome audit

**Files:**
- Modify: `app/globals.css`
- Modify: `app/routes/_site.tsx` (extract the "Skip to content" string)

**Interfaces:**
- Consumes: `useTranslation` from react-i18next.

- [ ] **Step 1: Extract the first chrome string as a pattern example**

In `app/routes/_site.tsx`, replace the hardcoded `Skip to content` text with a translated call. At the top of the component add `const { t } = useTranslation("common");` (import `useTranslation` from `react-i18next`) and replace the literal with `{t("skipToContent")}`. The key already exists in `locales/en/common.json` from Task 3.

- [ ] **Step 2: Add base RTL overrides**

Append an RTL section to `app/globals.css`:
```css
/* ----- RTL support (Arabic) ----- */
[dir="rtl"] body { text-align: right; }
/* Flip directional chevron/arrow icons that imply forward/back. */
[dir="rtl"] .rtl-flip { transform: scaleX(-1); }
```
For the left sidebar and mobile nav, prefer Tailwind logical utilities when editing them (replace `pl-*`→`ps-*`, `pr-*`→`pe-*`, `left-*`→`start-*`, `right-*`→`end-*`, `ml-*`→`ms-*`, `mr-*`→`me-*`, `text-left`→`text-start`). Add the `rtl-flip` class to any back/forward chevron icons in `LeftSidebar.tsx`/`MobileNav.tsx`.

- [ ] **Step 3: Verify RTL chrome**

Run: `pnpm run lint`
Expected: clean.
Manual: switch to العربية. The sidebar/nav mirror to the right side, text is right-aligned, directional chevrons point the correct way, and no chrome element is clipped or overlapping. Switch back to English/中文 and confirm the layout is unchanged (`ltr`).

- [ ] **Step 4: Re-extract and resync catalogs**

Run: `pnpm run i18n:extract && pnpm run i18n:translate`
Expected: any newly added `t()` keys appear in `en` and get translated into `zh`/`ar`. Re-run `pnpm exec vitest run lib/__tests__/i18n-catalogs.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/routes/_site.tsx locales
git commit -m "feat(i18n): add RTL base styles and extract first chrome string"
```

---

### Task 11: Document the repeatable extraction pattern (for follow-up PRs)

**Files:**
- Create: `docs/superpowers/i18n-extraction-guide.md`

This task captures the repeatable loop so each subsequent route-group PR (feed, games, library, news, profile, …) is mechanical. No code; it documents the established pattern from Tasks 3–10.

- [ ] **Step 1: Write the guide**

Create `docs/superpowers/i18n-extraction-guide.md` documenting the per-route-group loop:
1. Pick one route group (e.g. `components/feed/**` + its routes).
2. For each component: add `const { t } = useTranslation("<namespace>")`, replace hardcoded JSX strings with `t("key")`, using interpolation (`t("greeting", { name })`) for dynamic text. Add the namespace to `NAMESPACES` in `lib/i18n/config.ts` and to `RESOURCES`/imports in `lib/i18n/resources.ts` when introducing a new one.
3. Run `pnpm run i18n:extract` to populate `locales/en/<ns>.json`.
4. Fill real English copy where the parser used the key as a placeholder.
5. Run `pnpm run i18n:translate` to generate `zh`/`ar`.
6. Audit RTL for the group (logical Tailwind utilities + `[dir=rtl]` overrides + `rtl-flip` on directional icons).
7. Run `pnpm exec vitest run lib/__tests__/i18n-catalogs.test.ts` (and lint) → must pass.
8. Commit; open a PR scoped to that group.

Include the note: a new namespace must be registered in **both** `config.ts` (`NAMESPACES`) and `resources.ts` (import + `RESOURCES` entry) or it will not load.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/i18n-extraction-guide.md
git commit -m "docs(i18n): document the per-route-group extraction loop"
```

---

## Definition of Done (this plan / PR 1)

- All Vitest suites under `lib/__tests__/i18n-*.test.ts` and `lib/__tests__/locale-store.test.ts` pass.
- The site can be switched between English, 中文, and العربية from both the nav switcher and the settings page.
- First paint renders in the cookie/Accept-Language–resolved language with no English flash; `<html lang/dir>` is correct server-side.
- Arabic renders RTL across the nav/chrome without layout breakage.
- `zh`/`ar` catalogs are committed and key-complete with `en`.
- The extraction guide exists so remaining route groups can be localized incrementally in follow-up PRs.
