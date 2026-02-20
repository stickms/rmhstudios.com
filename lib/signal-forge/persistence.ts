/**
 * persistence.ts — Server-side run persistence for Signal Forge
 *
 * API wrapper functions for saving, loading, and abandoning game runs.
 * These are the only impure (side-effectful) functions in the game logic layer
 * since they perform network requests.
 */

import type { GameState } from './GameTypes';
import { serializeGameState, deserializeGameState } from './serialization';

/** Save the current game state to the server. */
export async function saveRunToServer(state: GameState): Promise<boolean> {
  try {
    const runState = serializeGameState(state);
    await fetch('/api/signal-forge/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runState }),
    });
    return true;
  } catch (e) {
    console.error('Failed to save run:', e);
    return false;
  }
}

/** Clear (abandon) the saved run on the server. */
export async function clearSavedRunOnServer(): Promise<boolean> {
  try {
    await fetch('/api/signal-forge/abandon', { method: 'POST' });
    return true;
  } catch (e) {
    console.error('Failed to clear save:', e);
    return false;
  }
}

/** Load a saved run from the server. Returns null if no saved run exists. */
export async function loadSavedRunFromServer(): Promise<GameState | null> {
  try {
    const res = await fetch('/api/signal-forge/load');
    if (!res.ok) return null;
    const data = await res.json();
    if (data.hasSavedRun && data.runState) {
      return deserializeGameState(data.runState);
    }
    return null;
  } catch (e) {
    console.error('Failed to load saved run:', e);
    return null;
  }
}

/** Check if a saved run exists on the server. */
export async function checkSavedRunOnServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/signal-forge/load');
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.hasSavedRun;
  } catch {
    return false;
  }
}
