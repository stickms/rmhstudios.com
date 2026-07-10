/**
 * Local (per-browser) personal-best storage for Dream Rift.
 *
 * A personal best is scoped to BOTH the character and the difficulty: a great
 * run with Hikari on Normal and a great run with Reika on Hard are separate
 * records and must not overwrite or shadow each other. Earlier builds keyed the
 * slot by difficulty alone (`dr.hi.<difficulty>`), so every character shared one
 * slot per difficulty and the most recent run's character won — that is the bug
 * this module fixes by folding the character into the key.
 */

import type { Difficulty, PlayerId } from './types';

/** localStorage key for a character's personal best on a given difficulty. */
export function hiScoreKey(character: PlayerId, difficulty: Difficulty): string {
    return `dr.hi.${character}.${difficulty}`;
}

/** Read a character's stored personal best for a difficulty (0 if none). */
export function loadHiScore(character: PlayerId, difficulty: Difficulty): number {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem(hiScoreKey(character, difficulty)) || 0);
}

/**
 * Persist `score` as the character's personal best for a difficulty if it beats
 * the stored value. Returns the resulting best.
 */
export function saveHiScore(character: PlayerId, difficulty: Difficulty, score: number): number {
    const prev = loadHiScore(character, difficulty);
    if (score > prev && typeof localStorage !== 'undefined') {
        localStorage.setItem(hiScoreKey(character, difficulty), String(score));
        return score;
    }
    return prev;
}
