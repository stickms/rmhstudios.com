/**
 * Handle rules — the shared, client-safe core.
 *
 * Every account has a `@handle`: it is what `@mentions` resolve against and
 * what `/u/<handle>` routes on. This module holds the *rules* only (charset,
 * length, reserved words, the cooldown) so it can be imported from client
 * components. Anything that needs the database to pick a free handle lives in
 * `lib/handle.server.ts`.
 */

import { z } from 'zod';

/** Handle rules: 3-20 chars, lowercase alphanumeric + underscores, must start with a letter */
export const HANDLE_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;

/**
 * Longest base a generated handle may use, leaving room for the `_1234`
 * collision suffix inside {@link HANDLE_MAX_LENGTH}.
 */
export const HANDLE_BASE_MAX_LENGTH = HANDLE_MAX_LENGTH - 5;

/** Two weeks in milliseconds */
export const HANDLE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** Reserved handles that can't be claimed */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'auth',
  'login',
  'signup',
  'register',
  'settings',
  'profile',
  'post',
  'messages',
  'notifications',
  'search',
  'explore',
  'help',
  'about',
  'terms',
  'privacy',
  'support',
  'feedback',
  'rmh',
  'rmhstudios',
  'mod',
  'moderator',
  'system',
  'null',
  'undefined',
  'home',
  'feed',
  'builds',
  'games',
  'blog',
  'research',
  'news',
]);

export const handleSchema = z
  .string()
  .min(HANDLE_MIN_LENGTH, 'Handle must be at least 3 characters')
  .max(HANDLE_MAX_LENGTH, 'Handle must be at most 20 characters')
  .regex(
    HANDLE_REGEX,
    'Handle must start with a letter and contain only lowercase letters, numbers, and underscores',
  )
  .refine((h) => !RESERVED_HANDLES.has(h), 'This handle is reserved');

/** True when `handle` satisfies every rule and is not reserved. */
export function isValidHandle(handle: string): boolean {
  return handleSchema.safeParse(handle).success;
}

/**
 * Common Latin-1 accents folded to ASCII so "José" derives `jose` rather than
 * `jos_`. Kept deliberately small — the SQL backfill in
 * `prisma/migrations/*_backfill_user_handles` mirrors this same table.
 */
const ACCENTS = 'àáâãäåèéêëìíîïòóôõöùúûüýÿñçß';
const ASCII_FOLD = 'aaaaaaeeeeiiiiooooouuuuyyncs';

/**
 * Derive the handle "base" from a display name / username.
 *
 * Always returns a string that starts with a lowercase letter and contains
 * only `[a-z0-9_]`, capped at {@link HANDLE_BASE_MAX_LENGTH}. It may still be
 * shorter than {@link HANDLE_MIN_LENGTH} or collide with a reserved word —
 * callers append a numeric suffix, which fixes both.
 */
export function deriveHandleBase(source: string | null | undefined): string {
  let base = (source ?? '').toLowerCase();

  // Fold accents, then map everything else outside the charset to underscores
  // and collapse the runs that leaves behind.
  base = base.replace(/[À-ɏ]/g, (ch) => {
    const i = ACCENTS.indexOf(ch);
    return i === -1 ? '_' : ASCII_FOLD[i];
  });
  base = base
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  // Handles must start with a letter — this also covers the empty string.
  if (!/^[a-z]/.test(base)) base = `u${base}`;

  return base.slice(0, HANDLE_BASE_MAX_LENGTH).replace(/_+$/, '');
}

/**
 * Append a random 4-digit suffix to a derived base, e.g. `alice` → `alice_4821`.
 * `random` is injectable so tests can make the output deterministic.
 */
export function suffixHandle(base: string, random: () => number = Math.random): string {
  const suffix = String(1000 + Math.floor(random() * 9000));
  return `${base.slice(0, HANDLE_BASE_MAX_LENGTH)}_${suffix}`;
}

/**
 * Check if a user can change their handle (2-week cooldown).
 * Admins bypass the cooldown.
 */
export function canChangeHandle(handleChangedAt: Date | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (!handleChangedAt) return true;
  return Date.now() - handleChangedAt.getTime() >= HANDLE_COOLDOWN_MS;
}

/**
 * Get remaining cooldown time in milliseconds. Returns 0 if no cooldown.
 */
export function handleCooldownRemaining(handleChangedAt: Date | null): number {
  if (!handleChangedAt) return 0;
  const elapsed = Date.now() - handleChangedAt.getTime();
  return Math.max(0, HANDLE_COOLDOWN_MS - elapsed);
}
