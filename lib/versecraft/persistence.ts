import type { SaveFile, GameState } from './types';

const SAVE_KEY_PREFIX = 'versecraft-save-';
const GAME_VERSION = '0.1.0';

export function saveGame(state: GameState, slotId: number): boolean {
  try {
    const { currentPoemScore, previousScreen, ...savableState } = state;
    const saveFile: SaveFile = {
      version: GAME_VERSION,
      slotId,
      timestamp: Date.now(),
      playtime: state.playtime,
      state: savableState,
      chapterTitle: state.currentChapter,
      playerName: state.settings.playerName,
    };
    localStorage.setItem(`${SAVE_KEY_PREFIX}${slotId}`, JSON.stringify(saveFile));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slotId: number): SaveFile | null {
  try {
    const raw = localStorage.getItem(`${SAVE_KEY_PREFIX}${slotId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SaveFile;
  } catch {
    return null;
  }
}

export function deleteSave(slotId: number): void {
  localStorage.removeItem(`${SAVE_KEY_PREFIX}${slotId}`);
}

export function getAllSaves(): (SaveFile | null)[] {
  const saves: (SaveFile | null)[] = [];
  for (let i = 0; i < 10; i++) {
    saves.push(loadGame(i));
  }
  return saves;
}

export function autoSave(state: GameState): boolean {
  return saveGame(state, 0);
}

export function formatPlaytime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

// ─── Database Persistence (for logged-in users) ─────────────────────────────

export interface DbSavePayload {
  saveData: object;
  progress?: {
    completedChapters: string[];
    unlockedEndings: string[];
    completedRoutes: string[];
    totalPoemsWritten: number;
    totalPlaytime: number;
  };
}

export interface DbLoadResponse {
  saveData: GameState | null;
  progress: {
    completedChapters: string[];
    unlockedEndings: string[];
    completedRoutes: string[];
    totalPoemsWritten: number;
    totalPlaytime: number;
  } | null;
}

export async function dbSave(state: GameState): Promise<boolean> {
  try {
    const { currentPoemScore, previousScreen, ...savableState } = state;
    void currentPoemScore;
    void previousScreen;
    const payload: DbSavePayload = {
      saveData: savableState,
      progress: {
        completedChapters: state.completedChapters,
        unlockedEndings: [],  // TODO: track in state
        completedRoutes: Object.entries(state.affinity)
          .filter(([, a]) => a.routeCompleted)
          .map(([id]) => id),
        totalPoemsWritten: state.totalPoemsWritten,
        totalPlaytime: state.playtime,
      },
    };
    const res = await fetch('/api/versecraft/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function dbLoad(): Promise<DbLoadResponse | null> {
  try {
    const res = await fetch('/api/versecraft/save');
    if (!res.ok) return null;
    return await res.json() as DbLoadResponse;
  } catch {
    return null;
  }
}
