# 20 — Error messages in the reader's language

Surface: every toast and inline error that shows a server refusal, in the composer, comments, communities, events,
tournaments, messages, builds, study and the admin pages; the site error taxonomy. Wave 7. Namespace `errors` (the
existing namespace of `lib/errors/codes.ts`). Sweeping UI feature.

## User story

As a member reading the site in Spanish, Arabic or Japanese, I want the message I get when something is refused — "This
event is full", "You can only change your handle once every two weeks", "Rule not found" — in my language, so that the
moment the site says no is not the moment it stops speaking to me.

## Requirements elicitation

- **What exists (verified):**
  - A taxonomy built for this and barely used: `lib/errors/codes.ts` (`ERROR_CODES`: 19 codes, each
    `{ http, i18n: 'errors:<key>', text }`), client-safe, whose header explains that the client should render
    `t(ERROR_CODES[code].i18n)`; `locales/en/errors.json` exists and `errors` is in `NAMESPACES`.
  - In practice the client shows the server's English: `serverError(error)` (`lib/http.ts`) returns the response's
    `error` text, called on about 250 lines in about 190 files under `components/`, `app/` and `features/` at the sprint
    09 tip (`grep -rn "serverError(" components app features`, tests and imports excluded; recount when the wave starts,
    since every earlier wave adds some; most in `components/feed`, admin pages, `components/communities`,
    `components/tournaments`, `components/posts-plus`, `components/competitive`, `components/chat-plus`). Route handlers
    answer `{ error: '<English>' }`, sometimes with a `code` (`ALT_REQUIRED_CODE`, sprint 06 01's `community_banned`
    read by `components/communities/useSanctionRefusal.ts`).
  - System notices were moved to keys in sprint 09 19; refusals were not.
- **Decisions:**
  - **One client helper, split so the extractor sees every key (validation pass 2).** `i18next-parser` reads only
    `app/`, `components/` and `features/` (`i18next-parser.config.js` `input`), so `t()` calls in `lib/` never reach
    `locales/`. `lib/errors/refusal.ts` (pure, client-safe) only reads the refusal: `readRefusal(error)` →
    `{ code, params } | null` from an `HttpError`'s body, validating params by type. The rendering hook
    `useRefusalText()` in `components/errors/useRefusalText.ts` returns `(error) => string` and holds the **literal**
    switch: one `case` per code, each `t('<key>', { ns: 'errors', defaultValue: '<English>', ...params })` with a
    literal key and default (plain `t`, never `t(ERROR_CODES[code].i18n)`, which is a computed key); an unknown code or
    no code falls back to `serverError(error)` (so nothing regresses) and then to a generic "Something went wrong" key.
    Components call the hook, not `serverError`.
  - **Codes with params:** a code may carry params from the body (`endsAt` as ISO, rendered in the reader's locale and
    zone through the site's formatters; a count; a limit). Member-written text is never a param.
  - **Server side:** `defineHandler` and `implement()` already pass bodies through; route handlers that refuse add a
    `code` beside their English `error` (additive; the English stays for old clients, push and logs). New codes are
    added to `ERROR_CODES` under per-domain comment blocks.
  - **Scope this sprint:** the domains with the most call sites and the most-seen refusals: the post and comment
    composers (`components/feed`), communities (join, post, mod actions), events and RSVPs, tournaments, messages and
    group chats (`components/chat-plus`, `components/messages`), builds, study, and handle and profile edits — at least
    100 call sites. The rest stay on `serverError` and are counted.
  - **A ratchet:** `lib/__tests__/server-error-ratchet.test.ts` counts `serverError(` call sites in `components/`,
    `app/` and `features/` (excluding `useRefusalText.ts`'s own fallback) and only lets the number fall (the baseline is
    set at the end of this feature); new code uses `useRefusalText`.
  - **The site's developer API** is untouched (it has its own envelope).

## Functional requirements

1. FR-1 `readRefusal`, `useRefusalText` and the params rules; `ERROR_CODES` extended with the domain codes (each with
   English `text` equal to the server's current English, so English readers see no change).
2. FR-2 Every converted route answers `code` (and params) beside `error`.
3. FR-3 Every converted component calls `useRefusalText`; `pnpm i18n:extract` brings every key into
   `locales/en/errors.json` (by hand only if the extractor churns unrelated catalogues).
4. FR-4 The ratchet test and its baseline.
5. FR-5 `components/communities/useSanctionRefusal.ts` is re-expressed through `useRefusalText` (its behaviour kept).

## Non-functional requirements

- **Compatibility:** responses keep `error`; only `code` and params are added. No component changes behaviour for an
  English reader (the defaults match the old server text, asserted per code).
- **i18n:** literal keys only (the computed-key ratchet): `useRefusalText` maps a code to a key through a literal
  `switch`, never by string building; the catalogue test holds `ERROR_CODES` and `errors.json` equal.
- **Bundle:** `lib/errors/refusal.ts` and `components/errors/useRefusalText.ts` import no zod and no server module.

## Data model and API

- No schema change. New `lib/errors/refusal.ts`, `components/errors/useRefusalText.ts`,
  `lib/__tests__/server-error-ratchet.test.ts`. Edits: `lib/errors/codes.ts`, `locales/en/errors.json`, and the route
  handlers and components of the converted domains (not `components/feed/NotificationsColumn.tsx` or other files another
  wave-7 feature owns; 19 edits only `lib/account/**` and `server/jobs/index.ts`).

## Testing requirements

- Product suite `components/errors/__tests__/refusal.product.test.ts`: a known code renders its key with params; an unknown
  code falls back to the server text; no body falls back to the generic key; `endsAt` formatting.
- Main suite `lib/errors/__tests__/error-codes-catalogue.test.ts`: every code's key is in `errors.json` with the same
  English; every code's English equals the server text it replaced (a table of the converted routes).
- The ratchet; i18n catalogues, drift and computed-key ratchets; the existing tests of each converted route stay green
  (they assert `error`; add `code`).

## Acceptance criteria

- [ ] A full event's RSVP refusal renders from its `errors` key (so it reads in Spanish once the `es` catalogue on the
      `i18n/catalogs` branch is translated); in `en` it reads exactly as before.
- [ ] A community ban refusal shows its end date in the reader's locale and zone.
- [ ] At least 100 call sites use `useRefusalText`; the ratchet holds the rest; every new key is in
      `locales/en/errors.json` through the extractor.
- [ ] No response lost its `error` field.

## Out of scope

The developer API's errors, socket-hub errors, validation messages from zod schemas (field-level form errors), and the
remaining `serverError` call sites (counted by the ratchet).
