# Working in rmhstudios.com

`AGENTS.md` links to this file. Use the Node version in `.nvmrc` and pnpm version in `package.json`.
`pnpm install` generates the Prisma client. `pnpm dev` starts TanStack Start on port 7005 and its Node hubs and workers.
`pnpm build` builds the islands, Vite/Nitro SSR app and server bundles. Production service wiring lives in
`docker-compose.yml` and `deploy.sh`. [Architecture](docs/architecture.md)

## Find the owner

| Change | Start here |
| --- | --- |
| Page or UI behavior | Follow the URL under `app/routes/` to its component. `_site` routes use `SiteShell` and `PageLayout`. Full-screen apps have their own shell. [Routing](app/CLAUDE.md) · [Components](components/CLAUDE.md) |
| Game or app | Search the product ID under `features/<id>/`. The manifest names its routes, catalog entry and namespaces. Older features live under `lib/<id>` and `components/<id>`. [Feature guide](features/CLAUDE.md) |
| API field or validation | Search the URL in `*.contract.ts` and the domain's `api/*.server.ts`. Follow the contract to its schema, handler and typed callers. Search all handlers through `lib/api/route-sources.ts`. [API routing](app/CLAUDE.md#adding-an-api-route) |
| Stored data, sessions or shared logic | Start with the model in `prisma/schema/` or its domain in `lib/`. Keep server-only value imports in server code. [Library guide](lib/CLAUDE.md) |
| Realtime or background job | Search the event or queue name in `server/` and its feature. Go owns status and assets. [Node services](server/CLAUDE.md) · [Go services](go-services/CLAUDE.md) |

For RMH Med Schools, start with the task links in its [feature guide](features/medschools/CLAUDE.md).
For other large guides, use `rg -n '^##' <guide>` to find the relevant section.

## Change the source, then regenerate

| Output | Source and command |
| --- | --- |
| `app/routeTree.gen.ts`, `lib/prepaint/generated.ts`, `docs/_generated/facts/*.json` | Routes under `app/routes/`, the two entries under `lib/prepaint/`, and `scripts/gen-repo-facts.ts`. `pnpm gen` writes all three locally. Keep them out of git. |
| `lib/api/route-table.server.ts` | Domain modules exporting `apiRoute(...)`. Run `pnpm api:routes` and commit the table with the handlers. For site-reference inventories run `pnpm docs:site`. |
| `.oxlintrc.json`, `.oxlintrc.boundaries.json` | Edit `scripts/gen-oxlintrc.mjs` or `eslint-local-rules/design-scope.js`, then run `pnpm lint:config`. |
| Responsive image manifest `lib/images/variants.gen.ts` | Edit the image inputs or `scripts/gen-image-variants.ts`. Run `pnpm images:variants`, then `pnpm images:variants:check`. |
| Developer SDK in `packages/sdk/src/index.ts` | Edit the endpoint in `lib/api/registry.ts`. `lib/api/openapi.ts` builds the spec for `pnpm sdk:generate`. Verify with `pnpm sdk:check`. |
| English catalogs | Write literal `t("key", { defaultValue })` calls, then run `pnpm i18n:extract`. Changed shipped wording needs a new key. Register new namespaces in `lib/i18n/config.ts`. Other languages come from `i18n/catalogs`. [Translations](docs/translations.md) |
| Go BUILD files | Edit the Go sources, then run `make gazelle` and `make test`. |

## Contracts to check before editing

- New JSON endpoints use a client-safe typed contract, `implement()` on the server and `api(contract, input)` on the client.
  Existing untyped handlers use `defineHandler()`. The developer API uses `withDeveloperApi`. Keep auth, rate limits and
  Zod validation in the wrapper. Use `lib/ssrf-guard.server` for user-supplied URL fetches. [API guide](app/CLAUDE.md#adding-an-api-route)
- Before a UI commit read [design.md](design.md), [the UI definition of done](docs/design-language.md#0-definition-of-done-for-a-ui-commit)
  and [page consistency](docs/page-consistency.md). Steel's exact values, exceptions and rule IDs live in the
  [implementation plan](docs/plans/2026-11-11-steel-design-implementation.md). Ask before resolving an open §18 decision.
  Use the site primitives and tokens on the site tier and the app theme on full-screen routes. Check Day and Night at
  390px and 1280px, plus Arabic. For changes affecting Safari's bars use the [iOS screenshot workflow](docs/ios-safari-screenshots.md).
- Each public page has its own title, description, canonical URL and card. Use `buildMeta`, `buildCanonical` and the
  JSON-LD builders. [Open Graph coverage](docs/open-graph.md)
- Keep core independent, engine dependent only on core, and site above both. A new server file in an engine directory
  belongs to the site project. Register a new top-level module in `tsconfig.strict.json`. [Project ownership tests](lib/__tests__/tsconfig-projects.test.ts)

## Verify the edit

- Run `pnpm test <path/to/file.test.ts>` or pass a feature directory. Add `-t 'test name'` to select a case.
  `*.product.test.*` uses `pnpm test:product <path>`. Engine gameplay, integration and epic tests also have dedicated
  commands. For CI-equivalent date fixtures, run Vitest in UTC. For integration, use UTC for the disposable database and SSR process too. [Suite selection and prerequisites](docs/testing.md)
- Run `pnpm typecheck` for TypeScript contracts, including test fixtures. It builds the three projects with `tsc -b`.
  `pnpm lint` runs oxlint. Keep warnings and ratchets at or below the base branch.
- Stage the intended files and run `pnpm check:consistency` **before every commit**. Use
  `pnpm check:consistency --base main` for a branch and `pnpm check:consistency:full` for the full test gate.
  Hooks run the fast subset. Fix failures and report the step and signal if a check is killed. A genuinely incorrect
  rule changes in the same commit with its rationale. Emergency bypasses must be explained in the commit message.
  [Gate and resource budget](docs/testing.md#the-commit-gates-budget)

Code and deployment files take precedence over older documentation. [Documentation index](docs/README.md)
