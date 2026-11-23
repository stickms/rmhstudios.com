/**
 * `runTask({ thinking: true })`: the request carries DeepSeek's thinking switch and no temperature, only `content` comes
 * back, and `reasoning_content` is never returned, metered or logged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn(), usage: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: h.create } };
  },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: { aiUsage: { create: h.usage } } }));

import { runTask } from '@/lib/ai/provider.server';

const REPLY = {
  choices: [{ message: { content: ' {"ok":true} ', reasoning_content: 'SECRET-REASONING' } }],
  usage: { prompt_tokens: 100, completion_tokens: 5000 },
};
beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = 'k';
  h.create.mockReset().mockResolvedValue(REPLY);
  h.usage.mockReset().mockResolvedValue({});
});

describe('runTask thinking', () => {
  it('sends thinking enabled, no temperature, JSON mode and the per-request timeout', async () => {
    const out = await runTask('medschools-qa', 's', 'u', { json: true, thinking: true, maxTokens: 8000, timeoutMs: 120_000 });
    const [body, req] = h.create.mock.calls[0]!;
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect('temperature' in body).toBe(false);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(8000);
    expect(req.timeout).toBe(120_000);
    expect(out).toBe('{"ok":true}');
  });
  it('keeps thinking off and temperature on by default', async () => {
    await runTask('medschools-qa', 's', 'u', { json: true });
    const [body, req] = h.create.mock.calls[0]!;
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(typeof body.temperature).toBe('number');
    expect('timeout' in req).toBe(false);
  });
  it('never returns, meters or logs the reasoning, and bills its tokens as output', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
    const out = await runTask('medschools-qa', 's', 'u', { thinking: true, userId: 'u1' });
    await new Promise((r) => setTimeout(r, 0));
    expect(out).not.toContain('SECRET-REASONING');
    expect(JSON.stringify(h.usage.mock.calls)).not.toContain('SECRET-REASONING');
    expect(h.usage.mock.calls[0]![0].data).toMatchObject({ task: 'medschools-qa', outTokens: 5000, ok: true });
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain('SECRET-REASONING');
  });
});
