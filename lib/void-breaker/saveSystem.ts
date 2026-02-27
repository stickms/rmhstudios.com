/**
 * saveSystem.ts
 * Client-side save/load for Void Breaker using localStorage.
 * Persists: stage, player stats, shards, abilities, story flags.
 */

const SAVE_KEY = 'voidbreaker-save-v1';

export interface VoidBreakerSave {
    version: number;
    savedAt: number;          // timestamp (ms)
    wave: number;
    score: number;
    playerHp: number;
    playerMaxHp: number;
    shards: number;
    abilitiesUnlocked: string[];
    storyFlags: Record<string, boolean>;
    bossesKilled: number;
    enemiesKilled: number;
    focusUsed: number;
    detonations: number;
}

const CURRENT_VERSION = 1;

export function saveGame(data: Omit<VoidBreakerSave, 'version' | 'savedAt'>): void {
    try {
        const save: VoidBreakerSave = {
            ...data,
            version: CURRENT_VERSION,
            savedAt: Date.now(),
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(save));
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
    } catch { /* ignore */ }
}

export function getSaveInfo(): { wave: number; savedAt: Date } | null {
    const save = loadGame();
    if (!save) return null;
    return { wave: save.wave, savedAt: new Date(save.savedAt) };
}
