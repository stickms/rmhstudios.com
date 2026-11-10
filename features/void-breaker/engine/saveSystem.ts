/**
 * saveSystem.ts
 * Client-side save/load for Void Breaker using localStorage.
 * V2: Stores full game state blob from engine serialization.
 */

const SAVE_KEY = 'voidbreaker-save-v2';

export interface VoidBreakerSave {
    version: number;
    savedAt: number;          // timestamp (ms)
    wave: number;
    score: number;
    /** Full serialized game state blob */
    stateJson: Record<string, unknown>;
}

const CURRENT_VERSION = 2;

export function saveGame(stateBlob: Record<string, unknown>): void {
    try {
        const run = stateBlob.run as { wave: number } | undefined;
        const save: VoidBreakerSave = {
            version: CURRENT_VERSION,
            savedAt: Date.now(),
            wave: run?.wave ?? 0,
            score: (stateBlob.score as number) ?? 0,
            stateJson: stateBlob,
        };
        const json = JSON.stringify(save);
        // Reject payloads > 200KB
        if (json.length > 200_000) {
            console.warn('[VoidBreaker] Save payload too large, rejected.');
            return;
        }
        localStorage.setItem(SAVE_KEY, json);
    } catch (e) {
        console.warn('[VoidBreaker] Failed to save:', e);
    }
}

export function loadGame(): VoidBreakerSave | null {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw) as VoidBreakerSave;
        // Validate version
        if (data.version !== CURRENT_VERSION) {
            console.warn('[VoidBreaker] Save version mismatch, discarding.');
            deleteSave();
            return null;
        }
        // Basic integrity check
        if (typeof data.wave !== 'number' || typeof data.score !== 'number') {
            console.warn('[VoidBreaker] Corrupted save, discarding.');
            deleteSave();
            return null;
        }
        return data;
    } catch (e) {
        console.warn('[VoidBreaker] Failed to load save:', e);
        deleteSave();
        return null;
    }
}

export function hasSave(): boolean {
    try {
        return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
        return false;
    }
}

export function deleteSave(): void {
    try {
        localStorage.removeItem(SAVE_KEY);
        // Also clean up v1 saves
        localStorage.removeItem('voidbreaker-save-v1');
    } catch { /* ignore */ }
}

export function getSaveInfo(): { wave: number; savedAt: Date; score: number } | null {
    const save = loadGame();
    if (!save) return null;
    return { wave: save.wave, savedAt: new Date(save.savedAt), score: save.score };
}
