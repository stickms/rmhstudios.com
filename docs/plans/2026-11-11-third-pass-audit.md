# Ground-up audit, third pass: the program under the paint (2026-11-11)

> **What this is.** A fresh answer to the original question ("if you rebuilt
> this site from the ground up, what would you do?"), written against main at
> `815c63ff` after 32 phases of the first audit and after the Broadsheet brief
> (`2026-11-11-broadsheet-redesign-audit.md`) was merged.
>
> **How it differs from the other two.** The first audit reorganised the code
> under a fixed look. Broadsheet replaces the look and deletes the runtime
> that drew it. This pass is about what neither changes: the site is about
> thirty products compiled as one program, and most of the remaining cost
> comes from that, not from how it looks.
>
> **What was measured for this pass.** A production build of `815c63ff` served
> locally against a small Postgres; sourcemap builds of three trees with every
> entry byte attributed to its package; counts from the tracked tree. Numbers
> without a source line were measured here. Numbers taken from Broadsheet say
> so. Nothing below was measured on the production VPS.

Item prefixes: **AR** architecture · **RT** runtime and page weight · **DT**
data · **OP** operations, CI, deploy · **QA** quality · **DS** design. Each
item has `evidence`, `target`, `steps`, a `stub` where code helps, and a
`done-when` a script can check.

## Contents

- [0. The short version](#0-the-short-version)
- [1. What the measurements say](#1-what-the-measurements-say)
- [2. Diagnosis](#2-diagnosis)
- [3. If this were truly from zero](#3-if-this-were-truly-from-zero)
- [Part AR: architecture](#part-ar--architecture)
- [Part RT: runtime and page weight](#part-rt--runtime-and-page-weight)
- [Part DT: data](#part-dt--data)
- [Part OP: operations, CI, deploy](#part-op--operations-ci-deploy)
- [Part QA: quality](#part-qa--quality)
- [Part DS: design, a second opinion on Broadsheet](#part-ds--design-a-second-opinion-on-broadsheet)
- [Order of work](#order-of-work)
- [Ledger](#ledger)

---

## 0. The short version

| Rank | ID | What | Axis | Impact | Effort |
|---:|---|---|---|:-:|:-:|
| 1 | [AR1](#ar1--a-workspace-the-compiler-can-hold) | A workspace with project references: the typecheck fits in memory and is incremental; a product can be built, tested and deleted on its own | structure | XL | L |
| 2 | [AR2](#ar2--one-definition-per-read) | One definition per read. Today a page's data is written up to three times (GET route, server function, contract) | structure | XL | M |
| 3 | [RT1](#rt1--entry-diet-by-package) | Entry diet by package: about 190 KB of the 538 KB entry is libraries a first paint does not need | perf | L | M |
| 4 | [RT3](#rt3--csp-nonces-and-the-shared-cache) | A CSP nonce is minted per request and then served from a shared cache for up to 150 s. Fix before the policy is enforced | security | L | S |
| 5 | [AR3](#ar3--api-routes-from-a-registry) | 987 API route files become a registry behind one dispatcher; the 1.26 MB route tree shrinks to pages | structure | L | M |
| 6 | [AR4](#ar4--the-source-engine-port-is-its-own-package) | The Source-engine port (about 190k lines, a third of `lib/`) leaves the site's compile and test path | structure | L | M |
| 7 | [OP1](#op1--a-commit-gate-that-runs-here) | A commit gate that runs on a 15 GB machine. It was skipped on every commit of phases 28–32 | practice | L | S |
| 8 | [OP2](#op2--perf-assertions-that-do-not-flake) | Perf assertions on shared CI runners that compare medians, not one sample | practice | M | S |
| 9 | [RT2](#rt2--edge-cache-that-is-in-the-repo) | The anonymous HTML cache exists; the Cloudflare rule that makes it work is not in the repo, and two of the busiest page types are not on the allowlist | perf | M | S |
| 10 | [DT1](#dt1--a-census-before-any-schema-work) | A table and product census (rows, last write, 30-day actives) so pruning is decided by data | structure | M | S |
| 11 | [OP3](#op3--one-realtime-process-that-can-restart) | One realtime process with state outside it and a drain | reliability | L | L |
| 12 | [DS1](#ds1--delete-the-runtime-before-choosing-the-paint) | Delete the material runtime first, under the current look; change identity second | perf/appearance | L | M |

**If only three things happen:** AR1, AR2 and RT1. The first makes every later
change cheaper to check, the second removes the largest remaining source of
duplicated code, and the third is the page-weight win that does not depend on
any design decision.

---

## 1. What the measurements say

### 1.1 The server is not the problem

Production build of `815c63ff`, one Node process, local Postgres with a small
dataset, `curl` on the same machine. These are floor values, not production
latencies.

| Page | Signed out, warm TTFB | Document | Cache-Control |
|---|---:|---:|---|
| `/` | 15–21 ms | 75–80 KB | `public, max-age=0, s-maxage=30, stale-while-revalidate=120` |
| `/games` | 17 ms | 117 KB | same |
| `/library` | 20 ms | 73 KB | same |
| `/explore` | 20 ms | 84 KB | none |
| `/games/slice-it` | 11 ms | 96 KB | none |
| `/` signed in | 26 ms | 79 KB | `private, no-cache, max-age=0, must-revalidate` |

Twenty sequential renders of `/` took 0.50 s. Each document carries 14–20 KB
of inline script (pre-paint, dehydrated loader data, JSON-LD). Server
rendering is quick and anonymous documents for an audited allowlist
(`server/nitro/anon-html-cache.ts`, 10 entries) are already marked for a
shared cache.

**Conclusion:** time-to-interactive is decided in the browser. Work on SSR
speed would be wasted.

### 1.2 What the browser must download before any page code

`scripts/check-bundle-budget.ts` on the phase 31 tree: entry 537,952 B raw;
critical path 1,116,833 B raw, 316,849 B brotli, 76 chunks. Attribution of the
entry chunk from its sourcemap (`vite build --sourcemap`, bytes charged to
`sources[]`):

| Package | Raw | Needed for first paint? |
|---|---:|---|
| react-dom + react + scheduler | 213.9 KB | yes |
| @tanstack router-core, react-router, history, store, start-client-core | 92.8 KB | yes |
| i18next + react-i18next | 47.6 KB | no for English: English renders from `defaultValue` |
| sonner | 32.8 KB | no: nothing toasts before an interaction |
| motion-dom + framer-motion + motion-utils | 41.6 KB | no |
| tailwind-merge + clsx + cva | 28.5 KB | partly |
| @tanstack/query-core | 26.6 KB | yes, since phase 18 |
| seroval + plugins | 25.8 KB | yes (loader data) |
| better-auth, better-fetch, better-call, passkey, simplewebauthn, stripe plugin, nanostores | 44.3 KB | no: the session arrives in the document (`getInitialUser`) |
| Radix dialog, dismissable-layer, focus-scope, presence, remove-scroll and helpers | 26.0 KB | no |
| App code in the entry | 322 KB | mixed: `routeTree.gen.ts` 37.5 KB, pre-paint 7.2 KB, `Providers.tsx` 5.9 KB |

(The package rows sum to more than the entry because the per-package table is
the entry's *static closure*, measured by `check-entry-composition`; the app
row is the entry chunk alone.)

About 190 KB raw of library code in the first-paint path belongs to things a
visitor has not asked for yet. That is independent of the material runtime
Broadsheet P1 deletes, and it survives any change of identity.

### 1.3 The size of the one program

| Area | Files | Lines (.ts/.tsx/.css/.go) |
|---|---:|---:|
| `lib/` | 3,321 | 588,619 |
| `components/` | 1,845 | 379,951 |
| `features/` | 1,150 | 241,993 |
| `app/` | 1,412 | 135,729 |
| `server/` | 176 | 52,999 |

- `lib/` has 182 directories and 201 files at its root.
- `lib/tf2-game` is 138,493 lines. With `sp-game`, `csgo-game`, `tf2-hud` and
  `tf2-loadout` the Source-engine port is about 189,000 lines: a third of
  `lib/`, compiled and gated with the social site.
- `lib/__tests__` is 53,616 lines of gates.
- 987 API route files; 764 `endpoint()` declarations in 167 contract files;
  425 route files call `implement()`; 134 files call `createServerFn`; 23
  `*.queries.ts` files, 12 of which say in a comment that they repeat the body
  of a GET handler.
- 493 Prisma models in 23 domain files; 277 migrations.
- 119 runtime dependencies, 45 dev dependencies, 85 package scripts.
- CI on the phase 32 pull request: typecheck job 5 m 19 s, two test shards
  about 2 m each, build 3 m, candidate image 4 m; the Balatro engine suite
  23 m when its paths change.

### 1.4 Two things found while measuring

1. **CSP nonce on cached HTML.** `lib/csp/nonce.server.ts` mints 128 random
   bits per request and stamps them on every inline script and in the
   `Content-Security-Policy-Report-Only` header. The same response is marked
   `public, s-maxage=30, stale-while-revalidate=120` for signed-out visitors.
   A shared cache replays header and markup together, so the page works, but
   the nonce is then the same for every visitor for up to 150 seconds and
   anyone can read it. A nonce that an attacker can fetch is not a nonce. This
   is harmless while the policy is report-only and becomes a real weakness the
   day it is enforced (first audit F5, Broadsheet B4). See RT3.
2. **A perf assertion failed once and passed on re-run** with no code change
   between (`perf_spec`: `frame_ratio 1.366 > 1.35`, pull request #1563). It
   compares one multiplayer run with one single-player run on a shared
   runner. See OP2.

---

## 2. Diagnosis

1. **One compile unit.** A change to a settings panel typechecks the Source
   engine port, a Balatro Lua bridge and 30 other products. The native
   compiler needs a memory cap and a single thread to finish on a 15 GB
   machine; the commit gate was skipped, with a note, on every commit of
   phases 28–32. A gate nobody can run locally is a CI job, not a gate.
2. **Three ways to read the same row.** Phase C1 gave every call a typed
   contract. Phase B4 then added a server function next to each GET route so
   loaders could call it without HTTP. A page's read is now a route file, a
   contract, a server function and a query-options object, and the two server
   halves are kept the same by hand. This is the largest duplication left and
   it grows with every page B4 migrates.
3. **Files as the unit of an endpoint.** 987 route files exist so the router
   can find a handler. 425 of them are one `implement(contract, options, fn)`
   call. They cost a 1.26 MB generated route tree, 37 KB of it in every
   visitor's entry chunk, and a route-tree regeneration on every API change.
4. **The first paint pays for the whole session.** Toasts, dialogs, the auth
   client, passkeys, a motion library and an i18n runtime are in the entry
   because the root layout imports them, not because the first screen uses
   them.
5. **Decisions wait on data that exists but is not read.** The site records
   playtime and history beats, and C3 dropped 18 tables on evidence. Nothing
   yet ranks the 30 products or the 493 tables by use, so "which of these
   earns its place in the build" is still answered by opinion.
6. **The paint and the engine were bundled into one decision.** Broadsheet
   ties deleting 68.5k lines of runtime to adopting a new identity. The
   deletion is a measurable win on its own and does not need the identity to
   be right first.

Principles:

- **A product is a package.** It can be typechecked, tested, built and removed
  without touching another.
- **Write a read once.** The definition is the route, the loader and the
  client call.
- **The first screen pays for the first screen.**
- **A gate runs where the code is written,** in under a minute, or it is not a
  gate.
- **Measure before pruning; prune after measuring.**

---

## 3. If this were truly from zero

Worth stating once, because it sets the direction even though none of it is a
recommendation to rewrite:

| Layer | From zero | From here |
|---|---|---|
| Content pages (legal, blog, library, catalogue, profiles) | An HTML-first framework with islands; no client router or hydration for a page that only reads | Keep TanStack Start; get the same effect with RT1 (smaller shell) and islands for full-screen products (first audit B1) |
| Products | One package each from day one | AR1 |
| Internal API | Server functions only; REST only for the public `/api/v1` | AR2 and AR3 converge on this without a flag day |
| Data | A schema per domain, and a tenth of the tables | DT1, then DT2 |
| Realtime | One process, state in Redis | OP3 |
| Locales | English until a second locale has readers | Keep the 16; they are already lazy per namespace |
| Identity | Chosen once, kept out of class names | Broadsheet N3's role names are right; see DS |

---

## Part AR — architecture

### AR1 — A workspace the compiler can hold

```yaml
id: AR1
gain: structure
impact: XL
effort: L
risk: med
depends: []
evidence: one tsconfig covers 1.4M lines; typecheck job 5m19s in CI; local run needs GOMEMLIMIT=4GiB GOGC=25 --singleThreaded; commit gate skipped on every commit of phases 28-32; lib/ has 182 directories
target: pnpm workspace packages with TypeScript project references; `tsc -b` rebuilds only what changed
```

Layout:

```
packages/
  core/          lib/core, lib/contract, lib/http, lib/url (no React, no Prisma)
  platform/      auth, prisma client, api handler, jobs, cache (server)
  ui/            components/ui, tokens, PageLayout
  engine-source/ tf2-game, sp-game, csgo-game, tf2-hud, tf2-loadout   (AR4)
features/<id>/   one package per product (already the shape: engine, ui, server)
apps/web/        app/, routes, the shell
apps/hubs/       server/socket-server, rmhbox, rmhtube
apps/jobs/       server/jobs and the workers
```

Steps, each shippable:

1. `packages/core` first: it has no inbound cycles (first audit A4/A5 saw to
   that). Add `composite: true`, a `references` entry in the root tsconfig,
   and keep the `@/lib/core/*` alias pointing at it so no import changes.
2. `packages/engine-source` (AR4). Largest single reduction in what a site
   change has to typecheck.
3. One feature at a time, starting with the 15 already under `features/`.
   Each gets `tsconfig.json` with `references: [core, ui, platform]`.
4. `apps/web` last. The root `typecheck` script becomes `tsc -b`.
5. Boundary rules already exist in `eslint-baseline/boundaries.json`; point
   them at package names.

```jsonc
// features/slice-it/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "outDir": "../../.cache/tsc/slice-it" },
  "include": ["engine", "ui", "server", "*.ts", "*.tsx"],
  "references": [{ "path": "../../packages/core" }, { "path": "../../packages/ui" }, { "path": "../../packages/platform" }]
}
```

**Done when:** `pnpm typecheck` with no source change finishes in under 20 s;
a cold run fits in 4 GB without flags; `rm -rf features/<id>` plus its one
catalogue line leaves `pnpm typecheck && pnpm test` green for three features
picked at random in CI (the *deletability test*).

### AR2 — One definition per read

```yaml
id: AR2
gain: structure
impact: XL
effort: M
risk: low
depends: []
evidence: 23 *.queries.ts files; 12 say they repeat a GET handler's body; 134 files call createServerFn; lib/admin/admin-ops.queries.ts re-implements requireAdmin next to defineHandler's auth:'admin'
target: defineQuery() is the GET route, the loader prefetch and the client call
```

Today, for one read:

```
app/routes/api/admin/flags.ts      implement(listAdminFlagsApi, { auth: 'admin' }, load)
lib/admin/admin-ops.contract.ts    endpoint<{ res }>()({ method: 'GET', path })
lib/admin/admin-ops.queries.ts     createServerFn().handler(async () => { requireAdmin(); load again })
                                   queryOptions({ queryKey, queryFn: routeQueryFn(serverFn, () => api(contract)) })
```

After:

```ts
// lib/admin/flags.query.ts
export const adminFlags = defineQuery({
  key: ['admin', 'flags'],
  path: '/api/admin/flags',          // still reachable over HTTP, same envelope
  auth: 'admin',
  rateLimit: 'read',
  load: async ({ userId }) => ({ flags: await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }) }),
});

// route:   export const Route = createFileRoute('/api/admin/flags')({ server: { handlers: { GET: adminFlags.handler } } })
// loader:  loader: ({ context }) => prefetchRouteQuery(context, adminFlags.options())
// client:  useQuery(adminFlags.options())
```

`defineQuery` builds the contract type from `load`'s return, wraps `load` in
`defineHandler` for HTTP, and wraps the same function in one server function
for loaders. Auth, rate limit and validation are stated once and enforced by
the same code on both paths.

Steps: write `lib/api/define-query.ts` over the existing `defineHandler`,
`endpoint` and `routeQueryFn`; convert the 23 queries files; make it the only
form B4 uses from then on; add a ratchet that fails on a new
`createServerFn` inside a `*.queries.ts`.

**Done when:** no `*.queries.ts` imports `createServerFn`; `grep -rl "Same
bod" lib` is empty; a new server-rendered read is one file plus one route
line.

### AR3 — API routes from a registry

```yaml
id: AR3
gain: structure
impact: L
effort: M
risk: med
depends: [AR2]
evidence: 987 files under app/routes/api; 425 are a single implement() call; app/routeTree.gen.ts is 1.26 MB and contributes 37.5 KB to the entry chunk
target: one dispatcher route; handlers registered next to their domain code; the generated tree lists pages only
```

```ts
// app/routes/api/$.ts
import { registry } from '@/lib/api/registry.server';   // built from features/*/api.ts and lib/*/api.ts
const dispatch = (request: Request) => registry.match(request)?.handle(request) ?? notFound();
export const Route = createFileRoute('/api/$')({ server: { handlers: { GET: dispatch, POST: dispatch, PUT: dispatch, PATCH: dispatch, DELETE: dispatch } } });
```

Steps: build the registry and a path matcher with a test that every contract
path resolves to exactly one handler; move the 425 pure-`implement` routes
(a codemod: the handler body moves beside its contract, the route file is
deleted); keep hand-written routes that stream, redirect or serve files as
files; regenerate `docs/site-reference/api.md` from the registry.

`/api/v1/**` keeps its own wrapper and can use the same dispatcher.

**Done when:** `app/routes/api` holds fewer than 150 files;
`routeTree.gen.ts` is under 450 KB; the entry's share of it is under 15 KB;
the integration suite passes unchanged.

### AR4 — The Source-engine port is its own package

```yaml
id: AR4
gain: structure
impact: L
effort: M
risk: low
depends: [AR1 step 1]
evidence: lib/tf2-game 138,493 lines; sp-game 15,075; csgo-game 10,247; tf2-hud 15,622; tf2-loadout 9,569; it already has its own workflow (tf2-game-tests.yml) and boundary test (tf2-engine-boundaries.test.ts)
target: packages/engine-source with its own tsconfig, test project and island build
```

First audit A3 step 1, promoted: it is the cheapest large cut. The engine
imports the site in very few places (the boundary test lists them); those
become the package's public interface. The site imports the engine only from
the TF2, CS:GO and HUD-editor routes, which become islands.

**Done when:** a change outside `packages/engine-source` runs none of its
125 test files and typechecks none of its files.

### AR5 — `lib/` has an index

`lib/` has 201 loose files and 182 directories. After AR1 most of it has an
owner. What stays is `packages/core` and `packages/platform`; a root-level
`lib/*.ts` file is then a lint error (`no-restricted-paths`), with today's 201
as a baseline that only shrinks.

---

## Part RT — runtime and page weight

### RT1 — Entry diet by package

```yaml
id: RT1
gain: perf
impact: L
effort: M
risk: low
depends: []
evidence: table in section 1.2; check-entry-composition already attributes bytes per package in CI
target: entry at or under 350 KB raw; critical path under 240 KB brotli (before Broadsheet P1, which lowers it further)
```

| Cut | Saves (raw) | How |
|---|---:|---|
| Auth client out of the shell | ≈44 KB | The document already carries the user. `authClient` loads with `/login`, `/settings/security` and the first sign-out. A 1 KB `session-context` reads the SSR value. |
| sonner on first toast | ≈33 KB | `toast()` becomes a 300-byte queue that imports sonner and its `<Toaster>` on first call. |
| Motion out of the shell | ≈42 KB | Shell transitions are CSS (`@starting-style`, already the house rule). framer stays for the pages that import it. |
| Dialog stack on first open | ≈26 KB | `ConfirmDialog` and the command palette mount lazily; they are already behind an interaction. |
| English without i18next | ≈40 KB | For `en`, `t(key, { defaultValue })` is string interpolation. Ship a 2 KB `t` for English and load i18next with the first non-English namespace. |
| tailwind-merge only where classes conflict | ≈20 KB | `cn()` in shell components becomes a join (already done for the radial loader in phase 27); `twMerge` stays in `components/ui` primitives that take a `className` override. |

Each cut is one pull request with the entry number before and after, and the
budget lowered in the same commit so the saving cannot be spent.

```ts
// lib/toast.ts
type Args = Parameters<typeof import('sonner').toast>;
let real: typeof import('sonner').toast | undefined;
const queue: Args[] = [];
export function toast(...args: Args) {
  if (real) return real(...args);
  queue.push(args);
  if (queue.length === 1) void import('./toast-host').then((m) => { real = m.mount(); queue.splice(0).forEach((a) => real!(...a)); });
}
```

**Done when:** `check-entry-composition` shows none of `sonner`,
`framer-motion`, `motion-dom`, `better-auth`, `@simplewebauthn/browser`,
`@radix-ui/react-dialog` in the entry closure (add them to its forbidden list
as each leaves), and `entryRaw` is at or under 350,000.

### RT2 — Edge cache that is in the repo

```yaml
id: RT2
gain: perf
impact: M
effort: S
risk: low
depends: [RT3]
evidence: anon-html-cache marks 10 audited paths public; deploy/terraform contains only dns.tf; Cloudflare does not cache HTML without a rule; /explore and /games/<id> send no Cache-Control when signed out
target: the cache rule is code; synthetic-perf asserts a HIT; the allowlist covers the busiest signed-out pages
```

Steps: add `cloudflare_ruleset` for "cache eligible when origin says public"
to `deploy/terraform` (if a dashboard rule exists, import it; if none exists,
the allowlist has never had an effect); add a `cf-cache-status` assertion to
`synthetic-perf.yml`; extend the allowlist to game and app landing pages and
`/explore` after checking each for per-viewer content, with the same test
that guards the current ten.

**Done when:** two requests a second apart to `/games` from the synthetic
check return `cf-cache-status: HIT` on the second.

### RT3 — CSP nonces and the shared cache

```yaml
id: RT3
gain: security
impact: L
effort: S
risk: low
depends: []
evidence: section 1.4 item 1; lib/csp/nonce.server.ts; server/nitro/anon-html-cache.ts
target: a response a shared cache may store never carries a nonce
```

Options, in order of preference:

1. **Hashes for cacheable documents.** The inline scripts on an anonymous
   page are the pre-paint script (static, already hashed by the Nitro hook
   for non-Start responses) and data. Move dehydrated loader data and JSON-LD
   into `<script type="application/json">` blocks, which are not executed and
   need no nonce, and read them from a hashed bootstrap. The cached document
   then carries a hash-only policy.
2. **No shared cache for nonce'd responses.** Simplest, and gives up RT2.

Either way add a test beside `anon-html-cache.test.ts`: a response whose
`Cache-Control` contains `public` must not contain `nonce-` in any header or
attribute.

**Done when:** that test passes and the enforced policy (when F5 lands) has no
`'unsafe-inline'` in `script-src`.

### RT4 — Smaller documents

Documents are 73–117 KB with 14–20 KB of inline script. `/games` at 117 KB is
the catalogue rendered in full. Worth doing only after RT1: paginate or
virtualise the catalogue below the fold, and stop dehydrating data the HTML
already shows where the query is not refetched on mount.

---

## Part DT — data

### DT1 — A census before any schema work

```yaml
id: DT1
gain: structure
impact: M
effort: S
risk: low
depends: []
evidence: 493 models in 23 files; C3 dropped 18 tables on evidence (docs/_generated/db-drop-candidates.md); playtime and history beats are recorded; no report ranks products or tables by use
target: an admin page and a monthly job that list every table with rows and last write, and every catalogue product with 30-day actives
```

```sql
-- tables: rows and last activity (pg_stat_user_tables is free)
select relname, n_live_tup, greatest(last_autoanalyze, last_analyze) as last_stats,
       n_tup_ins + n_tup_upd + n_tup_del as writes_since_reset
from pg_stat_user_tables order by n_live_tup;
```

Product actives come from the playtime and history tables grouped by catalogue
id. The job writes one JSON row per month; the page shows a table with a
"quiet for 90 days" filter.

**Done when:** the page exists and its first snapshot is committed to
`docs/_generated/` as the evidence file for DT2 and for the tiers below.

### DT2 — Tiers decided by the census

The owner keeps every page. Tiers decide what engineering a product gets, not
whether it exists:

| Tier | Rule | Treatment |
|---|---|---|
| Core | top third by actives, plus anything that touches coins | full gates, on the default typecheck and test path |
| Arcade | used, self-contained | own package, island build, its tests run when it changes |
| Attic | quiet for 90 days | frozen: built from a pinned commit of its package, excluded from default gates, banner-free for visitors |

Then the schema work the first audit left open (C3): drop what the census
shows is dead, thin `User`, and move each domain file to its own Postgres
schema (`multiSchema`) so a feature's tables are visibly its own.

### DT3 — A migration baseline

277 migrations replay on every CI database. With one production database and
no other consumers, squash to a baseline plus new migrations
(`prisma migrate resolve --applied` on the VPS). Low value alone; do it with
DT2.

---

## Part OP — operations, CI, deploy

### OP1 — A commit gate that runs here

```yaml
id: OP1
gain: practice
impact: L
effort: S
risk: low
depends: []
evidence: every commit of phases 28-32 used RMH_SKIP_COMMIT_GATE=1 with a memory note; the hook runs check-consistency --staged --fast, which is meant to skip tsc
target: the fast gate finishes in under 60 s and under 3 GB on the staged files
```

The hook is documented as fast and tsc-free, yet it was not usable in a 15 GB
container. Steps: time and memory-profile each step of `--fast` on a typical
staged change; cap the vitest step's workers and scope it to gates that read
the staged paths; fail with the step's name when a step is killed, so a skip
names the cause. After AR1 the full gate can include `tsc -b`.

**Done when:** ten consecutive agent commits in a cloud session carry no skip.

### OP2 — Perf assertions that do not flake

```yaml
id: OP2
gain: practice
impact: M
effort: S
risk: low
depends: []
evidence: perf_spec frame_ratio 1.366 > 1.35 on pull request 1563, green on re-run with no change; the spec divides one MP sample by one SP sample
target: the ratio is a median of interleaved runs; the job reports the spread
```

Run SP and MP alternately N times (5 is enough), compare medians, and print
min/median/max so a real regression is distinguishable from a noisy runner.
Keep the 1.35 line.

**Done when:** 20 consecutive runs on main are green and the log shows the
spread for each.

### OP3 — One realtime process that can restart

First audit D2, restated with numbers: three hubs, 17 handler modules, about
400 module-level `Map`/`Set` constructions across hubs and feature servers.
The rmhbox durable-lobby work (phase 20) is the pattern: a store interface,
coalesced saves, restore before listen. Apply it per handler in order of
session value (casino tables hold coins first), then turn on the Redis
adapter, then merge the three processes into one with namespaces. Each step
is behind the switch that already exists.

**Done when:** a deploy during an open blackjack round settles the round to
the same players after the restart, in an integration test.

### OP4 — Errors without a vendor

First audit D6 is blocked on choosing a vendor. A box-local option needs no
decision: `/api/client-error` and the server logger already produce the
events; store them in one Postgres table with a fingerprint, count and
first/last seen; show them on an admin page; let `oncall-watchdog` read the
count. It is not a tracing product. It answers "what broke after this
deploy", which is the question a single-box site has.

### OP5 — CI and deploy

Broadsheet B1 (deploy time) and B6 (workflow count) cover this. One addition:
`web-ci` should use AR1's project graph to skip jobs, not path filters kept
by hand.

---

## Part QA — quality

### QA1 — Gates by kind

`lib/__tests__` is 53,616 lines. Three kinds live there: contract tests
(a route answers 401 before 400), ratchets (a count may only fall), and
source scanners (a file must not contain a string). Broadsheet Q1 turns the
scanners into lint rules; agreed. Add: every ratchet prints the command that
lists its offenders, and ratchets that have reached their floor (raw fetch at
8, bare sockets at 1) become allowlists of named files, which read better
than a number.

### QA2 — Money paths end to end

First audit F2 remains open: checkout, coin grant, gift, market purchase and
refund, in a browser against the integration stack. These are the only flows
where a silent regression costs someone money, and AR2/AR3 will touch every
one of them.

---

## Part DS — design, a second opinion on Broadsheet

The owner asked for a new, human-made identity and Broadsheet is the merged
brief. This section does not propose a rival look. It records where an
independent read agrees and where it would do the work differently.

**Agreed.** The material runtime is the cost centre and should go. Role names
(`surface-card`) in place of material names (`glass-fill`) are right. "State
changes in 120 ms or does not animate" is right. Games and full-screen apps
keep their own art direction.

**Cautions.**

1. **A token swap produces a re-skin.** Paper, ink and a Clarendon applied
   through the existing contract will change 395 pages in a day, and most of
   them will read as the old layouts in new colours. What makes a site look
   made by a person is the decisions on individual pages: what is big, what
   is left out, where the grid is broken on purpose. Budget design time for
   the ten most-visited pages (Broadsheet N6 names two) and accept that the
   rest are themed.
2. **"Not generated" is not a style.** Warm paper with a serif headline is
   itself a current convention. The site's own material is stronger than any
   convention: a debt counter, a Pathfinder calendar, a laundry game, a
   history textbook. Let section fronts take their look from their subject,
   inside one type system.
3. **Do not tie the deletion to the identity.** See DS1.

### DS1 — Delete the runtime before choosing the paint

```yaml
id: DS1
gain: perf
impact: L
effort: M
risk: low
depends: []
evidence: Broadsheet 2.2 (globe chunk and worker on every page within 800 ms; DOM snapshot on every route change) and 2.4 (68.5k lines); none of that is needed to draw a static translucent card
target: the current look, static; no worker, canvas, snapshot or pointer service on a site page
```

Ship Broadsheet P1 against today's tokens first: role classes keep their
static CSS, the globe becomes a plain menu button, arcs and haze go. The page
gets lighter immediately, the before/after is a clean performance
measurement with no visual redesign mixed into it, and the identity work
then starts from a codebase where a surface is only CSS. If the new identity
needs a second attempt, nothing has to be undone.

**Done when:** a site page at rest and after ten clicks has zero
`requestAnimationFrame` callbacks, workers and canvases, with the current
themes still passing their contrast tests.

---

## Order of work

Each line is one pull request and leaves main shippable. Items that touch the
shell or tokens are left to the Broadsheet sequence to avoid two sessions
editing the same files.

| # | Pull request | Items |
|---:|---|---|
| 1 | This audit | — |
| 2 | Perf assertion medians; gate diagnostics | OP2, OP1 |
| 3 | No nonce on shared-cache responses | RT3 |
| 4 | `defineQuery`, 23 queries files converted | AR2 |
| 5 | Cloudflare cache rule in Terraform; allowlist widened | RT2 |
| 6 | Census job and page | DT1 |
| 7 | Entry diet, one cut per pull request | RT1 |
| 8 | `packages/core`, then `packages/engine-source` | AR1 steps 1–2, AR4 |
| 9 | API registry and dispatcher | AR3 |
| 10+ | Features as packages; realtime; tiers | AR1 steps 3–5, OP3, DT2 |

## Ledger

```
AR1: open
AR2: open
AR3: open
AR4: open
AR5: open
RT1: open
RT2: open
RT3: open
RT4: open
DT1: open
DT2: open
DT3: open
OP1: open
OP2: open
OP3: open (first audit D2 in progress)
OP4: open (owner call: box-local store or a vendor)
OP5: see Broadsheet B1, B6
QA1: see Broadsheet Q1
QA2: open (first audit F2)
DS1: open (sequencing proposal for Broadsheet P1)
```
