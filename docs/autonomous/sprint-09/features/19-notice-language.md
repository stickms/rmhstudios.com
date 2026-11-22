# 19 — System notices in the reader's language

Surface: `createNotification` (`lib/notifications.server.ts`), every `SYSTEM` notification emitter under `lib/`,
`server/` and `features/`, the notifications inbox (`components/feed/NotificationsColumn.tsx`). Wave 7. Namespace
`notice-language`.

## User story

As a member who reads the site in Arabic, Spanish or any of its other languages, I want the notices the site sends me —
"your scheduled post was not published", "you were timed out until …", "your recurring thread was paused" — in my
language and with dates in my format, not in English with a UTC time.

## Requirements elicitation

- **What exists (verified):**
  - `Notification` (`prisma/schema/social.prisma`) stores `preview VarChar(280)` — "a short snapshot of the content".
    For `SYSTEM` notifications the emitter writes an English sentence into it, e.g. `notifyAltRequired` in
    `lib/scheduled/publish.server.ts` ("Your scheduled post to
    ${community} was not published: an image needs a description"),
    the recurring pause in `lib/communities/recurring.server.ts` ("The
    recurring thread "${title}"
    in ${community} was paused"). `grep "type: 'SYSTEM'"` finds 134 sites in 95 files at the sprint 08 tip (06, 11 and
    14 add more this sprint). A few writers bypass `createNotification` and insert rows directly
    (`prisma.notification.create`/`createMany` in `lib/streak-reminders.server.ts`, `lib/homes/scrape/notify.server.ts`,
    `lib/economy/spend-budget-core.ts`, `lib/arcade/updates.server.ts`, `features/balatro/server/queue.ts`); their
    `SYSTEM` rows are in scope too (they write the two new columns themselves).
  - The inbox shows `n.preview` as the body under a translated label (`systemLabels`,
    `components/feed/notification-labels.ts`, keyed by `entityType`, literal `t()` calls so the extractor sees them).
    `components/feed/MentionToast.tsx` renders previews of live mention notifications only;
    `components/site/NotificationsPopover.tsx` is not imported by anything (`docs/_generated/knip-report.txt`). Both are
    left as they are; the implementer confirms neither shows a `SYSTEM` preview.
  - Sprint 06 01's integration TODO: community sanction text is "server English UTC — render from code + `endsAt` via
    `t()` + `useLocaleFormat`"; `lib/communities/bans.ts` has "a fixed English '1 Dec 2026, 14:30 UTC' for server-built
    text".
  - Push and e-mail deliveries read the same preview at send time; the server has no per-member catalogue then
    (`lib/i18n/runtime/` serves the client, and non-English catalogues are pulled in at build from the `i18n/catalogs`
    branch).
- **Decisions:**
  - **A key beside the text.** `Notification` gains `previewKey VarChar(64)?` and `previewParams Json?`.
    `createNotification` accepts `preview: { key, params, fallback }`: `fallback` is the English sentence (stored in
    `preview`, used by push, e-mail and old clients); `key` and `params` are stored for the inbox. Params are plain
    values: strings, numbers, and instants as ISO strings under names ending `At`, which the client formats with the
    site's locale formatters.
  - **One client catalogue.** `components/feed/notice-previews.ts` maps each key to a literal
    `t('notice-<key>', { ns: 'notice-language', defaultValue: '…', …params })` call (never a computed key; the
    computed-key ratchet holds it); the inbox renders `previewKey` through it when the key is known and falls back to
    `preview` otherwise. Keys are named after the notice, not the emitter (`scheduled-alt-required`,
    `community-timeout`, `recurring-paused`, …).
  - **Which emitters move.** Every `SYSTEM` emitter whose preview is a sentence the site wrote (not quoted member
    content) — the implementer inventories every site (the `createNotification` callers and the direct writers above),
    converts each such sentence, and leaves previews that quote member text (a post excerpt) as they are. Member content
    stays in `params` only as the quoted part (e.g. the community name), never translated.
  - **A ratchet.** `lib/__tests__/notice-preview-ratchet.test.ts` counts `SYSTEM` emitters that pass a bare string
    `preview` with an English template literal; the count only falls, and the summary reports what is left. New emitters
    must use the key form.
  - **Dates.** Sanction ends and other instants are sent as `endsAt` (ISO) and shown as the reader's local date and time
    ("until 1 December, 15:30"), not a fixed UTC string; the fallback keeps the UTC form for push.
  - **Old rows** keep their English preview; nothing is backfilled.

## Functional requirements

1. FR-1 The two columns and migration; `createNotification`'s new input shape (the old string form keeps working).
2. FR-2 The catalogue and the inbox rendering (`NotificationsColumn.tsx`), in both the list and grouped views.
3. FR-3 Every site-written `SYSTEM` preview converted, with its English fallback; the sanction notices with `endsAt`.
4. FR-4 The ratchet.
5. FR-5 `pnpm i18n:extract` puts every key in `locales/en/notice-language.json`.

## Non-functional requirements

- **Correctness:** the fallback and the catalogue's English default say the same thing (a test compares them for every
  key, with sample params); an unknown key renders the fallback.
- **Performance:** two nullable columns on a hot table (no default, no rewrite in Postgres); no new index; the inbox
  does no extra request.
- **i18n:** keys are literal; interpolation uses `{{name}}`; no `{/* */}` comment directly before a `t()` call.
- **Security:** params are rendered as text (React escapes them); no HTML in a notice.

## Data model and API

- Migration `20261129070100_s09_notice_language` (two nullable columns on `notification`).
- New `lib/notifications/notice-keys.ts` (the key list and param shapes, pure, shared by emitters and the catalogue),
  `components/feed/notice-previews.ts`, the ratchet test. Edits: `lib/notifications.server.ts`,
  `components/feed/NotificationsColumn.tsx`, and each converted emitter (lines at their notification call only — no
  reformatting).
- `/api/v1/me/notifications` keeps returning `preview` (the English fallback) and gains nothing in this feature
  (additive later if asked).

## Testing requirements

- Main suite `lib/notifications/__tests__/notice-keys.test.ts`: every key has a catalogue entry; fallback and default
  agree with sample params; ISO params parse.
- Main suite `lib/__tests__/create-notification-preview.test.ts`: the new input stores key, params and fallback; the
  string form is unchanged.
- Main suite `components/feed/__tests__/notice-previews.test.tsx` (rendered with `react-dom/server`, `ar` and `en`): a
  known key renders translated text with a locally formatted date; an unknown key renders the fallback.
- The ratchet; `lib/__tests__/i18n-computed-key-ratchet.test.ts`; the label test; existing notification tests stay
  green.

## Acceptance criteria

- [ ] In `ar`, a community timeout notice reads in Arabic with the end time in the reader's format.
- [ ] Push for the same notice carries the English fallback.
- [ ] A new `SYSTEM` emitter written with a bare English string fails the ratchet.
- [ ] Notifications from before the change still show their English text.

## Out of scope

Translating member-written text, push and e-mail in the member's language (needs a server-side catalogue), non-`SYSTEM`
notification types (their verbs are already translated), backfilling old rows.
