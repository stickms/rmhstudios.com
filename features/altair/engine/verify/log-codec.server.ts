// Transport decoding for a run log (hub side). The input is attacker-controlled, so the inflated
// size is capped: a gzip bomb stops at MAX_INFLATED_BYTES instead of filling the hub's heap.

import { gunzipSync } from 'node:zlib';
import { MAX_ENCODED_LOG_CHARS } from './log-codec';

/** ~1.2M numbers of the flat log is about 8 MB of JSON; allow some slack for the roster. */
export const MAX_INFLATED_BYTES = 10 * 1024 * 1024;

/** Returns the parsed (still untrusted) log, or null when it is malformed or too large. */
export function decodeRunLog(raw: unknown): unknown | null {
  if (!raw || typeof raw !== 'object') return null;
  const { enc, data } = raw as { enc?: unknown; data?: unknown };
  if (typeof data !== 'string' || data.length === 0 || data.length > MAX_ENCODED_LOG_CHARS) return null;
  try {
    let json: string;
    if (enc === 'gzip-b64') {
      json = gunzipSync(Buffer.from(data, 'base64'), { maxOutputLength: MAX_INFLATED_BYTES }).toString('utf8');
    } else if (enc === 'json') {
      json = data;
    } else {
      return null;
    }
    return JSON.parse(json);
  } catch {
    return null;
  }
}
