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
