import { describe, expect, it } from 'vitest';
import { buildLightmapAtlas } from '../../tf2-game/render/lightmap';
import { buildWorldChunks } from '../../tf2-game/render/world-geometry';
import { box, compileLevel, room, v3 } from './index';

describe('compiled level feeds the world renderer', () => {
  it('builds one chunk per material and model, with fullbright (white-luxel) lightmap UVs', () => {
    const level = compileLevel({
      id: 'r',
      title: 'r',
      world: [
        ...room({
          min: v3(0, 0, 0),
          max: v3(256, 256, 128),
          material: 'concrete',
          floorMaterial: 'steel',
        }),
      ],
      entities: [
        { classname: 'func_door', brushes: [box(v3(100, 100, 0), v3(140, 110, 96), 'steel')] },
      ],
    });
    const atlas = buildLightmapAtlas(level.bsp, { hdr: false });
    expect(atlas.luxels).toBe(0);
    const chunks = buildWorldChunks(level.bsp, {
      atlas,
      displacements: [],
      drawMaterial: (m) => m in level.manifest.materials,
    });
    const keys = chunks.map((c) => `${c.model}:${c.material}`).sort();
    expect(keys).toEqual(['0:concrete', '0:steel', '1:steel']);
    const tris = chunks.reduce((n, c) => n + c.indices.length / 3, 0);
    expect(tris).toBe(level.stats.faces * 2);
    for (const c of chunks) {
      for (let i = 0; i < c.uv2s.length; i += 2) {
        expect(c.uv2s[i]).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(c.uv2s[i + 1])).toBe(true);
      }
    }
  });
});
