import { describe, expect, it } from 'vitest';
import {
  decompressVis,
  faceVertexIndices,
  findLeaf,
  LUMP,
  parseBsp,
  parseStaticProps,
  readBrushSides,
  readWorldLights,
  rgbExp32ToLinear,
  texInfoMaterial,
  visTest,
  type BspFile,
} from './bsp';
import { buildDisplacements, dispTriCount, dispVertCount } from './displacement';
import { findEntities } from './keyvalues';
import { readMap } from './tf2-root.test-support';

const MAPS = ['ctf_2fort', 'cp_dustbowl', 'pl_badwater', 'koth_viaduct', 'cp_granary'];

describe('bsp helpers', () => {
  it('rejects non-BSP data', () => {
    expect(() => parseBsp(new Uint8Array(2048))).toThrow();
  });

  it('decodes ColorRGBExp32', () => {
    const out = { x: 0, y: 0, z: 0 };
    rgbExp32ToLinear(new Uint8Array([255, 128, 0, 0xff]), 0, out); // exponent −1
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(128 / 255 / 2);
    expect(out.z).toBe(0);
  });

  it('parses a synthetic v10 (SDK 2013) static prop lump', () => {
    const name = 'models/props_farm/wooden_barrel.mdl';
    const buf = new Uint8Array(4 + 128 + 4 + 2 + 4 + 72);
    const v = new DataView(buf.buffer);
    let o = 0;
    v.setInt32(o, 1, true);
    o += 4;
    for (let i = 0; i < name.length; i++) buf[o + i] = name.charCodeAt(i);
    o += 128;
    v.setInt32(o, 1, true);
    v.setUint16(o + 4, 7, true);
    o += 6;
    v.setInt32(o, 1, true);
    o += 4;
    v.setFloat32(o, 10, true);
    v.setFloat32(o + 4, 20, true);
    v.setFloat32(o + 8, 30, true);
    v.setFloat32(o + 16, 90, true); // yaw
    v.setUint8(o + 30, 6); // solid
    v.setInt32(o + 32, 2, true); // skin
    v.setFloat32(o + 40, 1500, true); // fade max
    v.setUint32(o + 64, 0x110, true); // flags
    const lump = parseStaticProps(buf, 10)!;
    expect(lump.recordSize).toBe(72);
    expect([...lump.leafs]).toEqual([7]);
    const p = lump.props[0];
    expect(p.model).toBe(name);
    expect(p.origin).toEqual({ x: 10, y: 20, z: 30 });
    expect(p.angles.y).toBe(90);
    expect(p.solid).toBe(6);
    expect(p.skin).toBe(2);
    expect(p.fadeMaxDist).toBe(1500);
    expect(p.flags).toBe(0x110);
  });

  // CS:GO (BSP v21, de_dust2): StaticPropLump_t v10 is 76 bytes (… DiffuseModulation, bDisableX360,
  // FlagsEx) and v11 adds a uniform scale (80 bytes).
  const csgoProps = (version: 10 | 11) => {
    const size = version === 10 ? 76 : 80;
    const name = 'models/props/de_dust/hr_dust/dust_crates/dust_crate_style_01_32x32x32.mdl';
    const buf = new Uint8Array(4 + 128 + 4 + 4 + size);
    const v = new DataView(buf.buffer);
    v.setInt32(0, 1, true);
    for (let i = 0; i < name.length; i++) buf[4 + i] = name.charCodeAt(i);
    v.setInt32(132, 0, true); // no leafs
    v.setInt32(136, 1, true);
    const o = 140;
    v.setFloat32(o, -100, true);
    v.setFloat32(o + 4, 200, true);
    v.setFloat32(o + 8, 8, true);
    v.setUint8(o + 30, 6); // solid
    v.setUint8(o + 31, 0x04); // flags (u8 in CS:GO's layout)
    v.setInt32(o + 32, 1, true); // skin
    v.setFloat32(o + 56, 1, true); // forced fade scale
    buf.set([1, 2, 3, 4], o + 60); // cpu/gpu levels
    buf.set([200, 150, 100, 255], o + 64); // diffuse modulation
    v.setUint32(o + 72, 0x2, true); // FlagsEx
    if (version === 11) v.setFloat32(o + 76, 1.5, true);
    return parseStaticProps(buf, version)!;
  };

  it.each([10, 11] as const)('parses a synthetic CS:GO v%i static prop lump', (version) => {
    const lump = csgoProps(version);
    expect(lump.recordSize).toBe(version === 10 ? 76 : 80);
    const p = lump.props[0];
    expect(p.origin).toEqual({ x: -100, y: 200, z: 8 });
    expect(p.solid).toBe(6);
    expect(p.skin).toBe(1);
    expect([p.minCpuLevel, p.maxCpuLevel, p.minGpuLevel, p.maxGpuLevel]).toEqual([1, 2, 3, 4]);
    expect(p.diffuseModulation).toEqual([200, 150, 100, 255]);
    expect(p.flags).toBe(0x04 | (0x2 << 8));
    expect(p.uniformScale).toBe(version === 11 ? 1.5 : 1);
  });

  it('reads a v21 brush side bevel as one byte (the next is CS:GO\'s "thin")', () => {
    const b = new Uint8Array(16);
    const v = new DataView(b.buffer);
    v.setUint16(0, 5, true);
    b[6] = 0; // bevel
    b[7] = 1; // thin
    v.setUint16(8, 6, true);
    b[14] = 1; // bevel
    expect([...readBrushSides(b, 21).bevel]).toEqual([0, 1]);
    // v20 reads the whole short (TF2: 0 or 1).
    expect([...readBrushSides(b, 20).bevel]).toEqual([256, 1]);
  });

  it("reads dworldlight_t v0 (88 bytes) and CS:GO's v1 (100: + shadow_cast_offset)", () => {
    for (const [version, size] of [
      [0, 88],
      [1, 100],
    ] as const) {
      const b = new Uint8Array(size * 2);
      const v = new DataView(b.buffer);
      for (let i = 0; i < 2; i++) {
        const o = i * size;
        v.setFloat32(o, 10 + i, true); // origin.x
        v.setFloat32(o + 24, 1, true); // normal.x
        const after = o + (size === 100 ? 48 : 36);
        v.setInt32(after, 7, true); // cluster
        v.setInt32(after + 4, 2, true); // type: spotlight
        v.setFloat32(after + 24, 512, true); // radius
      }
      const lights = readWorldLights(b, version);
      expect(lights).toHaveLength(2);
      expect(lights.map((l) => l.origin.x)).toEqual([10, 11]);
      expect(lights.every((l) => l.cluster === 7 && l.type === 2 && l.radius === 512)).toBe(true);
    }
  });
});

describe.skipIf(!process.env.TF2_ROOT)('bsp (TF2_ROOT)', () => {
  const cache = new Map<string, BspFile>();
  const load = (m: string) => {
    let b = cache.get(m);
    if (!b) {
      b = parseBsp(readMap(m));
      cache.set(m, b);
    }
    return b;
  };

  it.each(MAPS)('%s: header, lump counts and cross references', (map) => {
    const bsp = load(map);
    expect(bsp.version).toBe(20);
    expect(bsp.planes.count).toBeGreaterThan(1000);
    expect(bsp.nodes.count).toBeGreaterThan(1000);
    expect(bsp.leafs.count).toBeGreaterThan(bsp.nodes.count * 0.9);
    expect(bsp.brushes.count).toBeGreaterThan(500);
    expect(bsp.models.length).toBeGreaterThan(5);
    expect(bsp.faces.length).toBeGreaterThan(1000);
    expect(bsp.texInfo.length).toBeGreaterThan(100);
    expect(bsp.vertexes.length % 3).toBe(0);
    // Cross references stay in range.
    for (let n = 0; n < bsp.nodes.count; n++) {
      expect(bsp.nodes.planeNum[n]).toBeLessThan(bsp.planes.count);
      for (const c of [bsp.nodes.children[n * 2], bsp.nodes.children[n * 2 + 1]]) {
        if (c >= 0) expect(c).toBeLessThan(bsp.nodes.count);
        else expect(-1 - c).toBeLessThan(bsp.leafs.count);
      }
    }
    for (let l = 0; l < bsp.leafs.count; l++) {
      expect(bsp.leafs.firstLeafBrush[l] + bsp.leafs.numLeafBrushes[l]).toBeLessThanOrEqual(
        bsp.leafBrushes.length,
      );
    }
    for (let b = 0; b < bsp.brushes.count; b++) {
      expect(bsp.brushes.firstSide[b] + bsp.brushes.numSides[b]).toBeLessThanOrEqual(
        bsp.brushSides.count,
      );
    }
    for (const f of bsp.faces) {
      expect(f.texInfo).toBeLessThan(bsp.texInfo.length);
      expect(f.firstEdge + f.numEdges).toBeLessThanOrEqual(bsp.surfEdges.length);
    }
    // Material names resolve through the string table.
    const names = new Set(bsp.texData.map((t) => t.name.toLowerCase()));
    expect([...names].some((n) => n.startsWith('tools/'))).toBe(true);
    expect(texInfoMaterial(bsp, bsp.faces[0].texInfo).length).toBeGreaterThan(0);
    // A face polygon has as many vertices as edges.
    expect(faceVertexIndices(bsp, bsp.faces[0])).toHaveLength(bsp.faces[0].numEdges);
    // Leaf ambient lighting (HDR or LDR) is present on these maps.
    expect((bsp.leafAmbientHdr ?? bsp.leafAmbientLdr)!.sampleCount).toBeGreaterThan(100);
    expect(bsp.cubemaps.length).toBeGreaterThan(0);
    expect(bsp.worldLights.length + bsp.worldLightsHdr.length).toBeGreaterThan(0);
    expect(bsp.lumps[LUMP.PAKFILE].length).toBeGreaterThan(0);
  });

  it.each(MAPS)('%s: entities, spawn points and static props', (map) => {
    const bsp = load(map);
    expect(bsp.entities[0].classname).toBe('worldspawn');
    const spawns = findEntities(bsp.entities, 'info_player_teamspawn');
    expect(spawns.length).toBeGreaterThan(8);
    const teams = new Set(spawns.map((s) => s.get('TeamNum')));
    expect(teams.has('2') && teams.has('3')).toBe(true);
    // Brush entities reference valid models.
    for (const e of bsp.entities)
      if (e.brushModelIndex > 0) expect(e.brushModelIndex).toBeLessThan(bsp.models.length);
    // Spawns are inside the world model's bounds.
    const w = bsp.models[0];
    for (const s of spawns) {
      const o = s.origin;
      expect(o.x).toBeGreaterThanOrEqual(w.mins.x);
      expect(o.z).toBeLessThanOrEqual(w.maxs.z);
    }
    const sp = bsp.staticProps!;
    expect(sp.version).toBe(10);
    expect(sp.props.length).toBeGreaterThan(100);
    expect(sp.models.every((m) => m.toLowerCase().endsWith('.mdl'))).toBe(true);
    for (const p of sp.props) {
      expect(p.propType).toBeLessThan(sp.models.length);
      expect([0, 2, 6]).toContain(p.solid);
      expect(p.firstLeaf + p.leafCount).toBeLessThanOrEqual(sp.leafs.length);
      expect(Math.abs(p.origin.x)).toBeLessThan(32768);
    }
  });

  it.each(MAPS)('%s: PVS rows include their own cluster', (map) => {
    const bsp = load(map);
    const vis = bsp.visibility!;
    expect(vis.numClusters).toBeGreaterThan(100);
    const spawn = findEntities(bsp.entities, 'info_player_teamspawn')[0].origin;
    const leaf = findLeaf(bsp, spawn);
    const cluster = bsp.leafs.cluster[leaf];
    expect(cluster).toBeGreaterThanOrEqual(0);
    const row = decompressVis(vis, cluster);
    expect(visTest(row, cluster)).toBe(true);
    let visible = 0;
    for (let c = 0; c < vis.numClusters; c++) if (visTest(row, c)) visible++;
    expect(visible).toBeGreaterThan(1);
    expect(visible).toBeLessThan(vis.numClusters);
  });

  it.each(MAPS)('%s: displacements build with (2^p+1)^2 vertices', (map) => {
    const bsp = load(map);
    const disps = buildDisplacements(bsp);
    expect(disps.length).toBe(bsp.dispInfos.length);
    expect(disps.length).toBeGreaterThan(50);
    let agree = 0;
    let total = 0;
    for (const d of disps) {
      expect(d).not.toBeNull();
      if (!d) continue;
      const n = dispVertCount(d.power);
      expect(d.size).toBe((1 << d.power) + 1);
      expect(d.positions.length).toBe(n * 3);
      expect(d.normals.length).toBe(n * 3);
      expect(d.alphas.length).toBe(n);
      expect(d.indices.length).toBe(dispTriCount(d.power) * 3);
      expect(bsp.faces[d.faceIndex].dispInfo).toBe(d.index);
      // The first corner is the one nearest startPosition.
      const sp = bsp.dispInfos[d.index].startPosition;
      expect(
        Math.hypot(sp.x - d.corners[0], sp.y - d.corners[1], sp.z - d.corners[2]),
      ).toBeLessThan(2);
      for (let i = 0; i < d.normals.length; i += 3) {
        expect(Math.hypot(d.normals[i], d.normals[i + 1], d.normals[i + 2])).toBeCloseTo(1, 4);
      }
      // Triangle facing ((v2−v0)×(v1−v0)) agrees with the base face normal for nearly all triangles.
      const P = d.positions;
      for (let t = 0; t < d.indices.length; t += 3) {
        const a = d.indices[t] * 3;
        const b = d.indices[t + 1] * 3;
        const c = d.indices[t + 2] * 3;
        const e0 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
        const e1 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const nx = e1[1] * e0[2] - e1[2] * e0[1];
        const ny = e1[2] * e0[0] - e1[0] * e0[2];
        const nz = e1[0] * e0[1] - e1[1] * e0[0];
        if (nx * d.faceNormal[0] + ny * d.faceNormal[1] + nz * d.faceNormal[2] > 0) agree++;
        total++;
      }
    }
    expect(agree / total).toBeGreaterThan(0.98);
  });
});
