import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_READ_TIMEOUT_MS, jsonTransport, readJsonWithDeadline } from '../cloud-save';

/**
 * A cloud read that is accepted but never answered must not hold a game's
 * loading screen forever: every gate waits on `resolve()`, which awaits it.
 */
describe('cloud save read deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // A fetch that never resolves but honours its abort signal, as a real one does.
  const hangingFetch = () =>
    vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );

  it('rejects once the deadline passes instead of hanging', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const pending = readJsonWithDeadline('/api/x');
    const settled = expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(CLOUD_READ_TIMEOUT_MS + 1);
    await settled;
  });

  it('applies to the shared jsonTransport used by the games', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const read = jsonTransport('/api/temple-of-joy/save').read();
    const settled = expect(read).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(CLOUD_READ_TIMEOUT_MS + 1);
    await settled;
  });

  it('returns the parsed body, and null for a non-2xx, when the server answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ saveData: { a: 1 } }) })
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) }),
    );
    expect(await jsonTransport('/api/y').read()).toEqual({ a: 1 });
    expect(await readJsonWithDeadline('/api/y')).toBeNull();
  });
});
