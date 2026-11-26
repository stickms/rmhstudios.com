# Brief 10 — Notifications in the developer API that you can mark read, with their notice keys and an unread count

You are a fresh implementer with no other context. This brief and the files it names are everything you need. Build the
feature completely — UI, server, persistence and tests as specified — commit it on your feature branch, and report back.

|                |                                                                            |
| -------------- | -------------------------------------------------------------------------- |
| Specification  | `docs/autonomous/sprint-15/features/10-notifications-api.md` |
| Wave           | 5 (slot B) |
| Branch         | `autonomous/s15-notifications-api` (from `claude/autonomous-sprint-15`) |
| Worktree       | `/home/user/wt/s15-notifications-api` |
| i18n namespace | none (developer API) |
| Schema         | none |
| Client build   | required (§Sprint 15 additions) |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find you need to, stop and report it): 07 Hear back when a puzzle you reported is reviewed, and when a jam you entered moves its deadlines (`fix-notices`), 12 Mention someone in a game discussion, and they hear about it (`thread-mentions`).

Merged before your wave: Wave 0 (namespaces, anchors, the sprint 15 export file) and 19 `integration-finds`, 04 `workshop-reports`, 01 `human-keyboard`, 05 `prediction-comments`, 03 `slice-api`, 02 `haw-saves`, 06 `member-text-reports`, 15 `synapse-rivals`, 11 `character-resources`, 16 `removal-appeals`, 08 `calc-graphs`, 09 `dream-rift-coop` (see `plan.md` §Waves).

## Read first (in this order)

1. The specification: `docs/autonomous/sprint-15/features/10-notifications-api.md`. It is the contract; its acceptance criteria
   are what review checks.
2. `CLAUDE.md` at the repo root (commit gate, conventions), then `app/CLAUDE.md`, `lib/CLAUDE.md` and
   `components/CLAUDE.md` (and `features/CLAUDE.md` if you touch `features/`, `server/CLAUDE.md` if you touch
   `server/`).
3. `design.md` and, for any UI, `docs/page-consistency.md` §3. Values in
   `docs/plans/2026-11-11-steel-design-implementation.md` are exact; do not resolve its section-18 open decisions (D1,
   D3, D6, D7, D8, D10, D12) — if your work seems to need one, stop and say so in your report. Also do not decide any
   open owner decision: moderator notes in the data export, the deletion grace period (its length and what the account
   looks like during it), unlisted tournament or listing meta, Apache `CF-Connecting-IP` stripping, blocked members
   RSVPing to a blocker's events, RMHBox per-minigame history privacy, ownership transfer in the public mod log, emoji
   reactions under quiet counts, recovery codes and trusted contacts having no product, a deleted member's follows, game
   reviews, guides, jam entries and public decks, uploading Studio samples, how long `RebarReservation` bookings are
   kept, a public setting for the RMHTube profile card, purchased cosmetics and season passes at erasure, refunds when
   an account is deleted, retiring one of the two news-story follows.
4. `docs/autonomous/sprint-15/plan.md` (waves, shared and anchored files), and `docs/autonomous/sprint-15/README.md` for
   what the sprint does and rejects.

## Repo essentials you must follow

- **TanStack Start + Vite + React 19, not Next.js.** Routes are files under `app/routes/`; `_site/` pages get the Steel
  shell and use `PageLayout` (`components/feed/PageLayout.tsx`); top-level routes are full-screen and keep their own
  look (L8, `--app-*` in `components/shared/app-theme.css`).
- **Endpoints:** declare each one in a client-safe `*.contract.ts` with `endpoint<{ body; res }>()({ method, path })`
  (`import type` from the zod schemas), bind it in a registered module `lib/<domain>/api/<path.with.dots>.server.ts`
  exporting `route = apiRoute('/api/…', { GET: implement(contract, options, handler) })`, and call it from the client
  with `api(contract, input)` from `@/lib/contract/client`. Worked example: `lib/playtime/playtime.contract.ts` +
  `lib/playtime/api/games.playtime.server.ts`. Never write `fetch('/api/…')`
  (`lib/__tests__/raw-api-fetch-ratchet.test.ts`). After adding a module run `pnpm api:routes`. `/api/v1/**` stays route
  files with `withDeveloperApi`.
- `implement()` / `defineHandler` options: `auth` (`'required'` default, `'optional'`, `'admin'`, `'none'`), `rateLimit`
  (`'read'`, `'write'`, or `{ limit, windowMs, prefix }`), `body` / `query` zod schemas. **Validate every input with
  zod, query parameters included** — repeated parameters do not survive, so a list is one comma-separated parameter.
  Never echo a caught error to the client.
- **Server functions:** any `createServerFn` you add (route loaders) guards **inside its handler** with
  `requireSessionServerFn` / `requireAdminServerFn` from `lib/auth/server-fn-guards.server.ts`; a route's `beforeLoad`
  does not protect a server function.
- **Server-only code** is named `*.server.ts` and never imported from client code. Pure logic and zod go in plain files.
- **Prisma** via `import { prisma } from '@/lib/prisma.server'`. Every model `@@map`s to snake_case; migrations are
  additive. **Raw SQL (`$queryRaw`/`$executeRaw`) must use the real `@@map` table name and quoted camelCase column
  names** (`"userId"`, `"createdAt"`) — read them in the schema and assert them in a test; integration smoke-tests raw
  SQL against Postgres.
- **Caps and races:** a check-then-insert cap (at most N rows, one pending offer, one seat left) runs in a transaction
  that first takes `lockKey(tx, '<feature>:<id>')` from `lib/db/advisory-lock.server.ts` (sprint 04). A job that must
  act once claims its rows with a conditional `updateMany` (compare-and-set) before acting.
- **Account deletion anonymises in place**, so `onDelete: Cascade` never fires for a deleted member: every new per-user
  table must be deleted (or de-identified) explicitly in `anonymizeAccount` (`lib/account/deletion.server.ts`, under
  your anchor) with a test in `lib/account/__tests__/<thing>-erasure.test.ts` (copy
  `lib/account/__tests__/study-erasure.test.ts`). Personal data a member owns also gets an `export…(userId)` function
  for the account export (integration wires it).
- **Blocked and banned members** are refused wherever members interact (blocks in either direction: `UserBlock`; bans:
  `User.bannedUntil` in the future). **Anything that shows content must check every read path** — feed, post page,
  profile, search, embeds, RSS, OG images, admin server functions and `/api/v1/**`; sprint 03 leaked drafts through
  paths it forgot.
- **Design (Steel):** only `--site-*` token utilities on the site tier (`bg-site-bg`, `border-site-border`,
  `text-site-text-muted`, `rounded-site`, …); type is the `t-*` classes (`t-title`, `t-heading`, `t-body`, `t-post`,
  `t-prose`, `t-label`, `t-meta`), weights 400/500/600; flat (no gradient, blur, glow, shadow, translucency,
  `transition-all`); rules before boxes (a list is rows on `border-b border-site-border`); one ink primary button per
  view; overlays (menus, dialogs) are the only raised surface; content that arrives after paint fades in through
  `components/ui/arrive.tsx`; nothing moves at rest. Use `components/ui/` primitives (button, input, select, switch,
  tabs, dialog, menu, empty-state, skeleton, confirm-dialog, bar-chart, line-chart), lucide icons, `toast` from
  `@/lib/toast`. Tab strips and segmented filters use `components/ui/tabs.tsx` — never hand-roll one. **`components/ui/`
  primitives take translated strings as props**; never read a feature namespace from inside `components/ui/`. Never use
  `window.prompt`, `window.confirm` or `alert`.
- **Focus:** never use `requestAnimationFrame` to move focus (the rAF allowlist gate,
  `lib/__tests__/raf-loop-allowlist.test.ts`, fails it); use the dialog's `onCloseAutoFocus` or a direct `.focus()` in
  the event handler.
- **i18n:** every user-facing string is `t('key', { defaultValue: 'English' })` with a literal key and a literal default
  (interpolate with `{{name}}`, never `${}`; never build a key at run time — sprint 04's computed-key ratchet fails it).
  Your feature has **no namespace of its own**: the developer API speaks English JSON and its docs are generated; you add no `t()` strings. Never put a `{/* … */}` JSX comment immediately before a `t()` call (the
  extractor skips it). Do not edit `lib/i18n/config.ts`. `pnpm i18n:extract` scans `app/**`, `components/**` and
  `features/**` (not tests), so every `t()` call lives there: `lib/` code returns data and i18n keys, and components
  translate them. Changing the wording of a shipped string needs a new key.
- **Accessibility:** native or Radix primitives, labels on every control, focus ring is global (do not override it),
  4.5:1 text contrast via the tokens, controls 36 px high (44 px on touch).
- **Time zones and day keys:** use `lib/calendar/tz.ts` (`isValidTimeZone`, `dayOf`, `wallToUtcMs`, …); do not write
  another time-zone helper.
- **Strict island:** if you add a new top-level module directory, read `tsconfig.strict.json`; do not add `any`,
  `@ts-ignore` or `@ts-nocheck` (`lib/__tests__/ts-escape-hatch-ratchet.test.ts`). A new `*.server.ts` inside an engine
  directory belongs to `tsconfig.site.json` (root `CLAUDE.md` §12).
- **Erasure tests use recording Proxies.** The stubs in `lib/account/__tests__/*-erasure.test.ts` record calls through a
  Proxy, so a read that runs **before** the transaction (anything you `await` outside the `$transaction([...])` array)
  gets a Proxy back, not rows: guard it with `Array.isArray(rows) ? rows : []`. Never put `$executeRaw` inside the
  transaction array (the stub cannot record it and production ordering is unclear); use Prisma operations there, or a
  pre-step before the transaction.
- **Counts and lists other members can see:** like, reply, repost and view counts go through quiet counts
  (`QUIET_COUNT_READ_PATHS`, sprint 04 14); anything that lists who follows whom goes through follow-list privacy
  (`FOLLOW_LIST_READ_PATHS`, sprint 04 18). Direct messages are only ever sent through `sendDirectMessage`
  (`requestGate`, `guardDirect`), never by writing rows. Blocks (either direction) and bans are refused wherever members
  interact.
- **Notifications:** a `SYSTEM` notification's label is a literal
  `t('system-label-<entityType>', { ns: 'feed', defaultValue: '…' })` in `components/feed/notification-labels.ts` (under
  your anchor, with its line in the test); never a computed key or a ternary choosing keys (the computed-key ratchet,
  `lib/__tests__/i18n-computed-key-ratchet.test.ts`). Create notifications with `createNotification`
  (`lib/notifications.server.ts`) so preferences, quiet hours and push apply.
- **Public developer API (`/api/v1/**`, `lib/api/openapi.ts`) changes are additive only:\*\* add fields, never remove or
  rename documented ones.
- **Sitemap:** a new param-less page goes in `EXCLUDED_ROUTES` (or the public map, with an OG card), never
  `DYNAMIC_ROUTES` (that map is for `$param` paths); `lib/__tests__/sitemap-coverage.test.ts` checks it.
- **No native dialogs:** never `window.prompt`, `window.confirm` or `alert`
  (`lib/__tests__/native-dialog-ratchet.test.ts`); use `useConfirm` (`components/ui/confirm-dialog.tsx`) and `usePrompt`
  (`components/ui/prompt-dialog.tsx`).
- **Tests:** mission-critical tests (ownership, secrets, auth, money, a member's data, erasure) are plain `*.test.ts` in
  the main suite; pure product logic goes in `*.product.test.ts` (the product suite, `vitest.product.config.ts`).
  Main-suite tests never touch a real database: mock Prisma the way
  `lib/notify/__tests__/create-notification-push.test.ts` does (`vi.mock('@/lib/prisma.server', …)`) or use a fake like
  `lib/economy/__tests__/fake-db.ts`.

## Sprint 07 and 08 additions (lessons from earlier sprints)

- **Sprints 1–14 are in your worktree** (merged before Wave 0). Sprint 14 added: Identity Crisis in RMHBox, the
  Hearthworks town on the account (with the save route's optional `expectedUpdatedAt` compare-and-set), Synapse Storm
  "Your matches", the Altair co-op record and boards, the Doctrine XP ledger, daily-puzzle reports and
  `/admin/daily-puzzles`, report types for Slice It songs and comments, the games library's reviews, guides, threads,
  replies and tips, profiles' impersonation and RMHTube rooms (`moderatedAt` takedowns, `GAME_CONTENT_READ_PATHS`,
  `TUBE_ROOM_READ_PATHS`), keyed thread-reply notices (`notifyThreadReply`), pinned conversations, supporter marks, jam
  editing, saved homes in the developer API (`read:homes`, `write:homes`), self-exclusion that hides the coin games
  (`RISK_SURFACE_PATHS`, `useRiskSurfacesHidden`), timeouts on every writer and hub (`restriction-paths.ts`,
  `restrictions-core.ts`), the plain-column erasure registry (`PLAIN_MEMBER_COLUMNS`) and schema-checked fakes
  (`shapeChecked`, `assertJsonSafe`). Sprint 13 before it added Sequence Sam, Altair "Your runs", RMHTube chat reports
  and host subscriptions, RMHLadder's explicit scopes (`READ_SCOPES` leaves explicit scopes out), news stories, ranked
  standing, Rideshare blocks and reports, RMHBox pack reports (`autoHiddenAt`), DM reports with edit versions and
  message pushes; sprints 10–12 refusals in the reader's language (`ERROR_CODES`, `refusalBody()`, the `serverError(`
  ratchet), named form fields and member-item report types with takedowns that stick (`MEMBER_ITEM_REPORT_TYPES`,
  `moderatedAt`).
  Reuse them; do not redo them.
- **Exports:** if your feature owns personal data, write an `export…(userId)` function and add one property under your
  anchor in `lib/account/export-sprint-15.server.ts` (created in Wave 0). Never edit
  `lib/account/api/account.export.server.ts`.
- **Erasure registry:** every new model with a `User` relation gets an entry in `lib/account/erasure-registry.ts` with a
  real decision (`erase`, `deidentify`, `cascade` with its `parent`, `keep` with the rule) — **never `todo`** — and
  `lib/account/__tests__/erasure-coverage.test.ts` must pass. After editing the registry run `pnpm docs:deletion` and
  commit `docs/account-deletion.md`. `TODO_CEILING` may only fall, in the same change that classifies a `todo` entry.
- **Admin actions** are audited with `recordAdminActionIn(tx, …)` (`lib/admin-audit.server.ts`) inside the same
  transaction as the change.
- **Indexes on existing tables** are `CREATE INDEX CONCURRENTLY` in a migration of their own (one statement), followed
  by an `_ensure_valid` migration (copy `prisma/migrations/20261126060101_s06_flashcard_external_id_index` and
  `20261126060102_s06_flashcard_external_id_index_ensure_valid`). Declare the index in the schema with `@@index` and use
  **Prisma's default name** (`<table>_<columns>_idx`) in the SQL, so the schema and the database never drift. Two are
  planned in sprint 15 (09 on `"DreamRiftCoopRun"`, 20 on `rmhbox_match`); if you need another, stop and say so in
  your report.
- **Read-path registries:** a feature that changes what some readers see lists every server path that must apply it in
  an exported constant and holds that list with a source-scan test, the way `QUIET_COUNT_READ_PATHS`,
  `FOLLOW_LIST_READ_PATHS` and `QUIZ_READ_PATHS` do. A new reader of posts is added to every existing registry that
  lists readers of its kind.
- **Client code and zod:** a client module must not import `zod` statically on a hot route
  (`lib/__tests__/zod-off-hot-routes.test.ts`); lazy-load a dialog that needs a schema, and import contract types with
  `import type`.
- **No `/api` fetch inside `useEffect`** (`lib/__tests__/useeffect-fetch-ratchet.test.ts`): reads go through React Query
  (`useQuery` with `api(contract, input)`), writes through mutations or event handlers.
- **Island bundles** (`features/*/island*`) must not import React Query or the router (`lib/__tests__/islands.test.ts`);
  pass data in as props or call `api()` from an event handler.
- **Boundaries:** `lib/` never imports `components/`, and nothing adds an import cycle. Check your changed files with
  `pnpm -s exec eslint -c eslint.boundaries.config.mjs <files>` (the rules `pnpm lint:ratchet` counts); integration runs
  the full ratchet.
- **Browser storage:** a new `localStorage`, `sessionStorage` or IndexedDB key gets a line in
  `lib/device-data/registry.ts` (sprint 07 03), and every read and write is wrapped in try/catch.
- **i18n keys:** use the plain `t` from `useTranslation` (never an alias such as `const { t: tx }`), with literal keys;
  changed wording means a new key.
- **Fixtures:** never put credential-shaped strings (anything that looks like an API key, token or private key) in tests
  or fixtures; GitHub push protection rejects them. Use obviously fake values such as `test-key-1`.
- **Developer API** changes are additive only; after any change run `pnpm sdk:generate` and `pnpm docs:api` and commit
  their output; every new field must have a non-`unknown` SDK type (add a `NULLABLE` entry in `scripts/generate-sdk.ts`
  for fields whose example is `null`). Integration also runs `pnpm docs:site`.
- **Steel defaults for open decisions:** inline notices are a line of text on a rule, never a tinted box (D8 is open);
  admin and data views are rows on rules with `t-meta` figures (D10 is open).

## Sprint 09 additions (lessons from sprint 08)

- **Post text has a read-path registry.** New server code that reads a post's text (`content`, a quote's text, a poll's
  question) to show it to someone is classified in the content-warning registry (`CONTENT_WARNING_READ_PATHS` or
  `CONTENT_WARNING_EXEMPT_PATHS` in `lib/feed/content-warning.ts`), and in `GIF_ALT_READ_PATHS` (`lib/feed/gif-alt.ts`)
  and `QUIZ_READ_PATHS` (`lib/feed/quiz-poll.ts`) when it returns those. Any new file that mentions `likeCount`,
  `replyCount`, `commentCount`, `repostCount`, `quoteCount` or `viewCount` is classified in the quiet-count ratchet
  (`QUIET_COUNT_READ_PATHS` in `lib/feed/quiet-counts.ts`, or `EXEMPT` in `lib/feed/__tests__/quiet-counts.test.ts`)
  **with an honest reason** — "not a post count" only when it is not one.
- **Route nesting.** A route file under `app/routes` whose parent route has a loader (for example `games.tsx`,
  `_site/c.$slug.tsx`, a guide page) nests under it unless its path segment carries the `_` un-nesting suffix
  (`c.$slug_.wiki.index.tsx`, `$guideId_.history.tsx`; see the existing `c.$slug_.invite.$code.tsx` and
  `games_.$gameId.updates.rss[.]xml.ts`). Check where your new file nests before you write its loader.
- **jsdom is not installed.** No test may set `environment: 'jsdom'` or need a DOM. Render components with
  `react-dom/server` (`renderToStaticMarkup`) and assert on the markup, or test the pure function the component calls.
- **XML output** (RSS, sitemaps, anything with `Content-Type: …xml`) strips the control characters XML 1.0 forbids, the
  way `lib/rss.ts` already does; reuse its helper.
- **Erasure features verify, table by table:** every reader of the table, in **both directions** (rows where the member
  is the subject and rows where they are the object); the **foreign-key order** (what a database cascade would also
  remove, and which deletes must come first); and every **JSON snapshot that carries a name** (stored payloads, match
  results, share cards). Raw SQL goes after the transaction, never inside its array.
- **Keyboard bindings** you add must not collide with `SITE_SHORTCUTS` (`lib/shortcuts/registry.ts`): the bare keys `c`,
  `/`, `?`, the `g …` sequences, `mod+k`, and the feed keys `j k o l r t s x Escape`. Bind only while your own widget
  has focus, or register through the registry so `findShortcutConflicts()` sees it; the shortcut registry test must
  pass.
- **Labels for new `SYSTEM` notifications** go under your anchor in `components/feed/notification-labels.ts`.

## Sprint 10 additions (lessons from sprint 09)

- **Strings:** use the plain `t` from `useTranslation` with **literal** keys and literal defaults. If
  `pnpm i18n:extract` churns unrelated catalogues, discard its output and add your keys to `locales/en/<your-ns>.json`
  by hand (sorted as the file is), then run the catalogue and drift tests.
- **Client code:** zod stays off hot client routes (lazy-load any dialog or form that needs a schema; import contract
  types with `import type`); no `/api` fetch inside `useEffect` — reads are React Query (`useQuery` +
  `api(contract, input)`), writes are mutations or event handlers; island bundles (`features/*/island*`) never import
  React Query or the router; `lib/` never imports `components/`; add no import cycle.
- **System notices are keys** (sprint 09 19): a new `SYSTEM` notification is created with
  `createNotification({ ..., ...notice('<key>', params) })` (`lib/notifications/notice-keys.ts`). Add the key's English
  template to `NOTICE_TEMPLATES`, its params to `NoticeParamTypes`, and one literal `case` to
  `components/feed/notice-previews.ts`, **each under your Wave 0 anchor**; never build a preview string by hand
  (`lib/__tests__/notice-preview-ratchet.test.ts`). Member-written text (a title, a name) is a param, never translated.
- **Member text has a direction** (sprint 09 20): a component that renders member-written text gives the element
  `dir="auto"` (a block), wraps a name inside a sentence in `<bdi>` (inline), or gives a text field `dir="auto"`
  (input), and is listed in `USER_TEXT_RENDERERS` (`lib/i18n/user-text.ts`) **under your anchor**;
  `lib/__tests__/user-text-direction.test.ts` scans for it. Never satisfy a scan with a comment.
- **Read-path registries must be honest.** If your code reads what one of them governs, classify it truthfully: content
  warnings, quiet counts, GIF descriptions and quiz polls (the four post registries in `lib/feed/`), board privacy
  (`BOARD_PRIVACY_READ_PATHS`, `lib/game/leaderboard-privacy.ts`), community bans (`BAN_ENFORCEMENT_PATHS`), follow
  lists (`FOLLOW_LIST_READ_PATHS`), member-text direction (`USER_TEXT_RENDERERS`). An exemption states the real reason;
  a field named in a comment to pass a scan is a defect (sprint 08 integration removed one).
- **Developer API:** `/api/v1` changes are additive. After any change run `pnpm sdk:generate`, `pnpm docs:api` and
  commit their output (integration also runs `pnpm docs:site`). SDK types are never `unknown`. `NULLABLE` entries in
  `scripts/generate-sdk.ts` apply **by field name across the whole SDK**, so `git diff` the SDK output and confirm no
  existing field changed type; if one did, pick a field name that is not already used, or report it.
- **Migrations:** every migration file contains real SQL (never only comments). A `CREATE INDEX CONCURRENTLY` goes alone
  in its migration, followed by an `_ensure_valid` migration, with Prisma's default index name.
- **Browser storage:** a new storage key gets a line in `lib/device-data/registry.ts`, and stored JSON goes through
  `lib/core/persist` (never a bare `JSON.parse` of storage).
- **Erasure and export:** every new model that references a member gets a non-`todo` erasure classification with its
  operation under your anchor in `lib/account/deletion.server.ts`; personal data is exported under your anchor in
  `lib/account/export-sprint-15.server.ts`. Shared Prisma test mocks must learn new models: the export test's Proxy mock
  answers any model, but an explicit mock (`lib/__tests__/sitemap-sections.test.ts`'s `prismaMock`, any erasure stub
  that lists models) needs your model added if your code makes it read one.
- **Route nesting:** a route file whose parent route has a loader must carry the `_` un-nesting suffix
  (`builds.$slug_.issues.tsx`) unless it is meant to render inside the parent.
- **Fixtures** are never credential-shaped (no strings that look like keys, tokens, `whsec_…` secrets or private keys);
  use `test-secret-1`-style values.
- **Formatting:** never run prettier over a whole pre-existing file; format only files you created. Never run `tsc`, the
  full test suite, a build or the dev server.

## Sprint 11 additions (lessons from sprint 10)

- **Refusals have codes.** A route that refuses answers with `refusalBody()` from `lib/errors/codes.ts` (an English
  `error` plus a taxonomy `code` and params); add a new code under your Wave 0 anchor in `ERROR_CODES` (its English text
  and its `errors:` key) and its literal `case` under your anchor in `components/errors/refusal-sentence.ts`, and add the
  key to `locales/en/errors.json` in sorted place. The client renders a failure with `useRefusalText()`, never
  `serverError(` (the ratchet `lib/__tests__/server-error-ratchet.test.ts` only lets that count fall); run
  `lib/errors/__tests__/error-codes-catalogue.test.ts` and the ratchet. That file's `switch` has **no `default:`**: it is
  exhaustive over `ErrorCode`, so a code without its `case` fails `tsc` and the catalogue test; the Wave 0 anchors sit
  after the last `case` (`RIDE_SCHEDULE_LIMIT`, sprint 13's last), before the switch's closing brace. The case's literal key, `ns` and English
  default must equal the code's `i18n` and `text`. Write the body with `refusalBody(code, params)`, never by hand:
  `readRefusal` (`lib/errors/refusal.ts`) honours a code only when the body's English equals the code's text, and reads
  only the params named in its `PARAM_NAMES` (`endsAt`, `count`, `max`, `limit`, `remaining`, `minutes`, `days`), so a
  cap's number is `max` or `limit`, never a new name. Reuse an existing code (`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `GONE`, `INVALID_INPUT`, `RATE_LIMITED`) wherever its sentence is right; add a code only for a sentence the member
  needs that none of them says.
- **Socket events are rate-limited by name.** `checkRateLimit(socket.id, '<event>')` allows any event with no entry in
  `SOCKET_RATE_LIMITS` (`server/socket-server/config.ts`; the RMHTube hub's own in `server/rmhtube/config.ts`):
  `server/shared/rate-limit.ts` returns `true` for an unknown name. A new client-to-server event adds its entry there.
- **i18n:** plain `t` with literal keys and literal defaults; hand-add keys if `i18n:extract` churns other catalogues.
- **Client code:** zod stays off hot client routes; reads through React Query, never a `useEffect` fetch; islands use no
  React Query or router; `lib/` never imports `components/`; no import cycles.
- **`/api/v1`** is changed this sprint by 03 (Slice It), 10 (notifications), both under the Wave 0 anchors, and 18
  (one additive field on the characters party members) only; any other feature that finds it needs `/api/v1` stops
  and reports. Changes are additive only; run `pnpm sdk:generate`, `pnpm docs:api` (integration
  also runs `pnpm docs:site`), and remember `NULLABLE` in `scripts/generate-sdk.ts` applies by field name across the
  whole SDK.
- **Migrations:** every migration has real SQL; a `CREATE INDEX CONCURRENTLY` goes alone in its migration with an
  `_ensure_valid` follow-up and Prisma's default name (09 and 20 plan one each this sprint).
- **Registries and scans:** the device-data registry and `lib/core/persist` for any stored value; erasure classification
  plus export through `lib/account/export-sprint-15.server.ts`; the read-path registries — content warnings, quiet
  counts, GIF descriptions, quiz polls, board privacy (`BOARD_PRIVACY_READ_PATHS`), user-text direction
  (`USER_TEXT_RENDERERS`), the notice-preview ratchet, discovery reads (`DISCOVERY_READ_PATHS`,
  `lib/communities/discovery.ts`), mute reads (`MUTE_READ_PATHS`, `lib/moderation/mute-expiry.ts`), card-sound reads
  (`CARD_SOUND_READ_PATHS`, `lib/study/card-sound.ts`), due counts (`DUE_COUNT_READ_PATHS`, `lib/study/queue.ts`), bans
  (`BAN_ENFORCEMENT_PATHS`, `lib/communities/bans.ts`) and refusal codes (`ERROR_CODES`). Every scan strips comments and
  requires real use: never satisfy one with a comment.
- **Routing:** a route file that must not nest under a parent with a loader takes the `_` suffix
  (`c.$slug_.read.$id.tsx`).
- **Tests:** jsdom is not installed; shared Prisma test mocks that list models must learn your new models (the export
  test's Proxy answers any model; `lib/__tests__/sitemap-sections.test.ts`'s `prismaMock` and erasure stubs that list
  models do not); a timing assertion takes the fastest of several runs.
- **Safety:** no credential-shaped fixtures; format only new or changed files; never run `tsc`, full suites, builds or
  the dev server.

## Sprint 12 additions (lessons from sprint 11)

- **The refusal switch moved.** `components/errors/useRefusalText.ts` is the hook only; the exhaustive `switch` over
  `ErrorCode` is in `components/errors/refusal-sentence.ts`. Your `case` goes under your anchor there; a case whose
  literal key, `ns` or English differs from the code's `i18n` and `text` fails the catalogue test.
- **Feature folders carry their namespaces.** A feature under `features/<id>/` adds its namespace to that folder's
  `feature.ts` (`namespaces`), held by `lib/__tests__/feature-manifests.test.ts` (this sprint: 09 in
  `features/dream-rift/`, 11 in `features/rmhcharacters/`, 15 in `features/synapse-storm/`, and 02 in
  `features/nightrail/` if its strings live there).
- **Every new form field has a name** (sprint 11 20): an `aria-label`, `aria-labelledby`, a label linked by `htmlFor`,
  a wrapping label or a primitive's rendered label. `lib/__tests__/field-names.test.ts` holds the site tier at zero
  unnamed fields and lets the rest only fall.
- **Picture columns are classified** (sprint 11 18): a new column holding an image URL is added to the media sweep's
  surfaces and `lib/media/__tests__/sweep-reference-columns.test.ts` holds it. No feature plans one this sprint.
- **Hub code cannot reach the web tier.** Socket hubs (`server/socket-server`, `server/rmhbox`) import `lib/` relatively
  and cannot call `createNotification`; a hub feature that needs a notice writes it the way
  `lib/rmhtype/challenges-settle.server.ts` does, or stops and reports.
- **Claims and caps under concurrency are smoke-tested by integration against Postgres**: write each compare-and-set as
  one `updateMany` whose `where` repeats the condition, and each cap under `lockKey`.
- **Stripe, pg-boss and other outside systems are faked in tests** and called outside database transactions (no feature calls Stripe this sprint; 09 adds one cron, and no feature queues a job).

## Sprint 13 additions (lessons from sprint 12)

- **The type check does not fit on this box.** A cold `tsc -b` no longer fits in 15 GB even single-threaded; integration
  runs it in slices. You never run the whole-project check (the touched-files check in §Checks is different, and
  mandatory). Common type errors integration had to fix last sprint: a Prisma filter written
  `as const` becomes readonly and is rejected (`OR`): write `satisfies Prisma.<Model>WhereInput` instead; a test double
  typed `any` is a new lint warning (type it).
- **The report path is anchored again** (sprint 15: 04, 05, 06, one per wave; 16 edits `decideReports`):
  `report-constants.ts` (three lists), `moderation.report.server.ts`, `triage.server.ts`, `my-reports.server.ts`,
  `MyReportsPanel.tsx` and `components/feed/report-kind-label.ts` carry `// s15-NN` lines. Open
  `components/moderation/ReportDialog.tsx` with your entity type; nobody edits it this sprint. A removable type needs
  its takedown branch (`lib/moderation/__tests__/music-reports.test.ts` fails without one).
- **Tables with a plain `userId` and no `User` relation** are invisible to the erasure coverage test. If your feature
  touches one (09's run JSON, 15's reads and 20's `SecurityReport` this sprint), its erasure operation and test are the record; do not add a registry entry for a model the
  parser cannot find.
- **Explicit scopes** (sprint 13 10; sprint 14 15; 03 and 10 this sprint): `explicit: true` keeps a scope out of wildcards but not out of `READ_SCOPES`; a read scope
  that must be chosen by name needs the default grant fixed first.
- **The entry bundle is tight** (sprint 12 had to move parsers out of `validateSearch` and lazy-load the announcer):
  never import a heavy module from a route's `validateSearch`, loader-free route options or the root; lazy-load dialogs
  and anything with zod.
- **Migration timestamps** start at `20270105…` (sprint 14's were `20261228…`) because `main` keeps adding future-dated
  migrations; use the name in your brief exactly.
- **New API groups** need the explorer's `DOCUMENTED_GROUPS` (`lib/developer/explorer.ts`) or
  `lib/developer/__tests__/explorer.product.test.ts` fails.

## Sprint 14 additions (lessons from sprint 13)

- **Type-check what you touched, every time.** Sprint 13's implementers ran no `tsc`; integration then found 18 type
  errors, three of them real runtime bugs. You still never run `pnpm typecheck` or a whole-project `tsc`, but before
  every commit you run the **touched-files check** in §Checks: a temporary config that extends `tsconfig.json` and
  lists only the files you changed (tsc follows their imports). It takes about 15–40 s and 2–4 GB. It must report 0
  errors. The config lives in `.cache/` (ignored); never commit it.
- **Fakes must not be greener than Postgres.** Sprint 13's fakes let through a `{ not: null }` filter and a `nulls:
  'last'` ordering on a required column (`SliceRun.accuracy`), a nested select of a column the model lacks
  (`job.updatedAt` on `LadderJob`) and a `BigInt` in a `Response.json` body. Wrap every Prisma fake you write in
  `shapeChecked(...)` from `lib/db/query-shape.ts` (sprint 14 19) and call `assertJsonSafe(body)` on every response
  body your tests read. Whatever the fake, read each query you write against the schema file: a
  `null` comparison or `nulls` ordering only on an optional (`?`) column; every nested `select` field exists on the
  related model; a `BigInt` column (`id BigInt`, ledger `amount`) is converted with `Number()` or `String()` before it
  reaches JSON. Your specification's "Query shapes" lines name the shapes to check.
- **Existing Tailwind utilities only.** The site-tier CSS must not grow (B5, `scripts/check-bundle-budget.ts`): no new
  arbitrary value (`min-w-[56rem]`, `top-[3px]`, …) anywhere on the site tier. Use a utility another page already
  uses (`git grep` it first); if none fits, use the nearest one and say so in your report.
- **A new public GET declares its cache policy.** Sprint 13's `GET /api/news/stories` shipped without one and failed
  `lib/__tests__/api-cache-policy.test.ts` at integration. Pass `cache:` (a preset from `lib/api/cache-policies.ts`,
  for example `liveList`, or an explicit `{ visibility, maxAge, … }`); a member-specific GET is `private` or uncached
  by default — check the test's rule for your endpoint.
- **Audio uses the page's shared context.** Never `new AudioContext()` (`lib/__tests__/audio-context-ratchet.test.ts`);
  use `getAudioContext()` / `resumeAudioContext()` from `lib/shared/platform.ts`, and create nothing that makes sound
  before the first user gesture.
- **The cross-feature gates run in integration, so run them yourself:** the ad-hoc cache ratchet
  (`lib/__tests__/adhoc-cache-ratchet.test.ts`), the cache-policy test, the audio ratchet, the router's install gate
  and the bundle budget each failed sprint 13's first full run; the brief's gate list below includes them.
- **Hubs and restrictions:** sprint 14 17 added `isRestrictedIn(db, …)` (`lib/moderation/restrictions-core.ts`) for
  socket hubs. If your feature adds a new place where members write text others read, it must check the `comment` (or
  for a chat, `message`) timeout; `lib/moderation/__tests__/restriction-paths.test.ts` fails a writer that does not.

## Sprint 15 additions (lessons from sprint 14)

- **Fakes go through the checker, every one.** Wrap every Prisma fake you write in `shapeChecked(...)` (or use the
  economy fake's `checkedDb`, `lib/economy/__tests__/fake-db.ts`) and pass every response body your tests read to
  `assertJsonSafe` (`lib/db/query-shape.ts`). Sprint 14's adoption found a live bug the first day (a nested select of a
  column `LadderJob` does not have). A fake that answers a query Postgres would reject is a test that lies.
- **The touched-files type check** (§Checks) lists `lib/tf2-game/vite-env.d.ts` from the start (sprint 14's Wave 0
  correction). 0 errors before every commit; report the file count and result.
- **The client build, when a server module's exports change.** If you add a `*.server.ts` module a client file could
  reach (a route's loader, a contract's neighbour), or add or re-export names from an existing `*.server.ts`, run the
  client build once before your last commit, alone, under the shared lock (it needs about 8 GB):
  `flock /home/user/wt/.s15-build.lock pnpm build:frontend`. Sprint 14's 17 re-exported an inline type from a server
  module and broke the build in a way no test saw (`export { …, type X }` became `export const type X` in the client
  stub); `lib/__tests__/server-stub-exports.test.ts` now holds that one case, the build holds the rest. Then delete the
  build output it leaves (`git status` must be clean). Yours adds `lib/api/v1/notifications.server.ts` and may add a shared mark-read export; run the build.
- **Cross-feature gates broke at sprint 14's integration; run them yourself.** `lib/__tests__/style-tiers.test.ts`
  fails a site page that imports from a folder `app/site-tier.css` excludes whole (sprint 14's fix made
  `components/steam/`, `components/daily-puzzles/` and `lib/daily-puzzles/` per-file; make any new exclusion per-file the
  same way); `components/shell/__tests__/shell.test.tsx` now renders under a `QueryClientProvider`, so a new shell query
  works there but must not need a router context the harness lacks; the quiet-counts `EXEMPT` list takes an entry only
  under your anchor with an honest reason; and every characterization snapshot your files feed is updated deliberately,
  and said so in your report. Your gate list below names the ones your files can trip.
- **Dates rendered on the server are formatted in UTC until mount.** Sprint 14's exclusion notice wrote 15 January on
  the server and 14 January in a Los Angeles browser (React error #418). Format a server-rendered date in UTC on the
  first render and switch to the viewer's zone after mount, and pin the server render's zone in a test.
- **Phones at 390 px:** controls must not overlap or push out a name (sprint 14's conversation header did). Render
  your rows at 390 px in your head and in a render test of the markup: names truncate (`truncate`, `min-w-0`) and
  controls wrap to their own row where needed, with utilities other pages already use.
- **Existing Tailwind utilities only, and no new responsive variants.** Sprint 14's 09 added `sm:border-s`,
  `sm:border-site-border` and `sm:ps-4`, which no other page used, and integration had to take them out (B5). `git grep`
  every utility you write on the site tier; an arbitrary value (`w-[13px]`) or a variant no page uses is a defect.
- **New public GETs declare a cache policy; audio uses the shared context** (`lib/api/cache-policies.ts`,
  `getAudioContext()` in `lib/shared/platform.ts`), as in sprint 14; both tests are in your gate list.

## Worktree (run exactly this, once)

```bash
cd /home/user/rmhstudios.com
git worktree add /home/user/wt/s15-notifications-api -b autonomous/s15-notifications-api claude/autonomous-sprint-15
cd /home/user/wt/s15-notifications-api
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma client), so nothing you generate affects
the other implementers. Work only in `/home/user/wt/s15-notifications-api`; never edit `/home/user/rmhstudios.com`. Every Bash
call starts in a fresh shell: use absolute paths or `cd /home/user/wt/s15-notifications-api && …`.

## What you are building

Add `key` and `params` to the v1 notification list, fix its cursor at equal times (accepting the old form), add an `unread` filter, `GET /api/v1/me/notifications/unread-count`, and `POST /api/v1/me/notifications/read` behind a new explicit `write:notifications` scope, through the site's own mark-read.

## Files

Create:

- `lib/api/v1/notifications.server.ts`, `lib/api/v1/notifications-schema.ts`
- `app/routes/api/v1/me/notifications/unread-count.ts`, `app/routes/api/v1/me/notifications/read.ts`
- tests below

Modify:

- `app/routes/api/v1/me/notifications.ts`
- `lib/notifications/inbox.server.ts` (`markAllRead` gains an optional `before?: Date`; `setRead` unchanged)
- `docs/developer-api/scopes.md`

## Anchored shared files

Wave 0 put one comment line per feature in these files:

- `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`
- `docs/developer-api/changelog.md` (`<!-- s15-10 notifications-api -->`)

In each, find the line that starts with `s15-10 notifications-api` (as `// s15-10 notifications-api`, `{/* s15-10 notifications-api */}`
or `<!-- … -->`), keep it, and add your code directly below it, before the blank line that separates it from the
next anchor. Do not touch any other line of those files (other features edit theirs in parallel; this is what keeps
the merges clean). If your anchor is missing, stop and report it — do not invent one.

`locales/en/errors.json` cannot hold comments: add your keys in sorted place; integration merges it by taking both
sides.

## Patterns to copy

- `app/routes/api/v1/me/homes/` and `lib/api/v1/homes.server.ts` (an explicit write scope, sprint 14 15)
- `lib/api/serializers.server.ts` (`parsePage`)

## Gotchas

- The shared mark-read is `setRead` and `markAllRead` (`lib/notifications/inbox.server.ts`); add only an optional `before?: Date` to `markAllRead`. The count is `getUnreadNotificationCount` (`lib/notifications.server.ts`), uncapped, as the badge is.
- The registry guard (feature 03's `lib/api/__tests__/v1-route-registry.test.ts`) fails a route file without its `ENDPOINTS` entry: add the two route files and their entries in the same commit.

- Add your registry entries in the same commit as the route files: feature 03's registry guard fails a v1 route without one.
- `previewKey` and `previewParams` are optional on `Notification`; plain notices answer `key: null, params: null`.
- Marking read goes through the inbox's own function so the badge and the live count agree; never a second hand-written `updateMany`.
- The old bare-ISO cursor keeps working; `nextCursor` is always the new `<ISO>|<id>` form.

## Tests to write

- `lib/api/__tests__/v1-notifications.test.ts`

What each must cover is in the specification's "Testing requirements". Main-suite tests never touch a real database
(mock Prisma, wrapped in `shapeChecked` from `lib/db/query-shape.ts`, with `assertJsonSafe` on every body); product
tests are pure; no test needs jsdom. Test names follow the file names above so the suites' globs pick them up. Any
`$queryRaw`/`$executeRaw` you write gets a test asserting the real `@@map` table name and the quoted camelCase column
names.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, a whole-project `tsc`, `pnpm test`, `pnpm dev` or `vite` dev: a cold typecheck alone
needs about 11 GB. Integration runs them. The client build is the one exception (§Sprint 15 additions), under the
lock. Do **not** run prettier (or `pnpm format`) over files that existed before you started: reformatting unrelated
lines causes merge conflicts. New files may be formatted.

```bash
cd /home/user/wt/s15-notifications-api
# your tests
pnpm -s exec vitest run lib/api/__tests__/v1-notifications.test.ts lib/api/__tests__/v1-route-registry.test.ts
pnpm -s exec vitest run -c vitest.product.config.ts lib/developer/__tests__/explorer.product.test.ts
# the gate tests that cover what you touched
pnpm -s exec vitest run lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts \
  lib/__tests__/raw-api-fetch-ratchet.test.ts lib/__tests__/useeffect-fetch-ratchet.test.ts \
  lib/__tests__/zod-off-hot-routes.test.ts lib/__tests__/islands.test.ts lib/__tests__/i18n-catalogs.test.ts \
  lib/__tests__/i18n-default-drift.test.ts lib/__tests__/i18n-computed-key-ratchet.test.ts \
  lib/__tests__/sitemap-coverage.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/test-discovery.test.ts \
  lib/__tests__/design-consistency.test.ts lib/__tests__/steel-flat.test.ts lib/__tests__/arrival-coverage.test.ts \
  lib/__tests__/ts-escape-hatch-ratchet.test.ts lib/__tests__/raf-loop-allowlist.test.ts \
  lib/__tests__/tsconfig-projects.test.ts lib/__tests__/queries-server-fn-ratchet.test.ts \
  lib/__tests__/server-fn-guard-ratchet.test.ts lib/__tests__/native-dialog-ratchet.test.ts \
  lib/__tests__/migration-safety.test.ts lib/__tests__/ios-edge-contract.test.ts \
  lib/account/__tests__/erasure-coverage.test.ts lib/account/__tests__/erasure-plain-columns.test.ts \
  components/settings/__tests__/device-registry.test.ts \
  lib/feed/__tests__/quiet-counts.test.ts lib/__tests__/shortcut-registry.test.ts \
  lib/__tests__/user-text-direction.test.ts lib/__tests__/notice-preview-ratchet.test.ts \
  lib/notifications/__tests__/notice-keys.test.ts lib/errors/__tests__/error-codes-catalogue.test.ts \
  lib/__tests__/server-error-ratchet.test.ts lib/__tests__/permissions-policy.test.ts \
  lib/__tests__/feature-manifests.test.ts lib/__tests__/server-bundle-copies.test.ts \
  lib/__tests__/field-names.test.ts lib/media/__tests__/sweep-reference-columns.test.ts \
  lib/__tests__/api-cache-policy.test.ts lib/__tests__/adhoc-cache-ratchet.test.ts \
  lib/__tests__/audio-context-ratchet.test.ts lib/__tests__/server-stub-exports.test.ts \
  lib/__tests__/style-tiers.test.ts lib/api/__tests__/scopes-explicit.test.ts \
  lib/developer/__tests__/explorer.product.test.ts
# eslint and the boundary rules on what you changed (no new warnings, no new cycle)
changed=$( { git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-15 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts )
echo "$changed" | xargs -r pnpm -s exec eslint
echo "$changed" | xargs -r pnpm -s exec eslint -c eslint.boundaries.config.mjs
```

Type-check the files you touched (mandatory before each commit; 0 errors):

```bash
cd /home/user/wt/s15-notifications-api
changed=$( { git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-15 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts )
mkdir -p .cache
{ echo '{ "extends": "../tsconfig.json", "compilerOptions": { "incremental": false, "noEmit": true }, "files": ['
  printf '"../%s",\n' lib/framer-motion-internal.d.ts lib/vite-worker-modules.d.ts components/feed/qrcode-generator.d.ts \
    lib/tf2-game/vite-env.d.ts
  echo "$changed" | grep -v '^$' | sed 's|.*|"../&",|'
  echo '"../lib/utils.ts"] }'; } > .cache/tsc-touched.json
node --max-old-space-size=6000 node_modules/typescript/bin/tsc -p .cache/tsc-touched.json
```

If a touched file is a test that imports `vitest` globals, keep it in the list (the config inherits the project's
types). An error in a file you did not touch that your change caused (a changed export) is yours to fix; an error that
is already on the sprint branch without your change is reported, not fixed. Integration still runs the sliced full
check. A touched test that imports an `app/routes/**` route module (`lib/feed/__tests__/quiet-counts.test.ts` does)
fails with TS2345 / TS2353 on `createFileRoute`, because the route tree's `Register` augmentation is not in the
program: leave such a test out of the list when your change to it is an anchor or a registry line, and say so in the
report.

The client build (§Sprint 15 additions), once, before your last commit:

```bash
cd /home/user/wt/s15-notifications-api
flock /home/user/wt/.s15-build.lock pnpm build:frontend   # alone; about 8 GB; waits for the lock
git status --short   # the build leaves no tracked change; remove any untracked output it left
```

Also run (existing tests that must stay green): `lib/api/__tests__/`, `lib/notifications/__tests__/`.

If a gate test file named above does not exist under that name, find its current name with
`ls lib/__tests__ lib/api/__tests__` and run that; do not skip it. A test file this brief names that you are told to
create is new; one it names as existing that is missing is reported. The read-path registry tests live beside their
modules (`lib/feed/__tests__/`, `lib/game/__tests__/`, `lib/communities/__tests__/`, `lib/moderation/__tests__/`,
`lib/study/__tests__/`); run the ones your change touches.

Strings, after your UI is written:

```bash
cd /home/user/wt/s15-notifications-api
pnpm i18n:extract
# keep only your namespace (and feed.json / notice-language.json / errors.json where you added keys)
git diff --name-only -- locales | grep -v -E '^locales/en/(errors)\.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

You add no UI strings; skip the extract unless you did. If the extractor's output is unusable (it rewrote unrelated keys, or churned others you cannot
separate), add your keys by hand instead.

Generated files: run `pnpm api:routes` after adding, moving or removing an endpoint module and commit
`lib/api/route-table.server.ts` (never hand-edit it; on any conflict, regenerate). **Never stage `app/routeTree.gen.ts`, `docs/_generated/facts/` (git-ignored) or `docs/site-reference/*`** — integration
regenerates them. Do not edit `lib/account/api/account.export.server.ts` or `lib/i18n/config.ts`. Run `pnpm sdk:generate` and `pnpm docs:api` and commit their output.

## Committing

- Stage explicitly (`git add <paths>`), then commit in a separate command — never `git add -A && git commit` or
  `git commit -a` (the hook would gate the whole tree). Never stage `.cache/` or build output.
- The commit gate (`pnpm check:consistency --fast`) runs automatically on `git commit`. If it fails, fix the cause and
  commit again. **Never bypass it** (`--no-verify`, `RMH_SKIP_COMMIT_GATE=1`). If a step is killed (a `☠` line, exit 3),
  wait for other work to finish and retry; report it if it persists. The hook runs the fast gate only (no `tsc`): the
  touched-files type check above is yours to run before you commit.
- If a rule is genuinely wrong for your change, do not work around it: stop and describe it in your report.
- Small, focused commits are welcome (for example: schema + server, then UI, then tests); each must pass the gate. The
  message says _why_, in plain sentences, and ends with exactly the commit attribution lines your session's instructions
  give.
- Commit only on `autonomous/s15-notifications-api`. Never push, merge, rebase or touch the sprint branch or another worktree. Never commit
  secrets or `.env` files.
- No model names, personal names or e-mail addresses in code, comments or commit messages beyond those attribution
  lines.

## Done means

- Every functional requirement and acceptance criterion in the specification is implemented (or explicitly reported as
  not done, with the reason).
- Loading, empty, error and signed-out states exist for every new view.
- The checks above pass — including the touched-files type check with 0 errors, and the client build where required —
  and `git status` in the worktree is clean.
- Your final report lists: commits (hash and subject), files added and changed, tests added and their results, code
  lines added (TS/TSX/SQL/CSS/`data/` JSON) separately from docs, the touched-files type check's file count and result,
  the client build's result (or why it was not needed), every Prisma query shape you checked against the schema, every
  snapshot you updated and why, anything not done or uncertain, and anything integration must do.

- For integration: walk every page of a member's notifications with ties on `createdAt` against Postgres, and mark ten read through the API; the site's inbox shows them read.
