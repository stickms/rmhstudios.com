import type { ForestExplorerSave, ActId } from './types';

const STORAGE_KEY = 'forest-explorer-story-v1';
const MAX_PAYLOAD = 200 * 1024; // 200 KB
const CURRENT_VERSION = 1;

// ─── localStorage ───────────────────────────────────────────────────────────

export function saveGame(save: ForestExplorerSave): boolean {
    try {
        const json = JSON.stringify(save);
        if (json.length > MAX_PAYLOAD) {
            console.warn('[ForestExplorer] Save payload exceeds 200KB, skipping.');
            return false;
        }
        localStorage.setItem(STORAGE_KEY, json);
        return true;
    } catch (e) {
        console.warn('[ForestExplorer] Failed to save:', e);
        return false;
    }
}

export function loadGame(): ForestExplorerSave | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ForestExplorerSave;
        if (parsed.version !== CURRENT_VERSION) {
            console.warn('[ForestExplorer] Save version mismatch, discarding.');
            return null;
        }
        if (!parsed.currentAct || !parsed.actProgress) {
            console.warn('[ForestExplorer] Corrupt save data, discarding.');
            return null;
        }
        return parsed;
    } catch (e) {
        console.warn('[ForestExplorer] Failed to load save:', e);
        return null;
    }
}

export function hasSave(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed?.version === CURRENT_VERSION;
    } catch {
        return false;
    }
}

export function deleteSave(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.warn('[ForestExplorer] Failed to delete save:', e);
    }
}

export function getSaveInfo(): { currentAct: ActId; playtime: number; savedAt: number } | null {
    const save = loadGame();
    if (!save) return null;
    return {
        currentAct: save.currentAct,
        playtime: save.playtime,
        savedAt: save.savedAt,
    };
}

// ─── Default save factory ───────────────────────────────────────────────────

function defaultActProgress(): import('./types').ActProgress {
    return {
        puzzlesSolved: [],
        journalEntriesFound: [],
        landmarksVisited: [],
        checkpointPosition: [0, 1.7, 0],
        checkpointRotation: [0, 0],
    };
}

export function createNewSave(): ForestExplorerSave {
    return {
        version: 1,
        savedAt: Date.now(),
        currentAct: 'act1',
        playtime: 0,
        actProgress: {
            act1: defaultActProgress(),
            act2: defaultActProgress(),
            act3: defaultActProgress(),
        },
        puzzleStates: {},
        journalEntries: [],
        storyFlags: {},
    };
}

// ─── DB sync helpers ────────────────────────────────────────────────────────

export async function dbSave(save: ForestExplorerSave): Promise<boolean> {
    try {
        const res = await fetch('/api/forest-explorer/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saveData: save }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function dbLoad(): Promise<ForestExplorerSave | null> {
    try {
        const res = await fetch('/api/forest-explorer/save');
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.saveData) return null;
        const save = data.saveData as ForestExplorerSave;
        if (save.version !== CURRENT_VERSION) return null;
        return save;
    } catch {
        return null;
    }
}
