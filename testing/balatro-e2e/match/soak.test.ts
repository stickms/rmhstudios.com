/**
 * Soak (PLAN §6.3 E2E-24): a long 1v1 — one real browser (the engine, autopilot at game
 * speed 4) against a bot peer — for a "30-minute-equivalent" match, time-accelerated:
 * `BALATRO_E2E_SOAK_ANTES` antes (default 12; a played ante takes about 2.5 minutes, so
 * 12 is half an hour of play), shopping (a reroll each shop) and the PvP round every ante,
 * the real player winning each one so the bot loses a life per ante. Asserts zero Lua
 * errors, zero protocol drops and zero page errors over the whole run, and reports the
 * wall time.
 * Opt-in: BALATRO_E2E_SOAK=1 (the nightly CI run).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MpPlayer } from '../lib/mp-player';
import { setupMatch } from '../lib/match-flow';
import { matchWorld } from './world';

const w = matchWorld();
const ANTES = Number(process.env.BALATRO_E2E_SOAK_ANTES ?? 12);
const on = process.env.BALATRO_E2E_SOAK === '1';

describe.skipIf(w.skip || !on)(w.title(`soak: ${ANTES} antes 1v1 (1 browser + 1 bot)`), () => {
  let p: MpPlayer;

  beforeAll(async () => {
    p = await w.player('soak');
  }, 600_000);

  afterAll(() => w.down());

  it(`E2E-24: ${ANTES} antes with no Lua or protocol error`, async () => {
    const bot = await w.bot('soakbot', { score: '1' });
    await setupMatch(p, [bot], 'pvp_nemesis', { pvpStartRound: 1, startingLives: Math.min(16, ANTES + 1), timer: true });
    const t0 = Date.now();
    let antes = 0;
    for (let i = 0; i < ANTES; i++) {
      const r = await p.cmd<{ result: string | null; ante: number }>('mp_ante', { chips: 1_000_000, reroll: true }, 900_000);
      antes++;
      expect(r.result ?? null, `ante ${i + 1}`).toBeNull();
      expect(w.errors(), `after ante ${i + 1}`).toEqual([]);
    }
    const s = await p.cmd<{ ante: number; state: string }>('mp_state');
    expect(s.ante).toBe(ANTES + 1);
    const mins = (Date.now() - t0) / 60_000;
    process.stdout.write(`# soak: ${antes} antes in ${mins.toFixed(1)} min wall\n`);
    expect(p.errors.filter((e) => /dropped|CRASH|frame hook failed|mailbox failed|\[lua:error\]/.test(e))).toEqual([]);
    await p.cmd('forfeit').catch(() => {});
  });
});
