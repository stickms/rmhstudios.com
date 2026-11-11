/**
 * Client helper for fetching the server-generated (DeepSeek) daily puzzle.
 *
 * The server is the source of truth: it generates the puzzle once per day and
 * caches it, so every player gets the same puzzle. If the request fails for any
 * reason (offline, server hiccup), we fall back to the built-in deterministic
 * generator for that mode so the page still works — that fallback is date-seeded
 * and therefore also identical for everyone who hits it.
 */

import { api } from '@/lib/contract/client';
import { getDailyPuzzleApi } from './daily-puzzles.contract';

function parseDateKey(dateKey: string): Date {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export async function fetchDailyPuzzle<T>(
    gameMode: string,
    dateKey: string,
    fallback: (date: Date) => T,
): Promise<T> {
    try {
        // A stalled mobile connection must not leave the puzzle on its loading screen.
        const json = await api(getDailyPuzzleApi, { query: { gameMode, date: dateKey }, timeoutMs: 12_000, retries: 0 });
        if (json && json.puzzle) return json.puzzle as T;
    } catch {
        /* fall through to the local generator */
    }
    return fallback(parseDateKey(dateKey));
}
