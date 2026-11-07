// Models CPU seats are dealt from. Dependency-free: shared by the socket hub,
// the local-match builder and the tests. A pick that R2 does not hold simply
// renders as the Y-Bot on the client (chooseFighterView), so the pool may name
// models that are not published everywhere.
import { DEFAULT_FIGHTER_MODEL } from './models';

export const AI_MODEL_POOL: readonly string[] = [
    DEFAULT_FIGHTER_MODEL,
    'tf2_scout', 'tf2_soldier', 'tf2_pyro', 'tf2_demoman', 'tf2_heavy',
    'tf2_engineer', 'tf2_medic', 'tf2_sniper', 'tf2_spy',
    'csgo_tm_phoenix', 'csgo_ctm_sas', 'hl2_combine', 'hl2_police', 'portal_chell',
];

/** Deterministic pick (the hub: same seat, same model every roster build). */
export function aiModelForSeat(seat: number): string {
    return AI_MODEL_POOL[seat % AI_MODEL_POOL.length];
}

/** Random pick (local matches). `rand` is injectable for tests. */
export function randomAiModel(rand: () => number = Math.random): string {
    return AI_MODEL_POOL[Math.floor(rand() * AI_MODEL_POOL.length)] ?? DEFAULT_FIGHTER_MODEL;
}
