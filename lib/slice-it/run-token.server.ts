/**
 * A signed receipt that a run was started, and when.
 *
 * The score endpoint needs to know how much real time passed between a player
 * loading a song and submitting a score for it, because a run that finished in
 * four seconds did not involve listening to a three-minute track. It cannot ask
 * the client — "how long did you take" is exactly the sort of question a cheat
 * lies about — and it cannot remember, because the web tier is stateless and
 * runs **blue/green**: a run started on the container listening on 7005 would
 * submit to the one on 7015 after a deploy, and any in-memory record of it would
 * be gone.
 *
 * So the server does not remember; it *signs*. The token carries the user, the
 * song and the issue time, HMAC'd with the app secret. It comes back with the
 * score, the signature proves the server minted it, and the timestamp inside it
 * is the server's own clock reading — not the client's.
 *
 * ## What this does not do
 *
 * It does not prevent reuse. Preventing reuse means remembering which tokens
 * have been spent, which is the state this design exists to avoid, and the value
 * is low: a reused token can only resubmit against the same song for the same
 * account, and only a personal best is kept. Tokens do expire
 * ({@link MAX_TOKEN_AGE_MS}), which bounds the window without needing storage.
 *
 * See `lib/slice-it/integrity.ts` for the honest limits of the whole scheme.
 *
 * Server-only.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * How long a token stays valid.
 *
 * Long enough for the longest track at the slowest speed plus a pause, a retry
 * of the same load, and someone answering the door mid-song. Short enough that a
 * token is not a permanent licence to submit.
 */
export const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000;

const VERSION = 'v1';

function secret(): string {
  // The same secret the session layer uses. A missing one is a misconfigured
  // deployment, and failing loudly here beats signing everything with "".
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error('BETTER_AUTH_SECRET is required to sign run tokens');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * Mint a token for a run of `songId` by `userId`, stamped now.
 *
 * Issued by the single-song read, which every run already performs — so this
 * costs no extra round trip on the path to starting a song.
 */
export function issueRunToken(userId: string, songId: string, now = Date.now()): string {
  const payload = `${VERSION}.${userId}.${songId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

export type RunTokenResult =
  | { ok: true; issuedAt: number; elapsedMs: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'wrong_run' | 'expired' };

/**
 * Verify a token and report how long ago it was issued.
 *
 * The signature is compared in constant time, which matters less here than it
 * would for a session but costs nothing to get right.
 */
export function verifyRunToken(
  token: string | null | undefined,
  userId: string,
  songId: string,
  now = Date.now(),
): RunTokenResult {
  if (!token) return { ok: false, reason: 'missing' };

  const parts = token.split('.');
  if (parts.length !== 5) return { ok: false, reason: 'malformed' };
  const [version, tokenUser, tokenSong, issuedRaw, signature] = parts;
  if (version !== VERSION) return { ok: false, reason: 'malformed' };

  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: 'malformed' };

  const expected = sign(`${version}.${tokenUser}.${tokenSong}.${issuedRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  // Checked after the signature: a token that is genuinely ours but for a
  // different run is a different failure from one that was forged, and only the
  // signature check is worth doing in constant time.
  if (tokenUser !== userId || tokenSong !== songId) return { ok: false, reason: 'wrong_run' };

  const elapsedMs = now - issuedAt;
  if (elapsedMs > MAX_TOKEN_AGE_MS) return { ok: false, reason: 'expired' };
  // A token from the future means clock skew, not a valid head start.
  return { ok: true, issuedAt, elapsedMs: Math.max(0, elapsedMs) };
}
