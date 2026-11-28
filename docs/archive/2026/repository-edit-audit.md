# Repository edit audit

The [coverage checklist](repository-edit-audit.tsv) records the checkout at `b40d1e3ce` plus the working changes. It covers tracked paths and pending source files. Each row names a subsystem, route group, individual tool or configuration entry. The examples of callers and dependencies come from static imports, manifest commands and script references. Filesystem discovery, socket registration and external invocation also preserve entry points. A blank test field means the inventory did not establish a focused test for that row.

Search the TSV by an area such as `^features/doctrine` or `^scripts/balatro/`. The focused Vitest commands use file membership reported by the repository's own eight configs. For ongoing guidance use the [root instructions](../../../CLAUDE.md).

| Area | Decision |
| --- | --- |
| Routes, domain APIs and SDK | Share the developer API's first-issue validation and last-value query parsing. Homes keeps its empty-body rule and Study its distinct invalid-body message. Keep the four collection routes' direct session reads visible to the auth-migration gate. The endpoint registry feeds the OpenAPI generator, SDK and reference pages. |
| Game engines and realtime | Four games share the same checked timestamp and ID cursor. Four casino tables share room IDs and seat selection. Each game keeps its public exports, socket namespace, room state, settlement and timers. |
| UI, shared libraries, hooks and stores | Both chat components use the same media classifier. RMHTube keeps its parse cache. Time-zone callers select their original UTC or undefined fallback. Calendar, guestbook, study and RMHTube share the same two-way block lookup. Transaction-bound checks continue to use their own database handle. |
| Tournaments | Nine handlers share the error response that carries the message, taxonomy refusal and competition code. Routes with extra response fields keep their own envelopes. |
| Med Schools | One slug rule serves public schemas, member views and importers. One hook handles school-list filters on the index and live pages. The route, scraper and worker entry points stay at their existing paths. |
| Node services, Go services and CLI | Keep independent process entry points from the build, Compose and package manifests. Status and assets already separate commands, HTTP implementations and shared Go packages. CLI commands keep their published executable name. |
| Tests and verification | Share Vitest aliases while keeping suite-specific discovery. RMHBox phases retain their own user lists and share player defaults. The follow-privacy check reads the same production sources through Node. Integration fixtures create the paid user before authentication and read newly seeded data through distinct cache keys. |
| Builds, CI and operations | The three frontend build commands share one pipeline. Keep deployment scripts, action entry points, workflow triggers and separate documentation builds at their consumer-facing paths. |
| Schemas, assets, catalogs and generated files | Keep the Prisma migration sequence, translation keys and asset paths. Generate SDK, route tables, lint configuration and image variants at their sources. The TF2 data extractor preserves hand-maintained blocks, and the HUD base retains its original line endings for round trips. |

## Representative edit paths

The counts below are files containing the implementation and lines in the relevant function bodies or declarations, including their signatures. They measure the code to compare or rewrite for a rule change. Searches still return call sites. Token counts use the o200k_base encoding on the same excerpts. Test setup, search output and tool messages are outside these counts.

| Starting search and change | Prior implementations | Current owner | Tokens before → after | Focused verification |
| --- | --- | --- | --- | --- |
| `extractMediaEmbeds`, change chat URL classification | Shared chat and RMHTube, 2 files / 156 lines | `lib/unfurl/chat-media.ts`, 1 / 78 | 1,066 → 533 | `pnpm test:product lib/unfurl/chat-media.product.test.ts` |
| `tournamentRefusal`, change the common tournament error response | Nine check-in, scheduling, seeding and match handlers, 9 / 123 | `tournamentErrorResponse` in `lib/tournaments/tournament-error.ts`, 1 / 7 | 569 → 56 | `pnpm test lib/tournaments` |
| `getNextSeatIndex` or `generateRoomId`, change shared table seating and room-code rules | Baccarat, blackjack, hold’em and roulette handlers, 4 / 60 | `features/casino/server/room-seats.ts`, 1 / 15 | 533 → 152 | `pnpm test features/casino/server` |
| `saveFilters`, change the two school-list filter writers | Index and live pages, 2 / 59 | `features/medschools/ui/useSchoolListFilters.ts`, 1 / 19 | 649 → 137 | `pnpm test features/medschools/ui/pages.test.tsx` |

The coverage index is a structural audit. Production deployment, hosted CI, live third-party services and historical content reproduction require their own environments. The integration suite uses a disposable PostgreSQL database, a fake model provider and the in-memory casino table store.

## Verification on this checkout

| Scope | Result |
| --- | --- |
| Build and compatibility | Production build, sourcemap build and strict entry-composition check passed. The CLI built and the SDK matched its generator. |
| Type and lint checks | TypeScript projects, strict islands and the working-tree consistency gate passed. Whole-tree oxlint reported the same 865 warnings by file, rule and message as the original revision. |
| Main suite | 22,988 passed, 28 failed and 15 skipped in UTC. All 28 failures also occurred in the baseline. Seven are Altair simulation hash mismatches and 21 are deployment shell tests on macOS. The original local-time baseline had 51 failures, including date snapshots and timing assertions. |
| Integration | All 218 tests passed against the built SSR app and a freshly migrated UTC database. All six Go test targets passed separately with Bazel. |
| Dedicated suites | Product 3,158 passed, toolbox 171 passed, Source-engine 1,238 passed, Balatro 2,552 passed and epic publishing 21 passed. The Source-engine suite also reported 169 skips and Balatro one todo. The Balatro browser harness and engine projects had 47 passes and 18 skips. The multiplayer match project was outside this run. |
| Tooling | Python Source-game and asset suites passed with the CI dependencies. The Balatro pack tests passed with seven skips. Static parsing covered 56 Python, 37 shell, 78 JavaScript and 34 YAML files. Hosted CI triggers, production deployment and external publication were inspected statically. |
