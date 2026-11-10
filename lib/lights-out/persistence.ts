import { readJson, removeKey, writeJson } from '@/lib/core/persist';
const STORAGE_KEY = 'rmh-daily-puzzle';
const HINTS_USED_KEY = 'rmh-daily-puzzle-hints';
const HISTORY_KEY = 'rmh-puzzle-history';

export interface DailyPuzzleSave {
    dateKey: string;
    moves: number;
    solved: boolean;
    dnf?: boolean;
    optimalMoves?: number;
}

export interface PuzzleHistoryEntry {
    dateKey: string;
    moves: number;
    solved: boolean;
    dnf: boolean;
    hintUsed: boolean;
    shapeLabel: string;
    optimalMoves?: number;
}

export function loadSave(dateKey: string): DailyPuzzleSave | null {
    const data = readJson<DailyPuzzleSave | null>(STORAGE_KEY, null);
    return data && data.dateKey === dateKey ? data : null;
}

export function loadHintsUsed(dateKey: string): number {
    const data = readJson<{ dateKey: string; hintsUsed: number } | null>(HINTS_USED_KEY, null);
    return data && data.dateKey === dateKey ? Math.min(3, Math.max(0, data.hintsUsed)) : 0;
}

export function saveHintsUsed(dateKey: string, hintsUsed: number): void {
    writeJson(HINTS_USED_KEY, { dateKey, hintsUsed: Math.min(3, Math.max(0, hintsUsed)) });
}

export function saveProgress(
    dateKey: string,
    moves: number,
    solved: boolean,
    dnf?: boolean,
    optimalMoves?: number
): void {
    writeJson(STORAGE_KEY, { dateKey, moves, solved, dnf: dnf ?? false, optimalMoves });
}

/** Save a completed puzzle to history */
export function saveToHistory(entry: PuzzleHistoryEntry): void {
    {
        const history = loadHistory();
        const idx = history.findIndex((h) => h.dateKey === entry.dateKey);
        if (idx >= 0) {
            // Update existing entry only if better
            if (!entry.dnf && (history[idx].dnf || entry.moves < history[idx].moves)) {
                history[idx] = entry;
            }
        } else {
            history.push(entry);
        }
        // Keep last 30 days
        history.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
        const trimmed = history.slice(0, 30);
        writeJson(HISTORY_KEY, trimmed);
    }
}

/** Load puzzle history (most recent first) */
export function loadHistory(): PuzzleHistoryEntry[] {
    return readJson<PuzzleHistoryEntry[]>(HISTORY_KEY, []);
}

export function clearSave(): void {
    removeKey(STORAGE_KEY);
    removeKey(HINTS_USED_KEY);
}
