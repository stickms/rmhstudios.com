// Browser side of server-verified solo runs: ask the server for a seed, hand the log in at the end,
// and wait for the verdict. Every function degrades to "no server run" (null / 'offline') so a signed-out
// player, a network error or an old server leaves single-player working exactly as it did.

import { encodeRunLog } from '../verify/log-codec';
import { api } from '@/lib/contract/client';
import { getAltairRunStatusApi, startAltairRunApi } from '../altair.contract';
import { loadoutFromUpgrades } from './loadout';
import { setSoloSession, type ActiveRun } from './session';
import type { SoloLoadout } from './solo-log';

export interface StartedRun {
  runId: string;
  seed: number;
  classId: string;
  doubleTime: boolean;
  loadout: SoloLoadout;
}

/** Ask the server to issue a run and stage it for GameScreen. Null when it cannot (signed out, offline). */
export async function startServerRun(
  classId: string,
  doubleTime: boolean,
  heat = 0,
): Promise<StartedRun | null> {
  try {
    const run = await api(startAltairRunApi, {
      body: { classId, doubleTime, ...(heat > 0 ? { heat } : {}) },
      ...(typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? { signal: AbortSignal.timeout(5000) }
        : {}),
    });
    if (typeof run.runId !== 'string' || typeof run.seed !== 'number') return null;
    // Normalise through the same derivation the server used (guards against a malformed payload).
    const loadout = { ...loadoutFromUpgrades(null), ...run.loadout };
    setSoloSession({ runId: run.runId, seed: run.seed, loadout });
    return { ...run, loadout };
  } catch {
    return null;
  }
}

export type SubmitStatus = 'queued' | 'inline' | 'unverified' | 'duplicate' | 'offline';

/** Keepalive requests are capped near 64 KB, and CompressionStream is async (not available at unload). */
const KEEPALIVE_MAX_CHARS = 60_000;

/** Hand the finished (or abandoned) run in. */
export async function submitSoloRun(
  runId: string,
  run: ActiveRun,
  keepalive: boolean,
): Promise<SubmitStatus> {
  try {
    const log = run.toLog();
    const r = run.result();
    let enc: { enc: 'gzip-b64' | 'json'; data: string } | null;
    if (keepalive) {
      const json = JSON.stringify(log);
      enc = json.length <= KEEPALIVE_MAX_CHARS ? { enc: 'json', data: json } : null;
    } else {
      enc = await encodeRunLog(log);
    }
    if (!enc) return 'offline';
    const res = await fetch('/api/altair/run/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive,
      body: JSON.stringify({
        runId,
        log: enc,
        claim: {
          victory: r.status === 'victory',
          kills: r.kills,
          level: r.level,
          finalCoins: r.finalCoins,
        },
      }),
    });
    if (!res.ok) return 'offline';
    const body = (await res.json()) as { status?: string };
    if (
      body.status === 'queued' ||
      body.status === 'inline' ||
      body.status === 'unverified' ||
      body.status === 'duplicate'
    ) {
      return body.status;
    }
    return 'offline';
  } catch {
    return 'offline';
  }
}

/** Poll until the server has a verdict (or give up). Resolves the final status, 'timeout' if none. */
export async function waitForVerdict(
  runId: string,
  maxMs = 5 * 60_000,
): Promise<'verified' | 'rejected' | 'unverified' | 'timeout'> {
  const until = Date.now() + maxMs;
  let delay = 1500;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 8000);
    try {
      const { status } = await api(getAltairRunStatusApi, { query: { runId }, retries: 0 });
      if (status === 'verified' || status === 'rejected' || status === 'unverified') return status;
    } catch {
      // keep trying
    }
  }
  return 'timeout';
}
