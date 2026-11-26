/**
 * Theme suggestions for game jams (s15-13): the pure rules. Client-safe, no I/O.
 *
 * A member may suggest up to three themes for a theme-voted jam until its vote opens. Suggestions are seen by the
 * suggester and by admins only; an admin copies one onto the shortlist (the existing shortlist rules apply).
 */
import { themeVotingPhase, type ThemeVotingWindow } from './jam-themes';

export const JAM_SUGGESTION_LIMIT = 3;
export const SUGGESTION_MIN = 3;
export const SUGGESTION_MAX = 120;

/** Trim and strip control characters; null when the result is outside 3 to 120 characters. */
export function normaliseSuggestion(raw: string): string | null {
  const text = raw
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length >= SUGGESTION_MIN && text.length <= SUGGESTION_MAX ? text : null;
}

/**
 * Whether suggestions are being taken now: a voting jam, with a vote-opening time that has not come, before the
 * start. A voting jam without `themeVoteOpensAt` has no window (its vote opens as soon as it exists).
 */
export function suggestionsOpen(jam: ThemeVotingWindow, now: Date = new Date()): boolean {
  return themeVotingPhase(jam, now) === 'before';
}

/**
 * Whether a suggester may be told their text reached the shortlist: only once every member can see the candidates
 * anyway (the vote has opened), so no member learns the shortlist, and through it the secret theme, early.
 */
export function mayShowShortlisted(jam: ThemeVotingWindow, now: Date = new Date()): boolean {
  const phase = themeVotingPhase(jam, now);
  return phase === 'open' || phase === 'closed';
}

/** The key two suggestions share when they say the same thing. */
export const suggestionKey = (text: string): string => text.trim().toLowerCase();
