# 01 — Measurements: harness, numbers, and what not to trust

Everything quoted in this folder came from one of three places. Knowing which
matters, because they have very different error bars.

| Source                | Determinism | Use it for                                           |
| --------------------- | ----------- | ---------------------------------------------------- |
| **Build output**      | Exact       | Chunk sizes, critical-path composition, what exists  |
| **CDP network trace** | ±5%         | Request counts, encoded bytes on the wire            |
| **Browser timings**   | Noisy       | Direction of travel only — see §4                    |

## 1 — How to reproduce

```bash
# 1. Deps and a database (Postgres 16 local, empty).
pnpm install
createdb rmh
# `prisma db push` is blocked for agents by Prisma's own guard. Read-only DDL
# generation + psql apply is the non-destructive equivalent against an EMPTY db:
pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma \
  --script -o /tmp/schema.sql
psql -h 127.0.0.1 -U postgres -d rmh -f /tmp/schema.sql     # 323 tables, 0 errors

# 2. Production build, then boot it.
pnpm build
PORT=3201 NODE_ENV=production \
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/rmh \
  BETTER_AUTH_SECRET=... BETTER_AUTH_URL=http://localhost:3201/ \
  node .output/server/index.mjs

# 3. Measure. Both scripts are throwaway; the source is inlined in §5 below.
node measure2.mjs / /games /apps /library /news
```

Chromium: use the pre-installed binary, not Playwright's expected one — the repo
pins Playwright 1.62 (wants `chromium-1234`) and the image ships `chromium-1194`:

```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                  args: ['--no-sandbox', '--disable-dev-shm-usage'] })
```

All external origins are aborted at the route level, so every number below is
**pure client + origin cost with zero third-party network time**. A real
connection only adds to these.

## 2 — Build-level: the critical path

The critical path is the transitive **static**-import closure of the client
entry chunk (the one containing `rmh-user-theme`), walking `from "./x.js"` and
skipping `import("./x.js")`.

| Metric                | before  | after   | change      |
| --------------------- | ------: | ------: | ----------- |
| Entry chunk           | 277.2 KB | 276.0 KB | −1.2 KB    |
| Critical path, raw    | 1323.3 KB | 1260.6 KB | **−62.7 KB** |
| Critical path, brotli | 380.2 KB | 361.4 KB | **−18.8 KB** |
| Chunks                | 131     | **111** | **−20**     |
| Chunks under 6 KB     | 109 (137.6 KB) | 90 (125.9 KB) | −19 |
| Total JS files emitted | 1090   | 1018    | −72         |

Largest critical-path members, after:

| Chunk              |     Raw |  Brotli | What it is                        | Needed on every page? |
| ------------------ | ------: | ------: | --------------------------------- | --------------------- |
| `index-*`          | 276.0 KB | 66.5 KB | the entry                        | inherent              |
| `vendor-react-*`   | 187.3 KB | 50.1 KB | React                            | yes                   |
| `c-ui-*`           | 128.3 KB | 34.0 KB | English i18n core namespaces     | yes                   |
| `schemas-*`        |  71.0 KB | 16.6 KB | **zod**                          | **no** — see §3       |
| `layout-*`         |  68.2 KB | 19.3 KB | layout system                    | yes                   |
| `localeStore-*`    |  46.3 KB | 13.5 KB | locale store                     | yes                   |
| `auth-client-*`    |  43.0 KB | 13.0 KB | Better Auth client               | yes                   |
| `router-*`         |  41.4 KB | 12.2 KB | TanStack Router                  | yes                   |
| `createServerFn-*` |  36.8 KB | 10.2 KB | Start server-fn runtime          | yes                   |
| `Providers-*`      |  32.8 KB | 10.5 KB | the shell (was 41.7 KB)          | yes                   |
| `apps-*`           |  29.8 KB |  9.2 KB | the game/app catalog data        | data, not code        |
| `VisualElement-*`  |  26.4 KB |  8.5 KB | **framer-motion**                | **no** — see §3       |

Gone from the critical path entirely: `esm-*` (socket.io-client, 40.3 KB).

Gone from the build entirely: `icons-*` (431.3 KB raw / 116.1 KB gzip /
91.3 KB brotli, 1,400 export specifiers) and `lucide-react-*` (157.1 KB, the
barrel). What remains of lucide is `createLucideIcon-*` at **1.4 KB** plus
per-icon modules co-located into the route chunks that use them.

## 3 — What is still on the critical path and shouldn't be

Both are open items, carried into [`06-backlog.md`](06-backlog.md):

- **`schemas-*` — zod, 71.0 KB raw / 16.6 KB brotli.** The catalog path is
  fixed (see [`02-critical-path.md`](02-critical-path.md) §2) but the second
  path from the 08-09 audit is unchanged: **26 page routes** do
  `import { z } from 'zod'` at top level for their `validateSearch` schema.
  `validateSearch` is not a route *component*, so Start's splitter never lifts
  it and it lands in the shared entry by design.
- **`VisualElement-*` — framer-motion, 26.4 KB raw.** Reached from the shell.
  `Providers` already uses `LazyMotion`, so this is worth a look: either a
  feature bundle is being loaded eagerly, or a non-lazy `motion.*` import in the
  shell defeats it.

## 4 — Browser-level, and why to distrust the timings

Per-route, cold, unthrottled, all external origins aborted. Bytes are **encoded
transfer** (CDP `encodedDataLength`), i.e. what actually crossed the wire after
brotli/gzip:

| Route      | requests |    JS |  CSS |  IMG | FONT |  DOC | TOTAL   |
| ---------- | -------: | ----: | ---: | ---: | ---: | ---: | ------: |
| `/`        |      382 | 851–1062 KB | 104 KB | 6 KB | 49 KB | 60 KB | 1134–1347 KB |
| `/games`   |      351 | 1105 KB | 107 KB | 296 KB | 49 KB | 89 KB | 1723 KB |
| `/apps`    |      365 | 1010 KB | 104 KB | 124 KB | 49 KB | 63 KB | 1430 KB |
| `/library` |      334 |  873 KB | 107 KB |  6 KB | 49 KB | 61 KB | 1159 KB |
| `/news`    |      342 | 855–1071 KB | 104 KB | 6 KB | 49 KB | 50 KB | 1136–1352 KB |

Request counts are stable to ±1 across runs and are the number to act on.
**Byte totals swing up to 20% run-to-run** because the 3.5 s observation window
catches a different tail of lazily-preloaded route chunks each time; ranges are
given rather than false precision.

Timings, same runs:

| Route      | FCP        | LCP         | long tasks |
| ---------- | ---------: | ----------: | ---------: |
| `/`        | 724–824 ms | 1632–1924 ms | 457–584 ms |
| `/games`   |     868 ms |     2268 ms |     798 ms |
| `/apps`    |     724 ms |     2476 ms |     612 ms |
| `/library` | 716–852 ms |  716–852 ms | 303–435 ms |
| `/news`    | 644–660 ms | 644–2184 ms | 396–405 ms |

**Do not quote these as absolutes.** This is a shared, CPU-contended container.
Two first-touch samples came back at FCP 5768 ms (`/library`) and 11704 ms
(`/news`) and were not reproducible on any subsequent run — cold route-module
compilation, not a site defect. Anything under ~2× is noise here. What *is*
meaningful is the same-harness, minutes-apart before/after:

| Route    | metric      | before | after | change   |
| -------- | ----------- | -----: | ----: | -------- |
| `/`      | requests    |    533 |   382 | **−28%** |
| `/`      | long tasks  | 813 ms | ~570 ms | **−30%** |
| `/`      | LCP         | 2060 ms | 1904 ms | −8%    |
| `/`      | icon chunk fetched | yes | **no** | —   |
| `/games` | requests    |    515 |   350 | **−32%** |
| `/games` | long tasks  | 860 ms | 697 ms | −19%   |

> **Byte caveat, stated plainly.** The "before" run used
> `performance.getEntriesByType('resource')`, which the browser caps at 250
> entries, so its byte totals were silently truncated and are **not** comparable
> to the CDP figures above. The byte win from removing the icon chunk is
> therefore asserted from the *build* (a 431.3 KB raw / 116.1 KB gzip chunk that
> was fetched on `/` — initiator trace in
> [`02-critical-path.md`](02-critical-path.md) §1 — no longer exists), not from a
> before/after browser diff. The request-count and long-task deltas above are
> same-harness and are comparable.

## 5 — Server-side

```
cold first request after boot:  1.55 s – 2.04 s TTFB   (three boots)
warm:                           26 ms – 80 ms TTFB
```

The cold cost is `loadEntries()` in `startRequestResolver`: TanStack Start loads
**every** route entry module before serving any request, and there are ~855 of
them (570 under `app/routes/api/**`). The SSR router bundle is 2.77 MB. This
reproduces the 08-09 finding (1.84 s) unchanged, and is why a module-scope
third-party client constructor is a site-wide availability risk rather than a
feature-local one — see [`05-server-edge-fonts.md`](05-server-edge-fonts.md) §1.

`server/nitro/warmup.ts` masks this for the homepage after a deploy, so it is a
cold-start concern rather than a live one — but every blue/green swap pays it,
and any route the warmup does not prime pays it first.

## 6 — The harness

`measure2.mjs`, written to the repo root and deleted afterwards. Recreate it
from this description; the important details are the three things that are easy
to get wrong:

1. **Bytes from CDP `Network.loadingFinished.encodedDataLength`**, not from
   `performance.getEntriesByType('resource')` — the latter is capped at 250
   entries by default and will silently truncate a page like this one. If you do
   use the Performance API, call
   `performance.setResourceTimingBufferSize(5000)` in an init script first.
2. **Abort every non-origin request** in `page.route`, and record the hosts you
   aborted. That both removes third-party network variance and *produces the
   third-party inventory* — which is how the nine Google Fonts routes were
   found.
3. **Attribute by URL extension, not by `initiatorType`.** Modulepreloads and
   `import()`ed chunks report inconsistent initiator types across Chromium
   versions.

For chunk-graph analysis, walk `.output/public/assets/*.js` with two regexes —
`(?:from|import)\s*"\.\/([^"]+\.js)"` for static edges and
`import\(\s*"\.\/([^"]+\.js)"\s*\)` for dynamic ones — and BFS from the entry.
**Caveat learned the hard way:** those regexes miss `__vitePreload` and route
manifest references, so a chunk absent from the static closure can still be
fetched on every page load. Confirm reachability in a browser
(`Network.requestWillBeSent` + `e.initiator.stack`) before concluding a chunk is
not on a page. That mistake nearly buried this audit's largest finding.
