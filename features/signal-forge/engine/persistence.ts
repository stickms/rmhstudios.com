/**
 * Signal Forge client persistence: the network calls for the cloud save, the score and the leaderboard.
 * The only impure module of the engine; everything it returns is classified by save.ts first.
 */
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import type { SignalForgeRunFacts } from './achievements';
import { classifySave, makeBlob, type ClassifiedSave, type SaveMeta } from './save';
import {
  abandonSignalForgeRunApi,
  getSignalForgeLeaderboardApi,
  loadSignalForgeRunApi,
  saveSignalForgeRunApi,
  submitSignalForgeScoreApi,
  type SignalForgeLeaderboardRow,
} from './signal-forge.contract';
import type { RunState } from './types';

export async function loadSave(): Promise<ClassifiedSave | null> {
  try {
    const data = await api(loadSignalForgeRunApi, { retries: 0 });
    return classifySave(data.hasSavedRun ? data.runState : null);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error('Signal Forge: load failed', e);
    return null;
  }
}

export async function saveRun(run: RunState | null, meta: SaveMeta): Promise<boolean> {
  try {
    await api(saveSignalForgeRunApi, { body: { runState: makeBlob(run, meta) as unknown as Record<string, unknown> } });
    return true;
  } catch {
    return false;
  }
}

export async function abandonRun(): Promise<void> {
  try {
    await api(abandonSignalForgeRunApi);
  } catch {
    /* a failed abandon is replaced by the next save */
  }
}

export interface SubmitResult {
  ok: boolean;
  ranked: boolean;
  achievements: string[];
}

export async function submitScore(score: number, floorReached: number, durationMs: number, facts: SignalForgeRunFacts): Promise<SubmitResult> {
  try {
    const res = await api(submitSignalForgeScoreApi, { body: { score, floorReached: Math.max(1, floorReached), durationMs, facts } });
    return { ok: true, ranked: res.ranked, achievements: res.achievements ?? [] };
  } catch {
    return { ok: false, ranked: false, achievements: [] };
  }
}

export async function fetchLeaderboard(): Promise<SignalForgeLeaderboardRow[]> {
  try {
    return await api(getSignalForgeLeaderboardApi, { retries: 0 });
  } catch {
    return [];
  }
}
