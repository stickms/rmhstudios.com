import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wasmModule } from '../load';

afterEach(() => vi.unstubAllGlobals());

describe('Wasm loading and graceful fallback', () => {
  it('compiles despite a generic MIME type and fetches only once', async () => {
    const bytes = await readFile(new URL('../generated/dough.wasm', import.meta.url));
    const fetcher = vi.fn(
      async () => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    const load = wasmModule('/test.wasm');
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBeInstanceOf(WebAssembly.Module);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['network', 'http', 'invalid'])(
    'falls back on %s failure without unhandled rejections',
    async (failure) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          if (failure === 'network') throw new Error('offline');
          return new Response('not wasm', { status: failure === 'http' ? 404 : 200 });
        }),
      );
      expect(await wasmModule('/test.wasm')()).toBeNull();
    },
  );

  it('does not fetch when WebAssembly is unavailable', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('WebAssembly', undefined);
    expect(await wasmModule('/test.wasm')()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
