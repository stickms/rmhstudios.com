/**
 * RMHbox — Shared Utility Functions
 *
 * Utility functions shared between client and server.
 *
 * Reference: docs/rmhbox/design-spec/core.md §24.1
 */

import { nanoid, customAlphabet } from 'nanoid';
import { ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from './constants';

/** Custom nanoid generator for room codes (excludes ambiguous chars I, O, 0, 1) */
const generateCode = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

/**
 * Sanitize a raw string input by trimming whitespace,
 * stripping HTML-dangerous characters, and truncating to maxLength.
 *
 * @param raw - The raw input value (may not be a string)
 * @param maxLength - Maximum allowed length after sanitization
 * @returns A clean, safe string
 */
export function sanitizeString(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/[<>&"']/g, '')
    .slice(0, maxLength);
}

/**
 * Generate a 6-character room code using a URL-safe alphabet
 * that excludes visually ambiguous characters (I, O, 0, 1).
 *
 * @returns A 6-character uppercase alphanumeric room code
 */
export function generateRoomCode(): string {
  return generateCode();
}

/**
 * Prefix of the transient identity the hub mints for a Discord Activity player
 * whose Discord account isn't linked to a site account (`server/rmhbox/auth.ts`).
 */
export const TRANSIENT_DISCORD_ID_PREFIX = 'discord:';

/**
 * Whether a userId is a transient Discord Activity identity rather than a real
 * site account.
 *
 * These IDs exist only in hub memory — there is no `user` row behind them — so
 * anything that writes a row keyed on `userId` (RMHboxProfile has a foreign key
 * to User) must skip them. Persisting one raises a foreign-key error, which
 * previously took the whole lobby's stats down with it.
 */
export function isTransientDiscordIdentity(userId: string): boolean {
  return userId.startsWith(TRANSIENT_DISCORD_ID_PREFIX);
}
