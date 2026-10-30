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

describe('CS bots', () => {
  it('generates a mesh with both bomb sites', () => {
    const mesh = navMesh();
    expect(mesh.areaCount).toBeGreaterThan(20);
    expect(mesh.pois.filter((p) => p.kind === POI_BOMB_TARGET)).toHaveLength(2);
  });

  it('play bomb defusal for several minutes: plants, defuses or explosions, kills, no errors', () => {
    const nav = navMesh();
    const world = csTestWorld({ seed: 5, settings: { freezeTime: 3, roundRestartDelay: 2 } });
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
            moved.set(
              p.id,
              (moved.get(p.id) ?? 0) + Math.hypot(p.origin.x - l.x, p.origin.y - l.y),
            );
          last.set(p.id, { x: p.origin.x, y: p.origin.y });
        });
      }
    }
    const players = world.players() as CsPlayer[];
    expect(players).toHaveLength(10);
    expect(bomb.rounds).toBeGreaterThan(3);
    expect(bomb.plants).toBeGreaterThan(0);
    expect(bomb.defuses + bomb.explosions).toBeGreaterThan(0);
    // Both sides win rounds, and people die.
    expect(wins[2]).toBeGreaterThan(0);
    expect(wins[3]).toBeGreaterThan(0);
    expect(players.some((p) => p.stats.deaths > 0)).toBe(true);
    expect([...moved.values()].filter((d) => d > 500).length).toBeGreaterThanOrEqual(8);
  }, 300_000);
});
