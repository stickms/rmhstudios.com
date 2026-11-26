# 12 — Mention someone in a game discussion, and they hear about it

Surface: the games library's discussions (`/games/hub/$gameId`, a thread page), the composer's `@` autocomplete, the
inbox. Wave 5. Namespace `thread-mentions`. App tier (the games library's own look, `components/steam/`); the inbox
is site tier.

## User story

As a member writing in a game's discussion, I want to type `@name` to pull a friend into the thread, and as the friend,
I want to hear that I was mentioned and land on the post, so that discussions on a game's page can reach the people
who would answer instead of waiting for them to wander by.

## Requirements elicitation

- **What exists (verified):**
  - Game threads and replies (`GameThread`, `GameThreadPost`, `prisma/schema/games.prisma`) are written by
    `createThread` and `createPost` (`lib/games/hub.server.ts`), served by `lib/cards/api/games.hub.thread.server.ts`
    and `lib/games/api/games.hub.post.server.ts`, rendered by `components/steam/ThreadPage.tsx` and
    `components/steam/HubPage.tsx`.
  - A reply notifies the thread's author and earlier posters (`notifyThreadReply`, `lib/games/thread-notices.server.ts`,
    sprint 14 11: one `REPLY` row each, `dedupeUnread`, blocks, mutes, bans and the thread's `game-thread` conversation
    mute honoured, at most 50). **Nothing reads `@handle` in a thread or reply**: a mention is plain text. Sprint 14 11
    recorded "mentions in game threads" as out of scope.
  - The feed's mention machinery: `parseHandles` (`lib/feed/mentions.ts`, at most 10 per text), `findUsersByHandles`
    (`lib/handles/lookup.server.ts`), the `@` autocomplete (`mentionSearchApi`, `lib/feed/feed-reads.contract.ts`,
    `searchMentionUsers` in `lib/feed/mention-search.server.ts`), and the `MENTION` notification type with
    `notifyMentions` (`lib/feed/notify-mentions.server.ts`, feed posts only).
  - Notices are keys (`notice()`); conversation mutes (`lib/notify/conversation-prefs.server.ts`, `shouldDeliver`).
- **Decisions:**
  - **Who is told:** each mentioned member (at most 5 per post, the first five unique handles), except the writer,
    members blocked either way with the writer, members who muted the writer, banned or pending-deletion members, and
    members who muted that thread (`game-thread` scope) unless the mute is `mentions` mode (which by definition lets
    mentions through, `shouldDeliver`).
  - **No double notice:** a member who is both mentioned and a reply recipient gets the mention only (the mention is
    the more specific); `notifyThreadReply` is told to skip the mentioned ids.
  - **The notice:** `MENTION` type, key `game-thread-mention` ("{{name}} mentioned you in {{title}}"), link to the
    post's anchor, category `mentions` (the existing mentions setting governs it). **Spam cap:** `dedupeUnread` keyed
    on the **thread** (`entityType: 'game-thread'`, `entityId` the thread id), so a member holds at most one unread
    mention notice per thread however many posts name them; with the five-per-post cap and the post route's existing
    rate limit, one writer cannot flood one member. A mention of a member who cannot read the thread's game hub (none
    today: hubs are public) would be skipped by the same read check the reply notice uses.
  - **Thread opening posts** mention too (the thread body).
  - **Rendering:** `@handle` in a thread or reply body is shown as a link to the profile when it resolves, through a pure
    tokenizer and one batched handle lookup per page (the thread read returns `mentions: { handle → name }` for the
    page); an unknown handle stays plain text. No mention markup is stored.
  - **Autocomplete:** the thread and reply composers get the feed's `@` autocomplete (the same contract), which already
    leaves out blocked members.
  - **After the write:** the fan-out runs after the post is committed and logs rather than fails it.

## Functional requirements

1. FR-1 `lib/games/thread-mentions.server.ts` (new): `notifyThreadMentions(post)` returning the ids it told;
   `resolveThreadMentions(bodies)` for the page.
2. FR-2 `lib/games/hub.server.ts`: `createThread` and `createPost` call it after the write; `createPost` passes its ids
   to `notifyThreadReply` (which gains a `skip` set).
3. FR-3 `lib/games/thread-text.ts` (new, pure): tokenize a body into text and mention parts.
4. FR-4 The thread read (`lib/cards/api/games.hub.thread.server.ts` or the hub read it calls) returns `mentions`;
   `ThreadPage.tsx` renders links; the composers get the autocomplete.
5. FR-5 Notice `game-thread-mention` (`name`, `title`) under the Wave 0 anchors; its label; `MUTE_READ_PATHS` entry.

## Non-functional requirements

- **Bounded:** at most 5 notices per post and one handle lookup per post; one lookup per thread page for rendering.
- **The writer's text is unchanged:** tokenizing is display-only, so a renamed handle simply stops linking.
- **Query shapes (verify against the schema):** `User.handle` is optional and unique (lookup by lower-case through
  `findUsersByHandles`); `bannedUntil` and `deletionScheduledAt` (`prisma/schema/auth.prisma`)
  are optional.
- **Member text direction:** mention links inside a body are inline `<bdi>`; the body keeps `dir="auto"`.

## Testing requirements

- Main suite `lib/games/__tests__/thread-mentions.test.ts` (fakes through `shapeChecked`): mentioned members told
  once; the writer, blocks either way, mutes, banned and the thread mute (and its `mentions` mode) honoured; at most
  five; a second post mentioning the same member in the same thread while the first notice is unread adds none; a
  mentioned reply recipient gets no reply notice.
- Product suite `lib/games/__tests__/thread-text.product.test.ts`: tokenizing, emails and `@@` not mentions.
- `lib/games/__tests__/` thread-notice tests (`notifyThreadReply` unchanged without the skip set), the notice-key
  catalogue, the preview ratchet, the mute read-path test.

## Acceptance criteria

- [ ] Writing "@sam can you check this" in a reply tells Sam, and the notice opens that reply.
- [ ] Sam, who also posted in the thread earlier, gets one notice, not two.
- [ ] A member who blocked the writer is not told.
- [ ] `@sam` in the thread is a link to Sam's profile.
- [ ] The reply composer suggests members after typing `@`.

## Out of scope

Mentions in game reviews, guides or achievement tips; editing a post; mention notices by e-mail.
