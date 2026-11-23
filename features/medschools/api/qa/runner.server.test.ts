import { beforeEach, describe, expect, it, vi } from 'vitest';

const runTask = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai/provider.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/provider.server')>('@/lib/ai/provider.server').catch(
    () => null,
  );
  return { runTask, jsonFromModelText: actual?.jsonFromModelText ?? ((s: string) => JSON.parse(s)) };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { aiRunner } from './runner.server';

beforeEach(() => runTask.mockReset().mockResolvedValue('{"segments":[],"thin":false}'));

describe('aiRunner thinking (R20)', () => {
  it('route never thinks', async () => {
    await aiRunner.route('s', 'u', 'u1');
    const o = runTask.mock.calls[0]![3] as Record<string, unknown>;
    expect(o.thinking).toBeUndefined();
    expect(runTask.mock.calls[0]![0]).toBe('medschools-qa');
  });
  it('answer thinks only when asked, under the same task, still in JSON mode', async () => {
    await aiRunner.answer('s', 'u', 'u1', undefined, { think: false });
    await aiRunner.answer('s', 'u', 'u1');
    for (const c of runTask.mock.calls) expect((c[3] as Record<string, unknown>).thinking).toBeUndefined();
    await aiRunner.answer('s', 'u', 'u1', undefined, { think: true });
    const [task, , , o] = runTask.mock.calls[2]!;
    expect(task).toBe('medschools-qa');
    expect(o).toMatchObject({ thinking: true, json: true, maxRetries: 0, timeoutMs: 90_000 });
    expect((o as { maxTokens: number }).maxTokens).toBeGreaterThan(900);
  });
  it('parses the thinking answer as the same segments JSON', async () => {
    runTask.mockResolvedValue('```json\n{"segments":[{"text":"a","cites":["f1"]}],"thin":false}\n```');
    expect(await aiRunner.answer('s', 'u', 'u1', undefined, { think: true })).toEqual({
      segments: [{ text: 'a', cites: ['f1'] }],
      thin: false,
    });
  });
});
