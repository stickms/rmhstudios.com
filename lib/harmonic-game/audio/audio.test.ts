import { describe, expect, it } from 'vitest';
import { HARMONIC_SURFACE_PROPS } from '../assets/harmonic-assets';
import { SurfacePropsTable } from '../../sp-game/physics/surface-props';
import {
  AREAS,
  AREA_PROFILES,
  BED_FADE_SECONDS,
  BedCrossfader,
  HarmonicSoundBus,
  IMPACT_SURFACES,
  MusicPlanner,
  SOUND_BANK,
  SOUND_NAMES,
  STEP_SURFACES,
  areaForLevel,
  areaForSoundscape,
  encodeWav,
  isSoundName,
  mapSimEvent,
  measure,
  musicMix,
  noteInterval,
  pcmHash,
  recipeFor,
  renderRecipe,
  resolveEngineSound,
  type HarmonicSoundName,
  type Recipe,
} from './index';
import { mulberry32 } from './rng';
import { HARMONIC_LEVELS } from '../levels';

/** Every name the work package lists. */
const LISTED: HarmonicSoundName[] = [
  ...STEP_SURFACES.map((s) => `step.${s}` as const),
  'player.jump',
  'player.land',
  'melee.swing',
  'melee.hit',
  'pulse.fire',
  'pulse.reload',
  'pulse.empty',
  'coil.fire',
  'coil.reload',
  ...IMPACT_SURFACES.map((s) => `impact.${s}` as const),
  'door.open',
  'door.close',
  'button.press',
  'player.hurt',
  'player.death',
  'pickup',
  'tuner.shift',
  'tuner.listen_on',
  'tuner.listen_off',
  'tuner.charge_ready',
  'unstrung.voice',
  'wind.loop',
  'wind.gust',
  'ship.groan',
  'radio.click',
  'radio.static',
  ...AREAS.map((a) => `bed.${a}` as const),
];

function validate(r: Recipe, label: string): void {
  expect(Number.isFinite(r.seed), label).toBe(true);
  expect(r.duration, label).toBeGreaterThan(0.05);
  expect(r.duration, label).toBeLessThanOrEqual(30);
  expect(r.rate, label).toBeGreaterThanOrEqual(8000);
  expect(r.peak, label).toBeGreaterThan(0.05);
  expect(r.peak, label).toBeLessThan(1);
  expect(r.layers.length, label).toBeGreaterThan(0);
  const nyq = r.rate / 2;
  const finite = (x: number, what: string): void =>
    expect(Number.isFinite(x), `${label} ${what}`).toBe(true);
  for (const l of r.layers) {
    finite(l.at, 'at');
    expect(l.at, label).toBeGreaterThanOrEqual(0);
    expect(l.at, label).toBeLessThan(r.duration);
    finite(l.gain, 'gain');
    expect(l.gain, label).toBeGreaterThan(0);
    for (const e of l.env) expect(e, label).toBeGreaterThanOrEqual(0);
    for (const f of l.filters ?? []) {
      expect(f.freq, label).toBeGreaterThan(5);
      expect(f.freq, label).toBeLessThan(nyq);
      if (f.freqEnd) expect(f.freqEnd, label).toBeLessThan(nyq);
      expect(f.q, label).toBeGreaterThan(0);
    }
    if (l.kind === 'tone') {
      expect(l.freq, label).toBeGreaterThan(5);
      expect(l.freq, label).toBeLessThan(nyq);
      if (l.freqEnd) expect(l.freqEnd, label).toBeLessThan(nyq);
    } else if (l.kind === 'modal') {
      expect(l.modes.length, label).toBeGreaterThan(0);
      for (const m of l.modes) {
        expect(m.freq, label).toBeGreaterThan(5);
        expect(m.decay, label).toBeGreaterThan(0);
      }
    } else if (l.kind === 'formant') {
      expect(l.f0, label).toBeGreaterThan(40);
      expect(l.formants.length, label).toBeGreaterThan(0);
    }
  }
}

describe('sound bank recipes', () => {
  it('lists every sound the work package names', () => {
    for (const n of LISTED) expect(isSoundName(n), n).toBe(true);
    // Footsteps have four variations on every surface.
    for (const s of STEP_SURFACES) expect(SOUND_BANK[`step.${s}`].variants).toBe(4);
  });

  it('every recipe is valid data (JSON-clean, finite, below Nyquist)', () => {
    for (const name of SOUND_NAMES) {
      const def = SOUND_BANK[name];
      expect(def.variants).toBeGreaterThanOrEqual(1);
      for (let v = 0; v < def.variants; v++) {
        const r = recipeFor(name, v);
        validate(r, `${name}#${v}`);
        // Pure data: survives a JSON round trip unchanged, and rebuilding gives the same data.
        expect(JSON.parse(JSON.stringify(r))).toEqual(r);
        expect(recipeFor(name, v)).toEqual(r);
      }
    }
  });

  it('variations of one sound differ', () => {
    for (const name of SOUND_NAMES) {
      const def = SOUND_BANK[name];
      if (def.variants < 2) continue;
      const a = JSON.stringify(recipeFor(name, 0));
      const b = JSON.stringify(recipeFor(name, 1));
      expect(a, name).not.toBe(b);
    }
  });

  it('renders deterministically, audibly and without clipping', () => {
    const hashes = new Set<number>();
    for (const name of SOUND_NAMES) {
      const r = recipeFor(name, 0);
      const pcm = renderRecipe(r);
      const m = measure(pcm);
      expect(m.peak, name).toBeLessThan(1);
      expect(m.peak, name).toBeGreaterThan(0.1);
      expect(m.rms, name).toBeGreaterThan(0.01);
      expect(m.seconds, name).toBeCloseTo(r.duration, 1);
      for (const ch of pcm.channels)
        for (const x of ch) if (!Number.isFinite(x)) throw new Error(`${name}: non-finite sample`);
      const h = pcmHash(pcm);
      expect(pcmHash(renderRecipe(r)), name).toBe(h);
      hashes.add(h);
    }
    // No two sounds render identically.
    expect(hashes.size).toBe(SOUND_NAMES.length);
  }, 120_000);

  it('footstep variations render to different audio', () => {
    for (const s of STEP_SURFACES) {
      const hs = new Set([0, 1, 2, 3].map((v) => pcmHash(renderRecipe(recipeFor(`step.${s}`, v)))));
      expect(hs.size, s).toBe(4);
    }
  });

  it('loops are seamless: the last sample meets the first without a step', () => {
    for (const name of SOUND_NAMES) {
      if (!SOUND_BANK[name].loop) continue;
      const pcm = renderRecipe(recipeFor(name, 0));
      for (const ch of pcm.channels) {
        const jump = Math.abs(ch[0] - ch[ch.length - 1]);
        const typical = measure({ rate: pcm.rate, channels: [ch] }).rms;
        expect(jump, name).toBeLessThan(Math.max(0.05, typical * 3));
      }
    }
  }, 120_000);

  it('encodes a valid WAV', () => {
    const wav = encodeWav(renderRecipe(recipeFor('radio.click', 0)));
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
  });
});

describe('engine sound → bank map', () => {
  it('covers every surface prop (step, bullet impact, impact) with a real sound', () => {
    const table = new SurfacePropsTable();
    table.addFile(HARMONIC_SURFACE_PROPS);
    const names = [...HARMONIC_SURFACE_PROPS.matchAll(/^"(\w+)" \{/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const n of names) {
      const p = table.get(n);
      for (const snd of [p.stepLeft, p.bulletImpact, p.impactHard, p.impactSoft]) {
        expect(snd, `${n}`).toBeTruthy();
        expect(resolveEngineSound(snd)?.known, `${n}: ${snd}`).toBe(true);
        expect(isSoundName(resolveEngineSound(snd)!.sound)).toBe(true);
      }
    }
    // The seven named footstep surfaces all appear.
    const steps = new Set(names.map((n) => table.get(n).stepLeft));
    for (const s of STEP_SURFACES) expect(steps.has(`step.${s}`), s).toBe(true);
  });

  it('maps every listed bank name onto itself', () => {
    for (const n of LISTED) expect(resolveEngineSound(n)?.sound).toBe(n);
  });

  it('maps the engine entity sounds the simulation emits', () => {
    expect(resolveEngineSound('HL2Player.Jump')?.sound).toBe('player.jump');
    expect(resolveEngineSound('Player.FallDamage')?.sound).toBe('player.land');
    expect(resolveEngineSound('Buttons.snd3')?.sound).toBe('button.press');
    expect(resolveEngineSound('Doors.Move1')?.sound).toBe('door.open');
    expect(resolveEngineSound('Doors.FullClose')?.sound).toBe('door.close');
    expect(resolveEngineSound('SolidMetal.StepLeft')?.sound).toBe('step.metal');
    expect(resolveEngineSound('Grate.StepRight')?.sound).toBe('step.grating');
    expect(resolveEngineSound('Snow.StepLeft')?.sound).toBe('step.snow');
    expect(resolveEngineSound('Breakable.MatGlass')?.sound).toBe('impact.glass');
    expect(resolveEngineSound('ambient/wind1.wav', true)?.sound).toBe('wind.loop');
  });

  it('gives unknown names a soft default and drops unknown loops', () => {
    expect(resolveEngineSound('Totally.Unknown')).toMatchObject({
      sound: 'misc.soft',
      known: false,
    });
    expect(resolveEngineSound('Totally.Unknown', true)).toBeNull();
    expect(resolveEngineSound('')).toBeNull();
  });

  it('turns sim events into bus events', () => {
    const step = mapSimEvent({ type: 'sound', name: 'step.snow', entity: 1, volume: 0.5 });
    expect(step).toEqual([
      { type: 'sfx', sound: 'step.snow', pos: undefined, entity: 1, volume: 0.5, rate: 1 },
    ]);
    expect(mapSimEvent({ type: 'sound', name: 'wind.loop', stop: true, entity: 4 })).toEqual([
      { type: 'stop', sound: 'wind.loop', entity: 4 },
    ]);
    expect(mapSimEvent({ type: 'sound', name: 'x', setVolume: 3 })).toEqual([]);
    expect(mapSimEvent({ type: 'pickup', entity: 2, item: 'x' })[0]).toMatchObject({
      sound: 'pickup',
    });
    expect(mapSimEvent({ type: 'death' })[0]).toMatchObject({ sound: 'player.death' });
    expect(mapSimEvent({ type: 'sound', name: 'music.drone' })).toEqual([]);
    expect(mapSimEvent({ type: 'sound', name: 'a', pitch: 50 })[0]).toMatchObject({ rate: 0.5 });
  });
});

describe('ambient beds', () => {
  it('every area has a bed, a profile and a starting level', () => {
    for (const a of AREAS) {
      expect(isSoundName(`bed.${a}`)).toBe(true);
      expect(SOUND_BANK[`bed.${a}`].loop).toBe(true);
      expect(AREA_PROFILES[a]).toBeDefined();
    }
    for (const l of HARMONIC_LEVELS) expect(AREAS).toContain(areaForLevel(l.id));
    expect(areaForSoundscape('harmonic.ship_1971_hold')).toBe('ship_1971');
    expect(areaForSoundscape('nothing')).toBeNull();
  });

  it('crossfades equal-power and ends exactly on the target', () => {
    const c = new BedCrossfader();
    c.setArea('ice_open', 0, true);
    expect(c.gains(0).ice_open).toBeCloseTo(1, 6);
    c.setArea('ship_1971', 10);
    const mid = c.gains(10 + BED_FADE_SECONDS / 2);
    expect(mid.ice_open).toBeCloseTo(Math.SQRT1_2, 5);
    expect(mid.ship_1971).toBeCloseTo(Math.SQRT1_2, 5);
    expect(mid.ice_open ** 2 + mid.ship_1971 ** 2).toBeCloseTo(1, 5);
    const end = c.levels(10 + BED_FADE_SECONDS);
    expect(end.ship_1971).toBe(1);
    expect(end.ice_open).toBe(0);
    expect(c.audible(10 + BED_FADE_SECONDS)).toEqual(['ship_1971']);
    expect(c.audible(10 + 1)).toEqual(expect.arrayContaining(['ice_open', 'ship_1971']));
  });

  it('is monotonic and continuous when retargeted mid-fade', () => {
    const c = new BedCrossfader();
    c.setArea('ice_open', 0, true);
    c.setArea('camp_interior', 5);
    let prev = c.levels(5).camp_interior;
    for (let t = 5; t <= 7; t += 0.05) {
      const now = c.levels(t).camp_interior;
      expect(now).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = now;
    }
    const before = c.levels(7);
    // Switch again halfway: the levels do not jump.
    c.setArea('ship_2030', 7);
    const after = c.levels(7);
    for (const a of AREAS) expect(after[a]).toBeCloseTo(before[a], 9);
    // Everything still sums to a full mix once settled.
    const settled = c.levels(7 + BED_FADE_SECONDS);
    expect(settled.ship_2030).toBe(1);
    expect(settled.camp_interior).toBe(0);
    // The same area again is a no-op.
    expect(c.setArea('ship_2030', 20)).toBe(false);
  });

  it('instant switches skip the fade', () => {
    const c = new BedCrossfader();
    c.setArea('ship_1971', 3, true);
    expect(c.levels(3).ship_1971).toBe(1);
  });
});

describe('generative music', () => {
  const run = (seed: number, intensity: number): ReturnType<MusicPlanner['plan']> => {
    const p = new MusicPlanner(mulberry32(seed));
    const out: ReturnType<MusicPlanner['plan']> = [];
    for (let t = 0; t < 300; t += 3) out.push(...p.plan(t, 3, intensity));
    return out;
  };

  it('is deterministic for a seed', () => {
    expect(run(7, 0.2)).toEqual(run(7, 0.2));
    expect(run(7, 0.2)).not.toEqual(run(8, 0.2));
  });

  it('is sparse at rest, busier in combat, and never crowds notes', () => {
    const calm = run(3, 0);
    const fight = run(3, 1);
    expect(fight.length).toBeGreaterThan(calm.length * 1.8);
    expect(calm.length).toBeLessThan(60);
    for (const set of [calm, fight]) {
      for (let i = 1; i < set.length; i++) {
        expect(set[i].at - set[i - 1].at).toBeGreaterThanOrEqual(1.5 - 1e-9);
        expect(set[i].variant).not.toBe(set[i - 1].variant);
      }
      for (const n of set) {
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(1);
        expect(Math.abs(n.pan)).toBeLessThanOrEqual(1);
        expect(n.variant).toBeLessThan(SOUND_BANK['music.tone'].variants);
      }
    }
  });

  it('mixes the pulse in only as intensity rises', () => {
    expect(musicMix(0).pulse).toBe(0);
    expect(musicMix(0.3).pulse).toBe(0);
    expect(musicMix(1).pulse).toBeCloseTo(1, 6);
    expect(musicMix(1).drone).toBeGreaterThan(musicMix(0).drone);
    expect(noteInterval(1)).toBeLessThan(noteInterval(0));
  });
});

describe('sound bus', () => {
  it('delivers to subscribers and stops after unsubscribe', () => {
    const bus = new HarmonicSoundBus();
    const seen: string[] = [];
    const off = bus.on((e) => seen.push(e.type));
    bus.sfx('tuner.shift');
    bus.emit({ type: 'area', area: 'ship_2030' });
    bus.emit({ type: 'music', intensity: 1 });
    off();
    bus.sfx('pickup');
    expect(seen).toEqual(['sfx', 'area', 'music']);
    expect(bus.listenerCount).toBe(0);
  });
});
