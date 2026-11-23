/**
 * A request body read with a byte limit that does not depend on what the sender says. `Content-Length` is absent on a
 * chunked request and a lie on any other, and `request.formData()` / `request.json()` buffer the whole body before they
 * look at it. This reads the stream itself, counts what really arrives and cancels the stream past the limit, then hands
 * the buffered bytes back to the platform parsers.
 */
import { AppError } from '@/lib/errors/codes';

/** The body's bytes, or `MEDSCHOOLS_IMPORT_TOO_LARGE` the moment more than `maxBytes` have arrived. */
export async function readBodyCapped(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new AppError('MEDSCHOOLS_IMPORT_TOO_LARGE');
  const body = request.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError('MEDSCHOOLS_IMPORT_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

/** The multipart form in already-buffered bytes, parsed by the platform. Null when it is not a form. */
export async function formFromBytes(bytes: Buffer, contentType: string): Promise<FormData | null> {
  try {
    return await new Request('http://local.invalid/', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: new Uint8Array(bytes),
    }).formData();
  } catch {
    return null;
  }
}
