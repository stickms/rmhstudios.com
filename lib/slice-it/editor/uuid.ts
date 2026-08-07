/**
 * UUIDv7 — a time-sortable identifier, for `Chart` rows and for notes.
 *
 * `docs/slice-it-chart-editor.md` §1.1 asks for `uuid_generate_v7()` as the
 * column default; that function is not installed in this database and adding it
 * needs a hand-written migration, so the id is minted here instead and the
 * column default (`gen_random_uuid()`) only ever fires for a row inserted
 * without one. Same property — insert locality on an append-heavy table, which
 * is what the new-table PK policy in `lib/CLAUDE.md` §Database is after.
 *
 * Layout (RFC 9562): 48 bits of Unix milliseconds, version nibble `7`, 12 bits
 * of randomness, variant bits `10`, 62 more bits of randomness.
 *
 * Browser-free and Node-free — `crypto.getRandomValues` exists in both, and the
 * fallback covers the (test-only) environments where it does not.
 */

function randomBytes(count: number): Uint8Array {
  const out = new Uint8Array(count);
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webcrypto?.getRandomValues) {
    webcrypto.getRandomValues(out);
    return out;
  }
  // Only reachable in an environment with no Web Crypto at all. Ids here are
  // never a security boundary — they are row keys — so `Math.random` degrading
  // uniqueness slightly is better than throwing.
  for (let i = 0; i < count; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function uuidv7(now = Date.now()): string {
  const bytes = randomBytes(16);

  // 48-bit big-endian millisecond timestamp.
  const ms = Math.max(0, Math.floor(now));
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const h = HEX;
  return (
    h[bytes[0]] +
    h[bytes[1]] +
    h[bytes[2]] +
    h[bytes[3]] +
    '-' +
    h[bytes[4]] +
    h[bytes[5]] +
    '-' +
    h[bytes[6]] +
    h[bytes[7]] +
    '-' +
    h[bytes[8]] +
    h[bytes[9]] +
    '-' +
    h[bytes[10]] +
    h[bytes[11]] +
    h[bytes[12]] +
    h[bytes[13]] +
    h[bytes[14]] +
    h[bytes[15]]
  );
}

/**
 * A note id.
 *
 * Short and not a UUID: the note list is the biggest thing the editor sends, and
 * 1200 UUIDs is 43 KB of the payload spent on identity alone. `crypto.randomUUID`
 * is also absent on non-secure origins, which the editor is reachable from in
 * development.
 */
export function newNoteId(): string {
  const bytes = randomBytes(8);
  let out = 'n';
  for (const byte of bytes) out += HEX[byte];
  return out;
}
