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
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw) as DailyPuzzleSave;
        return data.dateKey === dateKey ? data : null;
    } catch {
        return null;
    }
}

export function loadHintsUsed(dateKey: string): number {
    if (typeof window === 'undefined') return 0;
    try {
        const raw = localStorage.getItem(HINTS_USED_KEY);
        if (!raw) return 0;
        const data = JSON.parse(raw) as { dateKey: string; hintsUsed: number };
        return data.dateKey === dateKey ? Math.min(3, Math.max(0, data.hintsUsed)) : 0;
    } catch {
        return 0;
    }
}

export function saveHintsUsed(dateKey: string, hintsUsed: number): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(
            HINTS_USED_KEY,
            JSON.stringify({ dateKey, hintsUsed: Math.min(3, Math.max(0, hintsUsed)) })
        );
    } catch {
        // ignore
    }
}

export function saveProgress(
    dateKey: string,
    moves: number,
    solved: boolean,
    dnf?: boolean,
    optimalMoves?: number
): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ dateKey, moves, solved, dnf: dnf ?? false, optimalMoves })
        );
    } catch {
        // ignore
    }
}

/** Save a completed puzzle to history */
export function saveToHistory(entry: PuzzleHistoryEntry): void {
    if (typeof window === 'undefined') return;
    try {
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
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch {
        // ignore
    }
}

/** Load puzzle history (most recent first) */
export function loadHistory(): PuzzleHistoryEntry[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as PuzzleHistoryEntry[];
    } catch {
        return [];
    }
}

export function clearSave(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(HINTS_USED_KEY);
    } catch {
        // ignore
    }
}
