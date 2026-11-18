/**
 * Build metering (streamModel writes one ledger row per provider call) and the preview
 * builder's lifecycle (createPreviewer). Prisma and the provider client are faked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ aiUsage: { create: vi.fn() } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: db }));

import { createPreviewer, streamModel } from '@/lib/rmhvibe/vibe.server';

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeClient(chunks: unknown[], fail = false) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          if (fail) throw new Error('boom');
          return (async function* () {
            for (const c of chunks) yield c;
          })();
        }),
      },
    },
  } as never;
}
const delta = (content: string, reasoning?: string) => ({
  choices: [{ delta: { content, reasoning_content: reasoning }, finish_reason: null }],
});

async function drain(gen: AsyncGenerator<unknown, unknown>) {
  let step = await gen.next();
  while (!step.done) step = await gen.next();
  return step.value;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('streamModel metering', () => {
  it('writes the provider-reported usage with the real provider and user', async () => {
    const client = fakeClient([delta('hello'), { choices: [], usage: { prompt_tokens: 111, completion_tokens: 222 } }]);
    await drain(streamModel(client, 'kimi-k2.7-code', [{ role: 'user', content: 'x' }], { userId: 'u1', provider: 'kimi' }));
    await flush();
    const arg = (client as { chat: { completions: { create: { mock: { calls: unknown[][] } } } } }).chat.completions.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.stream_options).toEqual({ include_usage: true });
    expect(db.aiUsage.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'u1',
      task: 'vibe',
      provider: 'kimi',
      model: 'kimi-k2.7-code',
      inTokens: 111,
      outTokens: 222,
      ok: true,
    });
  });

  it('estimates from characters when the provider sends no usage', async () => {
    const client = fakeClient([delta('a'.repeat(400), 'b'.repeat(400))]);
    await drain(streamModel(client, 'deepseek-v4-flash', [{ role: 'user', content: 'c'.repeat(80) }], { userId: null, provider: 'deepseek' }));
    await flush();
    expect(db.aiUsage.create.mock.calls[0]![0].data).toMatchObject({
      userId: null,
      provider: 'deepseek',
      inTokens: 20,
      outTokens: 200,
    });
  });

  it('meters a failed call too, and a failing ledger never breaks the build', async () => {
    db.aiUsage.create.mockRejectedValue(new Error('db down'));
    const client = fakeClient([], true);
    await expect(
      drain(streamModel(client, 'deepseek-v4-pro', [{ role: 'user', content: 'x' }], { userId: 'u1', provider: 'deepseek' })),
    ).rejects.toMatchObject({ reason: 'failed' });
    await flush();
    expect(db.aiUsage.create).toHaveBeenCalledTimes(1);
    expect(db.aiUsage.create.mock.calls[0]![0].data.ok).toBe(false);
  });

  it('does not meter without a meter context', async () => {
    await drain(streamModel(fakeClient([delta('x')]), 'm', [{ role: 'user', content: 'x' }]));
    await flush();
    expect(db.aiUsage.create).not.toHaveBeenCalled();
  });
});

describe('createPreviewer', () => {
  const raw = (files: string[], writing?: string) =>
    'TITLE: T\n===FILES===\n' +
    files.map((f) => `--- file: ${f} ---\n${f === 'index.tsx' ? "import {createRoot} from 'react-dom/client'; createRoot(document.getElementById('root')!).render(null)" : 'export default 1'}\n`).join('') +
    (writing ? `--- file: ${writing} ---\nconst a =` : '');

  it('builds a preview once the entry file is complete, and hands it back once', async () => {
    const p = createPreviewer();
    p.feed(raw(['index.tsx'], 'App.tsx'));
    expect(p.take()).toBeNull(); // the build is asynchronous
    await vi.waitFor(() => expect(p.take()).toMatchObject({ type: 'preview', done: ['index.tsx'], pending: ['App.tsx'] }));
    expect(p.take()).toBeNull();
  });

  it('builds nothing before the entry file exists', async () => {
    const p = createPreviewer();
    p.feed(raw(['util.ts'], 'index.tsx'));
    await flush();
    await flush();
    expect(p.take()).toBeNull();
  });

  it('close() drops a finished preview and any build still in flight', async () => {
    const p = createPreviewer();
    p.feed(raw(['index.tsx'], 'App.tsx'));
    p.close();
    await new Promise((r) => setTimeout(r, 400));
    expect(p.take()).toBeNull();
  });

  it('a fresh previewer shares no state with a closed one (per-candidate reset)', async () => {
    const first = createPreviewer();
    first.feed(raw(['index.tsx'], 'App.tsx'));
    await vi.waitFor(() => expect(first.take()).not.toBeNull());
    first.close();
    // The closed one stays closed...
    first.feed(raw(['index.tsx', 'App.tsx'], 'x.ts'));
    await flush();
    expect(first.take()).toBeNull();
    // ...while a new one starts from nothing and builds the same input.
    const second = createPreviewer();
    second.feed(raw(['index.tsx'], 'App.tsx'));
    await vi.waitFor(() => expect(second.take()).toMatchObject({ type: 'preview' }));
  });
});
