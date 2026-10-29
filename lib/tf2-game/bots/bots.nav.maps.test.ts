/**
 * The bots' navigation on the nine hosted maps (needs TF2_ROOT):
 *
 *   - the mesh generates within its budget with a sane area count, and every
 *     team spawn connects to every objective (flags, capture zones, control
 *     points, the payload track);
 *   - nav.bin round-trips;
 *   - a single bot, moving through playerMove like any bot, walks from its
 *     team's spawn to each objective its team plays for right now (waiting
 *     out setup gates) and gets within 64 units.
 */
import { describe, expect, it } from 'vitest';
import { TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import {
  POI_CAPTURE_AREA,
  POI_CAPTURE_ZONE,
  POI_CONTROL_POINT,
  POI_FLAG,
  POI_PATH_TRACK,
  POI_SPAWN,
} from './nav/nav-mesh';
import { decodeNavMesh, encodeNavMesh } from './nav/serialize';
import { GameWorld } from '../sim/world';
import { registerAllSimModules } from '../sim/register-all';
import { clearNavCache, getBotManager } from './brain/manager';
import {
  BOT_MAPS,
  botWorld,
  loadBotMap,
  navFor,
  objectiveTargets,
  TF2_ROOT,
  walkTo,
} from './__fixtures__/maps';

/** Seconds a walk may take (the longest routes, e.g. 2fort spawn to the enemy intel, take ~50 s). */
const WALK_BUDGET = 120;

describe.skipIf(!TF2_ROOT)('bot navigation on the hosted maps', () => {
  it('builds the mesh in the background, a slice per tick, when a package has none', () => {
    registerAllSimModules();
    clearNavCache();
    const map = loadBotMap('ctf_turbine');
    const world = new GameWorld({ map, options: { seed: 1 } });
    const mgr = getBotManager(world);
    expect(mgr.mesh).toBeNull();
    let ticks = 0;
    while (!mgr.mesh && ticks < 5000) {
      world.step();
      mgr.update();
      ticks++;
    }
    expect(mgr.mesh).not.toBeNull();
    // Spread over many ticks, and the same mesh as generating it in one go.
    expect(ticks).toBeGreaterThan(20);
    expect(mgr.mesh!.areaCount).toBe(navFor('ctf_turbine').mesh.areaCount);
    // The next world on this map gets it from the cache at once.
    expect(getBotManager(new GameWorld({ map, options: { seed: 2 } })).mesh).toBe(mgr.mesh);
  });

  describe.each(BOT_MAPS)('%s', (map) => {
    it('generates a connected mesh within budget and round-trips nav.bin', () => {
      const { mesh, stats, ms } = navFor(map);
      // eslint-disable-next-line no-console
      console.log(
        `[nav] ${map}: ${stats.areas} areas, ${stats.connections} connections, ${stats.nodes} samples, ${stats.sectors} sectors, ${(ms / 1000).toFixed(2)} s`,
      );
      expect(ms).toBeLessThan(60_000);
      expect(stats.areas).toBeGreaterThan(300);
      expect(stats.areas).toBeLessThan(12_000);
      expect(stats.seedsFailed).toBeLessThanOrEqual(3);

      // Every team spawn reaches every objective point of interest.
      const reach = (start: number): Uint8Array => {
        const seen = new Uint8Array(mesh.areaCount);
        const stack = [start];
        seen[start] = 1;
        while (stack.length) {
          const a = stack.pop()!;
          for (let c = mesh.connStart[a]; c < mesh.connStart[a + 1]; c++) {
            const b = mesh.connTo[c];
            if (!seen[b]) {
              seen[b] = 1;
              stack.push(b);
            }
          }
        }
        return seen;
      };
      const objectiveKinds = [
        POI_CONTROL_POINT,
        POI_CAPTURE_AREA,
        POI_FLAG,
        POI_CAPTURE_ZONE,
        POI_PATH_TRACK,
      ];
      const spawnAreas = new Set(
        mesh.pois
          .filter((p) => p.kind === POI_SPAWN && p.team >= TF_TEAM_RED && p.area >= 0)
          .map((p) => p.area),
      );
      expect(spawnAreas.size).toBeGreaterThan(1);
      const missing: string[] = [];
      for (const s of spawnAreas) {
        const seen = reach(s);
        for (const p of mesh.pois) {
          if (!objectiveKinds.includes(p.kind)) continue;
          // Decorative path_tracks (granary's lighting rails) are not objectives.
          if (p.kind === POI_PATH_TRACK && !map.startsWith('pl_')) continue;
          if (p.area < 0 || !seen[p.area]) missing.push(`${p.kind}:${p.name} from area ${s}`);
        }
      }
      expect(missing).toEqual([]);

      const bin = encodeNavMesh(mesh);
      const back = decodeNavMesh(bin);
      expect(back.areaCount).toBe(mesh.areaCount);
      expect(back.connectionCount).toBe(mesh.connectionCount);
      expect(encodeNavMesh(back)).toEqual(bin);
      // eslint-disable-next-line no-console
      console.log(`[nav] ${map}: nav.bin ${(bin.length / 1024).toFixed(0)} KiB`);
    });

    it('walks a bot from each team spawn to every current objective', () => {
      const world = botWorld(map);
      const red = world.addPlayer('red walker', { bot: true });
      red.requestTeam(TF_TEAM_RED);
      red.requestClass(3);
      const blu = world.addPlayer('blu walker', { bot: true });
      blu.requestTeam(TF_TEAM_BLUE);
      blu.requestClass(3);
      for (let i = 0; i < 66 * 2; i++) world.step();
      const failed: string[] = [];
      const done: string[] = [];
      for (const p of [red, blu]) {
        for (const target of objectiveTargets(world, p.team)) {
          const r = walkTo(world, p, target.pos, WALK_BUDGET);
          (r.reached ? done : failed).push(
            `team ${p.team} → ${target.label}: ${r.reached ? `${r.seconds.toFixed(1)} s` : `closest ${r.closest.toFixed(0)}`}`,
          );
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[path] ${map}: ${done.join('; ')}`);
      expect(done.length).toBeGreaterThan(0);
      expect(failed).toEqual([]);
    });
  });
});
