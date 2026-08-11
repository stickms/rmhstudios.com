# 02 — JavaScript: the critical path

Four things were on every page that did not belong there — a 431 KB icon chunk,
framer-motion's feature bundle, socket.io-client, and zod. Three are now gone.
zod is not, and §2 explains why that turned out to be a much bigger question than
either previous audit thought.

## 1 — The 431 KB icon chunk: four lines, not 588 files (FIXED)

### What was measured

`icons-7UyvsTkG.js` — **431.3 KB raw / 116.1 KB gzip / 91.3 KB brotli**, 1,400
export specifiers — was fetched on a cold anonymous load of `/`, alongside
`lucide-react-Dtg6ekTl.js` (**157.1 KB**, the barrel). Together, 588 KB raw of
icon machinery on the homepage, to render a handful of icons.

It is not in the entry's static-import closure, which is why a chunk-graph walk
says it is not on the homepage. It is, and the initiator trace says how:

```
icons-7UyvsTkG.js        <- preload-helper (__vitePreload)
                         <- index-*.js
                         <- lazyRouteComponent
lucide-react-Dtg6ekTl.js <- (same chain)
```

TanStack Start's lazy route component loading pulls the route's whole preload
list, and the homepage's route graph statically reaches the barrel.

### The root cause

Four files resolved an icon **by computed key against a namespace object**:

| File                                       | Shape                                  |
| ------------------------------------------ | -------------------------------------- |
| `components/shared/EmojiPickerPanel.tsx`   | `import * as Icons` → `Icons[name] ?? Icons.Smile` |
| `components/membership/MemberFeatureGrid.tsx` | `import * as Icons` → `Icons[name] ?? Icons.Sparkles` |
| `components/rmhbox/GameVoting.tsx`         | `import { icons }` → `icons[pascalName]` |
| `components/rmhbox/GamePickerModal.tsx`    | `import { icons }` → `icons[pascalName]` |

**A namespace object indexed by a computed key is unshakeable.** The bundler
cannot prove which members are reachable, so it must retain every one — all
~1,400 of lucide's exports — and because the namespace is a single module node
shared by hundreds of importers, it must become its own shared chunk. `import
{ icons }` is the same thing wearing a named-import costume: lucide's barrel
does `import * as index from './icons/index.mjs'; export { index as icons }`.

`EmojiPickerPanel` is the composer's emoji picker, which is how this reached the
*homepage* rather than staying on the four routes that use these components.

### Why the previously-recommended fix was the wrong one

The 08-09 audit attributed the chunk to "552 source files each importing a
handful of icons — rolldown hoists the union" and recommended OPT-10: a per-icon
deep-import codemod across ~588 files. That diagnosis was wrong and the codemod
was unnecessary. Ordinary named imports from lucide tree-shake correctly
(`sideEffects: false`, the barrel is a pure re-export list). **Do not do the
588-file codemod.**

### The fix

Each of the four sites had a **bounded, statically-known** set of possible icon
names, coming from a registry: `CATEGORY_META` (11 icons), `MEMBER_FEATURES`
(11), and `MINIGAME_REGISTRY` (9 lucide names + 8 emoji). Each became an explicit
`Record<string, LucideIcon>` map with the same fallback the dynamic lookup had.

This is not a new pattern — it is the pattern the codebase already used in
`components/home/layout-icons.ts` (`iconFor(name)`) and `CommandPalette`'s
`DESTINATION_ICONS`. The four sites were the outliers.

New shared module: `components/rmhbox/minigame-icons.ts` (the two rmhbox
components use the same registry, so the map is shared rather than duplicated).

### Verified

| Artefact                    | before                    | after           |
| --------------------------- | ------------------------- | --------------- |
| `icons-*` chunk             | 431.3 KB / 116.1 KB gzip  | **does not exist** |
| `lucide-react-*` barrel     | 157.1 KB                  | **does not exist** |
| lucide shared runtime       | —                         | `createLucideIcon-*`, **1.4 KB** |
| Icon chunk fetched on `/`   | yes                       | **no**          |
| Requests to render `/`      | 533                       | **382**         |
| Long tasks on `/`           | 813 ms                    | **~570 ms**     |

Icons are now per-icon modules that rolldown co-locates into whichever route
chunk uses them — the outcome OPT-10 wanted, reached by editing four files.

### The regression risk, and how to hold the line

Nothing stopped a fifth site from reintroducing this, and the failure is silent —
it costs bytes, not correctness, so nothing errors and no test fails. It reached
production four times before anyone measured it.

**So there is now a lint rule**: `local/no-lucide-namespace-import`, in
`eslint-local-rules/`, at **error** rather than warn. It bans
`import * as X from 'lucide-react'` and the named `icons` import, and points the
author at the three explicit-map examples the codebase already contains. Unlike
its neighbour `local/no-adhoc-user-select`, it has no backlog to work through —
the four sites are fixed, so the count is zero and the only direction it can move
is up.

Tests are exempt (`**/*.test.{ts,tsx}`, `**/__tests__/**`): the rule is about
bundle size and a test is never bundled, while `lib/__tests__/catalog.test.ts`
legitimately needs the whole set to assert every catalog `iconName` is a real
icon — which is exactly why the catalog schema deliberately does not check
`iconName` itself.

## 2 — zod: nine routes fixed, and it is STILL on the critical path

This is the finding that changed shape twice under measurement. Read the whole
section before spending time on it.

### What was fixed

**The catalog path (fixed).** `lib/catalog/index.ts` — imported by
`components/Providers.tsx`, i.e. every page — imported `./types` for the zod
schemas and ran `buildCatalog()` at module scope: **34 strict `.parse()` calls in
the browser on every cold page load**, re-validating static data that cannot
change at runtime. The validation was already duplicated in
`lib/__tests__/catalog.test.ts:51-52`, so moving it there cost nothing: the test
now sees the *raw* module objects (marginally stronger), each entry file is
annotated `const entry: GameInfo` so TypeScript's excess-property check already
rejects a typo'd key, and `pnpm test` is in the commit gate. `Providers-*` went
41.7 KB → 32.8 KB.

**The route modules (fixed).** Nine route modules imported zod at top level, and
because Start aggregates every route module's top-level code into the shared
entry, each one charged the whole site:

- Seven `_site/rmhladder/*` routes → schemas moved to
  `lib/rmhladder/server-fn-schemas.server.ts`. Safe because a server function's
  validator runs **only** on the server — `@tanstack/start-client-core`'s
  `createServerFn.js` is explicit: `if (validator && env === "server")`. The
  `.server.ts` suffix means the client gets `undefined` stubs, and the lambda form
  `(input) => schema.parse(input)` never dereferences them. Keep the lambda form,
  and keep derived schemas (`.extend()`) in that file — a module-scope `.extend()`
  on an `undefined` stub would throw on the client.
- `bums-rush.tsx` and `sohumbum2/$date.tsx` → hand-rolled parsers.
  `bums-rush` had to be: it used the schema for **`validateSearch`**, which *does*
  run in the browser and therefore can never hide behind a `.server` boundary.

### Why zod is still there anyway

`schemas-*` remains on the critical path at **71.0 KB raw / 16.6 KB brotli**.
Walking the source import graph from every route/shell top level (following `@/`
and relative specifiers, treating `.server.ts` as a dead end) finds **246
client-reachable modules that import zod**:

```
app/routes/_site/index.tsx          ← lib/feed/timeline.ts ← lib/feed/signals.ts
app/routes/_site/u/$userid/post/$postid.tsx ← components/feed/PostDetail.tsx ← lib/rmhark-schema.ts
app/routes/_site/emoji-packs.tsx    ← lib/emoji/packs.ts
app/routes/_site/settings/security.tsx ← components/settings/ProfileLinksPanel.tsx ← lib/url-safety.ts
app/routes/_site/settings/layout.tsx   ← components/site/SidebarEditMode.tsx ← lib/home-widgets.ts
… 241 more
```

**zod is the shared schema layer of this codebase, not a route-level accident.**
The homepage reaches it in three hops. 67 non-`.server` modules under `lib/`
import it directly. The 08-09 audit's "26 routes' `validateSearch`" framing —
which the first draft of this audit repeated — described neither the count nor
the mechanism.

So the remaining options are honest ones, and neither is a quick fix:

- **`zod/mini` (OPT-06).** Addresses all 246 paths at once with a substantially
  smaller runtime. Costs a rewrite of each schema to the functional API
  (`z.string().max(200)` → `z.string().check(z.maxLength(200))`), and these
  schemas guard server inputs, so a mechanical rewrite needs care.
- **Accept it.** 16.6 KB brotli is a real but modest price for the validation
  layer the whole application shares.

What is *not* an option is another round of route-level edits: that work is done
and it did not move the number.

> **Keep the rule anyway.** The 08-04 audit's rule — "never import zod into a
> shell module" — is still correct and is why the nine routes were worth fixing;
> it just was never the whole story. A route module's top level is the shared
> entry, so the rule holds regardless of what the aggregate number does.

## 3 — socket.io-client on every page, for voice calls (FIXED)

`components/Providers.tsx` renders `CallMount` on every page. `CallMount`
statically imported `@/lib/call/store`, which imports `socket.io-client`
(40.3 KB raw / 11.4 KB brotli).

The component was already careful *not to open* the socket for a signed-out
viewer:

```tsx
useEffect(() => { if (!userId) return; initCalls(); }, [userId]);
if (!userId) return null;
```

Guarding the **call** while leaving the **import** static saves nothing: an
import is paid at load time, not at call time. Every anonymous visitor — who has
nobody to call and nobody who can call them — downloaded, parsed and executed
the socket library before hydration could finish.

Fix: `lazy()` the overlay, and `import('@/lib/call/store')` inside the effect
that already guards on `userId`, with a cancel flag so a sign-out mid-flight
cannot open a socket for a dead session.

Effect: `esm-*` (40.3 KB) left the critical path.

## 4 — framer-motion on the critical path (FIXED)

`Providers` wraps the whole app in `LazyMotion`, whose entire purpose is that the
animation/gesture/layout feature bundle loads on demand. `m` is the component that
honours that; `motion` carries its own full implementation.

**Nine modules imported the full `motion`**, and every one was reachable from a
route's top level — so the feature bundle landed in the shared entry and the
`LazyMotion` setup was defeated for everyone:

| Module | Reached from |
| ------ | ------------ |
| `components/feed/ComposeBox.tsx` | `_site/c.$slug.tsx` ← `CommunityColumn` |
| `components/feed/ComposeModal.tsx` | `_site/share.tsx` |
| `components/ui/selection-bar.tsx` | `_site/u/$userid/index.tsx` ← `ProfileColumn` ← `ProfileShowcase` |
| `components/pf2ecal/{Pf2eCalendar,Loading,Announcements,MonthGrid,NextUp,SessionCard}.tsx` | `pf2ecal.tsx` |

Six *route* modules in the same codebase already used `import { m as motion }`,
so this was drift rather than a design decision. All nine switched.

Effect: `layout-*` (**68.2 KB raw / 19.3 KB brotli** — framer-motion's layout
projection) left the entry graph entirely. It had been sitting in the top five
critical-path members for two audits without anyone identifying what it was.

Critical path 1260.7 → **1182.1 KB raw**, brotli 361.4 → **338.1 KB**, 111 → **108**
chunks.

**`VisualElement-*` (26.4 KB) is still there**, and it is worth being precise about
why rather than claiming a clean sweep. After the fix, no route-reachable module
imports the full `motion` — verified by re-running the same scan, which returns 0.
What still reaches the element core is a set of framer APIs that have no
lightweight `m`-style variant:

| Binding | Module |
| ------- | ------ |
| `Reorder`, `useDragControls` | `components/ui/sortable-list.tsx` |
| `LayoutGroup` | `components/user-builds/BuildGrid.tsx` |
| `useScroll`, `useMotionValue` | `components/motion/ScrollScene.tsx` |
| `useTransform` | `components/feed/PinnedHero.tsx` |
| `useInView` | `components/news/NewsHero.tsx` |

Those are correct uses of the library. Removing the last 26.4 KB means putting
their *consumers* behind a lazy boundary, which is a route-structure change rather
than an import fix — [`06-backlog.md`](06-backlog.md) §12.

## 5 — Fragmentation: 89 chunks under 6 KB

The critical path is 111 chunks, of which **90 are under 6 KB**, totalling
125.9 KB. That is before the route's own chunks, which is how a page ends up
making 380 requests.

Improved by this commit (109 → 90 sub-6 KB chunks, 131 → 111 total) as a side
effect of the three fixes, but not addressed directly.
`output.codeSplitting.minSize` is the lever. The 08-04 audit called it "worth
measuring, not worth guessing at"; at 380 requests per page it is worth
measuring now. Open — [`06-backlog.md`](06-backlog.md) §3.

## 6 — Things deliberately not touched

- **`c-ui-*`, 128.3 KB — the English i18n core namespaces.** Genuinely needed on
  every page, and growing (103 KB on 08-04, 128 KB now). Worth watching; not a
  defect.
- **The 3D games' 4.8–6.0 s of main-thread long tasks.** Confirmed still the
  largest single ceiling anywhere in the product, and untouched here because it
  is a real investigation (three.js shader compilation, scene construction,
  geometry upload), not a known fix. The applicable levers remain OPT-26
  (KTX2/Basis), OPT-37 (`OffscreenCanvas`) and staging scene construction across
  frames. See [`../3d-performance-audit.md`](../3d-performance-audit.md).
- **`rapier-*` at 2.18 MB and `maplibre-gl-*` at 949 KB.** Both correctly behind
  route-level `lazy()` boundaries and absent from the critical path. Large, but
  paid only by the routes that need them.
