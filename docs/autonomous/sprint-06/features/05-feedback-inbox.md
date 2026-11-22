# 05 — Feedback you can send and someone reads

Surface: a "Send feedback" entry on `/help` and on the settings index, the
existing shake sheet, a new `/settings/feedback` ("Your feedback") and a new
admin inbox `/admin/feedback`. Wave 3. Namespace `feedback-inbox`.

## User story

As a member who hit a bug or an accessibility barrier, I want to send it from a
place I can find, with the page I was on attached, and to hear back when
someone has looked at it, so that reporting a problem is worth my time.

As the site operator, I want one inbox of that feedback that I can filter,
read with its context, answer and close, so that nothing sent to us is lost.

## Requirements elicitation

- **What exists (verified):**
  - `Feedback` (`prisma/schema/moderation.prisma`): `category`, `message`,
    `userId`, `createdAt`, and `context Json?` and `shotKey String?` that **no
    code writes** (the B23 comment describes route, viewport, theme, locale,
    build sha and the last client errors).
  - `POST /api/feedback` (`lib/api/routes/feedback.server.ts`, contract
    `lib/feedback.contract.ts`, schema `lib/feedback-schema.ts`: categories
    `bug | feature | general | other`, message 10–2 000 characters, 3 per 10
    minutes). `GET` is admin-only and has no client.
  - The only form is `components/access/FeedbackSheet.tsx`, opened by shaking a
    phone (`components/access/AccessMount.tsx`). Desktop members cannot send
    feedback at all.
  - Feature requests have their own board (`lib/requests/*`, `/roadmap`), which
    stays the place for ideas.
  - Feedback rows are not erased by `anonymizeAccount`.
- **Decisions:**
  - Categories become `bug | accessibility | feature | general | other`; an
    `accessibility` report adds optional "What were you using?" (screen reader,
    magnifier, voice control, keyboard only, switch, other; a `Select`) and
    "Where" (the page, prefilled).
  - Context is captured on submit and **shown to the member before sending** as
    a short list they can untick per item: page path (never query string), viewport
    size, edition (Day or Night or the theme id), locale, build id, and the last
    three client error messages from this tab (messages only, no stacks). No
    screenshot: `shotKey` stays unwritten (storage of user images is its own
    decision).
  - "Feature" feedback offers a link to the requests board but is still
    accepted.
  - Status: `new → in_progress → closed` (closed carries an outcome `fixed |
    wont_fix | duplicate | not_reproducible | answered`). An admin may write a
    reply (≤ 1 000 characters) that is sent to the member as a `SYSTEM`
    notification (label `feedback_reply`) and shown on "Your feedback".
  - Admin notes (internal, ≤ 1 000 characters) are never shown to the member.
  - Every admin status change, reply and note is audited with
    `recordAdminActionIn` in the same transaction.

## Functional requirements

1. FR-1 A shared `FeedbackForm` (extracted from `FeedbackSheet.tsx`, which keeps
   working) is reachable from a "Send feedback" row on `/help` and a "Send
   feedback" link on the settings index; it opens in a dialog on desktop and the
   existing sheet on phones.
2. FR-2 The form shows the context preview (FR decisions) with a checkbox per
   item; only ticked items are sent, validated by zod on the server
   (each value length-capped; the path must start with `/`).
3. FR-3 `/settings/feedback` lists the member's own feedback (newest first,
   category, first line, status, outcome, the admin reply when present) as rows
   on rules, with an empty state linking to FR-1.
4. FR-4 `/admin/feedback`: segments (`components/ui/tabs.tsx`) New, In progress,
   Closed; a category `Select`; text search over the message (ILIKE on at most
   the last 5 000 rows); rows show member, category, first line, `t-meta` age;
   pagination by keyset (createdAt, id).
5. FR-5 Opening a row (a dialog) shows the full message, the context as a
   definition list, the member link (to `/admin/users?…` drawer), status
   controls, internal note, reply, and "Close with outcome". Sending a reply
   notifies the member once (a `replyNotifiedAt` compare-and-set).
6. FR-6 An admin hub card links to `/admin/feedback` with the count of New.
7. FR-7 The legacy `GET /api/feedback` is removed in favour of the new admin
   endpoints (it has no client); its route-table entry is regenerated.

## Non-functional requirements

- **Security:** submit: `auth: 'required'`, the existing 3 per 10 minutes rate
  limit, zod for every field. Admin endpoints `auth: 'admin'`, admin page loader
  server functions guarded with `requireAdminServerFn`. "Your feedback" scopes
  every query by `userId`. Messages render as text (never HTML or Markdown).
- **Correctness:** reply notification is sent at most once per reply version
  (compare-and-set on `replyNotifiedAt` null → now, cleared when the reply
  changes).
- **Performance:** one new index, `@@index([status, createdAt(sort: Desc)])` on
  `feedback` (its concurrent migration holds exactly that one statement); the
  hub count reads `count` with it. "Your feedback" uses the existing
  `@@index([userId])` (a member has few rows); no second index is added, since
  each index on this existing table would need its own concurrent migration.
- **Privacy:** erasure deletes the member's feedback rows; export includes them
  (message, category, context, status, reply; not the internal note).
- **i18n:** `feedback-inbox`; the notification label in `feed`; the settings
  nav entry's label in `components/settings/settings-nav-labels.ts`.
- **Steel:** rows on rules; dialog is an overlay; one ink primary per view
  (Send on the form, Save on the detail dialog); statuses as words, not coloured
  chips; dates `t-meta` (D10 default).
- **Accessibility:** the form's fields are labelled; the context checkboxes are
  a `fieldset` with a legend; the inbox rows are buttons with the message's
  first line as name.

## Data model and API

- `Feedback` gains `status VarChar(12) @default("new")`, `outcome
  VarChar(20)?`, `adminNote VarChar(1000)?`, `reply VarChar(1000)?`,
  `repliedAt DateTime?`, `replyNotifiedAt DateTime?`, `handledById String?`,
  `updatedAt DateTime?`, `assistiveTech VarChar(24)?`. Migrations
  `20261126030000_s06_feedback_inbox` (columns),
  `20261126030001_s06_feedback_status_index` (CONCURRENTLY, one statement),
  `20261126030002_s06_feedback_status_index_ensure_valid`.
- `lib/feedback-schema.ts` (extended categories, context schema),
  `lib/feedback/inbox.ts` (pure: statuses, outcomes, context collection list),
  `lib/feedback/inbox.server.ts` (`listForAdmin`, `getForAdmin`, `updateStatus`,
  `reply`, `listMine`, `feedbackErasureOps`, `exportFeedback`),
  `lib/feedback/inbox.contract.ts`.
- Modules `lib/feedback/api/admin.feedback.server.ts` (GET),
  `admin.feedback.$id.server.ts` (GET, PATCH), `feedback.mine.server.ts` (GET);
  `lib/api/routes/feedback.server.ts` keeps POST only.
- Pages `app/routes/_site/admin/feedback.tsx`,
  `app/routes/_site/settings/feedback.tsx`; components
  `components/feedback/FeedbackForm.tsx`, `FeedbackInbox.tsx`,
  `FeedbackDetailDialog.tsx`, `MyFeedbackList.tsx`.

## Testing requirements

- Main suite `lib/feedback/__tests__/feedback-inbox.test.ts`: non-admins get 403
  on admin endpoints; "mine" never returns another member's rows; unticked
  context is not stored; context values over their caps are rejected; a path
  with a query string is stripped; reply notifies once; status change audited in
  the same transaction; internal note absent from "mine" and the export.
- Main suite `lib/account/__tests__/feedback-erasure.test.ts`.
- Product suite `lib/feedback/__tests__/inbox.product.test.ts`: context
  collection from a fake window, outcome required on close, keyset cursor.
- Gate tests: sitemap (two param-less pages), settings nav labels test, OG
  coverage (`/settings/feedback` is personal and excluded), server-fn guards.

## Acceptance criteria

- [ ] On a desktop browser, a member opens Help, sends an accessibility report
      with the page and screen reader ticked, and sees it under Your feedback.
- [ ] An admin sees it under New with its context, replies and closes it as
      fixed; the member gets one notification and sees the reply.
- [ ] The internal note is never visible to the member.
- [ ] Shaking a phone still opens the same form.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Screenshots, email replies, assigning feedback to people, merging feedback into
feature requests automatically.
