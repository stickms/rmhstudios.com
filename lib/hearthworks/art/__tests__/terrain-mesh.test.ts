import { describe, expect, it } from 'vitest';
import { LEVEL_HEIGHT, MEADOW_LEVEL, createWorld, type World } from '../../world';
import { buildTerrainMesh } from '..';

function flat(n = 8, kind: World['terrain'][number] = 'grass', level = 3): World {
  const w = createWorld(1, n);
  w.terrain = w.terrain.map(() => kind);
  w.height = w.height.map(() => level);
  return w;
}

describe('buildTerrainMesh', () => {
  it('produces consistent, finite buffers for a real world', () => {
    const w = createWorld(42, 32);
    const m = buildTerrainMesh(w);
    expect(m.positions.length % 3).toBe(0);
    expect(m.normals.length).toBe(m.positions.length);
    expect(m.colors.length).toBe(m.positions.length);
    expect(m.indices.length % 3).toBe(0);
    expect(m.faceTile.length).toBe(m.indices.length / 3);
    const vertexCount = m.positions.length / 3;
    for (const i of m.indices) expect(i).toBeLessThan(vertexCount);
    for (const v of [...m.positions, ...m.normals, ...m.colors]) expect(Number.isFinite(v)).toBe(true);
    for (const c of m.colors) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    for (const t of m.faceTile) expect(t).toBeLessThan(w.size * w.size);
  });

  it('gives every tile a top face at its height, and a flat world has walls only at the rim', () => {
    const w = flat(8);
    const m = buildTerrainMesh(w);
    const seen = new Set(m.faceTile);
    expect(seen.size).toBe(64);
    // 64 tops + 4*8 rim skirt quads, 2 triangles each
    expect(m.faceTile.length).toBe((64 + 32) * 2);
    for (let i = 0; i < m.positions.length / 3; i++)
      if (m.normals[i * 3 + 1] === 1) expect(m.positions[i * 3 + 1]).toBeCloseTo(3 * LEVEL_HEIGHT, 5);
  });

  it('adds a cliff wall between a tile and a lower neighbour, facing outward and downhill', () => {
    const w = flat(8);
    w.height[3 * 8 + 3] = MEADOW_LEVEL + 2;
    const m = buildTerrainMesh(w);
    let walls = 0;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const nx = m.normals[i * 3];
      const nz = m.normals[i * 3 + 2];
      if ((nx !== 0 || nz !== 0) && m.positions[i * 3 + 1] > 3 * LEVEL_HEIGHT + 1e-6) walls++;
    }
    expect(walls).toBe(4 * 2); // four walls × two top vertices above the surrounding level
  });

  it('orients every triangle to face along its stored normal', () => {
    const m = buildTerrainMesh(createWorld(7, 24));
    for (let f = 0; f < m.indices.length; f += 3) {
      const [a, b, c] = [m.indices[f], m.indices[f + 1], m.indices[f + 2]];
      const p = (i: number) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
      const [pa, pb, pc] = [p(a), p(b), p(c)];
      const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dot = cross[0] * m.normals[a * 3] + cross[1] * m.normals[a * 3 + 1] + cross[2] * m.normals[a * 3 + 2];
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('blends colour across a terrain boundary: the shared corner matches on both tiles, mid-way between them', () => {
    const w = flat(8, 'grass');
    for (let z = 0; z < 8; z++) for (let x = 4; x < 8; x++) w.terrain[z * 8 + x] = 'rock';
    const m = buildTerrainMesh(w, { ao: false });
    // corner between tiles (3,3) and (4,3) at world (3.5, ·, 2.5)
    const at: number[][] = [];
    for (let i = 0; i < m.positions.length / 3; i++) {
      if (m.normals[i * 3 + 1] !== 1) continue;
      if (Math.abs(m.positions[i * 3] - 3.5) < 1e-6 && Math.abs(m.positions[i * 3 + 2] - 2.5) < 1e-6)
        at.push([m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]]);
    }
    expect(at.length).toBe(4); // four tiles meet here
    for (const c of at) for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(at[0][k], 6);
    // and it is not the pure colour of either side
    const far = [...m.colors.slice(0, 3)];
    expect(at[0].some((v, k) => Math.abs(v - far[k]) > 0.01)).toBe(true);
  });

  it('darkens corners beside a taller neighbour only when ambient occlusion is on', () => {
    const w = flat(8);
    w.height[3 * 8 + 4] = 6;
    const lit = buildTerrainMesh(w, { ao: false });
    const shaded = buildTerrainMesh(w, { ao: true });
    let darker = 0;
    for (let i = 0; i < lit.colors.length; i++) {
      expect(shaded.colors[i]).toBeLessThanOrEqual(lit.colors[i] + 1e-9);
      if (shaded.colors[i] < lit.colors[i] - 1e-6) darker++;
    }
    expect(darker).toBeGreaterThan(0);
  });
});
