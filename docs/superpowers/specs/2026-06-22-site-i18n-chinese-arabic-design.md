# Site-wide Internationalization — English / 中文 / العربية

**Date:** 2026-06-22
**Status:** Approved (design)
**Topic:** Add full site i18n with Chinese (`zh`) and Arabic (`ar`) language options, including RTL support.

## Summary

The site (TanStack Start + React 19 + Vite + Tailwind v4) currently has **no i18n
infrastructure**: all user-facing text is hardcoded English across `app/routes/`
and `components/`, `<html lang="en">` is static, and there is no RTL support.

This project introduces real i18n from scratch using **`react-i18next`**, lets a
user switch the entire site between **English, Chinese, and Arabic**, and adds
**RTL layout** for Arabic. Translated text is rendered correctly on the **first
server paint** (no "English flash"). Chinese/Arabic catalogs are **AI-generated at
build time** (reusing the repo's existing `translateText` helper) and committed to
the repo.

## Goals

- A language switcher that changes the whole site between `en` / `zh` / `ar`.
- Server-side rendering already in the selected language (no flash of English).
- Full RTL layout for Arabic (`<html dir="rtl">` + mirrored UI).
- A repeatable pipeline to extract English strings and generate translations.

## Non-Goals

- Localizing user-generated content (posts/comments) — separate AI-translation
  features already exist for that and are out of scope here.
- URL-based locale routing (`/zh`, `/ar`). Locale is cookie-based; URLs unchanged.
- Professional/human translation sourcing. Catalogs are AI-generated; humans may
  hand-correct individual strings later by editing the committed catalogs.
- Localizing number/date/currency formatting beyond what `i18next` provides by
  default (can be a follow-up).

## Decisions (from brainstorming)

- **Approach:** Proper i18n infrastructure AND translate the whole site (not a
  machine-translation overlay, not core-UI-only).
- **Translation source:** AI-generated at build time, committed catalogs.
- **Library:** `react-i18next` + `i18next` (mature, framework-agnostic, and its
  companion `i18next-parser` auto-extracts the hundreds of existing strings).
- **Persistence:** Cookie + Zustand store (mirroring the existing `themeStore`
  pattern), read **server-side** so SSR renders in the right language.
- **Switcher placement:** Left sidebar nav + mobile nav, AND the profile settings
  page.
- **First-visit default:** Derive locale from the browser `Accept-Language` header
  when no `rmh-lang` cookie is present; otherwise default `en`.

## Architecture

### Locale source of truth

- A cookie **`rmh-lang`** with value `en | zh | ar` is the source of truth.
- On the server, the **root loader** (`app/routes/__root.tsx`) reads the cookie
  via `getRequest()`. If absent, it parses `Accept-Language` and picks the best
  supported match, else `en`. The resolved locale is returned from the loader.
- A per-request `i18next` instance is initialized with that locale so all SSR'd
  components render translated text on first paint.
- On the client, `i18next` is initialized once with the same locale (read from the
  cookie) to keep hydration consistent.

### `<html lang>` and `<html dir>`

- `RootDocument` renders `<html lang={locale} dir={dirFor(locale)}>` where
  `dirFor("ar") === "rtl"` and everything else is `"ltr"`. These come from the
  loader data so they are correct server-side.
- A tiny inline guard script (sibling to the existing `themeScript`) reads the
  `rmh-lang` cookie and sets `document.documentElement.lang`/`dir` before
  hydration as belt-and-suspenders. `suppressHydrationWarning` already present.

### SSR i18n instance lifecycle

- Use `i18next.createInstance()` per request (never the shared singleton) to avoid
  cross-request locale bleed in SSR. Initialize with the resolved locale and the
  preloaded catalogs, then wrap the tree in `<I18nextProvider>` (added inside
  `components/Providers.tsx`).
- On the client, a single shared instance initialized at module load with the
  cookie locale, also provided via `<I18nextProvider>`.

## Components & Files

### New

- `lib/i18n/config.ts` — supported locales list, `defaultLocale`, `dirFor(locale)`,
  namespaces list, and the `i18next` init options factory (shared server/client).
- `lib/i18n/server.ts` — `resolveLocale(request)` (cookie → Accept-Language → `en`)
  and `createServerI18n(locale)` returning a per-request instance.
- `lib/i18n/client.ts` — the singleton client `i18next` instance + init.
- `stores/localeStore.ts` — Zustand store: `{ locale, setLocale }`. `setLocale`
  writes the `rmh-lang` cookie, calls `i18n.changeLanguage`, and updates
  `document.documentElement.lang`/`dir` live (no reload).
- `components/site/LanguageSwitcher.tsx` — globe icon + 3 options (`English`,
  `中文`, `العربية`), used in sidebar/mobile nav.
- `locales/<locale>/<namespace>.json` — message catalogs. `en` is source of truth;
  `zh` and `ar` are generated.
- `scripts/translate-locales.ts` — reads `en` catalogs, fills missing/changed keys
  in `zh`/`ar` via the existing `translateText` helper, writes catalogs. Idempotent
  and re-runnable; output committed.
- `i18next-parser.config.js` — extraction config (namespaces, key style, locales,
  input globs for `app/` and `components/`).

### Modified

- `app/routes/__root.tsx` — loader resolves locale; `RootDocument` sets
  `lang`/`dir`; add locale inline guard script.
- `components/Providers.tsx` — wrap children in `<I18nextProvider>` with the
  correct (server vs client) instance.
- `components/.../LeftSidebar` + `MobileNav` — mount `LanguageSwitcher`.
- `app/routes/strategies/profile/settings.tsx` — add a language `<select>` beside
  the existing timezone control.
- `app/globals.css` — add `[dir="rtl"]` overrides for physically-positioned UI.
- `package.json` — add `i18next`, `react-i18next`, `i18next-parser` (dev), and
  scripts: `i18n:extract` (parser) and `i18n:translate` (translate-locales).

## Message Catalogs

- **Namespaced by feature** (e.g. `common`, `nav`, `feed`, `games`, `library`,
  `news`, `profile`, `settings`) so no single file grows unmanageable. Exact
  namespace list finalized during extraction.
- `locales/en/*.json` populated by `i18next-parser` from `t("...")` calls.
- `locales/zh/*.json` and `locales/ar/*.json` generated by `scripts/translate-locales.ts`
  and committed. The script only translates keys that are missing or whose English
  source changed (tracked by storing the source English string or a hash alongside
  generation), so human-corrected strings are not clobbered unless their English
  changed.

## String Extraction (bulk work)

- Replace hardcoded JSX strings with `t("namespace:key")` via `useTranslation()`.
- Done **route-group by route-group** (e.g. `_site` nav/chrome first, then feed,
  then games, etc.) so each PR is a reviewable chunk rather than one mega-diff.
- After each group: run `i18n:extract` to refresh `en`, run `i18n:translate` to
  fill `zh`/`ar`, and audit RTL for that group.

## RTL Support (Arabic)

- Prefer Tailwind v4 **logical-property utilities** (`ps-*`/`pe-*`, `ms-*`/`me-*`,
  `start-*`/`end-*`, `text-start/end`) when touching components during extraction.
- Add targeted `[dir="rtl"]` overrides in `app/globals.css` for components that use
  physical positioning (sidebar, nav, anything with `left/right`/`translateX` or
  directional icons). Audited per route group.
- Icons that imply direction (chevrons/arrows for back/forward) flipped under RTL.

## Data Flow

1. Request arrives → root loader reads `rmh-lang` cookie (or `Accept-Language`) →
   resolves `locale`.
2. Server creates a per-request `i18next` instance with `locale` + catalogs →
   renders `<html lang dir>` and translated markup.
3. Client hydrates with the same locale → no mismatch, no English flash.
4. User picks a language in `LanguageSwitcher` → `localeStore.setLocale` writes
   cookie, `i18n.changeLanguage`, updates `lang`/`dir` → UI re-renders live.
5. Next request uses the cookie.

## Error Handling

- Missing translation key → `i18next` falls back to the `en` value (configured
  `fallbackLng: "en"`), so the UI never shows a raw key.
- Unknown/invalid cookie value → treated as absent; falls back to `Accept-Language`
  then `en`.
- `scripts/translate-locales.ts` failures on a single key are logged and skipped
  (that key keeps its previous value / falls back to `en`) rather than aborting the
  whole run.

## Testing

- **Unit:** `resolveLocale` (cookie precedence, Accept-Language parsing, fallback);
  `dirFor`; `localeStore.setLocale` side effects (cookie + `lang`/`dir`).
- **Catalog integrity:** a test asserting `zh` and `ar` have exactly the same key
  set as `en` per namespace (no missing/orphan keys).
- **Render:** a component renders translated text when locale is `zh`; rendering
  under `ar` yields `dir="rtl"`.

## Rollout / Scope Reality

- **PR 1 (infra, independently shippable):** library install, `lib/i18n/*`, stores,
  Providers wiring, `<html lang/dir>`, `LanguageSwitcher`, settings control,
  extraction/translate scripts + config, and extraction of the **`_site` nav/chrome**
  group as the first proof. At this point all three languages work for the chrome.
- **Subsequent PRs:** one route group per PR — extract strings, regenerate `zh`/`ar`,
  audit RTL. Repeat until the whole site is covered.
