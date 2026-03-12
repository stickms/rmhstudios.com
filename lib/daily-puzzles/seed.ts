/**
 * Seeded PRNG and date utilities for Daily Puzzles.
 * Reuses the Mulberry32 algorithm from Lights Out.
 */

export function createSeededRng(seed: number): () => number {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function getDateSeed(date: Date): number {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return y * 10000 + m * 100 + d;
}

export function formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Get today's date in EST/EDT */
export function getTodayEST(): Date {
    const now = new Date();
    const estStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return new Date(estStr + 'T00:00:00');
}

/** Puzzle numbering: days since launch */
const LAUNCH_DATE = new Date('2026-04-01');

export function getPuzzleNumber(date: Date): number {
    const dateStr = formatDateKey(date);
    const launchStr = formatDateKey(LAUNCH_DATE);
    const d = new Date(dateStr + 'T00:00:00');
    const l = new Date(launchStr + 'T00:00:00');
    return Math.floor((d.getTime() - l.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Shuffle array in-place using seeded RNG (Fisher-Yates) */
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/** Pick n items from array using seeded RNG */
export function seededPick<T>(arr: T[], n: number, rng: () => number): T[] {
    return seededShuffle(arr, rng).slice(0, n);
}
