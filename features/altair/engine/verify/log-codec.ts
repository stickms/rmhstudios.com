// Transport encoding for a run log (client side). A 20 minute 4-player log is a few hundred KB of
// JSON; socket.io's per-message cap is 1 MB, so it travels gzipped + base64 where the browser can
// (CompressionStream), and plain JSON otherwise (only if it still fits).

export interface EncodedRunLog {
  enc: 'gzip-b64' | 'json';
  data: string;
}

/** The hub refuses anything bigger on the wire; stay under it. */
export const MAX_ENCODED_LOG_CHARS = 900_000;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Null when the log cannot be sent (too big even compressed). */
export async function encodeRunLog(log: object): Promise<EncodedRunLog | null> {
  const json = JSON.stringify(log);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      const data = toBase64(bytes);
      if (data.length <= MAX_ENCODED_LOG_CHARS) return { enc: 'gzip-b64', data };
      return null;
    } catch {
      // fall through to plain JSON
    }
  }
  return json.length <= MAX_ENCODED_LOG_CHARS ? { enc: 'json', data: json } : null;
}
