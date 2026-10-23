import { readFile } from 'node:fs/promises';
import { vi } from 'vitest';

/** Exercise real binaries and the production loader without an HTTP server. */
export function serveWasm(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const name = url.includes('dough') ? 'dough' : 'projection';
      const bytes = await readFile(new URL(`../generated/${name}.wasm`, import.meta.url));
      return new Response(bytes, { headers: { 'Content-Type': 'application/wasm' } });
    }),
  );
}
