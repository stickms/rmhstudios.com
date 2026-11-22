/**
 * Invite links for group chats (s06-09): the rules that need no database. Client-safe.
 *
 * A code is 10 base58 characters drawn with `crypto.randomBytes` on the server (`invites.server.ts`); this module
 * holds the alphabet, the option lists the owner picks from, and the validity check the join runs again under the
 * group's lock.
 */

/** Base58: no 0, O, I or l, so a code read aloud or typed from a screenshot is not ambiguous. */
export const INVITE_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const INVITE_CODE_LENGTH = 10;
/** Live (not revoked, not expired, not used up) links one group may hold. */
export const MAX_LIVE_INVITES = 5;
/** Characters of a code the owner's list shows. */
export const MASKED_TAIL = 4;

export const INVITE_EXPIRY_DAYS = [1, 7, 30, null] as const;
export const INVITE_MAX_USES = [1, 5, 10, 25, null] as const;
export type InviteExpiryDays = (typeof INVITE_EXPIRY_DAYS)[number];
export type InviteMaxUses = (typeof INVITE_MAX_USES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** True for a string shaped like a code; anything else is refused before a query is made. */
export function isInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return false;
  return true;
}

/** Map random bytes to a code without modulo bias (bytes at or above the largest multiple of 58 are skipped). */
export function codeFromBytes(bytes: Uint8Array): string | null {
  const n = INVITE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  for (const b of bytes) {
    if (b >= limit) continue;
    out += INVITE_ALPHABET[b % n];
    if (out.length === INVITE_CODE_LENGTH) return out;
  }
  return null;
}

export function expiryDate(days: InviteExpiryDays, now: Date): Date | null {
  return days === null ? null : new Date(now.getTime() + days * DAY_MS);
}

export interface InviteState {
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** Whether a link can take one more person at `now`. Expiry is exclusive: a link is dead at its `expiresAt`. */
export function isInviteLive(invite: InviteState, now: Date): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return false;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return false;
  return true;
}

/** "••••••AbCd": the owner's list shows only the end of a code. */
export function maskCode(code: string): string {
  const tail = code.slice(-MASKED_TAIL);
  return '•'.repeat(Math.max(0, code.length - tail.length)) + tail;
}

/** The path a member posts: the page is `/groups/join/<code>`. */
export function invitePath(code: string): string {
  return `/groups/join/${code}`;
}

export interface InviteRow {
  id: string;
  code: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  /** s07-04: who made the link (an admin may revoke any link, so the list says whose it is). */
  createdById: string | null;
  createdByName: string | null;
}
