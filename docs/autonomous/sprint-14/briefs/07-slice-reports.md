# Brief 07 — Report a Slice It song, or a comment on one

You are a fresh implementer with no other context. This brief and the files it names are everything you need. Build the
feature completely — UI, server, persistence and tests as specified — commit it on your feature branch, and report back.

|                |                                                                     |
| -------------- | ------------------------------------------------------------------- |
| Specification  | `docs/autonomous/sprint-14/features/07-slice-reports.md`            |
| Wave           | 1                                                                   |
| Branch         | `autonomous/s14-slice-reports` (from `claude/autonomous-sprint-14`) |
| Worktree       | `/home/user/wt/s14-slice-reports`                                   |
| i18n namespace | `slice-reports`                                                     |
| Schema         | none                                                                |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find you need to, stop and report it): 19 Test doubles that know the schema (`schema-fakes`), 01 Identity Crisis, a new RMHBox minigame (`identity-crisis`).

Merged before your wave: Wave 0 (namespaces, anchors, the sprint 14 export file) (see `plan.md` §Waves).

## Read first (in this order)

1. The specification: `docs/autonomous/sprint-14/features/07-slice-reports.md`. It is the contract; its acceptance criteria
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
   an account is deleted.
4. `docs/autonomous/sprint-14/plan.md` (waves, shared and anchored files), and `docs/autonomous/sprint-14/README.md` for
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
  Your namespace is **`slice-reports`**, already registered in `lib/i18n/config.ts` with its `locales/en/slice-reports.json`
  (Wave 0): `useTranslation('slice-reports')`. Never put a `{/* … */}` JSX comment immediately before a `t()` call (the
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

- **Sprints 1–13 are in your worktree** (merged before Wave 0). Sprint 13 added: Sequence Sam in RMHBox, game assists
  in Vega, Altair "Your runs", Slice It's picked chart and miss heat, friends' activity in the games library,
  reports of RMHTube chat messages (`tube-chat`), RMHTube host subscriptions with a durable fan-out (`tube-party`),
  own jobs and the calendar in RMHLadder and its developer API scopes (`read:ladder`, `write:ladder`, the first
  explicit read scopes, with `READ_SCOPES` fixed to leave explicit scopes out), the lists you are on (`ListLeave`),
  news stories you can follow (`NewsStoryFollow`, `news-story-article` fan-out), your ranked season standing,
  prediction quotes and sales, blocks and reports in Rideshare (`ride`), RMHBox pack reports (`rmhbox-pack`,
  `autoHiddenAt`), direct-message reports with edit versions (`ChatMessageEdit`), a billing stop that cannot lose a
  subscription, four sprint 12 gaps, and message pushes with a per-conversation mute. Sprints 10–12 before it added
  refusals in the reader's language (`ERROR_CODES`, `refusalBody()`, the `serverError(` ratchet), a name for every
  form field and member-item report types with takedowns that stick (`MEMBER_ITEM_REPORT_TYPES`, `moderatedAt`).
  Reuse them; do not redo them.
- **Exports:** if your feature owns personal data, write an `export…(userId)` function and add one property under your
  anchor in `lib/account/export-sprint-14.server.ts` (created in Wave 0). Never edit
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
  **Prisma's default name** (`<table>_<columns>_idx`) in the SQL, so the schema and the database never drift. Only 03
  plans one in sprint 14 (on `ss_player_match`); if you need another, stop and say so in your report.
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
  `lib/account/export-sprint-14.server.ts`. Shared Prisma test mocks must learn new models: the export test's Proxy mock
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
- **`/api/v1`** is changed this sprint by 15 (its endpoints, scopes and SDK, under the Wave 0 anchors) and 17 (a
  timeout check in two route files, no catalogue change) only; any other feature that finds it needs `/api/v1` stops
  and reports. Changes are additive only; run `pnpm sdk:generate`, `pnpm docs:api` (integration
  also runs `pnpm docs:site`), and remember `NULLABLE` in `scripts/generate-sdk.ts` applies by field name across the
  whole SDK.
- **Migrations:** every migration has real SQL; a `CREATE INDEX CONCURRENTLY` goes alone in its migration with an
  `_ensure_valid` follow-up and Prisma's default name (only 03 plans one this sprint).
- **Registries and scans:** the device-data registry and `lib/core/persist` for any stored value; erasure classification
  plus export through `lib/account/export-sprint-14.server.ts`; the read-path registries — content warnings, quiet
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
  `feature.ts` (`namespaces`), held by `lib/__tests__/feature-manifests.test.ts` (this sprint: 02 in
  `features/hearthworks/`, 03 in `features/synapse-storm/`, 04 in `features/altair/`, 05 in `features/doctrine/`,
  07 in `features/slice-it/`).
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
- **Stripe, pg-boss and other outside systems are faked in tests** and called outside database transactions (no feature calls Stripe this sprint; none queues a job).

## Sprint 13 additions (lessons from sprint 12)

- **The type check does not fit on this box.** A cold `tsc -b` no longer fits in 15 GB even single-threaded; integration
  runs it in slices. You never run the whole-project check (the touched-files check in §Checks is different, and
  mandatory). Common type errors integration had to fix last sprint: a Prisma filter written
  `as const` becomes readonly and is rejected (`OR`): write `satisfies Prisma.<Model>WhereInput` instead; a test double
  typed `any` is a new lint warning (type it).
- **The report path is anchored again** (sprint 14: 07, 08, 09, 10, one per wave): `report-constants.ts` (three
  lists), `moderation.report.server.ts`, `triage.server.ts`, `my-reports.server.ts`, `MyReportsPanel.tsx` and
  `components/feed/report-kind-label.ts` carry `// s14-NN` lines. Open `components/moderation/ReportDialog.tsx` with
  your entity type; only 09 edits it. A removable type needs its
  takedown branch (`lib/moderation/__tests__/music-reports.test.ts` fails without one).
- **Tables with a plain `userId` and no `User` relation** are invisible to the erasure coverage test. If your feature
  touches one (03 this sprint), its erasure operation and test are the record; do not add a registry entry for a model the
  parser cannot find.
- **Explicit scopes** (sprint 13 10; 15 this sprint): `explicit: true` keeps a scope out of wildcards but not out of `READ_SCOPES`; a read scope
  that must be chosen by name needs the default grant fixed first.
- **The entry bundle is tight** (sprint 12 had to move parsers out of `validateSearch` and lazy-load the announcer):
  never import a heavy module from a route's `validateSearch`, loader-free route options or the root; lazy-load dialogs
  and anything with zod.
- **Migration timestamps** start at `20261228…` (sprint 13's were `20261220…`) because `main` keeps adding future-dated Med Schools migrations; use
  the name in your brief exactly.
- **New API groups** need the explorer's `DOCUMENTED_GROUPS` (`lib/developer/explorer.ts`) or
  `explorer.product.test.ts` fails.

## Sprint 14 additions (lessons from sprint 13)

- **Type-check what you touched, every time.** Sprint 13's implementers ran no `tsc`; integration then found 18 type
  errors, three of them real runtime bugs. You still never run `pnpm typecheck` or a whole-project `tsc`, but before
  every commit you run the **touched-files check** in §Checks: a temporary config that extends `tsconfig.json` and
  lists only the files you changed (tsc follows their imports). It takes about 15–40 s and 2–4 GB. It must report 0
  errors. The config lives in `.cache/` (ignored); never commit it.
- **Fakes must not be greener than Postgres.** Sprint 13's fakes let through a `{ not: null }` filter and a `nulls:
  'last'` ordering on a required column (`SliceRun.accuracy`), a nested select of a column the model lacks
  (`job.updatedAt` on `LadderJob`) and a `BigInt` in a `Response.json` body. From wave 2 on, wrap every Prisma fake you
  write in `shapeChecked(...)` from `lib/db/query-shape.ts` (feature 19, merged in wave 1) and call `assertJsonSafe(body)`
  on every response body your tests read. Whatever the wave, read each query you write against the schema file: a
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
- **Hubs and restrictions:** feature 17 adds `isRestrictedIn(db, …)` (`lib/moderation/restrictions-core.ts`) for socket
  hubs. If your feature adds a new place where members write text others read, it must check the `comment` (or for a
  chat, `message`) timeout; after wave 6, `lib/moderation/__tests__/restriction-paths.test.ts` fails a writer that does
  not.

## Worktree (run exactly this, once)

```bash
cd /home/user/rmhstudios.com
git worktree add /home/user/wt/s14-slice-reports -b autonomous/s14-slice-reports claude/autonomous-sprint-14
cd /home/user/wt/s14-slice-reports
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma client), so nothing you generate affects
the other implementers. Work only in `/home/user/wt/s14-slice-reports`; never edit `/home/user/rmhstudios.com`. Every Bash
call starts in a fresh shell: use absolute paths or `cd /home/user/wt/s14-slice-reports && …`.

## What you are building

File the existing `song` report type from Slice It's song details and a new `song-comment` type from each comment; make both removable from the queue (`takeDownSong` for a song, deleting the row for a comment), with previews, labels and Your reports entries.

## Files

Create:

- `features/slice-it/engine/song-reports.server.ts`
- tests below

Modify:

- `features/slice-it/ui/SongDetailsPanel.tsx` ("Report song")
- `features/slice-it/ui/SongComments.tsx` ("Report" on others' comments)
- `features/slice-it/feature.ts` (namespace `slice-reports`)

## Anchored shared files

Wave 0 put one comment line per feature in these files:

- the report path: `lib/moderation/report-constants.ts` (`REPORT_ENTITY_TYPES`, `REMOVABLE_REPORT_ENTITY_TYPES`, `MEMBER_ITEM_REPORT_TYPES`), `lib/moderation/api/moderation.report.server.ts` (`resolveTargetUser` and the eligibility block), `lib/moderation/triage.server.ts` (the takedown branches and the preview block), `lib/moderation/my-reports.server.ts`, `components/moderation/MyReportsPanel.tsx` (both maps) and `components/feed/report-kind-label.ts`
- `lib/i18n/user-text.ts` (your `USER_TEXT_RENDERERS` entries)

In each, find the line that starts with `s14-07 slice-reports` (as `// s14-07 slice-reports`, `{/* s14-07 slice-reports */}`
or `<!-- … -->`), keep it, and add your code directly below it, before the blank line that separates it from the
next anchor. Do not touch any other line of those files (other features edit theirs in parallel; this is what keeps
the merges clean). If your anchor is missing, stop and report it — do not invent one.

## Patterns to copy

- sprint 13 16's pack reports (`lib/party/pack-moderation.server.ts`, its branches in the report files)
- `features/slice-it/engine/library.server.ts` `takeDownSong` (the tombstone)
- `components/party/PacksPage.tsx` (opening `ReportDialog` lazily)

## Gotchas

- The song takedown deletes the audio and cannot be undone; the queue's confirm says so; never call it twice (it is idempotent: keep it so).
- A private, taken-down or missing song answers the same refusal (no existence leak).
- Never offer "Report" on the member's own song or comment.
- `ReportDialog` pulls zod: lazy-load it from the game's UI.
- You are the first report feature of the sprint: your anchor lines are the first under the sprint 14 headers; keep the blank line before the next anchor.

## Tests to write

- `features/slice-it/engine/__tests__/song-reports.test.ts`

What each must cover is in the specification's "Testing requirements". Main-suite tests never touch a real database
(mock Prisma); product tests are pure; no test needs jsdom. Test names follow the file names above so the suites' globs
pick them up. Any `$queryRaw`/`$executeRaw` you write gets a test asserting the real `@@map` table name and the quoted
camelCase column names.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, a whole-project `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or `vite`: a cold
typecheck alone needs about 11 GB. Integration runs them. Do **not** run prettier (or `pnpm format`) over files that
existed before you started: reformatting unrelated lines causes merge conflicts. New files may be formatted.

```bash
cd /home/user/wt/s14-slice-reports
# your tests
pnpm -s exec vitest run features/slice-it/engine/__tests__/song-reports.test.ts
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
  lib/account/__tests__/erasure-coverage.test.ts components/settings/__tests__/device-registry.test.ts \
  lib/feed/__tests__/quiet-counts.test.ts lib/__tests__/shortcut-registry.test.ts \
  lib/__tests__/user-text-direction.test.ts lib/__tests__/notice-preview-ratchet.test.ts \
  lib/notifications/__tests__/notice-keys.test.ts lib/errors/__tests__/error-codes-catalogue.test.ts \
  lib/__tests__/server-error-ratchet.test.ts lib/__tests__/permissions-policy.test.ts \
  lib/__tests__/feature-manifests.test.ts lib/__tests__/server-bundle-copies.test.ts lib/__tests__/field-names.test.ts \
  lib/media/__tests__/sweep-reference-columns.test.ts lib/__tests__/api-cache-policy.test.ts \
  lib/__tests__/adhoc-cache-ratchet.test.ts lib/__tests__/audio-context-ratchet.test.ts
# eslint and the boundary rules on what you changed (no new warnings, no new cycle)
changed=$( { git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-14 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts )
echo "$changed" | xargs -r pnpm -s exec eslint
echo "$changed" | xargs -r pnpm -s exec eslint -c eslint.boundaries.config.mjs
```

Type-check the files you touched (mandatory before each commit; 0 errors):

```bash
cd /home/user/wt/s14-slice-reports
changed=$( { git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-14 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
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
check.

Wave 0 correction: `lib/tf2-game/vite-env.d.ts` (the `vite/client` reference) is in the list because the site project
gets `import.meta.env` and the CSS module types from `app/routes/__root.tsx`, which this program does not reach; without
it a touched file that imports `components/ui/dialog.tsx` or similar fails with TS2339 / TS2882 errors that are not
real. A touched test that imports an `app/routes/**` route module (`lib/feed/__tests__/quiet-counts.test.ts` does)
fails with TS2345 / TS2353 on `createFileRoute`, because the route tree's `Register` augmentation is not in the program
either: leave such a test out of the list when your change to it is an anchor or a registry line, and say so in the
report. `scripts/generate-sdk.ts(113,3): error TS1117` (a duplicate `NULLABLE` key) is already on the sprint branch:
report it, do not fix it unless the brief says to.

Also run (existing tests that must stay green): `lib/moderation/__tests__/music-reports.test.ts`, `lib/moderation/__tests__/` report-route and triage tests, `features/slice-it/engine/__tests__/` (library, takedown).

If a gate test file named above does not exist under that name, find its current name with
`ls lib/__tests__ lib/api/__tests__` and run that; do not skip it. A test file this brief names that you are told to
create is new; one it names as existing that is missing is reported. The read-path registry tests live beside their
modules (`lib/feed/__tests__/`, `lib/game/__tests__/`, `lib/communities/__tests__/`, `lib/moderation/__tests__/`,
`lib/study/__tests__/`); run the ones your change touches.

Strings, after your UI is written:

```bash
cd /home/user/wt/s14-slice-reports
pnpm i18n:extract
# keep only your namespace (and feed.json / notice-language.json / errors.json where you added keys)
git diff --name-only -- locales | grep -v -E '^locales/en/(slice-reports)\.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/slice-reports.json` and check every key you added is there with its English text. If the extractor's
output is unusable (it rewrote unrelated keys, or churned others you cannot separate), add your keys by hand instead.

Generated files: run `pnpm api:routes` after adding, moving or removing an endpoint module and commit
`lib/api/route-table.server.ts` (never hand-edit it; on any conflict, regenerate). **Never stage `app/routeTree.gen.ts`, `docs/_generated/facts.json` or `docs/site-reference/*`** — integration
regenerates them. Do not edit `lib/account/api/account.export.server.ts` or `lib/i18n/config.ts`.

## Committing

- Stage explicitly (`git add <paths>`), then commit in a separate command — never `git add -A && git commit` or
  `git commit -a` (the hook would gate the whole tree). Never stage `.cache/`.
- The commit gate (`pnpm check:consistency --fast`) runs automatically on `git commit`. If it fails, fix the cause and
  commit again. **Never bypass it** (`--no-verify`, `RMH_SKIP_COMMIT_GATE=1`). If a step is killed (a `☠` line, exit 3),
  wait for other work to finish and retry; report it if it persists. The hook runs the fast gate only (no `tsc`): the
  touched-files type check above is yours to run before you commit.
- If a rule is genuinely wrong for your change, do not work around it: stop and describe it in your report.
- Small, focused commits are welcome (for example: schema + server, then UI, then tests); each must pass the gate. The
  message says _why_, in plain sentences, and ends with exactly the commit attribution lines your session's instructions
  give.
- Commit only on `autonomous/s14-slice-reports`. Never push, merge, rebase or touch the sprint branch or another worktree. Never commit
  secrets or `.env` files.
- No model names, personal names or e-mail addresses in code, comments or commit messages beyond those attribution
  lines.

## Done means

- Every functional requirement and acceptance criterion in the specification is implemented (or explicitly reported as
  not done, with the reason).
- Loading, empty, error and signed-out states exist for every new view.
- The checks above pass — including the touched-files type check with 0 errors — and `git status` in the worktree is
  clean.
- Your final report lists: commits (hash and subject), files added and changed, tests added and their results, code
  lines added (TS/TSX/SQL/CSS/`data/` JSON) separately from docs, the touched-files type check's file count and result,
  every Prisma query shape you checked against the schema, anything not done or uncertain, and anything integration
  must do.

- For integration: report a song and a comment, then resolve and remove each from the queue; the song leaves every shelf and keeps its scores.
