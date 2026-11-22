/**
 * Reading a refusal off a failed request — the pure half of s10-20.
 *
 * A route that refuses answers `{ error: '<English>', code, ...params }` (`refusalBody()` in `./codes`). This module
 * reads that body back into `{ code, params }`; `components/errors/useRefusalText.ts` turns it into a sentence in
 * the reader's language. It lives here, with no React, zod or server import, so it is cheap to ship and easy to test.
 *
 * Two safeguards keep a stray `code` from changing what an English reader sees:
 *  - Other layers already put their own `code` on a body (a tournament's `FULL`, a quiz's `OWN_QUIZ`). A code is
 *    honoured only when the body's English `error` is the sentence that code was minted for, so a reused name such as
 *    `NOT_FOUND` over 'Tournament not found' falls back to the server's text.
 *    The guard stays (it was weighed against a namespaced code and rejected): taxonomy codes are not unique on the wire.
 *    `NOT_FOUND`, `FORBIDDEN`, `RATE_LIMITED` and `INSUFFICIENT_COINS` are also sent by tournaments, events, the socket
 *    servers and the market over different English, and a wire code cannot be renamed. Its failure mode is safe: if a
 *    route's English drifts from the catalogue the code is ignored and the reader sees the server's text, never a wrong
 *    sentence. `components/errors/__tests__/refusal.product.test.ts` pins the collisions.
 *  - Params are validated by type: a number, or a string that is short and, for the date params, an ISO date.
 */
import { ERROR_CODES, isErrorCode, type ErrorCode, type ErrorCodeDef, type RefusalParams } from './codes';
import { HttpError } from '@/lib/http';

/** Wire spellings older than the taxonomy: the community sanction refusals (s06-01). */
const WIRE_ALIASES: Record<string, ErrorCode> = {
  community_banned: 'COMMUNITY_BANNED',
  community_timed_out: 'COMMUNITY_TIMED_OUT',
};

/** Codes whose English on the wire is composed per request (a date in UTC), so the text guard cannot apply. */
const COMPOSED_ON_THE_WIRE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['COMMUNITY_BANNED', 'COMMUNITY_TIMED_OUT']);

/** The fields that may travel as params. A field outside this list is never read. */
const PARAM_NAMES = ['endsAt', 'count', 'max', 'limit', 'remaining', 'minutes', 'days'] as const;
const DATE_PARAMS: ReadonlySet<string> = new Set(['endsAt']);

export interface Refusal {
  code: ErrorCode;
  params: RefusalParams;
}

function bodyOf(source: unknown): unknown {
  return source instanceof HttpError ? source.body : source;
}

function templateMatches(template: string, english: string): boolean {
  if (!template.includes('{{')) return template === english;
  const pattern = template
    .split(/\{\{\w+\}\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+?');
  return new RegExp(`^${pattern}$`).test(english);
}

function readParams(body: Record<string, unknown>): RefusalParams {
  const params: RefusalParams = {};
  const detail = body.detail;
  const sources: Record<string, unknown>[] = [body];
  if (typeof detail === 'object' && detail !== null) sources.push(detail as Record<string, unknown>);
  for (const name of PARAM_NAMES) {
    for (const source of sources) {
      const value = source[name];
      if (typeof value === 'number' && Number.isFinite(value)) {
        params[name] = value;
        break;
      }
      if (typeof value === 'string' && value.length <= 64) {
        if (DATE_PARAMS.has(name) && Number.isNaN(new Date(value).getTime())) continue;
        params[name] = value;
        break;
      }
    }
  }
  return params;
}

/** The taxonomy code an `HttpError` (or a parsed error body) carries, with its params; `null` when it carries none. */
export function readRefusal(source: unknown): Refusal | null {
  const body = bodyOf(source);
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const english = typeof record.error === 'string' ? record.error : null;
  // `refusal` is the taxonomy code on a body whose own `code` belongs to another layer (tournaments).
  for (const raw of [record.code, record.refusal]) {
    if (typeof raw !== 'string') continue;
    const code: ErrorCode | null = isErrorCode(raw) ? raw : (WIRE_ALIASES[raw] ?? null);
    if (!code) continue;
    if (!COMPOSED_ON_THE_WIRE.has(code)) {
      const def: ErrorCodeDef = ERROR_CODES[code];
      if (english === null || !templateMatches(def.text, english)) continue;
    }
    return { code, params: readParams(record) };
  }
  return null;
}
