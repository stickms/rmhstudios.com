import { describe, expect, it, vi } from 'vitest';
import { Box3, Group, Matrix4, Vector3 } from 'three';
import { brotliCompressSync } from 'node:zlib';
import { ParticleSimulation, controlPoint } from '../particles/simulation';
import { sampleSheet } from '../particles/sheet';
import { sourceToGl, glToSource } from '../particles/renderer';
import { createParticleEnvironment } from '../particles/attachments';
import {
  isSafeParticlePath,
  type ParticleBundle,
  type ParticleDefinition,
  type ParticleOperator,
  type SheetSequence,
} from '../particles/types';
import { readParticleFile } from '../particles.server';

const storage = vi.hoisted(() => ({ getObjectEncoded: vi.fn() }));
vi.mock('@/lib/storage/s3.server', () => storage);
const op = (name: string, params: ParticleOperator['params'] = {}): ParticleOperator => ({
  function: name,
  params,
});
const definition = (name: string, extra: Partial<ParticleDefinition> = {}): ParticleDefinition => ({
  name,
  options: { max_particles: 100 },
  renderers: [],
  initializers: [],
  operators: [],
  forces: [],
  constraints: [],
  emitters: [op('emit_instantaneously', { num_to_emit: 1 })],
  children: [],
  ...extra,
});
function simulation(root: ParticleDefinition, systems: ParticleDefinition[] = []) {
  const bundle: ParticleBundle = {
    v: 1,
    id: 13,
    system: root.name,
    schema: {},
    materials: {},
    systems: Object.fromEntries([root, ...systems].map((s) => [s.name, s])),
  };
  const point = controlPoint();
  return {
    simulation: new ParticleSimulation(bundle, {
      points: new Map([[0, point]]),
      player: new Vector3(),
    }),
    point,
    bundle,
  };
}

describe('Source particle asset contract', () => {
  it('serves only the manifest and immutable bundle/texture names', async () => {
    for (const path of [
      '../_state.json',
      'effects/../manifest.json',
      '_state.json',
      'tex/x.webp',
      'manifest.json/extra',
    ]) {
      expect(isSafeParticlePath(path)).toBe(false);
      await expect(readParticleFile(path)).resolves.toBeNull();
    }
    expect(storage.getObjectEncoded).not.toHaveBeenCalled();
    expect(isSafeParticlePath('effects/' + 'a'.repeat(64) + '.json')).toBe(true);
    expect(isSafeParticlePath('tex/' + 'f'.repeat(64) + '.webp')).toBe(true);
  });
  it('does not send Brotli bytes to a client that refuses Brotli', async () => {
    const raw = Buffer.from('{"v":1,"effects":{}}');
    const compressed = brotliCompressSync(raw);
    storage.getObjectEncoded.mockResolvedValue({ body: compressed, contentEncoding: 'br' });
    expect((await readParticleFile('manifest.json', 'gzip, br;q=0'))?.body).toEqual(raw);
    const file = await readParticleFile('manifest.json', 'gzip, br;q=0.5');
    expect(file?.body).toEqual(compressed);
    expect(file?.contentEncoding).toBe('br');
  });
  it('preserves nonuniform SHT frame timing and clamps fitted sequences', () => {
    const sequence: SheetSequence = {
      clamp: false,
      duration: 1,
      frames: [
        { duration: 0.25, uv: [[0, 0, 0.5, 1]] },
        { duration: 0.75, uv: [[0.5, 0, 1, 1]] },
      ],
    };
    expect(sampleSheet(sequence, 0.125, 1, 1, false, false)).toMatchObject({
      first: [0, 0, 0.5, 1],
      blend: 0.5,
    });
    expect(sampleSheet(sequence, 1.125, 1, 1, false, false).blend).toBeCloseTo(0.5);
    expect(sampleSheet(sequence, 4, 1, 1, true, false).first).toEqual([0.5, 0, 1, 1]);
  });
});

describe('PCF playback', () => {
  it('retains persistent controller particles without a decay operator', () => {
    const { simulation: sim } = simulation(
      definition('controller', {
        initializers: [op('lifetime random', { lifetime_min: 0.1, lifetime_max: 0.1 })],
      }),
    );
    sim.warmup(2);
    expect(sim.root.particles).toHaveLength(1);
    expect(sim.root.particles[0].age).toBeGreaterThan(1);
  });
  it('emits and simulates consistently at different display frame rates', () => {
    const root = definition('continuous', {
      emitters: [op('emit_continuously', { emission_rate: 30 })],
      initializers: [op('lifetime random', { lifetime_min: 2, lifetime_max: 2 })],
      operators: [op('movement basic', { gravity: [0, 0, 10] }), op('lifespan decay')],
    });
    const a = simulation(root).simulation,
      b = simulation(root).simulation;
    for (let i = 0; i < 60; i++) a.advance(1 / 60);
    for (let i = 0; i < 10; i++) b.advance(0.1);
    expect(a.root.particles.map((p) => p.position.z)).toEqual(
      b.root.particles.map((p) => p.position.z),
    );
    expect(a.root.particles).toHaveLength(30);
    expect(a.root.particles[0].position.z).toBeGreaterThan(0);
  });
  it('applies moving control-point translation once across fixed substeps', () => {
    const { simulation: sim, point } = simulation(
      definition('locked', { operators: [op('movement lock to control point')] }),
    );
    sim.advance(1 / 60);
    point.position.x = 30;
    sim.advance(0.1);
    expect(sim.root.particles[0].position.x).toBeCloseTo(30);
  });
  it('keeps parent/child emitter graphs and delayed starts', () => {
    const root = definition('parent', {
      initializers: [
        op('position modify offset random', { 'offset min': [0, 0, 15], 'offset max': [0, 0, 15] }),
      ],
      children: [{ system: 'child', delay: 0.5 }],
      operators: [
        op('set child control points from particle positions', { 'first control point to set': 0 }),
      ],
    });
    const { simulation: sim } = simulation(root, [definition('child')]);
    sim.advance(0.1);
    expect(sim.root.children[0].particles).toHaveLength(0);
    sim.warmup(1);
    expect(sim.root.children[0].particles[0].position.z).toBe(15);
  });
  it('rejects recursive graphs', () => {
    expect(() =>
      simulation(definition('cycle', { children: [{ system: 'cycle', delay: 0 }] })),
    ).toThrow(/cycle/);
  });

  it('refires schema-driven burst effects while retaining live particles', () => {
    const { bundle } = simulation(definition('burst'));
    bundle.schema.refire_time = '0.25';
    const sim = new ParticleSimulation(bundle, {
      points: new Map([[0, controlPoint()]]),
      player: new Vector3(),
    });
    sim.warmup(1.1);
    expect(sim.root.emitted).toBe(5);
    expect(sim.root.particles).toHaveLength(5);
    expect(sim.root.particles[0].age).toBeGreaterThan(1);
  });
  it('uses Source units and the model ref basis, rather than cosmetic dimensions', () => {
    expect(sourceToGl(new Vector3(1, 2, 3), new Vector3()).toArray()).toEqual([
      2 * 0.01905,
      3 * 0.01905,
      0.01905,
    ]);
    const point = new Vector3(12, 34, 56);
    expect(
      glToSource(sourceToGl(point, new Vector3()), new Vector3()).distanceTo(point),
    ).toBeLessThan(1e-10);
    const { bundle } = simulation(definition('attachment'));
    bundle.schema = { attachment: 'unusual', attach_to_rootbone: '1' };
    const owner = new Group();
    owner.position.set(0, 1, 0);
    const pose = new Matrix4().makeTranslation(0, 0.25, 0).toArray();
    owner.userData.particleAttachments = { unusual: { bone: 'missing', bind: pose } };
    const env = createParticleEnvironment(bundle, owner, undefined, new Box3(), {
      x: 0,
      y: 0,
      z: 0,
      s: 1,
    });
    expect(env.environment.points.get(0)?.position.z).toBeCloseTo(1.25 / 0.01905);
  });
});
