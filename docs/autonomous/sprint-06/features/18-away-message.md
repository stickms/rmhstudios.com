# 18 — Away message for direct messages

Surface: an "Away message" control on `/messages`, the conversation header and
the member's profile. Wave 7 (after 17). Namespace `away-message`.

## User story

As a member going on holiday or into exams, I want to set an away message with
dates, so that people who write to me get one short automatic reply saying when
I will be back, instead of wondering why I have gone quiet.

## Requirements elicitation

- **What exists (verified):**
  - Calls have an automatic DM reply (`lib/call/auto-reply.server.ts`): it
    re-checks blocks, mutes, call privacy and DM privacy
    (`canDirectMessage`, `lib/chat-plus/dm-privacy.server.ts`), sends through
    `postChatMessage` (`lib/chat-plus/post.server.ts`) with `meta.autoReply`,
    labels it automatic and has a cooldown. That is the pattern to copy, minus
    the AI writer (an away message is the member's own text).
  - Direct messages are sent by `sendDirectMessage`
    (`lib/messages/send.server.ts`), with message requests (sprint 04 16,
    `requestGate`) and `guardDirect`.
  - Presence has an "away" state shown as a dot (D5, decided:
    `components/profile/PresenceDot.tsx`); a status message with expiry exists
    (`components/feed/StatusEditor.tsx`). Neither replies to anyone.
- **Decisions:**
  - An away message: text 1–300 characters, start (now or a date) and end
    (required, at most 60 days ahead), in the member's time zone
    (`lib/calendar/tz.ts`). One per member; it ends by itself at its end time
    (read-time check, no job).
  - **Who gets the reply:** the sender of a new direct message to the away
    member, in an **accepted** conversation (never a pending message request,
    which would accept or reveal it), not blocked or muted either way, at most
    once per conversation per away period, and never in reply to an automatic
    message (no auto-reply loops between two away members).
  - The reply is posted the way the call auto-reply posts (`postChatMessage`
    with `meta.autoReply: 'away'`), from the away member, after the incoming
    message is stored; it is labelled "Automatic reply" in the conversation.
  - The conversation header shows "Away until 3 Dec" to the other person in an
    accepted conversation while the message is active, so they know before
    writing. The profile line is **opt-in** ("Also show 'Away until …' on my
    profile", default off), because announcing an absence with a return date
    to everyone who can message the member is a safety choice the member
    should make; when on, it shows to people who can message the member and is
    hidden otherwise. Neither line ever shows the message text, only the end
    date.
  - Editing an active away message (text or end date) keeps its `id`, so
    nobody gets a second reply; turning it off and setting a new one, or
    setting one after the last has ended, makes a new `id` (a new period).
  - Group chats are not affected.
  - Turning it off early is one click.

## Functional requirements

1. FR-1 `/messages` shows "Set an away message" in its header menu; a dialog
   with the text, start, end and Save (ink primary); when active, the inbox
   shows one line "Away message on until 3 Dec · Edit · Turn off".
2. FR-2 After `sendDirectMessage` stores a message to an away member, an
   `afterDirectMessage` hook sends the automatic reply per Decisions,
   best-effort and after commit.
3. FR-3 The reply renders with "Automatic reply" in `t-meta` above the text.
4. FR-4 The conversation header and profile show "Away until …" per Decisions.
5. FR-5 The member's own conversation list marks conversations that received an
   automatic reply during the period (a `t-meta` "Auto-replied"), so they can
   follow up when back.

## Non-functional requirements

- **Correctness:** "once per conversation per period" is a unique row
  (`AwayReplySent(awayId, chatId)`); the insert is attempted first and the reply
  sent only when it succeeded (`createMany({ skipDuplicates })` count 1), so two
  concurrent incoming messages produce one reply. A new away period (new `id`)
  resets it.
- **Security:** `auth: 'required'`; `rateLimit: 'write'`; zod for text and dates;
  the hook re-checks blocks, mutes and DM privacy itself and never trusts the
  sender's client. The text is the member's own words, rendered as text.
- **Performance:** the hook is one indexed read of the recipient's away row
  (`userId` unique) and returns at once when none is active.
- **Privacy:** erasure deletes the away row and its sent markers; export includes
  the away message (text and dates).
- **i18n:** `away-message`; dates in the reader's locale.
- **Steel:** dialog overlay; the inbox line is text on a rule (no tinted box,
  D8); presence colours unchanged (D5 is decided and not extended).
- **Accessibility:** date fields labelled with the time zone; "Automatic reply"
  is part of the message's accessible text.

## Data model and API

- `AwayMessage { id String @id @default(cuid()), userId String @unique, body
  VarChar(300), startsAt DateTime, endsAt DateTime, tz VarChar(64), showOnProfile
  Boolean @default(false), createdAt @default(now()) }` and
  `AwayReplySent { awayId, chatId, sentAt
  @default(now()) }` with `@@id([awayId, chatId])`, both
  `@@map`ped (`away_message`, `away_reply_sent`) in
  `prisma/schema/messaging.prisma`; `User` back-relation under the auth anchor;
  `AwayReplySent.awayId` relation to `AwayMessage` (cascade). Migration
  `20261126070100_s06_away_message`.
- `lib/messages/away.ts` (pure: validity, active check, header text data),
  `away-schema.ts`, `away.server.ts` (`getAway`, `setAway`, `clearAway`,
  `afterDirectMessage`, `awayStatusFor`, `awayErasureOps`, `exportAwayMessage`),
  `away.contract.ts`.
- Modules `lib/messages/api/messages.away.server.ts` (GET, PUT, DELETE),
  `messages.away.$userId.status.server.ts` (GET: active and end date only, for
  the header and profile, gated by `canDirectMessage`).
- `lib/messages/send.server.ts`: one call to `afterDirectMessage` after a
  successful direct send.
- `components/messages/AwayMessageDialog.tsx`, `AwayLine.tsx`; the header in
  `ConversationView.tsx`; the profile hero line.

## Testing requirements

- Main suite `lib/messages/__tests__/away-message.test.ts`: reply sent once per
  conversation per period under two concurrent messages; never to a pending
  request; never to a blocked or muted pair; never in reply to an automatic
  message; ended or not-yet-started message sends nothing; end more than 60
  days ahead refused; the status endpoint returns nothing to someone who cannot
  message the member, and never the text; the profile line is absent unless
  `showOnProfile`; editing an active message sends no second reply.
- Main suite `lib/account/__tests__/away-message-erasure.test.ts`.
- Product suite `lib/messages/__tests__/away.product.test.ts`: active window in
  a time zone across DST, header text data.
- `ConversationView.characterization.test.tsx` stays green.

## Acceptance criteria

- [ ] A sets an away message until Friday; B writes twice; B gets one automatic
      reply and sees "Away until Fri" in the header.
- [ ] Someone with a pending message request to A gets no reply.
- [ ] Two members who are both away do not reply to each other's replies.
- [ ] After Friday nothing is sent.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Away messages in group chats, email auto-replies, changing presence colour.
