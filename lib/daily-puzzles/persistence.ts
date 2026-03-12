/**
 * Persistence for Daily Puzzles.
 * localStorage for anonymous play; DB for signed-in users (via API).
 */

const STORAGE_KEY = 'rmh-daily-puzzles';

export interface PuzzleResult {
    puzzleDate: string;
    score: number;
    timeSeconds: number | null;
    resultJson: any;
    completedAt: string;
}

interface DailyPuzzlesState {
    version: 1;
    results: {
        [gameMode: string]: {
            [puzzleDate: string]: PuzzleResult;
        };
    };
}

function loadState(): DailyPuzzlesState {
    if (typeof window === 'undefined') return { version: 1, results: {} };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { version: 1, results: {} };
}

function saveState(state: DailyPuzzlesState): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
}

/** Get result from localStorage */
export function getResult(gameMode: string, puzzleDate: string): PuzzleResult | null {
    const state = loadState();
    return state.results[gameMode]?.[puzzleDate] ?? null;
}

/** Save result to localStorage */
export function saveResult(gameMode: string, puzzleDate: string, result: PuzzleResult): void {
    const state = loadState();
    if (!state.results[gameMode]) state.results[gameMode] = {};
    state.results[gameMode][puzzleDate] = result;
    saveState(state);
}

/** Check if puzzle was completed (localStorage only) */
export function hasCompleted(gameMode: string, puzzleDate: string): boolean {
    return getResult(gameMode, puzzleDate) !== null;
}

/** Get all completed dates for a game mode from localStorage */
export function getCompletedDates(gameMode: string): Record<string, PuzzleResult> {
    const state = loadState();
    return state.results[gameMode] ?? {};
}

// ─── Server-aware functions (for signed-in users) ───

/** Fetch a single result from the server */
export async function fetchResultFromServer(
    gameMode: string,
    dateKey: string
): Promise<PuzzleResult | null> {
    try {
        const res = await fetch(`/api/daily-puzzles/results?gameMode=${gameMode}&date=${dateKey}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.result ?? null;
    } catch {
        return null;
    }
}

/** Fetch all results for a game mode from the server */
export async function fetchResultsFromServer(
    gameMode: string
): Promise<Record<string, PuzzleResult>> {
    try {
        const res = await fetch(`/api/daily-puzzles/results?gameMode=${gameMode}`);
        if (!res.ok) return {};
        const data = await res.json();
        return data.results ?? {};
    } catch {
        return {};
    }
}

/**
 * Sync results from server into localStorage.
 * Server results override local for matching dates.
 */
export async function syncFromServer(gameMode: string): Promise<Record<string, PuzzleResult>> {
    const serverResults = await fetchResultsFromServer(gameMode);
    if (Object.keys(serverResults).length === 0) return serverResults;

    const state = loadState();
    if (!state.results[gameMode]) state.results[gameMode] = {};

    for (const [dateKey, result] of Object.entries(serverResults)) {
        state.results[gameMode][dateKey] = result;
    }

    saveState(state);
    return serverResults;
}

/**
 * Save result to both localStorage and server.
 * The server POST is fire-and-forget.
 */
export function saveResultWithSync(
    gameMode: string,
    puzzleDate: string,
    result: PuzzleResult,
    isSignedIn: boolean
): void {
    // Always save to localStorage first (immediate)
    saveResult(gameMode, puzzleDate, result);

    // If signed in, also persist to server (fire-and-forget)
    if (isSignedIn) {
        const isLightsOut = gameMode === 'lights-out';
        const body: any = {
            gameMode,
            dateKey: puzzleDate,
            resultJson: result.resultJson,
            timeSeconds: result.timeSeconds,
        };

        if (isLightsOut) {
            body.moves = result.resultJson?.moves ?? result.score;
            body.hintUsed = result.resultJson?.hintUsed ?? false;
            body.dnf = result.resultJson?.dnf ?? false;
        } else {
            body.score = result.score;
        }

        fetch('/api/daily-puzzles/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).catch(() => { /* ignore */ });
    }
}
