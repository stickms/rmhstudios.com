/**
 * An offline-style game (needs TF2_ROOT): one human joining through the
 * host (team and class commands, input packets like a client's) with eleven
 * TFBots filling the server — the listen server's set-up. The bots take
 * their seats on both teams, fight the human's team and work the point.
 */
import { describe, expect, it } from 'vitest';
import { TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import { runBotMatch, TF2_ROOT } from './__fixtures__/maps';
import { describeResult } from './__fixtures__/match-suite';

describe.skipIf(!TF2_ROOT)('offline: one human and eleven bots', () => {
  it('fills the seats and plays koth_viaduct around the human', () => {
    const r = runBotMatch('koth_viaduct', {
      minutes: 3,
      bots: 11,
      maxPlayers: 12,
      scriptedHuman: true,
    });
    // eslint-disable-next-line no-console
    console.log(describeResult(r));
    const world = r.host.world;
    const human = r.human!;
    expect(human).not.toBeNull();
    expect(human.team).toBe(TF_TEAM_RED);
    expect(human.isBot).toBe(false);
    let bots = 0;
    let red = 0;
    let blu = 0;
    world.forEachPlayer((p) => {
      if (p.isBot) bots++;
      if (p.team === TF_TEAM_RED) red++;
      if (p.team === TF_TEAM_BLUE) blu++;
    });
    expect(bots).toBe(11);
    // Every seat taken, the teams within two (bots join balanced; the human picked RED).
    expect(red + blu).toBe(12);
    expect(Math.abs(red - blu)).toBeLessThanOrEqual(2);
    // The human was simulated (its commands reached the world) and the bots played.
    expect(r.host.lastCommandRun(1001)).toBeGreaterThan(1000);
    expect(r.kills.reduce((a, b) => a + b, 0)).toBeGreaterThan(5);
    expect(r.captures.length).toBeGreaterThan(0);
    expect(r.nonFinite).toBe(0);
    expect(r.movedPerMinute.filter((d) => d > 500).length).toBeGreaterThanOrEqual(10);
    r.host.dispose();
  }, 600_000);
});
