# 13 — Saved replies in messages

Surface: the direct-message and group-chat composers
(`components/feed/conversation/ComposerBar.tsx`,
`components/feed/group-chat/GroupComposerBar.tsx`). Wave 5. Namespace
`saved-replies`.

## User story

As a member who answers the same questions in messages again and again — a
creator asked where to download a build, a community organiser asked when the
next event is — I want to keep a few written answers and drop one into the
composer, edit it and send it — so that I do not retype them or keep them in a
notes app.

## Requirements elicitation

- **What exists (verified):** the composers support text, images with alt text
  (sprint 03), send-later (sprint 03, `SendLaterMenu.tsx`), length counting
  (`ComposerLengthCounter.tsx`). Community moderators have macros for moderation
  actions (`ModMacro`, `prisma/schema/developer.prisma`), which are not message
  text. Members have nothing like saved replies
  (`grep -ri "savedRepl\|cannedRe\|quickReply"` finds nothing).
- **Decisions:** at most 50 saved replies per member, each a title (≤ 60
  characters) and a body (≤ 2 000 characters, the direct-message limit — read
  the composer's own max). Choosing one **inserts** its text at the caret
  (replacing a selection); it never sends on its own, so every existing send
  rule (message requests, `requestGate`, `guardDirect`, blocks, bans, rate
  limits) applies unchanged at send time. Saved replies are private, not shared
  between members, and work in both composers. Variables: only `{{name}}`,
  replaced with the other person's display name in a direct conversation (left
  as is in groups).

## Functional requirements

1. FR-1 A "Saved replies" button in each composer's tool row opens a menu
   (`components/ui/menu.tsx`) listing replies by recent use with a filter field
   when there are more than 8; Enter inserts the highlighted reply.
2. FR-2 In the composer, typing `/` as the first character followed by letters
   filters saved replies by title in the same menu (Escape dismisses and leaves
   the text as typed).
3. FR-3 "Manage saved replies" (from the menu) opens a dialog: list (title,
   first line), New, Edit, Delete (confirmed with `useConfirm`), Move up / Move
   down.
4. FR-4 "Save as reply" from a message's own actions
   (`components/messages/MessageActions.tsx`, on the member's own sent messages)
   prefills New with that text.
5. FR-5 Inserting a reply records its use (`lastUsedAt`, `useCount`) so the menu
   orders by recency.
6. FR-6 Limits are explained inline; the 51st reply is refused with a message.

## Non-functional requirements

- **Correctness:** the cap check and insert run in a transaction after
  `lockKey(tx, 'saved-replies:' + userId)`; reorder writes positions in one
  transaction.
- **Security:** `auth: 'required'`; `rateLimit: 'write'` on writes; zod
  validation of title/body/position; a member only reads and edits their own
  rows (ids scoped by `userId` in every `where`). The `{{name}}` substitution
  happens client-side from data the composer already has; the body is plain
  text.
- **Performance:** the list is fetched once per session when a composer first
  opens the menu (React Query, `staleTime` 5 minutes) and invalidated on edit;
  recording a use is fire-and-forget.
- **Privacy:** erasure deletes the rows; export includes them.
- **i18n:** `saved-replies`.
- **Steel:** menu and dialog are overlays (the only raised surfaces); list rows
  on rules inside the dialog; one ink primary (Save) in the editor.
- **Accessibility:** the menu is a Radix menu with typeahead; the `/` trigger
  uses `aria-expanded` / `aria-controls` on the composer textarea and announces
  the result count; focus returns to the textarea with the caret after the
  inserted text (set directly in the event handler — never
  `requestAnimationFrame`).

## Data model and API

- `SavedReply { id String @id @default(cuid()), userId, title VarChar(60), body
  VarChar(2000), position Int, useCount Int @default(0), lastUsedAt DateTime?,
  createdAt, updatedAt @updatedAt }`, `@@index([userId, position])`,
  `@@map("saved_reply")` in `prisma/schema/messaging.prisma`; back-relation
  under the auth anchor. Migration `20261125050100_s05_saved_replies`.
- `lib/messages/saved-replies.server.ts` (`list`, `create`, `update`, `remove`,
  `reorder`, `recordUse`, `savedReplyErasureOps`, `exportSavedReplies`);
  `lib/messages/saved-replies.ts` (pure: `/` trigger parsing, filter and rank,
  `{{name}}` substitution, caret insertion).
- Contract `lib/messages/saved-replies.contract.ts`; modules
  `lib/messages/api/saved-replies.server.ts` (GET, POST),
  `saved-replies.$id.server.ts` (PATCH, DELETE), `saved-replies.order.server.ts`
  (PUT `{ ids: string }`), `saved-replies.$id.use.server.ts` (POST).
- `components/messages/SavedRepliesMenu.tsx`, `SavedRepliesDialog.tsx`, used by
  both composer bars.

## Testing requirements

- Main suite `lib/messages/__tests__/saved-replies.test.ts`: cap of 50 under the
  lock; another member's id is 404 on edit, delete and use; reorder only touches
  the caller's rows; body length limit.
- Main suite `lib/account/__tests__/saved-replies-erasure.test.ts`.
- Product suite `lib/messages/__tests__/saved-replies.product.test.ts`: `/`
  trigger detection (only at the start, not inside a URL), ranking,
  substitution, caret insertion with a selection.

## Acceptance criteria

- [ ] A member saves a reply, types `/where` in a DM and inserts it with Enter;
      nothing is sent until they press Send.
- [ ] A saved reply sent to someone who has not accepted a message request goes
      through the request rules exactly as typed text would.
- [ ] Other members cannot read or edit someone's saved replies.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Shared team replies, replies in post comments, scheduled replies (send-later
exists).
