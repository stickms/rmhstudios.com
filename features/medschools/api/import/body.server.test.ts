import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors/codes';
import { formFromBytes, readBodyCapped } from './body.server';

/** A request whose body arrives in chunks and carries no Content-Length, as a chunked upload does. */
function chunked(chunkBytes: number, chunks: number, state = { pulled: 0 }): { req: Request; state: { pulled: number } } {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= chunks) return controller.close();
      state.pulled += 1;
      controller.enqueue(new Uint8Array(chunkBytes).fill(97));
    },
  });
  const req = new Request('http://local.invalid/', {
    method: 'POST',
    body: stream,
    duplex: 'half',
    headers: { 'content-type': 'application/octet-stream' },
  } as RequestInit & { duplex: 'half' });
  return { req, state };
}

describe('readBodyCapped', () => {
  it('reads a body under the cap', async () => {
    const { req } = chunked(1000, 3);
    expect(req.headers.get('content-length')).toBeNull();
    expect((await readBodyCapped(req, 5000)).length).toBe(3000);
  });

  it('cuts a chunked body with no Content-Length at the cap, without reading the rest', async () => {
    const { req, state } = chunked(64 * 1024, 10_000); // 640 MB if it were all read
    const err = (await readBodyCapped(req, 2 * 1024 * 1024 + 256 * 1024).catch((e: unknown) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('MEDSCHOOLS_IMPORT_TOO_LARGE');
    expect(state.pulled).toBeLessThan(100);
  });

  it('refuses a declared length over the cap before reading', async () => {
    const req = new Request('http://local.invalid/', { method: 'POST', body: 'x'.repeat(100) });
    await expect(readBodyCapped(req, 10)).rejects.toMatchObject({ code: 'MEDSCHOOLS_IMPORT_TOO_LARGE' });
  });
});

describe('formFromBytes', () => {
  it('parses a buffered multipart body and returns null for anything else', async () => {
    const form = new FormData();
    form.set('file', new File(['Duke 7/20'], 'a.txt', { type: 'text/plain' }));
    const req = new Request('http://local.invalid/', { method: 'POST', body: form });
    const bytes = await readBodyCapped(req, 1 << 20);
    const parsed = await formFromBytes(bytes, req.headers.get('content-type')!);
    expect(await (parsed!.get('file') as File).text()).toBe('Duke 7/20');
    expect(await formFromBytes(Buffer.from('nope'), 'multipart/form-data; boundary=x')).toBeNull();
  });
});
