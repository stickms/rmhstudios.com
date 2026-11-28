export interface TimeIdCursor {
  at: Date;
  id: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** `(time, id)` of the last row of a page, as one opaque token. */
export function encodeTimeIdCursor(cursor: TimeIdCursor): string {
  return toBase64Url(`${cursor.at.getTime()}.${cursor.id}`);
}

/** The cursor a token carries, or null for anything that is not one (the endpoint answers 400). */
export function decodeTimeIdCursor(token: string): TimeIdCursor | null {
  if (token.length === 0 || token.length > 200) return null;
  try {
    const text = fromBase64Url(token);
    const dot = text.indexOf('.');
    if (dot <= 0) return null;
    const ms = Number(text.slice(0, dot));
    const id = text.slice(dot + 1);
    if (!Number.isSafeInteger(ms) || id.length === 0 || id.length > 64) return null;
    const at = new Date(ms);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}
