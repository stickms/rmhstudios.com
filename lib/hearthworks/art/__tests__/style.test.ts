import { describe, expect, it } from 'vitest';
import { BUILDING_IDS, CROP_IDS, UTILITY_IDS, ZONE_IDS } from '../../content';
import { PALETTE, PROCEDURAL_MODELS, checkStyle, resolveModel, type ModelId } from '..';

describe('palette', () => {
  it('is all valid 6-digit hex', () => {
    for (const v of Object.values(PALETTE)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('procedural models', () => {
  it('has a model for every building, crop, tree, lot level and utility, and each passes the style rules', () => {
    const ids: ModelId[] = [
      ...BUILDING_IDS.map((b) => `building:${b}` as const),
      ...CROP_IDS.map((c) => `crop:${c}` as const),
      ...ZONE_IDS.flatMap((z) => ([1, 2, 3] as const).map((l) => `lot:${z}:${l}` as const)),
      ...UTILITY_IDS.map((u) => `utility:${u}` as const),
      'city:green',
      'marker:unserved',
      'tree',
      'pine',
    ];
    for (const id of ids) {
      expect(PROCEDURAL_MODELS[id], id).toBeDefined();
      expect(checkStyle(PROCEDURAL_MODELS[id]), id).toEqual([]);
    }
  });

  it('flags off-palette colours, oversize and overlong models', () => {
    const bad = {
      id: 'x',
      parts: [
        { shape: 'box', size: [3, 0.1, 0.1], pos: [0, 0.05, 0], color: 'hotpink' as never },
        { shape: 'box', size: [0.1, 0.1, 0.1], pos: [0, 5, 0], color: 'teal' },
        ...Array.from({ length: 12 }, () => ({
          shape: 'box' as const,
          size: [0.1, 0.1, 0.1] as const,
          pos: [0, 0.05, 0] as const,
          color: 'butter' as const,
        })),
      ],
    } as const;
    const problems = checkStyle(bad as never);
    expect(problems.some((p) => /not in the palette/.test(p))).toBe(true);
    expect(problems.some((p) => /footprint/.test(p))).toBe(true);
    expect(problems.some((p) => /taller/.test(p))).toBe(true);
    expect(problems.some((p) => /part budget/.test(p))).toBe(true);
    expect(problems.some((p) => /accent/.test(p))).toBe(true);
  });
});

describe('resolveModel', () => {
  const sourceMap = { tree: 'mdl/props/tree.glb' } as const;

  it('uses the Source model when mapped and reachable', async () => {
    const r = await resolveModel('tree', { sourceMap, loader: async () => 'glb-bytes' });
    expect(r).toEqual({ kind: 'source', path: 'mdl/props/tree.glb', payload: 'glb-bytes' });
  });

  it('falls back to the procedural model when the channel is unreachable (no Source assets)', async () => {
    const r = await resolveModel('tree', {
      sourceMap,
      loader: async () => {
        throw new Error('404');
      },
    });
    expect(r.kind).toBe('procedural');
  });

  it('is procedural when nothing is mapped', async () => {
    expect((await resolveModel('pine')).kind).toBe('procedural');
  });
});
