/**
 * Practice (PLAN §6.3 E2E-16; PR-01/02, REF-24) in one real browser: every standard
 * practice ruleset starts a local session, reaches the Nemesis PvP blind at ante 2 with
 * the opponent shown as "???", and the PvP round ends after the last hand with no lives
 * lost; fast-forwarded to ante 8, beating the PvP blind wins the run as vanilla does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MpPlayer } from '../lib/mp-player';
import { leaveMatch } from '../lib/match-flow';
import { matchWorld } from './world';

const w = matchWorld();
const RULESETS = ['ruleset_mp_balanced', 'ruleset_mp_expanded', 'ruleset_mp_vanilla', 'ruleset_mp_smallworld'];


/** Small + Big won, cash out, leave the shop. */
async function normals(p: MpPlayer) {
  for (let i = 0; i < 2; i++) {
    await p.cmd('select_blind');
    await p.cmd('win_blind');
    await p.cmd('cash_out');
    await p.cmd('leave_shop');
  }
}

describe.skipIf(w.skip)(w.title('practice (1 browser)'), () => {
  let p: MpPlayer;

  beforeAll(async () => {
    p = await w.player('practice');
  }, 600_000);

  afterAll(() => w.down());

  for (const ruleset of RULESETS) {
    it(`E2E-16: ${ruleset} reaches the PvP blind at ante 2 showing "???"`, async () => {
      await p.ui('practice', { ruleset, deck: 'b_red', stake: 1, seed: 'PRACT1CE' });
      await p.waitSnap((s) => s.role === 'practice', 'practice session', 120_000);
      await p.cmd('wait_state', ['BLIND_SELECT', 240], 260_000);
      // Ante 1: the Boss is a vanilla boss (PvP from ante 2 in practice).
      await normals(p);
      await p.cmd('select_blind');
      await p.cmd('win_blind');
      await p.cmd('cash_out');
      await p.cmd('leave_shop');
      await normals(p);
      const before = await p.cmd<{ lives: Record<string, number> }>('mp_state');
      await p.cmd('pvp_ready');
      // The practice referee answers Ready with start_blind: countdown, then the PvP blind.
      await p.cmd('wait_state', ['SELECTING_HAND', 240], 260_000);
      const hud = await p.mp<{ blind_name?: string; enemy_score?: string; on_pvp?: boolean }>('hud');
      expect(hud.on_pvp).toBe(true);
      expect(hud.blind_name).toBe('???');
      expect(hud.enemy_score).toBe('???');
      const played = await p.cmd<{ played: number }>('pvp_play', { chips: 100 }, 600_000);
      expect(played.played).toBeGreaterThan(0);
      const end = await p.cmd<{ state: string; result: string | null }>('pvp_wait_end', {}, 300_000);
      expect(end.result ?? null).toBeNull();
      expect((await p.cmd<{ lives: Record<string, number> }>('mp_state')).lives).toEqual(before.lives);
      expect(w.errors()).toEqual([]);
      if (ruleset === 'ruleset_mp_balanced') {
        // REF-24 / PR-02: ante 9 is a vanilla win. Fast-forward to ante 8 and beat it.
        if (end.state === 'ROUND_EVAL') {
          await p.cmd('cash_out');
          await p.cmd('leave_shop');
        }
        await p.cmd('set_ante', [8]);
        await normals(p);
        await p.cmd('pvp_ready');
        await p.cmd('pvp_play', { chips: 100 }, 600_000);
        await p.cmd('pvp_wait_end', {}, 300_000).catch(() => {});
        const s = await p.cmd<{ won: boolean; ante: number }>('state');
        expect(s.won || s.ante >= 9).toBe(true);
      }
      await leaveMatch(p);
    });
  }
});
