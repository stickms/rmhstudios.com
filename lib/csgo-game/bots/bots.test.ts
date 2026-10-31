/**
 * CS bots on a synthetic two-site map (a nav mesh generated for NAV_HULL_CS from the box world, the
 * shared generator): 5 v 5 through CsMatchHost for several simulated minutes — they buy, take a site,
 * plant, defend, retake and defuse, fight, and nothing throws.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { NAV_HULL_CS, NavGenerator } from '../../tf2-game/bots/nav/generate';
import { POI_BOMB_TARGET } from '../../tf2-game/bots/nav/nav-mesh';
import { matchOptions } from '../../tf2-game/server/match.test-support';
import {
  asMapCollision,
  csCollision,
  csNavBsp,
  csTestWorld,
  setupCs,
} from '../__fixtures__/cs-world';
import { CsMatchHost } from '../server/cs-match-host';
import type { CsPlayer } from '../player';

beforeAll(setupCs);

function navMesh() {
  return new NavGenerator(csNavBsp(), asMapCollision(csCollision()), { hull: NAV_HULL_CS }).run();
}

/** Six minutes of 5v5 expert bots on the fixture map with this seed. */
function play(nav: ReturnType<typeof navMesh>, seed: number) {
  const world = csTestWorld({ seed, settings: { freezeTime: 3, roundRestartDelay: 2 } });
  const host = new CsMatchHost(
    matchOptions({
      game: 'csgo',
      variant: 'de',
      map: 'de_dust2',
      maxPlayers: 10,
      botCount: 10,
      botDifficulty: 'expert',
    }),
    { world, nav },
  );
  // Count the bomb's events at the rules (the players' stats reset when a match ends).
  const bomb = { plants: 0, defuses: 0, explosions: 0, rounds: 0 };
  const rules = world.csRules;
  const planted = rules.onBombPlanted.bind(rules);
  const defused = rules.onBombDefused.bind(rules);
  const exploded = rules.onBombExploded.bind(rules);
  const ended = rules.endRound.bind(rules);
  rules.onBombPlanted = (c4, p) => (bomb.plants++, planted(c4, p));
  rules.onBombDefused = (c4, p) => (bomb.defuses++, defused(c4, p));
  rules.onBombExploded = (c4) => (bomb.explosions++, exploded(c4));
  const wins = [0, 0, 0, 0];
  rules.endRound = (team, reason) => {
    if (rules.state === 4) {
      bomb.rounds++;
      wins[team]++;
    }
    ended(team, reason);
  };
  const moved = new Map<number, number>();
  const last = new Map<number, { x: number; y: number }>();
  const ticks = 66 * 60 * 6;
  for (let i = 0; i < ticks; i++) {
    host.tick();
    if (i % 33 === 0) {
      world.forEachPlayer((p) => {
        const l = last.get(p.id);
        if (l && p.alive)
          moved.set(p.id, (moved.get(p.id) ?? 0) + Math.hypot(p.origin.x - l.x, p.origin.y - l.y));
        last.set(p.id, { x: p.origin.x, y: p.origin.y });
      });
    }
  }
  return { bomb, wins, moved, players: world.players() as CsPlayer[] };
}

describe('CS bots', () => {
  it('generates a mesh with both bomb sites', () => {
    const mesh = navMesh();
    expect(mesh.areaCount).toBeGreaterThan(20);
    expect(mesh.pois.filter((p) => p.kind === POI_BOMB_TARGET)).toHaveLength(2);
  });

  // The bomb's flow on the small fixture map is chaotic (its spawns see each other and the sites), so
  // a few seeds are played and the objective counted over all of them.
  it('play bomb defusal for several minutes: plants, defuses or explosions, kills, no errors', () => {
    const nav = navMesh();
    const total = { plants: 0, defuses: 0, explosions: 0, wins: [0, 0, 0, 0] };
    for (const seed of [5, 6, 7]) {
      const r = play(nav, seed);
      total.plants += r.bomb.plants;
      total.defuses += r.bomb.defuses;
      total.explosions += r.bomb.explosions;
      for (let i = 0; i < 4; i++) total.wins[i] += r.wins[i];
      expect(r.players).toHaveLength(10);
      expect(r.bomb.rounds).toBeGreaterThan(3);
      expect(r.players.some((p) => p.stats.deaths > 0)).toBe(true);
      expect([...r.moved.values()].filter((d) => d > 500).length).toBeGreaterThanOrEqual(8);
    }
    expect(total.plants).toBeGreaterThan(0);
    expect(total.defuses + total.explosions).toBeGreaterThan(0);
    // Both sides win rounds.
    expect(total.wins[2]).toBeGreaterThan(0);
    expect(total.wins[3]).toBeGreaterThan(0);
  }, 300_000);
});
