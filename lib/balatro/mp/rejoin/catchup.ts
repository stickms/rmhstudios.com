/**
 * Rejoin bookkeeping on this peer (NET-06, LOB-14):
 *
 * - the localStorage hint `rmh-balatro-mp-rejoin` (= runId) — set while this
 *   player holds a seat in a running match, cleared when the match ends for
 *   them or they give the seat up; boot reads it (runtime.ts, WS3) to preload
 *   the MP pack and the session asks the hub `balatro:seat:query`;
 * - the catch-up rule: a crash rejoiner is "catching up" from the restore
 *   until its run is live again (the first `flags` past ante 0 after
 *   `rejoin_restore`, reported to the host as `player_info`); the host
 *   forfeits it after `CATCH_UP_LIMIT_MS` (3 min).
 */

import { MP_REJOIN_HINT_KEY } from '../../runtime';
import { BALATRO_LIMITS } from '../../net/limits';
import { kvGet, kvSet, type KeyValue } from '../history';

export const REJOIN_HINT_KEY = MP_REJOIN_HINT_KEY;
export const CATCH_UP_LIMIT_MS = BALATRO_LIMITS.CATCH_UP_LIMIT_MS;

export function rejoinHint(kv: KeyValue | null): string | null {
  const v = kvGet(kv, REJOIN_HINT_KEY);
  return v && /^[A-Za-z0-9_-]{1,32}$/.test(v) ? v : null;
}

export function setRejoinHint(kv: KeyValue | null, runId: string | null): void {
  kvSet(kv, REJOIN_HINT_KEY, runId);
}
