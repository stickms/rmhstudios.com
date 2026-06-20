# Bot DM Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bot accounts answer direct messages (and occasionally initiate them) in-persona via DeepSeek, with live SSE delivery from the separate worker process.

**Architecture:** All bot DM behavior lives in the `server/bot-worker` process as a new `dmTick()` loop, mirroring the existing feed-reply ticks. Pure decision logic (privacy, reactive-reply detection, anti-pester, history formatting) is extracted into side-effect-free modules under `lib/` so it is unit-testable. Because `notifyUser` is in-memory per-process, the worker pushes live SSE events by POSTing a new internal web endpoint guarded by a shared secret.

**Tech Stack:** TypeScript, Prisma (Postgres), TanStack Start file routes, OpenAI SDK pointed at DeepSeek, Vitest.

## Global Constraints

- DM generation MUST pass the bot's existing `user.botPersona` string — the same `composePersona(spec)` output that drives `generatePost`/`generateReply`. Same voice across posts, feed replies, and DMs.
- Bots MUST never reveal they are bots/AI (carried by the persona system prompt).
- No Prisma schema changes / migrations. All state is derived from existing `Conversation`, `DirectMessage`, `Follow` rows.
- Privacy is mandatory for bot-initiated DMs: `NONE` → never; `FOLLOWERS` → only if the human follows the bot; `EVERYONE` → allowed. Reactive replies need no privacy check (the human opened the conversation).
- All tunables use the existing `intEnv` / `probEnv` helpers in `server/bot-worker/index.ts`.
- Conversation creation MUST use the canonical participant ordering used in `app/routes/api/messages.ts:219-238`: `[pOne, pTwo] = a < b ? [a, b] : [b, a]`, then `upsert` on `participantOneId_participantTwoId`.
- DM length cap reuses `MAX_REPLY_CHARS` (500) from `lib/rmhark-ai/persona.ts`.
- Tests run with: `node_modules/.bin/vitest run <path>` (auto-loads `vitest.config.ts`; `@` alias resolves to repo root).
- Lint a file with: `pnpm exec eslint <path>`.

---

### Task 1: Pure DM policy module

Side-effect-free decision logic plus the Vitest wiring so its tests run.

**Files:**
- Create: `lib/rmhark-ai/dm-policy.ts`
- Create: `lib/rmhark-ai/__tests__/dm-policy.test.ts`
- Modify: `vitest.config.ts` (add the new test dir to `include`)

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type DmPrivacy = 'EVERYONE' | 'FOLLOWERS' | 'NONE'`
  - `interface PolicyMessage { senderId: string; createdAt: Date }`
  - `interface DmMessage { senderId: string; content: string }`
  - `interface DmTurn { from: 'them' | 'you'; text: string }`
  - `needsReactiveReply(messages: PolicyMessage[], botId: string): boolean`
  - `canBotMessage(opts: { dmPrivacy: DmPrivacy; humanFollowsBot: boolean }): boolean`
  - `type InitiationDecision = 'opener' | 'followup' | 'skip'`
  - `decideInitiation(opts: { botId: string; now: number; followupSilenceMs: number; messages: PolicyMessage[] | null }): InitiationDecision`
  - `formatDmHistory(messages: DmMessage[], botId: string): DmTurn[]`

- [ ] **Step 1: Add the new test dir to the Vitest include list**

In `vitest.config.ts`, change the `include` array:

```ts
    include: [
      'testing/**/*.test.ts',
      'lib/dream-rift/__tests__/**/*.test.ts',
      'lib/rmhark-ai/__tests__/**/*.test.ts',
    ],
```

- [ ] **Step 2: Write the failing tests**

Create `lib/rmhark-ai/__tests__/dm-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  needsReactiveReply,
  canBotMessage,
  decideInitiation,
  formatDmHistory,
} from '@/lib/rmhark-ai/dm-policy';

const BOT = 'bot-1';
const HUMAN = 'human-1';
const at = (ms: number) => ({ senderId: HUMAN, createdAt: new Date(ms) });

describe('needsReactiveReply', () => {
  it('is false for an empty conversation', () => {
    expect(needsReactiveReply([], BOT)).toBe(false);
  });
  it('is true when the human spoke last', () => {
    expect(
      needsReactiveReply(
        [{ senderId: BOT, createdAt: new Date(1) }, { senderId: HUMAN, createdAt: new Date(2) }],
        BOT,
      ),
    ).toBe(true);
  });
  it('is false when the bot already replied last', () => {
    expect(
      needsReactiveReply(
        [{ senderId: HUMAN, createdAt: new Date(1) }, { senderId: BOT, createdAt: new Date(2) }],
        BOT,
      ),
    ).toBe(false);
  });
});

describe('canBotMessage', () => {
  it('blocks NONE', () => {
    expect(canBotMessage({ dmPrivacy: 'NONE', humanFollowsBot: true })).toBe(false);
  });
  it('allows FOLLOWERS only when the human follows the bot', () => {
    expect(canBotMessage({ dmPrivacy: 'FOLLOWERS', humanFollowsBot: true })).toBe(true);
    expect(canBotMessage({ dmPrivacy: 'FOLLOWERS', humanFollowsBot: false })).toBe(false);
  });
  it('allows EVERYONE', () => {
    expect(canBotMessage({ dmPrivacy: 'EVERYONE', humanFollowsBot: false })).toBe(true);
  });
});

describe('decideInitiation', () => {
  const base = { botId: BOT, now: 1_000_000, followupSilenceMs: 1000 };
  it('opens when there is no conversation', () => {
    expect(decideInitiation({ ...base, messages: null })).toBe('opener');
    expect(decideInitiation({ ...base, messages: [] })).toBe('opener');
  });
  it('skips when the human has ever replied', () => {
    expect(
      decideInitiation({
        ...base,
        messages: [{ senderId: BOT, createdAt: new Date(0) }, at(5)],
      }),
    ).toBe('skip');
  });
  it('follows up once enough silence has passed after a lone opener', () => {
    expect(
      decideInitiation({ ...base, messages: [{ senderId: BOT, createdAt: new Date(0) }] }),
    ).toBe('followup');
  });
  it('skips a lone opener that is still within the silence window', () => {
    expect(
      decideInitiation({ ...base, messages: [{ senderId: BOT, createdAt: new Date(999_500) }] }),
    ).toBe('skip');
  });
  it('gives up after two unanswered bot messages', () => {
    expect(
      decideInitiation({
        ...base,
        messages: [
          { senderId: BOT, createdAt: new Date(0) },
          { senderId: BOT, createdAt: new Date(1) },
        ],
      }),
    ).toBe('skip');
  });
});

describe('formatDmHistory', () => {
  it('labels messages from the bot perspective, preserving order', () => {
    expect(
      formatDmHistory(
        [
          { senderId: HUMAN, content: 'hey' },
          { senderId: BOT, content: 'hi there' },
        ],
        BOT,
      ),
    ).toEqual([
      { from: 'them', text: 'hey' },
      { from: 'you', text: 'hi there' },
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run lib/rmhark-ai/__tests__/dm-policy.test.ts`
Expected: FAIL — cannot resolve `@/lib/rmhark-ai/dm-policy`.

- [ ] **Step 4: Implement the module**

Create `lib/rmhark-ai/dm-policy.ts`:

```ts
/**
 * Pure decision logic for bot direct messages — no Prisma, no I/O, no DeepSeek.
 * Side-effect-free so it is unit-testable and reused by the bot-worker dmTick.
 */

export type DmPrivacy = 'EVERYONE' | 'FOLLOWERS' | 'NONE';

/** Minimal shape of a direct message the policy functions reason about. */
export interface PolicyMessage {
  senderId: string;
  createdAt: Date;
}

/** A direct message with its text, used when formatting history for the model. */
export interface DmMessage {
  senderId: string;
  content: string;
}

/** One labeled turn of a DM conversation, from the bot's point of view. */
export interface DmTurn {
  from: 'them' | 'you';
  text: string;
}

/**
 * Whether a bot owes a reactive reply: true when there is at least one message
 * and the most recent one is NOT from the bot (the human spoke last).
 * `messages` must be ordered oldest-first.
 */
export function needsReactiveReply(messages: PolicyMessage[], botId: string): boolean {
  if (messages.length === 0) return false;
  return messages[messages.length - 1].senderId !== botId;
}

/**
 * Whether a bot may send the FIRST message to a human, per the human's DM
 * privacy. Mirrors app/routes/api/messages.ts.
 */
export function canBotMessage(opts: { dmPrivacy: DmPrivacy; humanFollowsBot: boolean }): boolean {
  switch (opts.dmPrivacy) {
    case 'NONE':
      return false;
    case 'FOLLOWERS':
      return opts.humanFollowsBot;
    case 'EVERYONE':
      return true;
    default:
      return false;
  }
}

export type InitiationDecision = 'opener' | 'followup' | 'skip';

/**
 * Decide whether a bot may initiate (or follow up) with a human, given the
 * existing conversation's messages (oldest-first), or null if none exists.
 *
 *  - No conversation            -> 'opener'
 *  - Human has ever replied     -> 'skip' (active; reactive path handles it)
 *  - One unanswered bot opener  -> 'followup' once enough silence elapsed, else 'skip'
 *  - Two+ unanswered bot msgs   -> 'skip' (give up; never pester further)
 */
export function decideInitiation(opts: {
  botId: string;
  now: number;
  followupSilenceMs: number;
  messages: PolicyMessage[] | null;
}): InitiationDecision {
  const { botId, now, followupSilenceMs, messages } = opts;
  if (!messages || messages.length === 0) return 'opener';

  const humanReplied = messages.some((m) => m.senderId !== botId);
  if (humanReplied) return 'skip';

  if (messages.length >= 2) return 'skip';

  const last = messages[messages.length - 1];
  return now - last.createdAt.getTime() >= followupSilenceMs ? 'followup' : 'skip';
}

/** Label conversation messages as them/you for the model prompt (order preserved). */
export function formatDmHistory(messages: DmMessage[], botId: string): DmTurn[] {
  return messages.map((m) => ({
    from: m.senderId === botId ? 'you' : 'them',
    text: m.content,
  }));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run lib/rmhark-ai/__tests__/dm-policy.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Lint**

Run: `pnpm exec eslint lib/rmhark-ai/dm-policy.ts lib/rmhark-ai/__tests__/dm-policy.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/rmhark-ai/dm-policy.ts lib/rmhark-ai/__tests__/dm-policy.test.ts vitest.config.ts
git commit -m "feat(bot-worker): pure DM policy (privacy, reactive, anti-pester)"
```

---

### Task 2: Internal request authorization helper

A reusable shared-secret gate for server-to-server internal endpoints.

**Files:**
- Create: `lib/internal-auth.ts`
- Create: `lib/__tests__/internal-auth.test.ts`
- Modify: `vitest.config.ts` (add `lib/__tests__/**` to `include`)

**Interfaces:**
- Consumes: nothing.
- Produces: `authorizeInternalRequest(provided: string | null, configured: string | undefined): { ok: true } | { ok: false; status: 401 | 503 }`

- [ ] **Step 1: Add the test dir to the Vitest include list**

In `vitest.config.ts`, add to `include`:

```ts
      'lib/__tests__/**/*.test.ts',
```

- [ ] **Step 2: Write the failing tests**

Create `lib/__tests__/internal-auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { authorizeInternalRequest } from '@/lib/internal-auth';

describe('authorizeInternalRequest', () => {
  it('503 when no secret is configured (feature disabled)', () => {
    expect(authorizeInternalRequest('anything', undefined)).toEqual({ ok: false, status: 503 });
    expect(authorizeInternalRequest('anything', '')).toEqual({ ok: false, status: 503 });
  });
  it('401 when the header is missing', () => {
    expect(authorizeInternalRequest(null, 'sekret')).toEqual({ ok: false, status: 401 });
  });
  it('401 when the header does not match', () => {
    expect(authorizeInternalRequest('nope', 'sekret')).toEqual({ ok: false, status: 401 });
  });
  it('ok when the header matches', () => {
    expect(authorizeInternalRequest('sekret', 'sekret')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run lib/__tests__/internal-auth.test.ts`
Expected: FAIL — cannot resolve `@/lib/internal-auth`.

- [ ] **Step 4: Implement the helper**

Create `lib/internal-auth.ts`:

```ts
/**
 * Authorize a server-to-server internal request by shared secret.
 *  - configured secret missing/empty -> 503 (the internal API is disabled)
 *  - provided header missing or mismatched -> 401
 *  - otherwise -> ok
 */
export function authorizeInternalRequest(
  provided: string | null,
  configured: string | undefined,
): { ok: true } | { ok: false; status: 401 | 503 } {
  if (!configured) return { ok: false, status: 503 };
  if (!provided || provided !== configured) return { ok: false, status: 401 };
  return { ok: true };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run lib/__tests__/internal-auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint**

Run: `pnpm exec eslint lib/internal-auth.ts lib/__tests__/internal-auth.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/internal-auth.ts lib/__tests__/internal-auth.test.ts vitest.config.ts
git commit -m "feat: shared-secret authorizer for internal endpoints"
```

---

### Task 3: DeepSeek DM generators

Add DM reply + opener generators to the existing AI module, reusing `chat()`, persona framing, and `cleanGeneratedText`.

**Files:**
- Modify: `lib/rmhark-ai/generate.server.ts` (append a "Direct messages" section after the Replies section, ~line 196)
- Create: `lib/rmhark-ai/__tests__/generate-dm.test.ts`

**Interfaces:**
- Consumes: `chat()` (internal), `MAX_REPLY_CHARS`, `cleanGeneratedText` (from `./persona`), `isRmharkAIConfigured`.
- Produces:
  - `generateDirectMessageReply(opts: { persona: string; history: { from: 'them' | 'you'; text: string }[] }): Promise<string>`
  - `generateDirectMessageOpener(opts: { persona: string }): Promise<string>`

- [ ] **Step 1: Write the failing tests**

Create `lib/rmhark-ai/__tests__/generate-dm.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture the mocked DeepSeek call so tests can inspect prompts & set replies.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(() => ({ chat: { completions: { create: createMock } } })),
}));

import {
  generateDirectMessageReply,
  generateDirectMessageOpener,
} from '@/lib/rmhark-ai/generate.server';

const reply = (content: string) =>
  createMock.mockResolvedValueOnce({ choices: [{ message: { content } }] });

beforeEach(() => {
  createMock.mockReset();
  process.env.DEEPSEEK_API_KEY = 'test-key';
});

describe('generateDirectMessageReply', () => {
  it('puts the persona in the system prompt and the labeled transcript in the user prompt', async () => {
    reply('sounds good!');
    const out = await generateDirectMessageReply({
      persona: 'THEME: vintage synths.',
      history: [
        { from: 'them', text: 'hey do you gig?' },
        { from: 'you', text: 'sometimes' },
      ],
    });
    expect(out).toBe('sounds good!');
    const [{ messages }] = createMock.mock.calls[0];
    const system = messages.find((m: any) => m.role === 'system').content;
    const user = messages.find((m: any) => m.role === 'user').content;
    expect(system).toContain('THEME: vintage synths.');
    expect(system).toMatch(/never reveal/i);
    expect(user).toContain('Them: hey do you gig?');
    expect(user).toContain('You: sometimes');
  });

  it('clamps output to the reply char limit', async () => {
    reply('x'.repeat(900));
    const out = await generateDirectMessageReply({ persona: 'p', history: [] });
    expect(out.length).toBeLessThanOrEqual(500);
  });
});

describe('generateDirectMessageOpener', () => {
  it('asks the model to open a new conversation in persona', async () => {
    reply('hey! love your last post');
    const out = await generateDirectMessageOpener({ persona: 'THEME: trail running.' });
    expect(out).toBe('hey! love your last post');
    const [{ messages }] = createMock.mock.calls[0];
    const system = messages.find((m: any) => m.role === 'system').content;
    const user = messages.find((m: any) => m.role === 'user').content;
    expect(system).toContain('THEME: trail running.');
    expect(user).toMatch(/start a new .*conversation/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run lib/rmhark-ai/__tests__/generate-dm.test.ts`
Expected: FAIL — `generateDirectMessageReply` / `generateDirectMessageOpener` are not exported.

- [ ] **Step 3: Implement the generators**

In `lib/rmhark-ai/generate.server.ts`, after the Replies section (after `generateReply` ends near line 196), add:

```ts
/* ------------------------------------------------------------------ */
/*  Direct messages                                                    */
/* ------------------------------------------------------------------ */

const BASE_DM_RULES = [
  'This is a private one-to-one direct message (DM), not a public post.',
  `Hard limit: ${MAX_REPLY_CHARS} characters; most DMs are a sentence or two.`,
  'Write like a real person messaging privately: warm, specific, conversational. You may ask a question back.',
  'Do NOT use markdown, do NOT wrap the message in quotes, do NOT add a label. Output ONLY the message text.',
].join(' ');

/** Shared in-character system prompt for DMs (persona + never-reveal + rules). */
function dmPersonaSystem(persona: string): string {
  return [
    'You are roleplaying as a specific person chatting in private DMs. Stay completely in character.',
    'Never reveal or hint that you are an AI, a bot, or generated. You are just a person.',
    'Follow this persona exactly, including the VOICE rules (formality, quirks, and any typos):',
    '',
    persona,
    '',
    BASE_DM_RULES,
  ].join('\n');
}

/**
 * Generate an in-character reply to a private DM conversation. `history` is the
 * recent message chain labeled from the bot's perspective (them = the other
 * person, you = the bot), oldest first.
 */
export async function generateDirectMessageReply(opts: {
  persona: string;
  history: { from: 'them' | 'you'; text: string }[];
}): Promise<string> {
  const transcript = opts.history
    .map((t) => `${t.from === 'you' ? 'You' : 'Them'}: ${t.text}`)
    .join('\n');
  const user = [
    'Here is your DM conversation so far (oldest first):',
    transcript || '(no messages yet)',
    '',
    'Write your next message as the most recent reply. Output only the message.',
  ].join('\n');

  const raw = await chat(
    [
      { role: 'system', content: dmPersonaSystem(opts.persona) },
      { role: 'user', content: user },
    ],
    { maxTokens: 300, temperature: 1.0 },
  );
  return cleanGeneratedText(raw, MAX_REPLY_CHARS);
}

/** Generate a short, natural opening DM in the bot's voice (no prior context). */
export async function generateDirectMessageOpener(opts: { persona: string }): Promise<string> {
  const user = [
    'Start a new private conversation with someone on the same social platform.',
    'Open naturally and briefly — a friendly hello, a small question, or a light comment in your voice.',
    'Output only the message.',
  ].join('\n');

  const raw = await chat(
    [
      { role: 'system', content: dmPersonaSystem(opts.persona) },
      { role: 'user', content: user },
    ],
    { maxTokens: 200, temperature: 1.1 },
  );
  return cleanGeneratedText(raw, MAX_REPLY_CHARS);
}
```

Confirm `MAX_REPLY_CHARS` and `cleanGeneratedText` are already imported from `./persona` at the top of the file (they are — used by `generateReply`). No new imports needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run lib/rmhark-ai/__tests__/generate-dm.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm exec eslint lib/rmhark-ai/generate.server.ts lib/rmhark-ai/__tests__/generate-dm.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/rmhark-ai/generate.server.ts lib/rmhark-ai/__tests__/generate-dm.test.ts
git commit -m "feat(rmhark-ai): DeepSeek DM reply + opener generators"
```

---

### Task 4: Internal notify-message endpoint

A web route the worker calls to push a `new-message` SSE event from inside the web process.

**Files:**
- Create: `app/routes/api/internal/notify-message.ts`

**Interfaces:**
- Consumes: `authorizeInternalRequest` (Task 2), `notifyUser` + `MessagePayload` (`@/lib/message-events`).
- Produces: `POST /api/internal/notify-message` — header `x-internal-secret`, body `{ userId, message }`.

- [ ] **Step 1: Implement the route**

Create `app/routes/api/internal/notify-message.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { notifyUser, type MessagePayload } from '@/lib/message-events';
import { authorizeInternalRequest } from '@/lib/internal-auth';

const bodySchema = z.object({
  userId: z.string().min(1),
  message: z.object({
    id: z.string(),
    conversationId: z.string(),
    content: z.string(),
    senderId: z.string(),
    read: z.boolean(),
    createdAt: z.string(),
  }),
});

/** POST /api/internal/notify-message — server-to-server SSE fan-out for bot DMs. */
export const Route = createFileRoute('/api/internal/notify-message')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = authorizeInternalRequest(
          request.headers.get('x-internal-secret'),
          process.env.INTERNAL_API_SECRET,
        );
        if (!authz.ok) {
          return Response.json({ error: 'Unauthorized' }, { status: authz.status });
        }

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: 'Invalid input' }, { status: 400 });
        }

        notifyUser(parsed.data.userId, {
          type: 'new-message',
          message: parsed.data.message as MessagePayload,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
```

- [ ] **Step 2: Regenerate the route tree / verify it compiles in dev**

The TanStack route tree is generated on dev/build. Start dev (or the web app alone) and confirm no route-tree or type error for the new file:

Run: `pnpm exec eslint app/routes/api/internal/notify-message.ts`
Expected: no errors. (Route-tree regeneration happens automatically under `vite dev`; if a `routeTree.gen.ts` diff appears, include it in the commit.)

- [ ] **Step 3: Manual smoke (optional but recommended)**

With the web app running and `INTERNAL_API_SECRET=devsecret` in `.env`:

```bash
# wrong/missing secret -> 401; with a valid body + secret -> {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:7005/api/internal/notify-message \
  -H 'content-type: application/json' -d '{"userId":"x","message":{"id":"1","conversationId":"c","content":"hi","senderId":"b","read":false,"createdAt":"2026-06-19T00:00:00.000Z"}}'
# expect 401 (no x-internal-secret header)
```

Expected: `401`. Re-run with `-H 'x-internal-secret: devsecret'` → `200`.

- [ ] **Step 4: Commit**

```bash
git add app/routes/api/internal/notify-message.ts
# include routeTree.gen.ts only if it changed:
git add -A app/routeTree.gen.ts 2>/dev/null || true
git commit -m "feat(api): internal notify-message endpoint for bot DM SSE push"
```

---

### Task 5: Bot-worker dmTick orchestration

Wire reactive replies + rare initiated openers into the worker, plus the notify bridge, config, and `.env.example` docs. This task has no new unit tests (it is Prisma/network orchestration over already-tested pure logic); verify by lint + a worker boot smoke + manual DM.

**Files:**
- Modify: `server/bot-worker/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `generateDirectMessageReply`, `generateDirectMessageOpener` (Task 3); `needsReactiveReply`, `canBotMessage`, `decideInitiation`, `formatDmHistory` (Task 1); `type MessagePayload` (`@/lib/message-events`); existing `getPersona`, `shuffle`, `randomItem`, `intEnv`, `probEnv`, `prisma`, `log`, `errlog`.
- Produces: `dmTick()`, started on `dmTimer`.

- [ ] **Step 1: Extend imports**

In `server/bot-worker/index.ts`, extend the existing import blocks:

```ts
import {
  generateBotProfile,
  generatePost,
  generateReply,
  generateDirectMessageReply,
  generateDirectMessageOpener,
  isRmharkAIConfigured,
} from '@/lib/rmhark-ai/generate.server';
import {
  needsReactiveReply,
  canBotMessage,
  decideInitiation,
  formatDmHistory,
  type DmPrivacy,
} from '@/lib/rmhark-ai/dm-policy';
import type { MessagePayload } from '@/lib/message-events';
```

- [ ] **Step 2: Add DM config constants**

After the reply-behaviour config block (after line 72, `PROACTIVE_LOOKBACK_MS`), add:

```ts
// ─── DM behaviour ───────────────────────────────────────────────
// How often the worker services DMs (snappier than the feed tick).
const DM_TICK_MS = intEnv('BOT_DM_TICK_MS', 60 * 1000);
// Only react to human DMs whose conversation moved within this window (default 24h).
const DM_LOOKBACK_MS = intEnv('BOT_DM_LOOKBACK_MS', 24 * 60 * 60 * 1000);
// Cap reactive DM replies created per tick (protects the DB + paid API).
const MAX_DM_REPLIES_PER_TICK = intEnv('BOT_MAX_DM_REPLIES_PER_TICK', 4);
// Probability a bot answers a human's DM (a DM expects an answer).
const REACTIVE_DM_PROB = probEnv('BOT_REACTIVE_DM_PROB', 1.0);
// Probability per tick that any bot-initiated opener happens at all.
const DM_INITIATE_PROB = probEnv('BOT_DM_INITIATE_PROB', 0.15);
// Cap bot-initiated openers per tick.
const MAX_DM_OPENERS_PER_TICK = intEnv('BOT_MAX_DM_OPENERS_PER_TICK', 1);
// Silence after a lone opener before one gentle follow-up (default 3 days).
const DM_FOLLOWUP_SILENCE_MS = intEnv('BOT_DM_FOLLOWUP_SILENCE_MS', 3 * 24 * 60 * 60 * 1000);
// Window defining "recently-active" candidate humans for openers (default 7 days).
const DM_ACTIVE_HUMAN_LOOKBACK_MS = intEnv('BOT_DM_ACTIVE_HUMAN_LOOKBACK_MS', 7 * 24 * 60 * 60 * 1000);
```

- [ ] **Step 3: Add the notify bridge + shared DM-send helper**

After the `getPersona` helper (after line 258), add:

```ts
// ─── DMs ────────────────────────────────────────────────────────

/** Resolve the web origin the worker calls for the SSE notify bridge. */
function internalApiBase(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/$/, '');
  const auth = process.env.BETTER_AUTH_URL;
  if (auth) {
    try {
      return new URL(auth).origin;
    } catch {
      /* fall through */
    }
  }
  return 'http://127.0.0.1:7005';
}

/**
 * Push a live SSE event for a bot DM into the web process. Best-effort: if the
 * secret is unset or the call fails, the message is already persisted and the
 * human will see it on their next stream reconnect.
 */
async function notifyMessageDelivered(userId: string, message: MessagePayload): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return; // bridge disabled — graceful degradation
  try {
    await fetch(`${internalApiBase()}/api/internal/notify-message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ userId, message }),
    });
  } catch (e) {
    errlog('notify bridge failed:', e);
  }
}

/** Create one DM from `botId`, bump the conversation, and push the live event. */
async function sendBotDm(
  conversationId: string,
  botId: string,
  humanId: string,
  content: string,
): Promise<void> {
  const [message] = await prisma.$transaction([
    prisma.directMessage.create({ data: { conversationId, senderId: botId, content } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } }),
  ]);
  const payload: MessagePayload = {
    id: message.id,
    conversationId,
    content: message.content,
    senderId: message.senderId,
    read: message.read,
    createdAt: message.createdAt.toISOString(),
  };
  await notifyMessageDelivered(humanId, payload);
}
```

- [ ] **Step 4: Add reactive DM replies**

Append after the helper from Step 3:

```ts
/**
 * Reactive DM replies: when a human's message is the latest in a conversation
 * with a bot, the bot replies in-character. No privacy check — the human opened
 * the conversation by messaging the bot.
 */
async function answerDirectMessages(): Promise<number> {
  const since = new Date(Date.now() - DM_LOOKBACK_MS);
  const conversations = await prisma.conversation.findMany({
    where: {
      lastMessageAt: { gte: since },
      OR: [
        { participantOne: { is: { isBot: true } } },
        { participantTwo: { is: { isBot: true } } },
      ],
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 60,
    select: {
      id: true,
      participantOneId: true,
      participantTwoId: true,
      participantOne: { select: { isBot: true } },
      participantTwo: { select: { isBot: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { senderId: true } },
    },
  });

  // Keep conversations where exactly one participant is a bot and the human spoke last.
  const candidates = conversations
    .map((c) => {
      const oneBot = !!c.participantOne?.isBot;
      const twoBot = !!c.participantTwo?.isBot;
      if (oneBot === twoBot) return null; // both bots or neither — skip
      const botId = oneBot ? c.participantOneId : c.participantTwoId;
      const humanId = oneBot ? c.participantTwoId : c.participantOneId;
      const last = c.messages[0];
      if (!last || last.senderId === botId) return null; // nothing new from the human
      return { conversationId: c.id, botId, humanId };
    })
    .filter((x): x is { conversationId: string; botId: string; humanId: string } => x !== null);

  let made = 0;
  for (const cand of shuffle(candidates)) {
    if (made >= MAX_DM_REPLIES_PER_TICK) break;
    if (Math.random() > REACTIVE_DM_PROB) continue;
    try {
      const persona = await getPersona(cand.botId);
      if (!persona) continue;

      const recent = await prisma.directMessage.findMany({
        where: { conversationId: cand.conversationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { senderId: true, content: true },
      });
      const history = formatDmHistory(recent.reverse(), cand.botId);

      const content = await generateDirectMessageReply({ persona, history });
      if (!content.trim()) continue;

      await sendBotDm(cand.conversationId, cand.botId, cand.humanId, content);
      made++;
      log(`bot ${cand.botId} answered DM from ${cand.humanId}`);
    } catch (e) {
      errlog('reactive DM failed:', e);
    }
  }
  return made;
}
```

- [ ] **Step 5: Add bot-initiated openers**

Append after `answerDirectMessages`:

```ts
/** Canonical participant ordering for the Conversation unique constraint. */
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Bot-initiated DMs: rarely, a bot opens (or gently follows up) a DM with a
 * recently-active human, respecting DM privacy and the anti-pester rules.
 */
async function initiateDirectMessages(): Promise<void> {
  if (Math.random() > DM_INITIATE_PROB) return;

  const since = new Date(Date.now() - DM_ACTIVE_HUMAN_LOOKBACK_MS);
  const [recentPosts, recentComments, bots] = await Promise.all([
    prisma.rMHark.findMany({
      where: { createdAt: { gte: since }, deletedAt: null, user: { is: { isBot: false } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { userId: true },
    }),
    prisma.rMHarkComment.findMany({
      where: { createdAt: { gte: since }, deletedAt: null, user: { is: { isBot: false } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { userId: true },
    }),
    prisma.user.findMany({ where: { isBot: true }, select: { id: true, botPersona: true } }),
  ]);
  if (bots.length === 0) return;

  const humanIds = shuffle([
    ...new Set([...recentPosts, ...recentComments].map((r) => r.userId)),
  ]);
  if (humanIds.length === 0) return;

  let opened = 0;
  for (const humanId of humanIds) {
    if (opened >= MAX_DM_OPENERS_PER_TICK) break;

    const bot = randomItem(bots);
    if (!bot.botPersona || bot.id === humanId) continue;

    try {
      // Privacy gate (mirrors app/routes/api/messages.ts).
      const human = await prisma.user.findUnique({
        where: { id: humanId },
        select: { profile: { select: { dmPrivacy: true } } },
      });
      const dmPrivacy = (human?.profile?.dmPrivacy ?? 'EVERYONE') as DmPrivacy;
      let humanFollowsBot = false;
      if (dmPrivacy === 'FOLLOWERS') {
        const follows = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: humanId, followingId: bot.id } },
          select: { id: true },
        });
        humanFollowsBot = !!follows;
      }
      if (!canBotMessage({ dmPrivacy, humanFollowsBot })) continue;

      // Anti-pester gate, from the existing conversation (if any).
      const [pOne, pTwo] = orderPair(bot.id, humanId);
      const existing = await prisma.conversation.findUnique({
        where: { participantOneId_participantTwoId: { participantOneId: pOne, participantTwoId: pTwo } },
        select: {
          id: true,
          messages: { orderBy: { createdAt: 'asc' }, take: 10, select: { senderId: true, createdAt: true } },
        },
      });
      const decision = decideInitiation({
        botId: bot.id,
        now: Date.now(),
        followupSilenceMs: DM_FOLLOWUP_SILENCE_MS,
        messages: existing ? existing.messages : null,
      });
      if (decision === 'skip') continue;

      const content = await generateDirectMessageOpener({ persona: bot.botPersona });
      if (!content.trim()) continue;

      const conversation = await prisma.conversation.upsert({
        where: { participantOneId_participantTwoId: { participantOneId: pOne, participantTwoId: pTwo } },
        create: { participantOneId: pOne, participantTwoId: pTwo },
        update: {},
        select: { id: true },
      });

      await sendBotDm(conversation.id, bot.id, humanId, content);
      opened++;
      log(`bot ${bot.id} ${decision === 'followup' ? 'followed up with' : 'opened DM to'} ${humanId}`);
    } catch (e) {
      errlog('DM initiation failed:', e);
    }
  }
}
```

- [ ] **Step 6: Add the dmTick orchestrator**

Add after `replyTick` (after line 396):

```ts
async function dmTick(): Promise<void> {
  personaCache.clear();
  await answerDirectMessages();
  await initiateDirectMessages();
}
```

- [ ] **Step 7: Add the re-entrancy guard, timer, startup, and shutdown wiring**

In the Loops section, add the timer + flag alongside the others:

```ts
let dmTimer: NodeJS.Timeout | undefined;
```
```ts
let replying = false;
let dmRunning = false;
```

Add the guard next to `safeReplyTick`:

```ts
async function safeDmTick() {
  if (dmRunning) return;
  dmRunning = true;
  try {
    await dmTick();
  } catch (e) {
    errlog('dm tick failed:', e);
  } finally {
    dmRunning = false;
  }
}
```

In `startup()`, update the config log and schedule the timer after `replyTimer`:

```ts
  log(
    `config: target=${TARGET_BOT_COUNT}, postTick=${POST_TICK_MS}ms, replyTick=${REPLY_TICK_MS}ms, dmTick=${DM_TICK_MS}ms, userCheck=${USER_CHECK_MS}ms`,
  );
```
```ts
  replyTimer = setInterval(() => void safeReplyTick(), REPLY_TICK_MS);
  dmTimer = setInterval(() => void safeDmTick(), DM_TICK_MS);
```

In `shutdown()`, clear it:

```ts
  if (replyTimer) clearInterval(replyTimer);
  if (dmTimer) clearInterval(dmTimer);
```

- [ ] **Step 8: Document the new env vars**

In `.env.example`, in the bot-worker / RMHark AI section (near the `BOT_POST_TICK_MS` docs around line 133), add:

```bash
# ─── Bot DM responses (optional; bots answer & occasionally start DMs) ───
#   BOT_DM_TICK_MS                  — how often the worker services DMs (default: 60000 = 60s).
#   BOT_DM_LOOKBACK_MS              — only react to DMs moved within this window (default: 86400000 = 24h).
#   BOT_MAX_DM_REPLIES_PER_TICK     — cap reactive DM replies per tick (default: 4).
#   BOT_REACTIVE_DM_PROB            — probability a bot answers a human DM (default: 1.0).
#   BOT_DM_INITIATE_PROB            — probability any opener happens per tick (default: 0.15).
#   BOT_MAX_DM_OPENERS_PER_TICK     — cap bot-initiated openers per tick (default: 1).
#   BOT_DM_FOLLOWUP_SILENCE_MS      — silence before one gentle follow-up (default: 259200000 = 3d).
#   BOT_DM_ACTIVE_HUMAN_LOOKBACK_MS — window defining recently-active candidate humans (default: 604800000 = 7d).
#
# Live SSE push from the worker to the web app requires the internal bridge.
# If INTERNAL_API_SECRET is unset, DMs still send but appear on the recipient's
# next stream reconnect instead of instantly.
#   INTERNAL_API_URL    — web origin the worker POSTs (default: origin of BETTER_AUTH_URL, else http://127.0.0.1:7005).
INTERNAL_API_SECRET=
```

- [ ] **Step 9: Lint the worker**

Run: `pnpm exec eslint server/bot-worker/index.ts`
Expected: no errors.

- [ ] **Step 10: Worker boot smoke (no DeepSeek key needed)**

With `DEEPSEEK_API_KEY` unset, the worker must still import and idle cleanly (proves no import/type errors in the new code):

Run: `pnpm exec tsx server/bot-worker/index.ts`
Expected: logs `Starting…` then `DEEPSEEK_API_KEY not set — idling`, and the process stays up. Ctrl-C to stop.

- [ ] **Step 11: Manual end-to-end (recommended, requires DeepSeek key + DB)**

1. Set `DEEPSEEK_API_KEY` and `INTERNAL_API_SECRET=devsecret` in `.env`.
2. Run `pnpm dev` (starts web on 7005 + bot-worker). Wait for the pool to mint bots.
3. As a logged-in human, open a DM to a bot user and send a message.
4. Within ~1 tick (≤60s) the bot replies in its persona, and the reply appears live in the open conversation (SSE), not only on refresh.

- [ ] **Step 12: Commit**

```bash
git add server/bot-worker/index.ts .env.example
git commit -m "feat(bot-worker): bots answer and initiate DMs via DeepSeek"
```

---

## Self-Review Notes

**Spec coverage:**
- Worker `dmTick` + own interval → Task 5 (Steps 2,6,7). ✓
- Internal notify bridge (worker → web) → Task 2 (auth) + Task 4 (route) + Task 5 Step 3. ✓
- DM generators reusing persona → Task 3; persona passed through `getPersona`/`botPersona` → Task 5 Steps 4,5. ✓
- Reactive replies (always-on, history, no privacy check) → Task 5 Step 4 + Task 1 `needsReactiveReply`/`formatDmHistory`. ✓
- Initiated openers: privacy + anti-pester + canonical conversation creation + rare volume → Task 5 Step 5 + Task 1 `canBotMessage`/`decideInitiation`. ✓
- No schema migration → confirmed; all reads over existing models. ✓
- Env knobs via `intEnv`/`probEnv` + `.env.example` docs → Task 5 Steps 2,8. ✓
- Graceful degradation when `INTERNAL_API_SECRET` / `DEEPSEEK_API_KEY` unset → Task 5 Step 3 (`notifyMessageDelivered` early return) + Step 10 smoke. ✓

**Type consistency:** `MessagePayload` (message-events) used in route + worker; `DmTurn`/`from` union shared between `formatDmHistory` (Task 1) and `generateDirectMessageReply` (Task 3); `DmPrivacy` from Task 1 reused in Task 5; conversation upsert key `participantOneId_participantTwoId` matches schema. ✓

**Placeholder scan:** none — every step shows concrete code/commands. ✓
