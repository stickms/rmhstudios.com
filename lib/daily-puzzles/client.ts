/**
 * Client helper for fetching the server-generated (DeepSeek) daily puzzle.
 *
 * The server is the source of truth: it generates the puzzle once per day and
 * caches it, so every player gets the same puzzle. If the request fails for any
 * reason (offline, server hiccup), we fall back to the built-in deterministic
 * generator for that mode so the page still works — that fallback is date-seeded
 * and therefore also identical for everyone who hits it.
 */

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
        const res = await fetch(
            `/api/daily-puzzles/puzzle?gameMode=${encodeURIComponent(gameMode)}&date=${encodeURIComponent(dateKey)}`,
        );
        if (res.ok) {
            const json = await res.json();
            if (json && json.puzzle) return json.puzzle as T;
        }
    } catch {
        /* fall through to the local generator */
    }
    return fallback(parseDateKey(dateKey));
}
