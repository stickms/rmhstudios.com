# 02 — JavaScript: the critical path

Three things were on every page that did not belong there. All three are fixed
in this commit. Two more are still there and are in
[`06-backlog.md`](06-backlog.md).

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

Nothing stops a fifth site from reintroducing this, and the failure is silent —
it costs bytes, not correctness. **This is worth an eslint rule**
(`eslint-local-rules/` already exists): ban `import * as X from 'lucide-react'`
and the named `icons` import. That is OPT-10 rewritten to match the real cause,
and it is the highest-value item in [`06-backlog.md`](06-backlog.md) §2.

## 2 — zod on the critical path, path one of two (FIXED)

`lib/catalog/index.ts` — imported by `components/Providers.tsx`, i.e. by every
page — imported `./types` for `gameEntrySchema`/`appEntrySchema` and ran
`buildCatalog()` at module scope: **34 strict `.parse()` calls in the browser on
every cold page load**, re-validating static data that cannot change at runtime.
Because module-scope `z.object(...)` calls are not tree-shakeable, the import
alone pinned zod (71.0 KB raw) to the shared entry.

The file documented the reasoning ("a typo'd key fails immediately — in dev, in
the test run, and in the build"). That reasoning is right; the *location* was
wrong. The cost was being paid by visitors for a check that only ever needs to
run once, in CI.

**The fix cost nothing in coverage, because the check was already duplicated.**
`lib/__tests__/catalog.test.ts:51-52` already parsed every entry with the same
two schemas. So:

- `lib/catalog/index.ts` now does `import type { … }` (erased at compile time),
  keeps the cheap cross-entry invariants (duplicate id, duplicate order) as plain
  comparisons, and ships typed data.
- The test is now the single place the schema runs — and it now sees the **raw**
  module objects rather than already-parsed output, which is marginally stronger.
- Each entry file is additionally annotated `const entry: GameInfo`, so
  TypeScript's excess-property checking already rejects a typo'd key at compile
  time. `imgPath` for `imagePath` never compiled.

`pnpm test` is in the commit gate and in `web-ci`, so the check cannot silently
stop running. The test's doc comment now says it is load-bearing.

Effect: `Providers-*` 41.7 KB → **32.8 KB**. `schemas-*` (zod) is **still on the
critical path** via the second path — 26 routes' `validateSearch` — which is
open; see [`06-backlog.md`](06-backlog.md) §1.

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

## 4 — Fragmentation: 90 chunks under 6 KB

The critical path is 111 chunks, of which **90 are under 6 KB**, totalling
125.9 KB. That is before the route's own chunks, which is how a page ends up
making 380 requests.

Improved by this commit (109 → 90 sub-6 KB chunks, 131 → 111 total) as a side
effect of the three fixes, but not addressed directly.
`output.codeSplitting.minSize` is the lever. The 08-04 audit called it "worth
measuring, not worth guessing at"; at 380 requests per page it is worth
measuring now. Open — [`06-backlog.md`](06-backlog.md) §3.

## 5 — Things deliberately not touched

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
