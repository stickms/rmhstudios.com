# Modernization audit — 2026-11-18

**Question:** is the site behind on its dependencies, runtime or React/TypeScript
practices, and would a smaller or newer library replace one of its foundations?

**Answer:** it was close to current. One commit brings 50 dependencies up within
their ranges and upgrades four majors (i18next, react-i18next, stripe, web-push).
The foundations stay: React 19 and Vite 8 are on their latest releases, and
TanStack Router/Start are exact pins that move together as the framework group
(Start is one patch behind, 1.169.4 against 1.169.5, to move with the nitro RC);
nothing smaller replaces them without a rewrite. What is held back
below is held for a stated reason, and each entry names what lifts it.

## Upgraded (commit "Bring dependencies up to date…")

- **Within range:** 50 minor and patch releases (TanStack Query and router
  plugin, Vite, Vitest, Tailwind, better-auth, framer-motion, lucide-react, the
  AWS/OpenAI/Anthropic SDKs, pg-boss, Playwright, and the rest).
- **i18next 26 → 27, react-i18next 17 → 18.** No call site depended on a removed
  behaviour. Two changes fix non-English locales:
  - An empty catalog string now falls back to English instead of rendering
    blank (92 such strings in `ar`, 56 in `ru`).
  - A missing plural form falls back to `_other` in the same language
    (`fr`/`es`/`pt` `_many`).

  Cost: about 0.8 KB Brotli in the entry. The stricter `TFunction` types required
  four hand-written `t` signatures to make their options argument required.
- **stripe 22 → 23** (pins API version `2026-10-28.endive`). `@better-auth/stripe`
  1.7.x declares it as a peer, and neither it nor the repo uses what 23 removed.
  Verified by the integration suite, including webhook signature verification.
- **web-push 3 → 4.** It is ESM-only with no default export, so
  `lib/push/send.server.ts` imports `sendNotification` and `setVapidDetails` by
  name. It loads through both `require()` (the worker bundles) and `import`.

## Upgraded afterwards

- **satori 0.35.1 → 0.63.2.** Its Yoga 3 layout defaults to CSS's
  `content-box`, where 0.35 laid out every element `border-box`, so every padded
  box grew by its padding and each card rendered shifted and cropped.
  `lib/og/satori.server.ts` is now the one way to call satori and sets
  `border-box` on every element that does not choose one
  (`lib/og/__tests__/satori-box.test.ts` holds both). Checked by rendering all
  143 cards before and after (every section, game, app, post, post story,
  profile, the elections/wiki/pf2ecal/sohumtracker pages, the Discord activity
  images and the PWA icons): no layout changes; text sits 1–2 px differently,
  lines wrap slightly fuller, and Arabic punctuation is ordered correctly.
  Arabic, CJK and Greek text render as boxes both before and after, because the
  cards load only Geist.

## Held back, and what lifts each hold

| Package | Held at | Why | Lift when |
| --- | --- | --- | --- |
| `typescript` | 6.0 | TS 7 ships no JavaScript compiler API (planned for 7.1). `typescript-eslint` (peer `<6.1`), `lib/api/__tests__/route-table.test.ts`, `features/rmhos/__tests__/image-publish.test.ts` and `scripts/api-cache-triage.ts` call it. Type-checking already runs on TS 7 through the `typescript-native` alias. | `typescript-eslint` widens its peer range |
| `prisma` | 7.10 | 8.0 is a release candidate and replaces the client API, schema format and migrate commands (794 importing files). | 8.0 is stable, as its own project (Dependabot holds `prisma`, `@prisma/client` and `@prisma/adapter-pg` at `<8`) |
| `nitro` | 3.0 beta | The RC replaces the global `Response` with srvx's `FastResponse` on Node; the `response`-hook header plugins need a boot test. | a build-and-boot run of the integration suite on the RC |

## Runtime

- **Moved to Node 26** (Active LTS since 2026-10-28; 26.13.1) in one PR, with
  `@types/node` 26:
  - `engines` (`>=26.13.0 <27`, in the root and the four workspace packages)
    and `.nvmrc`;
  - the three Node stages of the `Dockerfile` (still Alpine 3.24, so the OS
    packages are unchanged) and the esbuild `--target=node26`;
  - `.github/actions/setup-deps` and every workflow that pins `node-version`.
- **Native modules are N-API prebuilds** (`@napi-rs/canvas`, `@resvg/resvg-js`,
  `sharp`), so they are ABI-independent; all three were exercised on 26.
- **Web Storage.** Node 25 turned on a global `localStorage`. Without
  `--localstorage-file` it is `undefined` (so `typeof localStorage` checks
  behave as on 24) and the first read logs an `ExperimentalWarning`. The test
  environments print it; the web server and the seven Node services did not
  read it in a boot and an integration run.
- **Verified on 26.13.1:** `tsc -b`, the main suite (12,168 tests), `pnpm build`,
  the production server with the integration suite (31 tests), and a start of
  every compose Node service. The image itself is first built by CI.

## Foundations, considered for replacement

| Library | Entry cost | Verdict |
| --- | --- | --- |
| React 19 + react-dom | ~67 KB Brotli (its own chunk) | **Keep.** Preact's compat layer lacks React 19's streaming SSR, selective hydration and `use()`, which TanStack Start and the lazy-hydration work in the low-bandwidth audit rely on, and Radix and framer-motion depend on React internals. |
| TanStack Router + Start | ~150 KB raw (router, data layer, `seroval`) | **Keep.** It is current, and the alternatives are a framework migration of 420 routes. Its remaining cost is per-route `head()` setup, which the router runs during hydration (low-bandwidth audit, "Still open"). |
| i18next + react-i18next | ~13 KB Brotli | **Keep for now; a replacement is feasible.** The site uses a small part of it (flat keys, `{{var}}`, count plurals, namespaces, lazy loading). A ~2–3 KB runtime with the same API and catalogs could save ~12 KB Brotli per page. The risk is silent per-locale differences (plural resolution order, empty-string fallback), so it should only land behind a test that compares both runtimes on every catalog key, every locale and a spread of counts. |
| tailwind-merge | ~7 KB Brotli | **Keep.** `cn()` resolves class conflicts across every component; a lighter merge changes which class wins. |

## Practices

- **Removed React APIs:** none in use (`defaultProps` on function components,
  `propTypes`, string refs, `findDOMNode`, `ReactDOM.render`).
- **Class components:** the 8 that remain are error boundaries, which still
  need classes.
- **TypeScript:** `strict: true`, bundler resolution, ES2022 target, strict
  islands and the escape-hatch ratchet. Sound.
- **Open, in order of value:**
  1. **React Compiler** (stable since 1.0). It memoizes automatically, which
     mostly helps interaction latency on slow phones. Adopt as a pilot on a few
     heavy routes with measurements first: it changes when components
     re-render, and code that relied on re-render timing would show it.
  2. **`forwardRef` → `ref` as a prop** (18 files, most of them `components/ui/`
     primitives). React 19 passes `ref` like any prop, and `forwardRef` is
     slated for deprecation. A mechanical change, but to primitives every page
     renders, so it belongs in its own PR.
  3. **`<Context.Provider>` → `<Context>`** (56 uses). Cosmetic; the old form
     still works.
- **Formatting drift:** `pnpm format:check` reports ~200 files on `main`
  that were never run through Prettier. This predates the audit and is
  unchanged by it. One `pnpm format` commit on its own, reviewed for noise,
  would close it.
- **English catalog drift:** `pnpm i18n:extract` on `main` rewrites about 30
  English catalog files whose strings drifted from the code. The
  i18n-translate workflow translates from `locales/en`, so those keys stay
  English in other locales until extracted.
