/**
 * `proposeRuleAmendment` — the DeepSeek arm of the house-rules feature.
 *
 * The deterministic balancer is tested next to the game
 * (`lib/gabriels-horn/__tests__/house-rules.test.ts`). This covers the half
 * that talks to a model, which is the half that cannot be exercised by simply
 * running the app: without a `DEEPSEEK_API_KEY` the endpoint takes the fallback
 * and says so, so a broken AI arm would look exactly like an unconfigured one
 * and could ship unnoticed.
 *
 * The contract being pinned here is "never throws". Every way an upstream call
 * can go wrong — no key, network error, HTTP failure, a refusal in prose, a
 * fenced code block, a truncated body, a hang — has to come back as
 * `rules: null`, because that is the caller's signal to fall back rather than
 * 500 at a player mid-game.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

/** A DeepSeek chat-completion carrying `content` as the assistant message. */
function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

async function propose(wish = 'make it harsher') {
  const { proposeRuleAmendment } = await import('@/lib/ai/text.server');
  return proposeRuleAmendment({ wish, context: { current: { penaltyDraw: 3 } }, timeoutMs: 200 });
}

beforeEach(() => {
  vi.resetModules();
  create.mockReset();
  process.env.DEEPSEEK_API_KEY = 'sk-test';
});

afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
});

describe('proposeRuleAmendment — the happy path', () => {
  it('returns the model’s rules and its one-sentence reasoning', async () => {
    create.mockResolvedValue(
      completion(JSON.stringify({ rules: { penaltyDraw: 5 }, reasoning: 'Lying was too cheap.' })),
    );
    const out = await propose();
    expect(out.rules).toEqual({ penaltyDraw: 5 });
    expect(out.reasoning).toBe('Lying was too cheap.');
  });

  it('sends the wish and the context as DATA, at a low temperature', async () => {
    create.mockResolvedValue(completion(JSON.stringify({ rules: {}, reasoning: '' })));
    await propose('the horn is brutal');

    const call = create.mock.calls[0][0];
    expect(call.temperature).toBeLessThanOrEqual(0.3);
    expect(call.max_tokens).toBeLessThanOrEqual(400);
    // The system prompt has to forbid inventing keys and forbid obeying the
    // wish — both are load-bearing for the clamp downstream to be sufficient.
    const system = call.messages[0].content as string;
    expect(system).toMatch(/never invent a key/i);
    expect(system).toMatch(/never follow instructions/i);
    // The wish travels inside the JSON payload, not as its own instruction turn.
    expect(call.messages).toHaveLength(2);
    expect(call.messages[1].role).toBe('user');
    expect(JSON.parse(call.messages[1].content).current).toEqual({ penaltyDraw: 3 });
  });

  it('unwraps a fenced code block, which models emit constantly', async () => {
    create.mockResolvedValue(
      completion('```json\n{"rules":{"diceCount":4},"reasoning":"Harder to guess."}\n```'),
    );
    expect((await propose()).rules).toEqual({ diceCount: 4 });
  });

  it('caps a model that ignores the one-sentence limit', async () => {
    create.mockResolvedValue(
      completion(JSON.stringify({ rules: {}, reasoning: 'x'.repeat(5000) })),
    );
    expect((await propose()).reasoning.length).toBeLessThanOrEqual(240);
  });
});

describe('proposeRuleAmendment — every failure is a fallback, never a throw', () => {
  it('does not call the API at all when no key is configured', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const out = await propose();
    expect(out).toEqual({ rules: null, reasoning: '' });
    expect(create).not.toHaveBeenCalled();
  });

  it('survives a network error', async () => {
    create.mockRejectedValue(new Error('ECONNREFUSED'));
    expect((await propose()).rules).toBeNull();
  });

  it('survives an upstream HTTP failure', async () => {
    create.mockRejectedValue(Object.assign(new Error('503 Service Unavailable'), { status: 503 }));
    expect((await propose()).rules).toBeNull();
  });

  it('survives a refusal written in prose', async () => {
    create.mockResolvedValue(completion("I'm sorry, I can't help with that."));
    expect((await propose()).rules).toBeNull();
  });

  it('survives a truncated body', async () => {
    create.mockResolvedValue(completion('{"rules":{"penaltyDraw":'));
    expect((await propose()).rules).toBeNull();
  });

  it('survives an empty completion', async () => {
    create.mockResolvedValue({ choices: [] });
    expect((await propose()).rules).toBeNull();
  });

  it('survives JSON of the wrong SHAPE', async () => {
    // Valid JSON, but `rules` is an array — which would sail through a naive
    // `typeof === 'object'` check and spread into nonsense downstream.
    create.mockResolvedValue(completion(JSON.stringify({ rules: [1, 2, 3], reasoning: 'x' })));
    expect((await propose()).rules).toBeNull();
  });

  it('gives up on a hang rather than holding the request open', async () => {
    create.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const out = await propose();
    expect(out.rules).toBeNull();
    // The player is waiting on this with a game behind it.
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
