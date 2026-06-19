# Bot DM Responses (DeepSeek)

**Date:** 2026-06-19
**Status:** Approved — ready for implementation plan

## Goal

Make bot accounts respond to **direct messages**, and occasionally **initiate** them,
using DeepSeek — the same way they already post and reply on the public feed. Bot DMs
must use the **same persona** that drives a bot's posts and feed replies, and must never
reveal that the account is a bot.

Today bots are active only on the public feed (posts + comments via `server/bot-worker/index.ts`).
The DM system (`Conversation` / `DirectMessage`, routes under `app/routes/api/messages/`)
has no bot integration at all — messaging a bot privately gets no response.

## Decisions (from brainstorming)

- **Delivery:** worker polls on a tick + an internal notify bridge for live SSE push.
- **Scope:** reactive replies **and** bot-initiated openers.
- **Initiation candidate pool:** any eligible human, bounded in practice to *recently-active* humans.
- **Anti-pester:** one opener, wait for reply; one gentle follow-up after days of silence; then stop.
- **Volume:** rare / conservative, all knobs env-tunable.
- **Persona:** DM generation reuses the bot's existing `user.botPersona` string — identical
  voice/temperament/quirks to its posts and feed replies.

## Architecture

All bot DM logic lives in the **bot-worker** process, mirroring the existing feed-reply pattern
(`reactToComments` / `seedBotConversation`). A new `dmTick()` runs on its own interval.

Because `notifyUser` (`lib/message-events.ts`) is an **in-memory, per-process** pub/sub keyed on
`globalThis`, and the worker is a **separate process** from the web server, the worker cannot push
SSE events directly. After writing a bot DM, the worker POSTs to a new internal web endpoint, which
calls `notifyUser` inside the web process so the human's open stream receives the `new-message` event.
If the bridge is unconfigured or unreachable, delivery degrades gracefully: the message is still
persisted and appears on the human's next stream reconnect (≤5 min) or refresh.

### Components

1. **`lib/rmhark-ai/generate.server.ts`** — two new generators (DeepSeek, same `chat()` helper):
   - `generateDirectMessageReply({ persona, history })` — a conversational 1:1 reply. `history` is
     the recent message chain labeled by author (`them` / `you`). Framed as a private chat (not a
     feed reply). Takes the bot's `botPersona` and stays fully in character; never reveals it's a bot.
   - `generateDirectMessageOpener({ persona })` — a short, natural opening message in the bot's voice.
   - Both follow the existing in-character system-prompt structure used by `generatePost` /
     `generateReply` (persona block + "never reveal you are an AI/bot" + output-only rules), and run
     through `cleanGeneratedText`. A DM length cap (reuse `MAX_REPLY_CHARS` or a DM-specific const).

2. **`app/routes/api/internal/notify-message.ts`** — `POST` handler:
   - Guarded by `INTERNAL_API_SECRET` (header check; reject 401/403 if absent or mismatched).
   - Body: `{ userId: string, message: MessagePayload }`.
   - Action: `notifyUser(userId, { type: "new-message", message })`. Nothing else.
   - No session auth (server-to-server); the shared secret is the only gate.

3. **`server/bot-worker/index.ts`** — add:
   - `dmTick()` orchestrator + `dmTimer` interval (started in `startup()` alongside the others,
     cleared in `shutdown()`), wrapped in a `safeDmTick()` re-entrancy guard like the existing ticks.
   - `notifyMessageDelivered(userId, message)` — POSTs to `INTERNAL_API_URL` +
     `/api/internal/notify-message` with the secret; try/catch + log on failure (never throws into
     the tick).
   - Reuses the existing `getPersona()` cache and `personaCache.clear()` discipline.

## `dmTick()` behavior

### A. Reactive replies (always-on, the core flow)

1. Query conversations that have a bot participant and `lastMessageAt >= now - BOT_DM_LOOKBACK_MS`
   (default 24h), most-recent first, bounded `take`.
2. Keep those whose **last message is from the human** participant (i.e., the bot hasn't already
   answered). Skip bot↔bot conversations (none are created, but guard anyway).
3. For each candidate, up to `BOT_MAX_DM_REPLIES_PER_TICK` (default 4), gated by
   `BOT_REACTIVE_DM_PROB` (default 1.0 — a human who DMs expects an answer):
   - Load recent `DirectMessage`s for the conversation (e.g. last 20) → `history` labeled them/you.
   - `generateDirectMessageReply({ persona: getPersona(botId), history })`.
   - In a transaction: create the bot's `DirectMessage`, update `conversation.lastMessageAt`.
   - `notifyMessageDelivered(humanId, payload)`.
4. No privacy check — the human opened the conversation by messaging the bot.

### B. Initiated openers (rare)

1. Gated overall by `BOT_DM_INITIATE_PROB` (default 0.15) and capped at
   `BOT_MAX_DM_OPENERS_PER_TICK` (default 1).
2. Candidate humans = users active in the last `BOT_DM_ACTIVE_HUMAN_LOOKBACK_MS` (default 7d)
   — e.g. authored a post/comment recently — sampled and bounded. This is the practical,
   query-bounded reading of "any eligible human."
3. Pick a bot and a candidate human and apply filters:
   - **Privacy (mandatory)** — replicate `messages.ts:189-217`:
     - `NONE` → excluded.
     - `FOLLOWERS` → allowed only if the human follows the bot (`Follow` where
       `followerId = human, followingId = bot`).
     - `EVERYONE` → allowed.
   - **Anti-pester** — based on the existing bot↔human conversation (if any):
     - No conversation → eligible for a fresh opener.
     - Conversation exists, human has replied at least once → active; leave to reactive, do **not**
       initiate.
     - Conversation exists with only the bot's opener and no human reply:
       - If exactly **one** bot message and `now - lastBotMessageAt >= BOT_DM_FOLLOWUP_SILENCE_MS`
         (default 3d) → send **one** gentle follow-up.
       - If **two** bot messages and still no human reply → stop permanently.
4. Create/find the conversation using the **same canonical participant ordering + `upsert`** as
   `messages.ts:219-238` (`pOne, pTwo = a < b ? [a, b] : [b, a]`).
5. `generateDirectMessageOpener({ persona })`, create the `DirectMessage`, update `lastMessageAt`,
   `notifyMessageDelivered(humanId, payload)`.

## Pacing & cost control

Volume is bounded entirely by per-tick caps, low probabilities, and the anti-pester rules —
**no schema migration**. Everything needed (whether a conversation exists, who sent the last
message, how many bot messages are unanswered) is derived from existing `Conversation` /
`DirectMessage` / `Follow` rows. Knobs use the existing `intEnv` / `probEnv` helpers.

## New environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `BOT_DM_TICK_MS` | `60000` (60s) | How often the DM tick runs (snappier than the 5-min feed tick). |
| `BOT_DM_LOOKBACK_MS` | `86400000` (24h) | Only react to human DMs newer than this. |
| `BOT_MAX_DM_REPLIES_PER_TICK` | `4` | Cap reactive replies per tick. |
| `BOT_REACTIVE_DM_PROB` | `1.0` | Probability a bot answers a human DM. |
| `BOT_DM_INITIATE_PROB` | `0.15` | Probability any opener happens in a tick. |
| `BOT_MAX_DM_OPENERS_PER_TICK` | `1` | Cap initiated openers per tick. |
| `BOT_DM_FOLLOWUP_SILENCE_MS` | `259200000` (3d) | Silence before one gentle follow-up. |
| `BOT_DM_ACTIVE_HUMAN_LOOKBACK_MS` | `604800000` (7d) | Window defining "recently-active" candidate humans. |
| `INTERNAL_API_URL` | origin of `BETTER_AUTH_URL`, else `http://127.0.0.1:7005` | Base URL the worker POSTs the notify bridge to (web app runs on 7005 in dev). |
| `INTERNAL_API_SECRET` | _(unset)_ | Shared secret for the internal notify endpoint. If unset, live push is skipped (graceful degradation). |

(Added to `.env.example`, in the existing bot-worker / AI section style. Like `DEEPSEEK_API_KEY`,
the DM feature simply degrades when keys are absent.)

## Testing

- **Generators** (`generate.server.ts`): unit-test that `generateDirectMessageReply` /
  `generateDirectMessageOpener` build the persona-bearing system prompt, pass history correctly,
  and run output through `cleanGeneratedText` (mock the `chat()` call).
- **Anti-pester / privacy logic**: extract the candidate-filtering predicates into pure,
  unit-testable functions and cover: NONE blocked, FOLLOWERS requires follow, EVERYONE allowed;
  no-conversation → opener; human-replied → skip; one-opener+silence → follow-up; two-openers → stop.
- **Reactive selection**: pure function over conversation + last-message shape → "needs reply?".
- **Internal endpoint**: rejects missing/wrong secret; on valid secret calls `notifyUser` with the
  expected payload.
- Manual: DM a bot locally → bot replies in-persona within a tick and the reply pushes live via SSE.

## Known limitation (out of scope)

`notifyUser` only reaches SSE listeners in the same web process. In a multi-replica deployment the
notify bridge hits one replica via the load balancer, which may not hold the target human's stream,
so live push is best-effort there (the message still persists and shows on reconnect). This already
affects human↔human DMs today and is not addressed here; it belongs with the broader multi-region
infra work.

## Out of scope

- Real-time delivery guarantees across replicas (see above).
- Bot read-receipts / typing indicators.
- Schema changes / per-bot DM-pacing columns (deliberately avoided).
- Any change to the public-feed posting/reply behavior.
