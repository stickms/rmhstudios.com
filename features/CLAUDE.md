# features/ — one folder per game or app (redesign audit A1)

> Scope: guidance for `features/<id>/`. Repo-wide context: [`/CLAUDE.md`](../CLAUDE.md).
> Imported as `@features/<id>/...` (alias in `tsconfig.json`, `tsconfig.server.json`,
> `vitest*.config.ts`; Vite reads `tsconfig.json` paths).

A feature is everything one game or app owns, in one folder, instead of four to
six roots (`lib/<x>`, `components/<x>`, `server/socket-server/handlers/<x>.ts`, ...).

```
features/<id>/
  feature.ts     manifest: defineFeature({ id, kind, basePath, delivery, routes, namespaces, catalog, listed })
  catalog.ts     the game/app card (`GameInfo`/`AppInfo`, incl. `scoring` rules); composed into lib/catalog
  engine/        non-React logic (was lib/<id>/) — must not import components or features/<id>/ui
  ui/            React components (was components/<id>/)
  net/           client realtime/API wrappers, if split out of engine
  server/        socket handlers; registered by server/socket-server/features.ts
  api/           API route handlers, if they move out of app/routes/api/<id>/
```

Rules:

- **Routes stay thin and in `app/routes/`** (`app/routes/<id>.tsx`, `app/routes/api/<id>/**`):
  they import from `@features/<id>/...`. `routeTree.gen.ts` is unchanged by a move.
- **Manifest.** `feature.ts` default-exports `defineFeature({...})` from `@/lib/core/feature`.
  It imports zod, so client code never imports a manifest; `lib/__tests__/feature-manifests.test.ts`
  checks every manifest (id = folder, route files exist, namespaces registered in `lib/i18n/config.ts`).
- **Catalog.** A feature with a card owns it: `features/<id>/catalog.ts` default-exports the entry and
  the manifest's `catalog` names that path. `lib/catalog/index.ts` imports it in its static feature list
  (no generator: the list is checked in both directions by `feature-manifests.test.ts` and `catalog.test.ts`,
  and `catalog-contract.test.ts` snapshots the composed catalog). Moving a feature that has a card in
  `lib/catalog/{games,apps}/` means moving that file, repointing `catalog`, and swapping its import line.
  Scoring rules ride on the entry (`scoring`); `lib/game/registry.ts` derives from them.
- **Server handlers** live in `features/<id>/server/` and are registered by the hub's
  `server/socket-server/features.ts` list (order = registration order). A feature whose handlers sat between other hand-written calls sets `slot` and the hub calls `registerFeatureHandlers(io, socket, '<slot>')` at that spot. The esbuild
  server bundle follows the imports; the Dockerfile `server-builder` stage copies `features/`.
- **Tier exemptions follow the id.** `features/<id>/ui` is held to the same design tier as the old
  `components/<id>` (`FULLSCREEN_TIER_DIRS` in `eslint-local-rules/design-scope.js`).
- **Boundary rules.** Shared code (`components/ui`, `hooks`, `stores`, `lib/shared`, `lib/utils`)
  must not import `@features/*` (`eslint.boundaries.config.mjs`).
- **i18n catalogs stay in `locales/<lng>/<ns>.json`** (the loader reads them there); the manifest only
  names the namespaces.
- Moving a feature: `git mv` (history follows), rewrite specifiers repo-wide, move the matching
  `@source not` lines in `app/site-tier.css`, update test excludes in `vitest.config.ts` and workflow
  path filters that named the old directories.
- **Site-sheet exclusions are per part, never the whole folder:** a full-screen feature gets
  `@source not "../features/<id>/engine"` (and `/ui`, `/server`), so `features/<id>/catalog.ts` (the
  card, with its gradient classes, that site pages render) stays scanned.
  `lib/__tests__/style-tiers.test.ts` checks both directions at that granularity.

Moved so far: `hearthworks`, `casino`, `doctrine`, `balatro`, `altair`, `slice-it` (engine, ui, server), `void-breaker` and `nightrail` (engine, ui), `vega` and `signal-forge` (engine, ui; unlisted secret games), `dream-rift`, `gabriels-horn`, `synapse-storm` and `laundry-sort` (engine, ui, server, catalog). A feature whose disconnect handler was guarded by `if (!shuttingDown)` sets `skipDisconnectOnShutdown` on its `FeatureSocketServer`, and the hub passes `shuttingDown` to `handleFeatureDisconnects`. The A1 ledger line in `docs/plans/2026-11-09-ground-up-redesign-audit.md` tracks the rest.
