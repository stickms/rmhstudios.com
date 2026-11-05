import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIP_FALLBACKS,
  CLIP_SLOTS,
  EMPTY_MANIFEST,
  MANIFEST_URL,
  getManifest,
  hasClip,
  loadManifest,
  missingRequiredClips,
  parseManifest,
  resetManifestForTests,
  resolveClip,
} from '../model-manifest';
import { FIGURE_SCALE, figureWorldHeight, modelScale } from '../figure-scale';
import { FIXTURE_ENTRY, MINIMAL_ENTRY } from './fixture-model';

const entry = (over: Record<string, unknown> = {}) => ({
  file: 'citizen.glb',
  height: 1.8,
  yaw: 0,
  handBone: 'ValveBiped.Bip01_R_Hand',
  bytes: 123_456,
  provenance: 'valve-source',
  clips: { idle: 'idle01', walk: 'walk_all' },
  ...over,
});

describe('parseManifest', () => {
  it('accepts the documented shape and keeps only skins in the catalog', () => {
    const m = parseManifest({ version: 1, models: { citizen: entry(), 'not-a-skin': entry() } });
    expect(Object.keys(m.models)).toEqual(['citizen']);
    expect(m.models.citizen?.clips.idle).toBe('idle01');
  });

  it('treats null optional clips as absent', () => {
    const m = parseManifest({ version: 1, models: { citizen: entry({ clips: { idle: 'i', walk: 'w', run: null, shoot: null } }) } });
    expect(m.models.citizen?.clips.run).toBeUndefined();
    expect(m.models.citizen?.clips.shoot).toBeUndefined();
  });

  it('allows a null hand bone', () => {
    expect(parseManifest({ version: 1, models: { citizen: entry({ handBone: null }) } }).models.citizen?.handBone).toBeNull();
  });

  it('drops a bad entry but keeps the good ones', () => {
    const m = parseManifest({
      version: 1,
      models: { citizen: entry({ height: -1 }), worker: entry(), rebel: entry({ clips: { idle: 'x' } }) },
    });
    expect(Object.keys(m.models)).toEqual(['worker']);
  });

  it.each([
    ['a file path', '../../etc/passwd.glb'],
    ['a url', 'https://evil.example/m.glb'],
    ['a subdirectory', 'a/b.glb'],
    ['a non-glb', 'citizen.gltf'],
  ])('refuses %s as a file name', (_n, file) => {
    expect(parseManifest({ version: 1, models: { citizen: entry({ file }) } }).models.citizen).toBeUndefined();
  });

  it.each([null, undefined, 3, 'x', [], { version: 2, models: {} }, { version: 1 }, { version: 1, models: [] }])(
    'answers "no models" for garbage: %j',
    (junk) => {
      expect(parseManifest(junk)).toBe(EMPTY_MANIFEST);
    },
  );

  it('keeps the optional hold offset when valid', () => {
    const m = parseManifest({ version: 1, models: { citizen: entry({ hold: { pos: [0, 0.01, 0], rot: [0, 1, 0] } }) } });
    expect(m.models.citizen?.hold?.rot).toEqual([0, 1, 0]);
  });
});

describe('resolveClip', () => {
  const full = FIXTURE_ENTRY;
  it('returns the model’s own clip when it has one', () => {
    for (const slot of CLIP_SLOTS) {
      expect(resolveClip(full, slot)).toEqual({ slot, animation: full.clips[slot] });
      expect(hasClip(full, slot)).toBe(true);
    }
  });

  it('falls back run→walk→idle, shoot/reload/interact/hurt→idle, death→hurt→idle, jump/fall→idle', () => {
    const min = MINIMAL_ENTRY;
    expect(resolveClip(min, 'run')).toEqual({ slot: 'walk', animation: 'Walk' });
    for (const s of ['shoot', 'reload', 'interact', 'hurt', 'jump', 'fall', 'death'] as const) {
      expect(resolveClip(min, s)).toEqual({ slot: 'idle', animation: 'Idle' });
      expect(hasClip(min, s)).toBe(false);
    }
    const hurtOnly = { clips: { ...min.clips, hurt: 'Hurt' } };
    expect(resolveClip(hurtOnly, 'death')).toEqual({ slot: 'hurt', animation: 'Hurt' });
    const noRunOrWalkInFile = resolveClip(min, 'run', new Set(['Idle']));
    expect(noRunOrWalkInFile).toEqual({ slot: 'idle', animation: 'Idle' });
  });

  it('treats a clip the file does not contain as missing', () => {
    const available = new Set(['Idle', 'Walk', 'Run']);
    expect(resolveClip(full, 'run', available).slot).toBe('run');
    expect(resolveClip(full, 'shoot', available).slot).toBe('idle');
  });

  it('every chain starts at the clip asked for and ends at idle', () => {
    for (const slot of CLIP_SLOTS) {
      const chain = CLIP_FALLBACKS[slot];
      expect(chain[0]).toBe(slot);
      expect(chain.at(-1)).toBe('idle');
    }
  });

  it('requires idle and walk to exist in the file', () => {
    expect(missingRequiredClips(FIXTURE_ENTRY, new Set(['Idle', 'Walk']))).toEqual([]);
    expect(missingRequiredClips(FIXTURE_ENTRY, new Set(['Walk']))).toEqual(['idle']);
    expect(missingRequiredClips(FIXTURE_ENTRY, new Set())).toEqual(['idle', 'walk']);
  });
});

describe('figure size contract', () => {
  it('scales any model to the procedural figure’s height', () => {
    for (const metres of [1.4, 1.8, 2.3, 72]) {
      expect(modelScale(metres, 1) * metres).toBeCloseTo(figureWorldHeight(1), 10);
    }
    expect(figureWorldHeight(1)).toBeCloseTo(1.26 * FIGURE_SCALE, 10);
    // A person is about 0.4 tile (a door is 0.44).
    expect(figureWorldHeight(1)).toBeGreaterThan(0.3);
    expect(figureWorldHeight(1)).toBeLessThan(0.44);
  });

  it('honours the skin’s height multiplier and survives bad numbers', () => {
    expect(figureWorldHeight(1.1)).toBeCloseTo(figureWorldHeight(1) * 1.1, 10);
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(Number.isFinite(modelScale(bad, 1))).toBe(true);
      expect(modelScale(1.8, bad)).toBeCloseTo(modelScale(1.8, 1), 10);
    }
  });
});

describe('loadManifest', () => {
  beforeEach(() => resetManifestForTests());

  const ok = (body: unknown, status = 200) =>
    vi.fn(async (_url?: unknown, _init?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response);

  it('fetches the manifest once and caches it', async () => {
    const f = ok({ version: 1, models: { citizen: entry() } });
    const a = await loadManifest({ fetch: f });
    const b = await loadManifest({ fetch: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe(MANIFEST_URL);
    expect(a).toBe(b);
    expect(getManifest().models.citizen).toBeDefined();
  });

  it.each([
    ['a 404', () => ok({}, 404)],
    ['invalid JSON', () => vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } }) as unknown as Response)],
    ['a network error', () => vi.fn(async () => { throw new TypeError('offline'); })],
    ['an invalid manifest', () => ok({ version: 9, models: {} })],
  ])('never throws on %s: the answer is "no models"', async (_n, make) => {
    const m = await loadManifest({ fetch: make() });
    expect(m.models).toEqual({});
  });

  it('retries a failed fetch only after the retry window', async () => {
    let t = 1_000;
    const bad = vi.fn(async () => { throw new TypeError('offline'); });
    await loadManifest({ fetch: bad, now: () => t });
    await loadManifest({ fetch: bad, now: () => (t += 5_000) });
    expect(bad).toHaveBeenCalledTimes(1);
    const good = ok({ version: 1, models: { citizen: entry() } });
    const m = await loadManifest({ fetch: good, now: () => (t += 60_000) });
    expect(good).toHaveBeenCalledTimes(1);
    expect(m.models.citizen).toBeDefined();
  });

  it('shares one request between concurrent callers', async () => {
    const f = ok({ version: 1, models: {} });
    await Promise.all([loadManifest({ fetch: f }), loadManifest({ fetch: f })]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
