/**
 * Request body-size caps for API routes.
 *
 * Two problems this guards against:
 *   1. A large declared `Content-Length` — cheap to reject up front.
 *   2. A *lying* `Content-Length`, a chunked/streamed upload, or a body with no
 *      length header at all — where trusting the header (or calling
 *      `request.json()` / `request.arrayBuffer()` directly) lets an attacker
 *      stream unbounded bytes into memory before any size check runs.
 *
 * `readJsonLimited` reads the body stream itself and aborts the moment the
 * accumulated bytes exceed `maxBytes`, so memory use is bounded regardless of
 * what the headers claim. It is a drop-in for `await request.json()` that adds
 * the cap; oversize bodies throw `RequestTooLargeError` (HTTP 413), malformed
 * JSON throws the usual `SyntaxError` (callers already wrap parsing in
 * try/catch or zod `safeParse`).
 *
 * Pure Web-standard APIs only (Request / ReadableStream / TextDecoder) — no
 * Node-only deps, so this is client-safe and needs no `.server` suffix.
 */

/** Sensible default cap for JSON API bodies (1 MB). */
export const DEFAULT_JSON_LIMIT = 1_000_000;

/** Thrown when a request body exceeds the configured byte cap. */
export class RequestTooLargeError extends Error {
  /** HTTP status callers should map this to. */
  readonly status = 413;
  readonly maxBytes: number;
  constructor(maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = 'RequestTooLargeError';
    this.maxBytes = maxBytes;
  }
}

/**
 * Read a request body as raw bytes, aborting past `maxBytes`. Prefers the body
 * stream (so an oversize body is stopped mid-flight) and falls back to
 * `arrayBuffer()` with a post-hoc check only when no stream is exposed.
 */
async function readBytesLimited(request: Request, maxBytes: number): Promise<Uint8Array> {
  const body = request.body;
  if (!body) {
    // No readable stream on this runtime — buffer then check. The declared
    // Content-Length gate below already caught the honest oversize case; this
    // still bounds the dishonest one, just after the fact.
    const buf = new Uint8Array(await request.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new RequestTooLargeError(maxBytes);
    return buf;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling more bytes immediately — don't buffer the rest.
        await reader.cancel().catch(() => {});
        throw new RequestTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released / cancelled */
    }
  }

  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Parse a JSON request body, enforcing a maximum size.
 *
 * - Rejects immediately when the declared `Content-Length` exceeds `maxBytes`.
 * - Guards the actual stream read so a lying `Content-Length` or a chunked
 *   upload can't stream unbounded bytes into memory.
 *
 * Throws `RequestTooLargeError` (413) when over the cap and `SyntaxError` when
 * the body isn't valid JSON. An empty body parses as an empty object, matching
 * the common `request.json().catch(() => ({}))` ergonomics callers rely on.
 */
export async function readJsonLimited<T = unknown>(
  request: Request,
  maxBytes: number = DEFAULT_JSON_LIMIT
): Promise<T> {
  // 1. Fast path: an honest, oversize Content-Length is rejected without reading.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RequestTooLargeError(maxBytes);
  }

  // 2. Read the body with a hard byte ceiling (defends against a lying length).
  const bytes = await readBytesLimited(request, maxBytes);
  if (bytes.byteLength === 0) return {} as T;

  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}
