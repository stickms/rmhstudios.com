import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Box3, type BufferGeometry, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createHarmonicAssets } from '../harmonic-assets';
import { HARMONIC_MODELS } from './catalog';
import {
  CHARACTER_CLIPS,
  HARMONIC_MODEL_INFO,
  MODEL_SPECS,
  VIEW_CLIPS,
  harmonicModelInfo,
} from './info';
import { createHarmonicModelLibrary } from './library';
import type { ModelObject } from './parts';

const U = 0.01905;

/** FNV-1a over every vertex, skin weight and clip value of a model, rounded. */
function modelHash(o: ModelObject): string {
  let h = 0x811c9dc5;
  const feed = (n: number): void => {
    h ^= Math.round(n * 1e5) | 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  o.updateMatrixWorld(true);
  o.traverse((x) => {
    const g = (x as Mesh).geometry as BufferGeometry | undefined;
    if (!g) return;
    for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
      const a = g.getAttribute(name);
      if (a) for (let i = 0; i < a.array.length; i++) feed(a.array[i]);
    }
  });
  for (const c of o.animations) for (const t of c.tracks) for (const v of t.values) feed(v);
  return (h >>> 0).toString(16);
}

describe('catalog info (pure)', () => {
  it('has one entry per spec, keyed models/harmonic/<name>.mdl', () => {
    expect(HARMONIC_MODEL_INFO.size).toBe(MODEL_SPECS.length);
    for (const s of MODEL_SPECS) {
      expect(s.path).toBe(`models/harmonic/${s.name}.mdl`);
      expect(HARMONIC_MODEL_INFO.get(s.path)?.path).toBe(s.path);
    }
    expect(harmonicModelInfo('Models\\Harmonic\\Crate.mdl')?.path).toBe(
      'models/harmonic/crate.mdl',
    );
    expect(harmonicModelInfo('models/props/other.mdl')).toBeNull();
  });

  it('is complete: bounds, sequences, hulls', () => {
    for (const s of MODEL_SPECS) {
      const info = HARMONIC_MODEL_INFO.get(s.path)!;
      expect(info.maxs.x).toBeGreaterThan(info.mins.x);
      expect(info.maxs.y).toBeGreaterThan(info.mins.y);
      expect(info.maxs.z).toBeGreaterThan(info.mins.z);
      if (s.kind === 'character')
        expect(info.sequences.map((q) => q.name)).toEqual(CHARACTER_CLIPS.map((c) => c.name));
      if (s.kind === 'viewmodel')
        expect(info.sequences.map((q) => q.name)).toEqual(VIEW_CLIPS.map((c) => c.name));
      for (const q of info.sequences) {
        expect(q.duration).toBeCloseTo((q.frames - 1) / q.fps, 6);
        expect(q.activity).toMatch(/^ACT_/);
      }
      if (s.kind === 'prop' || s.kind === 'weapon') {
        expect(info.physics?.hulls).toHaveLength(1);
        expect(info.physics!.hulls[0]).toHaveLength(24);
        expect(info.physics!.mass).toBeGreaterThanOrEqual(0);
      } else expect(info.physics).toBeNull();
    }
  });

  it('is what SpAssets.model() serves', () => {
    const assets = createHarmonicAssets();
    for (const s of MODEL_SPECS) expect(assets.model(s.path)).toBe(HARMONIC_MODEL_INFO.get(s.path));
    expect(assets.model('models/missing.mdl')).toBeNull();
  });

  it('imports without three or the DOM', () => {
    expect(typeof document).toBe('undefined');
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const src = readFileSync(path.join(dir, 'info.ts'), 'utf8');
    const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)];
    for (const m of imports) {
      expect(m[1], `info.ts imports ${m[2]} as a value`).toBeTruthy();
      expect(m[2]).not.toMatch(/three/);
    }
  });
});

describe('procedural builders', () => {
  const all = Object.values(HARMONIC_MODELS);

  it('are deterministic: the same vertex and clip hash twice', () => {
    for (const m of all) expect(modelHash(m.build()), m.name).toBe(modelHash(m.build()));
  });

  it('produce clips that match the sequence names, with the tracks bound to bones', () => {
    for (const m of all) {
      const o = m.build();
      expect(
        o.animations.map((c) => c.name),
        m.name,
      ).toEqual(m.info.sequences.map((s) => s.name));
      const bones = new Set<string>();
      o.traverse((x) => {
        if ((x as { isBone?: boolean }).isBone) bones.add(x.name);
      });
      for (const c of o.animations) {
        expect(c.duration).toBeCloseTo(
          m.info.sequences.find((s) => s.name === c.name)!.duration,
          5,
        );
        for (const t of c.tracks)
          expect(bones.has(t.name.split('.')[0]), `${m.name}/${c.name}/${t.name}`).toBe(true);
      }
    }
  });

  it('have the rig bones, and the attachments the info lists', () => {
    const rig = [
      'pelvis',
      'spine',
      'chest',
      'neck',
      'head',
      'upperarm_l',
      'lowerarm_l',
      'hand_l',
      'upperarm_r',
      'lowerarm_r',
      'hand_r',
      'upperleg_l',
      'lowerleg_l',
      'foot_l',
      'upperleg_r',
      'lowerleg_r',
      'foot_r',
    ];
    for (const m of all) {
      const o = m.build();
      const names = new Set<string>();
      o.traverse((x) => names.add(x.name));
      if (m.spec.kind === 'character')
        for (const b of rig) expect(names.has(b), `${m.name} ${b}`).toBe(true);
      const att = ((o.userData.attachments ?? []) as Array<{ name: string; local: number[] }>).map(
        (a) => a.name,
      );
      for (const a of m.info.attachments) expect(att, `${m.name} ${a}`).toContain(a);
      for (const a of (o.userData.attachments ?? []) as Array<{ local: number[] }>)
        expect(a.local).toHaveLength(16);
    }
  });

  it('sit inside their declared hull', () => {
    for (const m of all) {
      if (m.spec.kind === 'viewmodel' || m.spec.name === 'meridian_shield') continue;
      const o = m.build();
      o.updateMatrixWorld(true);
      const b = new Box3().setFromObject(o);
      const { mins, maxs } = m.info;
      const slack = 1.5 * U;
      // three (x left, y up, z forward) = Source (y, z, x).
      // A character's carried item is rotated for its pose, so only height is checked.
      if (m.spec.kind !== 'character') {
        expect(b.min.z, `${m.name} x min`).toBeGreaterThanOrEqual(mins.x * U - slack);
        expect(b.max.z, `${m.name} x max`).toBeLessThanOrEqual(maxs.x * U + slack);
      }
      if (m.spec.kind !== 'character') {
        expect(b.min.x, `${m.name} y min`).toBeGreaterThanOrEqual(mins.y * U - slack);
        expect(b.max.x, `${m.name} y max`).toBeLessThanOrEqual(maxs.y * U + slack);
      }
      expect(b.min.y, `${m.name} z min`).toBeGreaterThanOrEqual(mins.z * U - slack);
      expect(b.max.y, `${m.name} z max`).toBeLessThanOrEqual(maxs.z * U + slack);
    }
  });

  it('use no team-colour material names (the model shader would tint them)', () => {
    for (const m of all) {
      const o = m.build();
      o.traverse((x) => {
        const mat = (x as Mesh).material as { name?: string } | undefined;
        if (mat?.name) expect(mat.name).not.toMatch(/(^|[_/])(red|blue|blu)([_/.]|$)/);
      });
    }
  });
});

describe('ModelLibrary injection', () => {
  it('serves every catalog model to the entity renderer with its sequences bound to clips', async () => {
    const lib = createHarmonicModelLibrary();
    for (const m of Object.values(HARMONIC_MODELS)) {
      const asset = await lib.asset(m.path);
      expect(asset, m.path).not.toBeNull();
      const a = asset!;
      expect(a.materials.length).toBeGreaterThan(0);
      expect(
        a.frame.elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9),
        `${m.name} frame is identity`,
      ).toBe(true);
      if (m.info.sequences.length === 0) {
        expect(a.anim).toBeNull();
        continue;
      }
      expect(a.anim).not.toBeNull();
      for (const s of m.info.sequences) {
        const seq = a.anim!.seq(s.name);
        expect(seq, `${m.name}/${s.name}`).toBeDefined();
        expect(a.anim!.clips.has(s.name)).toBe(true);
        expect(a.anim!.selectWeightedSequence(s.activity)?.name).toBe(s.name);
      }
    }
    expect(await lib.asset('models/harmonic/missing.mdl')).toBeNull();
  });
});
