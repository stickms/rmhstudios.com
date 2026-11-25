/**
 * "Your runs" (sprint 13 03), the pure half: the view shapes the endpoint answers with, the verifier's reason
 * codes as keys the screen translates, the `result` schema and the page cursor codec. Client-safe: it imports
 * nothing from the server, and the screen turns every key below into words with a literal `t()` call.
 */
import { z } from 'zod';
import type { CoopRecord } from './coop-record';

export const RUNS_PAGE_SIZE = 20;

/** A solo run that left `open` (an open run is the one in progress and is never listed). */
export const LISTED_SOLO_STATUSES = [
  'submitted',
  'verified',
  'rejected',
  'unverified',
  'abandoned',
  'expired',
] as const;
export type ListedSoloStatus = (typeof LISTED_SOLO_STATUSES)[number];

export function isListedSoloStatus(status: string): status is ListedSoloStatus {
  return (LISTED_SOLO_STATUSES as readonly string[]).includes(status);
}

/** The replay's numbers, as `persistVerifiedSoloRun` stores them (never the client's claim). */
export const soloResultSchema = z.object({
  status: z.enum(['victory', 'dead', 'incomplete']),
  gameTime: z.number().finite().nonnegative(),
  kills: z.number().int().nonnegative(),
  level: z.number().int().nonnegative(),
  bossesDefeated: z.array(z.string()).default([]),
});

export interface SoloResultView {
  outcome: 'victory' | 'dead' | 'incomplete';
  /** Game-clock seconds the replay survived. */
  timeSurvived: number;
  kills: number;
  level: number;
  bosses: number;
}

/** Parse a stored `result`; an unparsable one is null and the row shows its status only. */
export function parseSoloResult(raw: unknown): SoloResultView | null {
  const parsed = soloResultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    outcome: r.status,
    timeSurvived: r.gameTime,
    kills: r.kills,
    level: r.level,
    bosses: r.bossesDefeated.length,
  };
}

/** The verifier's reason codes (`SoloFailure`, plus `no_run`) the screen has words for. */
export const REJECT_REASON_KEYS = [
  'invalid_log',
  'setup_mismatch',
  'stale_sim',
  'too_long_for_wall_clock',
  'illegal_event',
  'stalled',
  'end_mismatch',
  'step_mismatch',
  'timeout',
  'claim_mismatch',
  'error',
  'no_run',
] as const;
export type RejectReasonKey = (typeof REJECT_REASON_KEYS)[number];

/** What the screen says for a code it has no words for. */
export const UNKNOWN_REASON = 'unknown' as const;
export type RejectReasonView = RejectReasonKey | typeof UNKNOWN_REASON;

/**
 * `rejectReason` is stored as `<code>: <detail>` (queue.server.ts). Only the code is read; the detail is the
 * verifier's own text and never leaves the server. An unknown or missing code maps to "unknown".
 */
export function rejectReasonKey(stored: string | null | undefined): RejectReasonView {
  if (!stored) return UNKNOWN_REASON;
  const code = stored.split(':', 1)[0]?.trim() ?? '';
  return (REJECT_REASON_KEYS as readonly string[]).includes(code) ? (code as RejectReasonKey) : UNKNOWN_REASON;
}

export interface SoloRunView {
  id: string;
  classId: string;
  doubleTime: boolean;
  /** ISO time the run was issued. */
  issuedAt: string;
  status: ListedSoloStatus;
  /** The replay's numbers, verified runs only; null when absent or unparsable. */
  result: SoloResultView | null;
  /** Rejected and unverified runs only. */
  reason: RejectReasonView | null;
  coinsCredited: number;
  firstClear: boolean;
}

export type TeammateView =
  | { kind: 'player'; name: string; classId: string }
  | { kind: 'deleted'; classId: string }
  | { kind: 'blocked'; classId: string };

export interface CoopMatchView {
  /** The member's own `AltairMatchPlayer` row id. */
  id: string;
  /** ISO time the member's row was written. */
  playedAt: string;
  victory: boolean;
  durationMs: number | null;
  playerCount: number;
  doubleTime: boolean;
  sharedKills: number;
  bossesDefeated: number;
  me: {
    classId: string;
    finalLevel: number;
    kills: number;
    coinsEarned: number;
    timeSurvived: number;
    wasDowned: boolean;
    wasRevived: boolean;
    revivesGiven: number;
    wasAliveAtEnd: boolean;
  };
  teammates: TeammateView[];
}

export type RunsKind = 'solo' | 'coop';
export type SoloRunsPage = { kind: 'solo'; runs: SoloRunView[]; nextCursor: string | null };
export type CoopMatchesPage = {
  kind: 'coop';
  matches: CoopMatchView[];
  nextCursor: string | null;
  /** Only on the first co-op page: the member's co-op record, null with no co-op profile. */
  coopRecord?: CoopRecord | null;
};
export type RunsPage = SoloRunsPage | CoopMatchesPage;

// ---- Cursor ---------------------------------------------------------------------------------------------

export interface RunsCursor {
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
export function encodeRunsCursor(cursor: RunsCursor): string {
  return toBase64Url(`${cursor.at.getTime()}.${cursor.id}`);
}

/** The cursor a token carries, or null for anything that is not one (the endpoint answers 400). */
export function decodeRunsCursor(token: string): RunsCursor | null {
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
