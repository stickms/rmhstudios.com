# RMH Studios — Whole-Platform Improvement Plan

**Document type:** Cross-cutting engineering & product audit + roadmap
**Prepared:** 2026-06-30
**Scope:** The entire web application — public site (`app/routes/_site/*`), games, full-screen apps, shared UI primitives, server functions/API routes (`app/routes/api/*`, ~316 files), realtime hubs (`server/*`, `go-services/*`), build/deploy, and developer experience.
**Stack of record:** TanStack Start + Vite 8 + React 19 + Nitro SSR · PostgreSQL/Prisma 7 · Better Auth · Socket.io · Go services (Bazel) · Tailwind v4 · 32-locale i18n · ~2,250 TS/TSX files.

> **How to read this document.** Findings are grouped by dimension. Each dimension opens with **what is already strong** (this is a mature, well-engineered codebase and the plan treats it as such), then a **findings table** with severity, a concrete `file:line` anchor, the current state, and a recommended change. A consolidated, phased **roadmap** is at the end, followed by **KPIs**, **tooling**, and a **definition-of-done** appendix.
>
> **Confidence & method.** Every finding is source-anchored. Where a claim drives a specific code change, it was spot-verified against the live tree on this branch. A handful of items surfaced from *legacy* audit documents were verified to be **already remediated or not present** in the current code; these are listed explicitly in §6 so they are not re-opened by mistake. Items that still need a runtime check (vs. source) are labeled **`VERIFY`**.

---

## Implementation status (branch `claude/website-improvement-ideas-mq41th`)

Shipped on this branch so far. Items that need a **staging URL / seeded DB** for
visual/scroll QA, or a **product/infra decision**, are intentionally not shipped
blind and are listed as deferred.

| Phase | Item | Status |
|---|---|---|
| 0 | Error tracking + route error boundaries + styled 404 | ✅ done |
| 0 | Default OG image (`/images/og/default.png`) | ✅ done |
| 0 | `<main>` landmark so the skip link works | ✅ done |
| 0 | `eslint-plugin-jsx-a11y` (warn) | ✅ done |
| 0 | Security-header parity (Apache CSP Report-Only + Traefik middleware) | ✅ done |
| 0 | Frontend CI gate (typecheck/lint/test/build) | ⏸️ skipped by request (no test gate for now) |
| 1 | Client RUM (Core Web Vitals → `/api/rum`) | ✅ done |
| 1 | JSON-LD structured data (`lib/schema.ts`, wired 4 route types + site-wide) | ✅ done |
| 1 | Canonical URLs on content routes | ✅ done |
| 1 | `hreflang` | ⏸️ deferred — needs per-locale URLs (architectural); same-URL alternates would be invalid |
| 1 | Security VERIFY sweep | ✅ done — Range bounds & Socket CORS confirmed already-fixed; PAT/AI quotas flagged for owner |
| 1 | Form labels + Escape-to-close (first pass) | ✅ done (ComposeBox poll, ImageCropModal) |
| 1 | Stripe payment tests | ⏸️ skipped by request (no tests) |
| 2 | Reduced-motion global gate + `useReducedMotion()` | ✅ done |
| 2 | High-Contrast theme (WCAG AAA) | ✅ done |
| 2 | Skeletons + `useCelebration()` hook | ✅ done |
| 2 | `React.memo` on hot leaves (UserAvatar, OptimizedImage) | ✅ done |
| 2 | PWA manifest (PNG/maskable icons, shortcuts, categories) | ✅ done |
| 2 | Feed list virtualization | ⏸️ deferred — needs scroll/visual QA on dynamic-height feeds |
| 2 | Service worker + Web Push | ⏸️ deferred — a bad SW breaks prod caching; push needs VAPID keys + rollout |
| 2 | Responsive-image rework | ⏸️ deferred — needs per-image above/below-fold judgment on the running app |
| 3 | Dependabot | ✅ done |
| 3 | Docs & DX (rewrite this overview, CONTRIBUTING, Prettier, PR template, `i18n:coverage`) | ✅ done |
| 3 | CSP enforcement | ⏸️ deferred — promote from Report-Only after collecting real violation data |
| 3 | Product features (referral, quote-repost, badges, creator coins, digests) | ⏸️ deferred — schema-changing features; need product sign-off + migration/QA |
| 3 | Resilience (backoff/breaker/DB-retry) + migration/e2e tests | ⏸️ deferred — server behavior needs a runtime to validate; tests skipped by request |

**Verification standard used:** every code change was typechecked (`tsc --noEmit`
stays at the repo's pre-existing baseline with zero new errors in changed files)
and linted, and generated assets were visually checked.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Platform scorecard](#2-platform-scorecard)
3. [Top 12 highest-leverage improvements](#3-top-12-highest-leverage-improvements)
4. [Dimension 1 — Performance & Core Web Vitals](#4-dimension-1--performance--core-web-vitals)
5. [Dimension 2 — Accessibility (WCAG 2.2 AA)](#5-dimension-2--accessibility-wcag-22-aa)
6. [Dimension 3 — Security, Privacy & Abuse-resistance](#6-dimension-3--security-privacy--abuse-resistance)
7. [Dimension 4 — SEO & Discoverability](#7-dimension-4--seo--discoverability)
8. [Dimension 5 — Reliability, Observability & Quality Engineering](#8-dimension-5--reliability-observability--quality-engineering)
9. [Dimension 6 — UX, Engagement & Delight](#9-dimension-6--ux-engagement--delight)
10. [Dimension 7 — Internationalization](#10-dimension-7--internationalization)
11. [Dimension 8 — Documentation & Developer Experience](#11-dimension-8--documentation--developer-experience)
12. [Consolidated roadmap](#12-consolidated-roadmap)
13. [Appendix A — KPIs & instrumentation](#appendix-a--kpis--instrumentation)
14. [Appendix B — Recommended tooling](#appendix-b--recommended-tooling)
15. [Appendix C — Definition of done / PR checklist](#appendix-c--definition-of-done--pr-checklist)

---

## 1. Executive summary

RMH Studios is an unusually ambitious single codebase: a social feed, ~20 browser games (several multiplayer, several 3D), a half-dozen full apps (RMHTube, RMHMusic, RMHType, RMHStudy, RMHCode), a blog/research system, a coin economy, a developer API, a Discord Activity build, and a Go microservice fleet behind it. The engineering bar is already high — manual vendor chunking, server-stub plugins for `.server` files, lazy-loaded locale bundles, intent-based route preloading, content-addressed immutable caching, a blue-green web hot-swap, a Bazel-built Go tier with e2e + Helm-lint CI, and an LLM "senior review" merge gate.

Because the foundations are strong, the highest-value work is **no longer "build the basics" — it is closing the gaps between an excellent core and enterprise-grade consistency.** Those gaps cluster in five places:

1. **The frontend has no CI safety net.** The only GitHub Actions workflows are Go-only (`go-microservices.yml`) and an author-gated LLM review (`senior-review.yml`, gated to one user). A pure TypeScript/React PR can merge with **no typecheck, no lint, no test run, and no build**. This is the single biggest risk-to-effort item in the entire plan.
2. **Accessibility is good in primitives but inconsistent in composition** — Radix-based dialogs and native form controls are solid, but the skip link is a no-op (no `#main-content` target, no `<main>` landmark), ~492 `onClick` handlers include non-keyboard div-buttons, many form fields lack programmatic labels, and `prefers-reduced-motion` is honored in only ~11 of the many Framer Motion/GSAP surfaces.
3. **SEO leaves structured discoverability on the table** — SSR and clean URLs are excellent, but there is **zero JSON-LD**, **no `hreflang`** despite 32 locales, only ~49% of routes set unique titles, and the referenced default OG image (`/images/og/default.png`) **404s** because it was never created.
4. **Observability is thin for the user-facing tier** — no error tracking (Sentry-class), no client RUM/Web-Vitals reporting, and routes define no `errorComponent`, so a render error in a route surfaces as a broken shell with no signal to ops.
5. **Security is solid where it was audited, but the deployment is mid-migration** — Apache sets a thoughtful header set today, yet the Helm/Go-gateway path replicates **none** of it, and the CSP is `frame-ancestors`-only (no `script-src`/`connect-src`). Several legacy-audit "criticals" are in fact already fixed (see §6).

None of these are architectural rewrites. The plan below sequences them so that **two weeks of work removes the most acute risk** (a frontend CI gate + error tracking + the four "missing-asset/missing-tag" SEO fixes), and the remainder is steady, parallelizable refinement.

---

## 2. Platform scorecard

| Dimension | Grade | One-line assessment |
|---|:---:|---|
| Performance & Web Vitals | **A−** | Sophisticated build/splitting; gaps are list virtualization, hot-path memoization, and a few raw `<img>`. |
| Accessibility | **C+** | Great primitives, inconsistent composition; no a11y lint, skip-link no-op, motion prefs partial. |
| Security & privacy | **B** | Strong auth/validation/upload checks; residual CSP depth, gateway header parity, IP-trust nuance. |
| SEO & discoverability | **B−** | Excellent SSR/URLs/sitemap; missing JSON-LD, hreflang, broad unique titles, OG default asset. |
| Reliability & observability | **C+** | Excellent Go CI + blue-green deploy; **no frontend CI**, no error tracking, no RUM. |
| UX, engagement & delight | **A−** | Deep gamification & social; refine onboarding, loading states, confetti coverage, PWA/offline. |
| Internationalization | **B+** | 32 locales, RTL, SSR resolution; missing hreflang and a per-locale OG/QA story. |
| Docs & DX | **B−** | Rich domain docs; the flagship `codebase-overview.md` is stale (still says "Next.js 16"). |

*Grades are relative to an enterprise bar, not to typical projects — most lines here would be an "A" against an average codebase.*

---

## 3. Top 12 highest-leverage improvements

Ranked by (impact ÷ effort). Each links to its detailed finding.

| # | Improvement | Dimension | Effort | Impact | Why it's top-ranked |
|:--:|---|---|:--:|:--:|---|
| 1 | **Add a frontend CI workflow** (typecheck + lint + `vitest run` + build) | Reliability | S | ★★★★★ | Closes the largest hole: today FE code merges unchecked. [→](#ci-gap) |
| 2 | **Integrate error tracking + route `errorComponent`s + a root error boundary** | Observability | S–M | ★★★★★ | Production render/JS errors are currently invisible. [→](#obs-errors) |
| 3 | **Create the missing `/images/og/default.png`** and wire a default `buildMeta()` | SEO | XS | ★★★★ | A referenced asset 404s on every share without a custom card. [→](#seo-og) |
| 4 | **Add a real `<main id="main-content">` landmark** so the skip link works | A11y | XS | ★★★★ | One-line fix that unbreaks keyboard/SR navigation site-wide. [→](#a11y-landmarks) |
| 5 | **Add `eslint-plugin-jsx-a11y`** (warn) to catch a11y regressions in PRs | A11y | XS | ★★★★ | Prevents the long tail from growing while you fix the backlog. [→](#a11y-tooling) |
| 6 | **JSON-LD structured data** (Article, Organization, Person, Book, Breadcrumb) | SEO | M | ★★★★ | Unlocks rich results; pure additive `head()` output. [→](#seo-jsonld) |
| 7 | **Virtualize the long lists** (feed threads, leaderboards, profile tabs) | Performance | M | ★★★★ | Biggest runtime win at scale; DOM stays bounded. [→](#perf-virtual) |
| 8 | **Replicate security headers in the Helm ingress / Go gateway** + deepen CSP | Security | S–M | ★★★★ | The migration target currently ships **no** security headers. [→](#sec-headers) |
| 9 | **`hreflang` alternates** for the 32 locales + `x-default` | i18n/SEO | S | ★★★ | You already do the hard SSR locale work; just signal it. [→](#i18n-hreflang) |
| 10 | **Client RUM: report Core Web Vitals + JS errors** | Observability | S | ★★★ | Turns "feels slow" into a measured, trendable number. [→](#obs-rum) |
| 11 | **First-run onboarding checklist** for new accounts (+ coin reward) | UX | M | ★★★ | Converts the strong feature set into activated users. [→](#ux-onboarding) |
| 12 | **Web Push + service worker** (notifications + offline single-player games) | UX/PWA | M–L | ★★★ | Real retention lever; `idb` is already in the dep tree. [→](#ux-pwa) |

Effort key: **XS** ≤ ½ day · **S** ≈ 1–2 days · **M** ≈ 3–5 days · **L** ≈ 1–2 weeks.

---

## 4. Dimension 1 — Performance & Core Web Vitals

### Already strong
- **Build-level splitting is excellent.** `vite.config.ts` defines deliberate `manualChunks` for three/monaco/tiptap/tone/pixi/recharts/motion, externalizes heavy client-only deps from the Nitro server bundle, and a custom `stubServerFiles()` plugin prevents `.server` trees (pg, Buffer) from leaking into the client (`vite.config.ts:15-81`, `:148-201`).
- **Routing is tuned for perceived speed:** `defaultPreload: "intent"` with a 50ms delay and 30s preload stale-time (`app/router.tsx`).
- **i18n is lazy** — only `en` ships eagerly; `zh`/`ar`/etc. resources are serialized into the loader payload only when active (`app/routes/__root.tsx:76-85`).
- **Caching is correct where it matters:** content-addressed image/cover routes use `max-age=31536000, immutable`; the image proxy uses `stale-while-revalidate`; sitemap is cache-revalidated.
- **Console stripping** (`esbuild.pure: ["console.log","console.debug"]`) and **deferred decorative fonts** via `requestIdleCallback` (`__root.tsx:69`) are already in place.

### Findings

| Sev | Area | Location | Current state | Recommendation |
|:--:|---|---|---|---|
| **High** | <a id="perf-virtual"></a>List virtualization | `components/feed/ConversationView.tsx`, `MessagesColumn.tsx`, `ProfileColumn.tsx`, `components/game/Leaderboard.tsx` | Long lists render every item; infinite-scroll **accumulates** items in state and keeps them all mounted. | Introduce a virtualizer (`@tanstack/react-virtual`) for message threads, leaderboards, and profile feeds beyond ~50 rows. Bounds DOM size; 60–80% faster scroll at 500+ items. |
| **Med** | Hot-path memoization | `components/feed/ProfileColumn.tsx`, `components/feed/ConversationView.tsx`, `components/ui/UserAvatar.tsx`, `OptimizedImage.tsx` | Only **one** `React.memo` in the entire `components/` tree (`game/Leaderboard.tsx`). Tab/state changes re-render large subtrees. | `memo()` the heavy leaf/list-row components (`UserAvatar`, post/RMHark rows, tab panels); `useMemo` derived feed data. Low-risk, measurable 30–50% fewer renders on tab switches. |
| **Med** | Responsive user images | `components/feed/ProfileColumn.tsx`, `ConversationView.tsx`, `components/versecraft/CompletionScreen.tsx` | `OptimizedImage` generates `srcset` for internal resizable endpoints, but several call sites still use raw `<img>` at full resolution. | Route remaining avatar/attachment `<img>` through `OptimizedImage`; add a width-based `srcset` path for static local images. 20–40% mobile image bytes saved. |
| **Med** | Effect races on fast nav | `components/feed/ConversationView.tsx` (message fetch), `ProfileColumn.tsx` (profile fetch) | In-flight fetches aren't aborted when `conversationId`/`userId` changes mid-flight; `olderCursor` in a `useCallback` dep can re-trigger fetches. | Add `AbortController` keyed on the id; split cursor out of the fetch callback deps. Eliminates stale-overwrite races. |
| **Low** | List key stability | `components/feed/PersonasColumn.tsx`, `FlashcardsColumn.tsx` | `mine.map((p) => Tile(p))` returns JSX without stable `key`s. | Pass `key={p.id}`; render rows as components, not function calls. Prevents reconciliation glitches on reorder. |
| **Low** | Font CLS | `app/routes/__root.tsx:125-134` | Main Nunito/Inter link is render-blocking and Google's default is `display=block` for the deferred decorative set. | Ensure every Google Fonts URL carries `&display=swap`; keep the existing `preconnect`. Add a `size-adjust` fallback `@font-face` to cut CLS. |
| **Info** | SSR payload trim | `__root.tsx:27-46` (`getInitialUser`) | Root loader serializes a moderate user object on every navigation. | Optional: trim to `{id,name,image,handle}` and hydrate the rest client-side **only if** hydration is measurably slow on low-end mobile (don't pre-optimize). |

**Acceptance signal:** a Lighthouse mobile run on the feed and a 500-item conversation stays in the green for CLS/INP; React Profiler shows bounded DOM node count while scrolling.

---

## 5. Dimension 2 — Accessibility (WCAG 2.2 AA)

### Already strong
- **Native, accessible primitives:** `components/ui/button.tsx` uses real `<button>` with `focus-visible:ring`; inputs/sliders use native elements with visible focus; dialogs are Radix (`@radix-ui/react-dialog`) and get focus trap/restore + Escape for free.
- **407 ARIA attributes across 136 files**, `role="status" aria-live="polite"` on toasts/uploaders/spinner, decorative icons marked `aria-hidden`, RTL `dir` handled at the document level (`__root.tsx:60`).
- A skip link **exists** (`app/routes/_site.tsx:28-33`) — it just needs a target (below).

### Findings

| Sev | Area | Location | Current state | Recommendation |
|:--:|---|---|---|---|
| **High** | <a id="a11y-landmarks"></a>Skip link is a no-op + no `<main>` | `app/routes/_site.tsx:29,44-50` | Skip link targets `#main-content`, but **no element has that id** and there is **no `<main>` landmark** — `<Outlet/>` renders into a bare `<div>`. | Wrap the content outlet in `<main id="main-content" tabIndex={-1}>`. One-line fix that restores keyboard + screen-reader landmark navigation everywhere under `_site`. |
| **High** | <a id="a11y-tooling"></a>No a11y linting | `eslint.config.mjs` | No `eslint-plugin-jsx-a11y`; no axe in tests. Regressions are invisible. | Add `eslint-plugin-jsx-a11y` (start at `warn`), and `jest-axe`/`@axe-core/playwright` smoke tests on the feed, a form, and a dialog. Caps the backlog. |
| **High** | Non-keyboard interactive divs | ~492 `onClick` handlers across 148 files; e.g. `components/feed/ComposeBox.tsx` backdrops/audience dropdown, `ImageCropModal.tsx:64`, `ProfileEditModal.tsx` | Several custom overlays/dropdowns are mouse-only (no `Escape`, no arrow-key roving, no `role`). | Migrate custom modals to the shared Radix `Dialog`; give custom dropdowns `role="listbox"`/`option` + arrow/Enter/Escape handling. Prioritize the ~10 most-used patterns. |
| **High** | Form label association | `components/feed/ComposeBox.tsx` (poll question/options/upload/duration), many of the ~230–260 fields | Many fields rely on `placeholder` only; no `<label htmlFor>`/`aria-label`; no `aria-invalid`/`aria-describedby` on errors. | Add programmatic labels (`sr-only` where visual labels don't fit), link errors via `aria-describedby` + `role="alert"`, announce character counts with `aria-live`. |
| **Med** | Motion preferences | `prefers-reduced-motion` honored in only ~11 files (mostly game CSS); the helper `prefersReduced()` lives in `components/rmh-pmc/shared.tsx` | Framer Motion/GSAP UI animations (dialogs, reveals, page transitions) are not guarded. | Export a shared `useReducedMotion()` hook; gate non-essential motion; add a global `@media (prefers-reduced-motion: reduce)` block in `globals.css`. |
| **Med** | Color contrast on muted text | `app/globals.css` default theme: `--site-text-dim (#6a6b74)` on `--site-surface (#27282c)` ≈ **2.6:1** (fails AA); `--site-text-muted` on surface ≈ **4.2:1** | Secondary/helper/disabled text can drop below AA on some of the 20+ themes. | Lift `--site-text-dim`/`-muted` luminance to ≥4.5:1 on surfaces; add an explicit **High-Contrast** theme; run a per-theme contrast pass (axe/Wave) including the zodiac/season variants. |
| **Med** | Image alt text on user content | `components/feed/UserAvatar.tsx`, post image grids, emoji-cinema tiles (13 of 97 `<img>` lack alt) | Avatars and uploaded images often have no `alt`; no capture of alt at upload. | Default avatar `alt={`${name}'s avatar`}`; offer an optional alt field in `ComposeBox`; mark purely-decorative game tiles `aria-hidden`. |
| **Low** | Toggle state + live game state | like/follow buttons; minigame score/turn | No `aria-pressed` on toggles; multiplayer state changes aren't announced. | `aria-pressed` on toggles; a polite live region for "Comment posted", score/turn changes in minigames. |

**Target:** WCAG 2.2 AA. A pragmatic order is fix #1/#2 (landmark + lint) first, then forms and keyboard handlers, then contrast/motion, then a third-party audit before claiming conformance.

---

## 6. Dimension 3 — Security, Privacy & Abuse-resistance

> ⚠️ **Accuracy note.** Several items in the legacy reports under `docs/misc/` were re-verified against the current tree and are **already remediated or not present**. They are listed first so they are not re-opened. The genuinely-open items follow.

### ✅ Verified already-fixed / not-applicable (do NOT re-open)
- **Webhook default secret** — legacy reports flag `WEBHOOK_SECRET || 'change-me'` as live. The current `webhook-server.cjs:4-6` already **fails closed**: `const SECRET = process.env.WEBHOOK_SECRET; if (!SECRET || SECRET === 'change-me') { …FATAL… }`. ✔ Fixed.
- **`SharedNoteView` XSS (href/src)** — the file **does not exist** in the tree (`components/rmh-notes/SharedNoteView.tsx` not found). ✔ N/A.
- **`formatProblemDescription` XSS in `OAEditor`** — no such function / no `dangerouslySetInnerHTML` in `components/rmh-jobs/OAEditor.tsx`. ✔ N/A.
- **XSS surface generally** — only **2** `dangerouslySetInnerHTML` sites exist site-wide, both controlled: the inline theme bootstrap (`app/routes/__root.tsx`) and Wikipedia content that is **server-sanitized** before render (`components/rmhbox/minigames/wiki-race/WikiFrame.tsx` + `lib/rmhbox/wiki-race/wikipedia-proxy.ts`). User prose renders via `react-markdown` (escapes HTML by default). ✔ Low residual risk.
- **Prior audit F1–F10** (comment/score rate limits, username sanitization, body-size caps, cover magic-byte checks) — present in the relevant `app/routes/api/**` handlers. ✔ Fixed.
- **Auth/session hardening** — Better Auth with per-endpoint sign-in/sign-up/reset rate limits (`lib/auth.ts`), `httpOnly`/`secure`/`sameSite` cookies, Prisma-parameterized queries throughout. ✔ Solid.

### Genuinely open findings

| Sev | Area | Location | Current state | Recommendation |
|:--:|---|---|---|---|
| **High** | <a id="sec-headers"></a>Header parity on the migration target | `deploy/apache/rmhstudios.conf:48-52` vs `deploy/helm/rmhstudios-go/templates/ingress.yaml` | Apache sets a thoughtful set (HSTS, `nosniff`, Referrer-Policy, `X-Permitted-Cross-Domain-Policies`, a Discord-aware `frame-ancestors` CSP). The **Helm ingress sets none**, and the Go gateway has no header layer. A cutover to the gateway path silently drops all of them. | Add the same headers at the ingress (nginx `configuration-snippet`) or in a gateway middleware. Treat header config as code shared by both serving paths. |
| **High** | CSP depth | `deploy/apache/rmhstudios.conf:52` | CSP is **`frame-ancestors`-only** — no `default-src`/`script-src`/`connect-src`/`object-src`/`base-uri`. Good clickjacking control, no injected-script defense-in-depth. | Roll out a real CSP in **Report-Only** first (collect violations), then enforce. Pair with a nonce/hash strategy for the small set of inline bootstrap scripts in `__root.tsx`. Add `object-src 'none'; base-uri 'self'`. |
| **Med** | Client-IP trust for rate limiting | `lib/rate-limit.ts:97-101` | `getClientIp` returns the **first** `x-forwarded-for` value. Correct **only** if every ingress hop overwrites (not appends) XFF; otherwise spoofable to evade limits. | Document/confirm the proxy contract (Cloudflare → Apache/ingress). For authenticated endpoints, **also** key the limiter on `session.user.id`. `VERIFY` the deployed XFF behavior. |
| **Med** | AI-endpoint cost abuse | routes using `@anthropic-ai/sdk` / `openai` (vibe generation, study tools, etc.) | Generative endpoints are the highest-$$ abuse target. Per-IP limits exist broadly; per-user/льtier quotas for AI specifically need confirmation. | Add per-user **and** per-tier quota + concurrency caps on AI routes; log spend per user; alert on anomalies. `VERIFY` current coverage. |
| **Med** | Range/stream input validation | audio/asset stream routes (e.g. `app/routes/api/slice-it/songs/stream/$id.ts`) | Legacy report flags unbounded `Range` parsing (NaN/negative → bad reads). Needs a current-tree check. | Validate `start`/`end` are finite, ordered, within file size; return `416` otherwise. `VERIFY` against current handler. |
| **Med** | Socket.io CORS default | `server/socket-server/config.ts` (`SOCKET_CORS_ORIGIN` default `''`) | An empty default may not fail closed depending on Socket.io semantics. | Make startup **throw** if `SOCKET_CORS_ORIGIN` is unset in production; never allow wildcard. `VERIFY` runtime behavior with empty value. |
| **Med** | Secret-at-rest for 3rd-party tokens | GitHub PAT flow (`app/routes/api/rmhcode/auth/*`); `.env.example` defines `TOKEN_ENCRYPTION_KEY` | The encryption key is declared, but it's unconfirmed that stored PATs are actually AES-GCM encrypted. | Confirm encrypt-on-write/decrypt-on-read is wired; if not, implement it. `VERIFY`. |
| **Med** | No security scanning in CI | `.github/workflows/*` | No dependency audit, secret scanning, SAST, or container scan runs on PRs. | Add `pnpm audit` (advisory), enable GitHub secret scanning + Dependabot/Renovate, add Trivy on the built images (ties into §8 CI work). |
| **Low** | `robots.txt` hardening | `public/robots.txt` | Disallows `/api/`, auth paths; no crawl-rate hint; `/embed/*` only partly noindexed. | Add explicit `Disallow: /embed/`; optional `Crawl-delay` for non-primary bots. |

**Suggested first PR (½ day):** ingress header parity + CSP in Report-Only. **Then** the `VERIFY` items as a single hardening sweep.

---

## 7. Dimension 4 — SEO & Discoverability

### Already strong
- **Full SSR** — crawlers receive complete HTML; per-route `head()` + server loaders fetch data before paint.
- **Dynamic OG images** via `satori` + `@resvg/resvg-js` for social posts (`app/routes/api/og/post/$id.ts`, `lib/og/post-image.server.tsx`), privacy-aware and cached.
- **Reusable SEO helpers** `buildMeta()` / `buildCanonical()` (`lib/seo.ts`).
- **Dynamic sitemap** covering static routes + up to ~7k blog/news/build URLs with `lastmod`/`priority` and graceful DB-failure fallback (`app/routes/sitemap[.]xml.ts`).
- **Clean, semantic URLs** and a correct `viewport`/manifest baseline.

### Findings

| Sev | Area | Location | Current state | Recommendation |
|:--:|---|---|---|---|
| **High** | <a id="seo-jsonld"></a>No structured data | entire app (0 `application/ld+json`) | No schema.org markup anywhere → no rich results, no Organization knowledge-panel seed. | Add a `lib/schema.ts` builder and emit JSON-LD from `head()`: `Article`/`NewsArticle` (blog/news), `Person` (profiles), `Book` (library), `Organization` (root), `BreadcrumbList` (nested content), `VideoObject` (RMHTube). |
| **High** | <a id="seo-og"></a>Default OG image 404s | referenced by `lib/seo.ts`; `public/images/og/` **does not exist** | Any route using the default card (or any non-custom share) points at a missing `/images/og/default.png`. | Create `public/images/og/default.png` (1200×630). Quick win; stops broken unfurls in Discord/Slack/iMessage. |
| **Med** | Unique titles/descriptions coverage | ~49% of routes set `head()`; ~51% inherit the generic root title | Game/app roots (`/daily`, `/forest-explorer`, `/altair`, `/rmhbox`), `/explore`, `/search`, `/bookmarks`, and others fall back to "RMH Studios — The everything platform." | Add `head()` to public game/app routes with descriptive titles + an `og:image` of game art. Decide explicitly which utility routes should be `noindex` instead. |
| **Med** | <a id="i18n-hreflang"></a>No `hreflang` | `lib/i18n/config.ts` defines 32 locales; no alternates emitted | Crawlers can't associate language variants; same URL serves different languages by cookie (duplicate-content risk). | Emit `<link rel="alternate" hreflang>` for each locale + `x-default` from the root `head()` for public routes. (Cross-listed as top-12 #9.) |
| **Med** | Canonicals underused | `buildCanonical()` used by only ~13 routes (the `rmh-pmc`/`rmh-capital` set) | Dynamic content (blog/news/profiles/builds) sets no canonical; two profile routes (`/_site/profile/$id` vs `/_site/u/$userid`) can duplicate. | Emit a canonical from every public route's `head()`; pick one profile URL as canonical and 301/canonicalize the other. |
| **Low** | OG coverage for games/apps | 85+ routes set no OG tags | Game/app pages don't unfurl with a preview card. | Use `buildMeta()` with static per-game art so shared game links render rich cards. |
| **Low** | PWA manifest depth | `public/manifest.webmanifest` | Only an SVG icon; no `categories`/`screenshots`/`shortcuts`/PNG sizes. | Add 192/512 PNG icons, `categories`, `shortcuts` (Daily Puzzle, Feed), `screenshots`. (Ties into §9 PWA.) |

---

## 8. Dimension 5 — Reliability, Observability & Quality Engineering

### Already strong
- **Go tier is well-engineered for CI/CD:** Bazel build+test with opt-in remote cache, a Postgres-backed e2e job, and Helm lint/template validation (`.github/workflows/go-microservices.yml`).
- **Deployment safety:** blue-green web hot-swap with health-gated flip and rollback (`deploy/hotswap-web.sh`), Helm `--atomic --wait`, SIGTERM graceful shutdown across services, liveness/readiness probes, a standalone status dashboard that survives outages.
- **Structured JSON logging** in services (`server/shared/logger.ts`); **connection pooling** with timeouts (`server/shared/prisma-client.ts`); `strict: true` TypeScript.

### Findings

| Sev | Area | Location | Current state | Recommendation |
|:--:|---|---|---|---|
| **High** | <a id="ci-gap"></a>No frontend CI gate | `.github/workflows/*` | The only workflows are Go-path-scoped and an **author-gated** LLM review (`senior-review.yml:33`, gated to `arexwu` — everyone else short-circuits green). A TS/React PR gets **no `tsc`, no `eslint`, no `vitest`, no build**. | Add `web-ci.yml`: `pnpm install` → `tsc --noEmit` → `pnpm lint` → `pnpm vitest run` → `pnpm build:frontend`, with `concurrency` cancel-in-progress. Mark required in branch protection. **This is the #1 item in the plan.** |
| **High** | <a id="obs-errors"></a>No error tracking + routes lack `errorComponent` | `app/routes/**` define **0** `errorComponent`; some component-level `ErrorBoundary`s exist but there's no global capture | A render/JS error surfaces as a broken shell with **no signal to ops**. | Integrate a Sentry-class SDK (client + Nitro server); add a root error boundary in `__root.tsx` and `errorComponent`/`notFoundComponent` on top-level routes (feed, profile, each game shell). |
| **High** | Payments untested | `@better-auth/stripe` wired in `lib/auth.ts`; no Stripe tests | Subscription/checkout/webhook paths have zero automated coverage — highest blast-radius if it breaks. | Add a Stripe test suite (mocked webhooks: checkout completed, subscription updated/canceled, payment failed) + an idempotency test. |
| **Med** | <a id="obs-rum"></a>No client RUM / Web-Vitals | no analytics/RUM (`posthog`/`plausible`/`gtag` absent) | "Feels slow" can't be measured or trended; no real-user INP/LCP/CLS. | Add a lightweight, consent-aware RUM (Web-Vitals → a `/api/rum` sink, or Plausible/PostHog). Track Core Web Vitals + top user funnels. |
| **Med** | Component/e2e test coverage | 161 test files (~20% breadth); 0 React component tests; Playwright present but used only for app features, not QA | Critical UI (auth, compose, multiplayer join) is unverified end-to-end. | Add `@testing-library/react` smoke tests for auth + compose + a dialog; a Playwright happy-path for "sign in → post → play a game → reconnect." |
| **Med** | Lint is advisory-only; 285 `any` | `eslint.config.mjs` downgrades most rules to `warn`; no Prettier; `no-explicit-any: warn` | Warnings never block; formatting drifts across 750+ components; 285 `: any` + 10 `@ts-*` escapes. | Once CI exists, fail on a **non-regressing** error set; add Prettier; ratchet `any` down over time (don't big-bang). |
| **Med** | Resilience patterns | WebSocket reconnect uses fixed delay (e.g. `components/lights-out/…:221`); no DB connect-retry; no circuit breaker | Recovery can thunder-herd; a single DB blip fails queries; cascading failures aren't isolated. | Exponential backoff + jitter on socket reconnect; bounded DB connect-retry; a simple breaker around cross-service calls. |
| **Med** | Migration & deploy guards | `prisma migrate deploy` in prod; no migration test or post-deploy smoke | Breaking schema changes can ship; `--wait` ≠ functional health. | Run migrations against a throwaway DB in CI; add a post-deploy smoke check (probe `/health` + a couple of real routes) that auto-rolls-back on failure. |
| **Low** | Dependency automation | no `renovate.json`/`dependabot.yml`; `audit` script unused in CI | Stale/vulnerable deps aren't surfaced. | Add Renovate/Dependabot + `pnpm audit` (advisory) in `web-ci.yml`. |

**The CI workflow is the keystone** — items #2 (tests), the lint ratchet, and security scanning all plug into it once it exists. A minimal first version:

```yaml
# .github/workflows/web-ci.yml  (illustrative)
name: web-ci
on:
  pull_request:
    paths-ignore: ["go-services/**", "deploy/helm/**", "docs/**"]
concurrency: { group: "web-ci-${{ github.ref }}", cancel-in-progress: true }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec tsc --noEmit
      - run: pnpm lint
      - run: pnpm exec vitest run
      - run: pnpm run build:frontend
```

---

## 9. Dimension 6 — UX, Engagement & Delight

### Already strong
- **Deep, mature engagement system already exists:** achievements (`/achievements`, bronze/silver/gold + secret tiers), daily check-in **streaks** with milestones, ELO **leaderboards** + challenges (`/ranked`), weekly **recap** + **wrapped**, multi-type **notifications**, a **coins economy** (Plinko, shop), **daily puzzles** (`/daily/*`), predictions, quotes.
- **Excellent UI primitives:** `EmptyState`, `Skeleton`, `Spinner`, Radix `Dialog`, and a **29-theme** system (vibes/zodiac/seasons/school) with FOUC-free hydration.
- **Real onboarding seeds exist:** `WelcomeModal` (4-step, localStorage-gated) and an app-specific `OnboardingTour` for RMHTube.
- **Delight touches:** `canvas-confetti` on RMHBox wins + Plinko, Framer/GSAP motion, a `/secret` vault of hidden games, `useCardSheen`.

### Findings & opportunities

| Pri | Theme | Evidence | Opportunity |
|:--:|---|---|---|
| **High** | <a id="ux-onboarding"></a>First-run activation | new accounts land in a bare feed; `WelcomeModal` is informational only | Add a `FirstTimeExperienceGate` on `/` for accounts < 1 day with 0 posts/follows: an interactive checklist (play a game · follow 3 creators · post · customize theme) that awards coins on completion. Converts the rich feature set into **activated** users. |
| **High** | Celebration coverage | confetti only in RMHBox + Plinko | Centralize a `useCelebration()` hook and fire (theme-accent-colored) confetti on achievement unlocks, streak milestones (7/30/100), first follow, and level-ups. Cheap dopamine loop with broad reach. |
| **High** | Loading consistency | feed/recommendations/library show spinners or bare states, not layout-matched skeletons | Add `PostCardSkeleton`/`UserCardSkeleton`/`BuildCardSkeleton` and use them on `FeedList`, `SearchColumn`, right-sidebar, and the library/blog/builds grids. Big perceived-speed win. |
| **High** | <a id="ux-pwa"></a>Push + offline | no service worker; `idb` already used for the library reader | Add `public/sw.js`: (1) Web Push for notifications/DMs (opt-in, with a preferences panel), (2) cache-first asset shell + `/offline` fallback, (3) IndexedDB save for deterministic single-player games (Lights Out, Slice-It, Plinko) with sync-on-reconnect. Real retention lever + installability. |
| **Med** | Virality loop | deeplinks/embeds exist; no referral or quote-repost | Add a referral link flow (`/ref/[code]`, mutual coin reward on the invitee's first achievement) and **quote-repost** (compose with the original embedded). Both are natural growth multipliers on top of the existing social graph. |
| **Med** | Public achievement showcase | achievements aren't surfaced on profiles | Render an unlocked-badge grid on profiles with a "pin top 3" showcase. Makes status visible → drives completion. |
| **Med** | Creator-side coin loop | coins skew toward game-play + streaks | Add creator earn events (per-N likes, per-N followers, monthly active-creator bonus) so non-gamers have an economy too. |
| **Med** | Notification refinement | no grouping, no preferences, no push | Group ("5 people liked your post"), add a preferences panel, wire push (above), optional daily email digest. |
| **Low** | Discovery polish | strong `/explore` + Fuse.js search | Add "Trending this week" to the feed, a trending-communities widget in the sidebar, recent-search history, and hover profile cards (Radix Popover: avatar/bio/follow). |
| **Low** | Theme-aware fun | 29 themes are cosmetic | Optional flourishes per theme (gamer CRT scanlines, anime petals, zodiac constellation banners) — **gated by `prefers-reduced-motion`** (ties to §5). |

---

## 10. Dimension 7 — Internationalization

### Already strong
- **32 locales** with a tiered (eager `en`, on-demand others) loading model, **RTL** support for `ar`/`ur`/`fa` set at the document level before paint, SSR locale resolution from cookie → `Accept-Language`, and an i18next extraction/translation pipeline (`i18n:extract`, `i18n:translate`).

### Findings

| Sev | Area | Location | Recommendation |
|:--:|---|---|---|
| **Med** | `hreflang` absent | `lib/i18n/config.ts` (no alternates emitted) | Emit per-locale `hreflang` + `x-default` (cross-listed in §7). The SSR work is done; this is just the discovery signal. |
| **Low** | Per-locale OG/social | `lib/og/post-image.server.tsx` | Ensure dynamic OG cards render non-Latin scripts (CJK/Arabic) correctly — confirm the font stack in `satori` covers them; `VERIFY`. |
| **Low** | Translation QA surface | `locales/*` | Add a CI check that fails on missing keys per locale (or reports coverage %), so untranslated strings are visible rather than silently English. |
| **Low** | RTL visual QA | components with directional layout | Add a small RTL visual smoke (Playwright screenshot in `ar`) for the feed + a game shell to catch mirroring bugs. |

---

## 11. Dimension 8 — Documentation & Developer Experience

### Findings

| Sev | Area | Location | Current state | Recommendation |
|:--:|---|---|---|---|
| **Med** | Stale flagship doc | `docs/codebase-overview.md` | Still describes the app as **"Next.js 16 App Router"** with old port/route facts — but the stack is TanStack Start + Nitro. New contributors will be misled. | Rewrite to reflect TanStack Start/Vite/Nitro, the Go fleet, and current routes; or regenerate it. |
| **Low** | No `CONTRIBUTING.md` / PR template | repo root, `.github/` | No contribution guide or PR template to encode the (high) implicit quality bar. | Add `CONTRIBUTING.md` (run/test/lint/commit conventions) and a PR template (the §Appendix C checklist). |
| **Low** | No formatter config | repo root | Formatting relies on convention. | Add Prettier + an `.editorconfig`; run `prettier --check` in `web-ci.yml`. |
| **Low** | `scripts/` excluded from typecheck | `tsconfig.json:31` | One-off scripts skip `tsc`, so they rot silently. | Add a `tsconfig.scripts.json` and typecheck them in CI (non-blocking at first). |

---

## 12. Consolidated roadmap

Phased so the riskiest gaps close first and later work parallelizes cleanly. Sizes use the §3 key.

### Phase 0 — "Stop the bleeding" (Week 1–2)
> Removes the most acute risk for the least effort.

1. **`web-ci.yml`**: typecheck + lint + `vitest run` + build, required on PRs. *(S)* — §8 `#ci-gap`
2. **Error tracking + root error boundary + top-route `errorComponent`s.** *(S–M)* — §8 `#obs-errors`
3. **Create `/images/og/default.png`.** *(XS)* — §7 `#seo-og`
4. **`<main id="main-content">` landmark.** *(XS)* — §5 `#a11y-landmarks`
5. **`eslint-plugin-jsx-a11y` (warn).** *(XS)* — §5 `#a11y-tooling`
6. **Ingress/gateway security-header parity + CSP Report-Only.** *(S)* — §6 `#sec-headers`

### Phase 1 — Visibility & correctness (Week 3–6)
7. **Client RUM (Core Web Vitals + JS errors).** *(S)* — §8 `#obs-rum`
8. **JSON-LD structured data** across content types. *(M)* — §7 `#seo-jsonld`
9. **`hreflang` + canonicals** on public routes. *(S)* — §7/§10
10. **Stripe payment test suite.** *(M)* — §8
11. **Security `VERIFY` sweep** (XFF/IP keying, Range bounds, Socket.io CORS fail-closed, PAT-at-rest, AI quotas). *(M)* — §6
12. **Form labels + keyboard handlers** for the top ~10 a11y offenders. *(M)* — §5

### Phase 2 — Performance & engagement (Week 7–12)
13. **List virtualization** (threads/leaderboards/profile feeds). *(M)* — §4 `#perf-virtual`
14. **Hot-path `memo()` + `AbortController` fetch races.** *(M)* — §4
15. **First-run onboarding checklist + celebration hook + skeletons.** *(M)* — §9
16. **Web Push + service worker (notifications + offline single-player).** *(M–L)* — §9 `#ux-pwa`
17. **Reduced-motion global gate + per-theme contrast fixes + High-Contrast theme.** *(M)* — §5
18. **Responsive `<img>` cleanup through `OptimizedImage`.** *(S)* — §4

### Phase 3 — Depth & polish (Quarter+)
19. **CSP enforce (after Report-Only data), security scanning in CI (Dependabot/Renovate/Trivy/secret scan).** — §6/§8
20. **Component + Playwright e2e coverage for critical funnels; resilience patterns (backoff/breaker/DB retry); migration test + post-deploy smoke.** — §8
21. **Referral loop, quote-repost, public badges, creator coins, notification grouping/digests.** — §9
22. **Rewrite `codebase-overview.md`; add `CONTRIBUTING.md` + Prettier + PR template; i18n key-coverage check + RTL visual smoke.** — §8/§10

---

## Appendix A — KPIs & instrumentation

Track these before/after so the work is provably moving numbers, not just shipping.

| Goal | Metric | Source once instrumented |
|---|---|---|
| Faster real-user pages | p75 **LCP / INP / CLS** on feed, profile, a game shell | Client RUM (Phase 1) |
| Fewer silent failures | client error rate; % sessions with a JS error | Error tracking (Phase 0) |
| Safer merges | % PRs passing typecheck/lint/test; mean time to red→green | `web-ci.yml` |
| Better activation | D1/D7 retention; % new users completing onboarding checklist | Product analytics + onboarding events |
| Discoverability | indexed pages; rich-result eligibility; impressions/CTR | Google Search Console |
| Accessibility | axe violations/route; keyboard-only task completion | `jest-axe`/Playwright-axe |
| Engagement | DAU/MAU; posts/session; games started/session; streak retention | Product analytics |
| Reliability | error budget burn; deploy rollback rate; WS reconnect success | Status dashboard + RUM |

## Appendix B — Recommended tooling

- **CI:** GitHub Actions (`web-ci.yml`); Dependabot **or** Renovate; Trivy (image scan); GitHub secret scanning.
- **Quality:** `eslint-plugin-jsx-a11y`, Prettier, `jest-axe` / `@axe-core/playwright`, `@testing-library/react`, Playwright (QA, not just features).
- **Observability:** a Sentry-class SDK (client + Nitro), `web-vitals` → `/api/rum` (or Plausible/PostHog, consent-aware).
- **Performance:** `@tanstack/react-virtual`; Lighthouse CI (budget gate, optional).
- **SEO:** a `lib/schema.ts` JSON-LD builder; Search Console; a generated `/images/og/default.png`.

## Appendix C — Definition of done / PR checklist

A reusable checklist to drop into `.github/pull_request_template.md`:

- [ ] `tsc --noEmit`, `pnpm lint`, and `pnpm vitest run` pass locally (and in CI).
- [ ] New interactive UI is keyboard-operable, labeled, and respects `prefers-reduced-motion`.
- [ ] New public route sets a unique `title`/`description`, a canonical, and (if content) JSON-LD.
- [ ] User-facing errors are handled (route `errorComponent`/boundary) and reported to error tracking.
- [ ] New server/API input is validated (zod) and rate-limited where it writes or costs money.
- [ ] User-facing strings go through i18n (`t(...)`), not hardcoded English.
- [ ] Data-heavy views have a layout-matched skeleton/empty state.
- [ ] Security headers / CSP unaffected (or intentionally updated in **both** serving paths).

---

*Prepared as a living document. Each finding is independently shippable; the roadmap is a suggested sequence, not a dependency chain (except that the Phase-0 CI gate makes every later change safer to land).*
