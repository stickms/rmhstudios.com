const STORAGE_KEY = 'rmh-daily-puzzle';
const HINTS_USED_KEY = 'rmh-daily-puzzle-hints';

export interface DailyPuzzleSave {
    dateKey: string;
    moves: number;
    solved: boolean;
    dnf?: boolean;
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

/** Load hints used for today (0–3). Persists across Restart. */
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

/** Save hints used for today. */
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

export function saveProgress(dateKey: string, moves: number, solved: boolean, dnf?: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ dateKey, moves, solved, dnf: dnf ?? false })
        );
    } catch {
        // ignore
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
