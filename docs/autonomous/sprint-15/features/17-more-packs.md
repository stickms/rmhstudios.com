# 17 — Community packs for Identity Crisis and Human Keyboard, and an auto-hide three new accounts cannot trigger

Surface: the RMHBox packs page (`/rmhbox-packs`, `components/party/PacksPage.tsx`: a game picker on "New pack"), the
Identity Crisis and Human Keyboard lobby settings (a pack code), the report path for packs. Wave 6. Namespace
`more-packs`. Site tier (Steel) on the packs page; app tier (L8) in the lobby.

## User story

As a host who wants an Identity Crisis night of our friend group's in-jokes, or a Human Keyboard round of our own
sentences, I want to make a pack for those games the way I can for Wit War and play it by its code; and as a pack
maker, I want my pack safe from three throwaway accounts hiding it, so that member-made packs reach more games without
becoming easier to abuse.

## Requirements elicitation

- **What exists (verified):**
  - RMHBox packs (`RmhboxPack`, `prisma/schema/games/rmhbox.prisma`: `code`, `name`, `game` (default `'wit-war'`),
    `prompts` JSON, `promptCount`, `hidden`, `featured`, `moderatedAt`, `autoHiddenAt`) are made and listed through
    `lib/party/packs.server.ts`, `lib/party/packs.contract.ts`, `lib/party/packs-schema.ts`, `components/party/PacksPage.tsx`.
    `PACK_GAMES` (`lib/party/packs.ts`) is `['wit-war']` only; the `game` column already exists for more.
  - A minigame loads a pack by code with `loadPackPrompts(code, game)` (`server/rmhbox/pack-loader.ts`, which skips
    hidden, removed and wrong-game packs); only Wit War reads a `packCode` setting
    (`server/rmhbox/minigames/wit-war/handler.ts`; the setting is declared in `lib/rmhbox/minigame-registry.ts`).
  - Identity Crisis (sprint 14 01) draws from bundled identities (`lib/rmhbox/identity-crisis/data-loader.ts`,
    `data/rmhbox/identity-crisis/identities.json`), matching guesses with `fuse.js` against `name` and `aliases`; Human
    Keyboard (feature 01) draws from bundled sentences. Sprint 14 01 recorded "member-written identity packs" as out of
    scope.
  - **The auto-hide (sprint 13 16)** hides a pack once three distinct members have open reports on it
    (`PACK_AUTOHIDE_REPORTS`, `filePackReport` in `lib/party/pack-moderation.server.ts`), with no trust gate:
    sprint 13's summary recorded that "three sock accounts can auto-hide any pack until a moderator dismisses".
- **Decisions:**
  - **Two more pack games:** `identity-crisis` (one identity per line, 2–60 characters, optional aliases after a `|`
    separator, e.g. `Ada Lovelace | Lovelace`) and `human-keyboard` (one sentence per line, normalised to lowercase
    letters and single spaces, 20–60 characters after normalising; a line that normalises to nothing is refused with
    its line number). Minimums: 20 identities, 12 sentences; maximum 60 lines, as today.
  - **Per-game parsing** lives in one pure module, `lib/party/pack-games.ts` (new), used by the create schema, the
    packs page's preview and the hub's loader (which re-validates what it loads).
  - **Lobby settings:** both minigames gain a `packCode` setting (the Wit War shape). Identity Crisis with a pack draws
    from it alone when it has enough identities for the table, else mixes in bundled ones (as Wit War does); a pack's
    identities have no `category` or `difficulty`, so the category spread rule is skipped for pack draws.
  - **The trust gate:** a reporter counts toward the auto-hide only if their account is at least 7 days old, has a
    verified e-mail (`User.emailVerified`, an optional boolean in `prisma/schema/auth.prisma`: only `true` counts) or a
    linked sign-in provider (an `Account` row), and is not banned. Reports from other accounts still reach the queue and are shown
    there, but do not hide the pack. The constant `PACK_AUTOHIDE_MIN_ACCOUNT_DAYS = 7` sits beside
    `PACK_AUTOHIDE_REPORTS`.
  - **No new report type:** packs of any game are `rmhbox-pack` reports; the queue preview names the pack's game.
  - **Restriction:** making a pack is member text others read; the existing pack create route's checks stay (and the
    `comment` timeout applies if the route does not already check it — it is in `RESTRICTION_WRITERS` if so).

## Functional requirements

1. FR-1 `lib/party/packs.ts`: `PACK_GAMES` gains the two ids; `lib/party/pack-games.ts` (new): per-game parse,
   normalise and minimums; `lib/party/packs-schema.ts` uses it.
2. FR-2 `server/rmhbox/pack-loader.ts`: `loadPackLines(code, game)` returns parsed lines per game (the Wit War path
   unchanged).
3. FR-3 `lib/rmhbox/identity-crisis/settings.ts` and `lib/rmhbox/human-keyboard/settings.ts`: `packCode`; the two
   handlers load the pack at start (`server/rmhbox/minigames/identity-crisis/handler.ts`,
   `server/rmhbox/minigames/human-keyboard/handler.ts`).
4. FR-4 `components/party/PacksPage.tsx`: the game picker, per-game help text and preview with line errors.
5. FR-5 `lib/party/pack-moderation.server.ts`: the trust gate in the distinct-reporter count; the queue preview's game.

## Non-functional requirements

- **The hub never trusts the stored lines:** it re-parses on load and falls back to bundled content on any failure.
- **No reporter can be singled out by the weighting:** the trust gate changes only whether the pack is auto-hidden. The
  pack's owner sees what they see today (hidden or not, never a report count, a reporter or which reports counted);
  the queue shows moderators each report as today plus one `t-meta` line "Counted toward the auto-hide: N of M",
  never a per-reporter trust flag; nothing in the report's own answer to the reporter differs by trust.
- **Fuse matching** of pack identities uses the same threshold (0.3) and the aliases given.
- **The trust gate is one query:** the open reports' reporters joined to `User` (`createdAt`, `emailVerified`,
  `bannedUntil`) in the same transaction under the existing `lockKey(tx, 'pack-report:<id>')`.
- **Query shapes (verify against the schema):** `RmhboxPack.game` is `VarChar(24)` (both ids fit); `emailVerified`
  is `Boolean?` (filter `emailVerified: true`, never a truthiness check on `null`); `bannedUntil` optional.
- **Steel** on the packs page: the game picker is a `Select` primitive with a label; no new arbitrary utilities.

## Testing requirements

- Product suite `lib/party/__tests__/pack-games.product.test.ts`: both formats, aliases, normalising, minimums, line
  errors.
- Main suite `lib/party/__tests__/pack-trust-gate.test.ts` (fakes through `shapeChecked`): three new accounts do not
  hide; three trusted accounts do; a mix counts only the trusted; a banned reporter never counts; `emailVerified: null`
  does not count as verified; the reporter's own response and the owner's pack view are identical whether or not the
  reporter counted.
- Main suite: both handlers with a pack code (the pack's lines used; a bad code, a hidden or removed pack falls back);
  the existing pack and pack-report tests (`lib/party/__tests__/`, `lib/moderation/__tests__/`).

## Acceptance criteria

- [ ] A member makes an Identity Crisis pack of 25 names and a host plays it by code.
- [ ] A Human Keyboard pack's sentences are the round's sentences.
- [ ] A pack line that cannot be used is shown with its line number before saving.
- [ ] Three reports from accounts made today do not hide a pack; the reports still reach the queue.

## Out of scope

Packs for the other minigames, images in packs, a pack marketplace, changing the auto-hide count.
