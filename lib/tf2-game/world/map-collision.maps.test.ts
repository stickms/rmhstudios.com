import { describe, expect, it } from 'vitest';
import {
  MASK_PLAYERSOLID,
  MASK_SHOT,
  MASK_SOLID,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
} from '../core/constants';
import { emptyTrace } from '../core/types';
import type { Vec3 } from '../core/vec';
import { parseBsp, texInfoMaterial, type BspFile } from '../formats/bsp';
import { DISP_SURF_NORAY_COLL } from '../formats/bsp';
import { findEntities } from '../formats/keyvalues';
import { gameFileSystem, readMap } from '../formats/tf2-root.test-support';
import { MapCollision } from './map-collision';
import { addBspStaticProps, propResolver } from './prop-collision';

const MAPS = ['ctf_2fort', 'cp_dustbowl', 'pl_badwater', 'koth_viaduct', 'cp_granary'];

/** Deterministic random stream for reproducible traces. */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe.skipIf(!process.env.TF2_ROOT)('MapCollision on real maps (TF2_ROOT)', () => {
  const loaded = new Map<string, { bsp: BspFile; col: MapCollision; props: number }>();
  const load = (map: string) => {
    let l = loaded.get(map);
    if (!l) {
      const bsp = parseBsp(readMap(map));
      const col = new MapCollision(bsp);
      const props = addBspStaticProps(col, bsp, propResolver(gameFileSystem()));
      l = { bsp, col, props };
      loaded.set(map, l);
    }
    return l;
  };
  const tr = emptyTrace();

  it.each(MAPS)('%s: every spawn has a floor below and room for a player', (map) => {
    const { bsp, col, props } = load(map);
    expect(props).toBe(bsp.staticProps!.props.filter((p) => p.solid !== 0).length);
    const spawns = findEntities(bsp.entities, 'info_player_teamspawn');
    expect(spawns.length).toBeGreaterThan(8);
    for (const s of spawns) {
      // Disabled spawns can be leftovers buried in geometry (cp_dustbowl has four); the game never uses them.
      if (s.get('StartDisabled') === '1') continue;
      const o = s.origin;
      const start = { x: o.x, y: o.y, z: o.z + 8 };
      col.traceLine(start, { x: o.x, y: o.y, z: o.z - 200 }, MASK_PLAYERSOLID, null, tr);
      expect(tr.startSolid).toBe(false);
      expect(tr.fraction).toBeLessThan(1);
      expect(start.z - tr.endPos.z).toBeLessThan(100);
      expect(tr.plane.normal.z).toBeGreaterThan(0.7); // a walkable floor
      col.traceHull(o, o, VEC_HULL_MIN, VEC_HULL_MAX, MASK_PLAYERSOLID, null, tr);
      expect(tr.startSolid, `${map} spawn at ${o.x} ${o.y} ${o.z}`).toBe(false);
    }
  });

  it.each(MAPS)('%s: line traces are symmetric through brushes and props', (map) => {
    const { bsp } = load(map);
    // Displacements are one-sided in Source (SDK: SweepAABBTriIntersect culls back faces), so
    // symmetry only holds without them.
    const col = new MapCollision(bsp, { displacements: [] });
    addBspStaticProps(col, bsp, propResolver(gameFileSystem()));
    const spawns = findEntities(bsp.entities, 'info_player_teamspawn');
    const rnd = lcg(11);
    let blocked = 0;
    let asymmetric = 0;
    for (let i = 0; i < 2000; i++) {
      const s = spawns[i % spawns.length].origin;
      const a: Vec3 = {
        x: s.x + (rnd() - 0.5) * 400,
        y: s.y + (rnd() - 0.5) * 400,
        z: s.z + 20 + rnd() * 60,
      };
      const b: Vec3 = {
        x: s.x + (rnd() - 0.5) * 3000,
        y: s.y + (rnd() - 0.5) * 3000,
        z: s.z + (rnd() - 0.5) * 600,
      };
      col.traceLine(a, b, MASK_SHOT, null, tr);
      const ab = tr.fraction < 1 || tr.startSolid;
      col.traceLine(b, a, MASK_SHOT, null, tr);
      const ba = tr.fraction < 1 || tr.startSolid;
      if (ab !== ba) asymmetric++;
      if (ab) blocked++;
    }
    expect(blocked).toBeGreaterThan(500);
    // CM_ClipBoxToBrush's DIST_EPSILON widens a brush on the entering side only, so a line
    // grazing a brush edge within 1/32 unit can hit one way and not the other (as in Source).
    // That is the only asymmetry allowed: a handful in 2000.
    expect(asymmetric).toBeLessThanOrEqual(4);
  });

  it.each(MAPS)('%s: rays hit displacements from the front with the face material', (map) => {
    const { bsp, col } = load(map);
    let tested = 0;
    let material = 0;
    let onSurface = 0;
    for (const d of col.displacements) {
      if (!d || d.flags & DISP_SURF_NORAY_COLL) continue;
      const mid = ((d.size * d.size) >> 1) * 3;
      const p = { x: d.positions[mid], y: d.positions[mid + 1], z: d.positions[mid + 2] };
      const n = { x: d.normals[mid], y: d.normals[mid + 1], z: d.normals[mid + 2] };
      const a = { x: p.x + n.x * 4, y: p.y + n.y * 4, z: p.z + n.z * 4 };
      const b = { x: p.x - n.x * 4, y: p.y - n.y * 4, z: p.z - n.z * 4 };
      // Displacements often tuck under brushes and props; only test where the ray starts in the open.
      col.traceLine(a, a, MASK_SOLID, null, tr);
      if (tr.startSolid) continue;
      col.traceLine(a, b, MASK_SOLID, null, tr);
      expect(tr.startSolid).toBe(false);
      tested++;
      // Every ray is stopped; nearly all on the surface (within the 1/32 pull-back plus float
      // slack) — the rest by props, brushes or other displacements overlapping it…
      expect(tr.fraction).toBeLessThan(1);
      if (Math.hypot(tr.endPos.x - p.x, tr.endPos.y - p.y, tr.endPos.z - p.z) < 1) onSurface++;
      // …reporting the displacement's material, unless a coplanar nodraw brush under it wins the tie.
      if (tr.surfaceName === texInfoMaterial(bsp, d.texInfo)) material++;
    }
    expect(tested).toBeGreaterThan(50);
    expect(onSurface / tested).toBeGreaterThan(0.9);
    expect(material / tested).toBeGreaterThan(0.75);
  });

  it.each(MAPS)('%s: a point inside each prop convex is solid', (map) => {
    const { bsp, col } = load(map);
    const resolve = propResolver(gameFileSystem());
    let tested = 0;
    let solid = 0;
    const R = new Float64Array(9);
    for (const p of bsp.staticProps!.props) {
      if (p.solid !== 6) continue;
      const m = resolve(p.model);
      if (!m || m.hulls.length === 0) continue;
      const h = m.hulls[0];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < h.length; i += 3) {
        cx += h[i];
        cy += h[i + 1];
        cz += h[i + 2];
      }
      const n = h.length / 3;
      cx /= n;
      cy /= n;
      cz /= n;
      // Model → world (yaw/pitch/roll as the SDK's AngleMatrix).
      const d2r = Math.PI / 180;
      const [sp, cp] = [Math.sin(p.angles.x * d2r), Math.cos(p.angles.x * d2r)];
      const [sy, cy2] = [Math.sin(p.angles.y * d2r), Math.cos(p.angles.y * d2r)];
      const [sr, cr] = [Math.sin(p.angles.z * d2r), Math.cos(p.angles.z * d2r)];
      R.set([
        cp * cy2,
        sr * sp * cy2 - cr * sy,
        cr * sp * cy2 + sr * sy,
        cp * sy,
        sr * sp * sy + cr * cy2,
        cr * sp * sy - sr * cy2,
        -sp,
        sr * cp,
        cr * cp,
      ]);
      const w = {
        x: R[0] * cx + R[1] * cy + R[2] * cz + p.origin.x,
        y: R[3] * cx + R[4] * cy + R[5] * cz + p.origin.y,
        z: R[6] * cx + R[7] * cy + R[8] * cz + p.origin.z,
      };
      col.traceHull(
        w,
        w,
        { x: -0.5, y: -0.5, z: -0.5 },
        { x: 0.5, y: 0.5, z: 0.5 },
        MASK_SOLID,
        null,
        tr,
      );
      tested++;
      if (tr.startSolid) solid++;
    }
    expect(tested).toBeGreaterThan(100);
    expect(solid / tested).toBeGreaterThan(0.97);
  });

  it('ctf_2fort: 10k random player-hull traces run well under a second', () => {
    const { bsp, col } = load('ctf_2fort');
    const spawns = findEntities(bsp.entities, 'info_player_teamspawn');
    const rnd = lcg(5);
    const starts: Vec3[] = [];
    const ends: Vec3[] = [];
    for (let i = 0; i < 10_000; i++) {
      const s = spawns[i % spawns.length].origin;
      starts.push({
        x: s.x + (rnd() - 0.5) * 200,
        y: s.y + (rnd() - 0.5) * 200,
        z: s.z + 10 + rnd() * 50,
      });
      ends.push({
        x: s.x + (rnd() - 0.5) * 2000,
        y: s.y + (rnd() - 0.5) * 2000,
        z: s.z + (rnd() - 0.5) * 500,
      });
    }
    // Warm up the JIT, then time.
    for (let i = 0; i < 2000; i++)
      col.traceHull(starts[i], ends[i], VEC_HULL_MIN, VEC_HULL_MAX, MASK_PLAYERSOLID, null, tr);
    const t0 = performance.now();
    let hits = 0;
    for (let i = 0; i < starts.length; i++) {
      col.traceHull(starts[i], ends[i], VEC_HULL_MIN, VEC_HULL_MAX, MASK_PLAYERSOLID, null, tr);
      if (tr.fraction < 1) hits++;
    }
    const ms = performance.now() - t0;
    console.warn(`ctf_2fort: 10k player-hull traces in ${ms.toFixed(1)} ms (${hits} hit)`);
    expect(hits).toBeGreaterThan(5000);
    expect(ms).toBeLessThan(1000);
  });
});
