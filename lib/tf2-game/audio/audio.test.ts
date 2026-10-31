/**
 * The game's mixer against the engine's rules: attenuation, channels, the decoded-audio budget,
 * voice stealing, soundscapes, captions and the page lifecycle — over a fake AudioContext.
 */
import { describe, expect, it } from 'vitest';
import type { SoundIndex } from '../assets/urls';
import { soundlevelToAttenuation } from '../data/sounds';
import {
  attnToSndlvl,
  audibleRadius,
  CSGO_FALLOFF,
  distanceGain,
  falloffProfileFor,
  fullVolumeRadius,
  profileAudibleRadius,
  profileDistanceGain,
  SND_GAIN_MIN,
  SOURCE_FALLOFF,
  sndlvlToAttn,
  sndlvlToDistMult,
  soundlevelForRadius,
} from './attenuation';
import { BufferCache, decodedBytes } from './buffer-cache';
import { captionDuration, reduceCaption } from './captions';
import {
  CHAN_AUTO,
  CHAN_BODY,
  CHAN_REPLACE,
  CHAN_STATIC,
  CHAN_VOICE,
  CHAN_WEAPON,
  replacesOnChannel,
  soundGroupOf,
} from './channels';
import { crc32 } from './crc32';
import { AudioEngine, normalizeSoundPath, OCCLUSION_GAIN, VOICE_DUCK_GAIN } from './engine';
import { chainOf, FakeAudioContext, FakeBuffer, flush } from './fake-audio.test-support';
import { EntityLoopSounds, LateStartFilter, LOOP_RETRY_INTERVAL } from './loops';
import { sceneCrc } from './scene-image';
import {
  parseSoundscapes,
  selectSoundscape,
  SoundscapePlayer,
  type SoundscapeEntity,
  type SoundscapeHost,
} from './soundscapes';

const sha = (c: string) => c.repeat(64).slice(0, 64);
const A = sha('a');
const B = sha('b');
const C = sha('c');
const D = sha('d');
const E = sha('e');

const INDEX: SoundIndex = {
  v: 1,
  entries: {
    'Weapon_Test.Single': {
      waves: [A],
      volume: [1, 1],
      pitch: [100, 100],
      soundlevel: 75,
      channel: CHAN_WEAPON,
    },
    'Weapon_Test.Reload': {
      waves: [B],
      volume: [0.5, 0.5],
      pitch: [100, 100],
      soundlevel: 75,
      channel: CHAN_WEAPON,
    },
    'Test.Auto': {
      waves: [B],
      volume: [1, 1],
      pitch: [100, 100],
      soundlevel: 75,
      channel: CHAN_AUTO,
    },
    'Test.Static': {
      waves: [B],
      volume: [1, 1],
      pitch: [100, 100],
      soundlevel: 75,
      channel: CHAN_STATIC,
    },
    'Test.Voice': {
      waves: [D],
      volume: [1, 1],
      pitch: [100, 100],
      soundlevel: 80,
      channel: CHAN_VOICE,
    },
    'Test.Loop': {
      waves: [C],
      volume: [1, 1],
      pitch: [95, 95],
      soundlevel: 75,
      channel: CHAN_AUTO,
    },
    'Test.Ui': { waves: [E], volume: [1, 1], pitch: [100, 100], soundlevel: 0, channel: CHAN_AUTO },
    'Default.StepLeft': {
      waves: [B],
      volume: [1, 1],
      pitch: [100, 100],
      soundlevel: 75,
      channel: CHAN_BODY,
    },
  },
  files: {
    'sound/weapons/test.wav': `${A}.mp3`,
    'sound/player/b.wav': `${B}.mp3`,
    'sound/ambient/loop.wav': `${C}.mp3`,
    'sound/vo/test/line.wav': `${D}.mp3`,
    'sound/ui/click.wav': `${E}.mp3`,
  },
  loops: { [`${C}.mp3`]: { start: 0.25, end: null } },
};

function engine(over: Partial<ConstructorParameters<typeof AudioEngine>[0]> = {}) {
  const ctx = new FakeAudioContext();
  const fetched: string[] = [];
  const positions = new Map<number, { x: number; y: number; z: number }>();
  const audio = new AudioEngine({
    game: 'portal',
    context: ctx.asContext(),
    mobile: false,
    random: () => 0,
    fetchSound: async (s) => {
      fetched.push(s);
      return new ArrayBuffer(441); // decodes to 1 s
    },
    loadIndex: async () => INDEX,
    loadDocument: async () => null,
    entityPosition: (id) => positions.get(id) ?? null,
    ...over,
  });
  audio.setIndex(INDEX);
  audio.setListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  return { ctx, audio, fetched, positions };
}

async function warm(audio: AudioEngine, ...shas: string[]) {
  for (const s of shas) await audio.cache.get(s);
}

describe('attenuation (SNDLVL)', () => {
  it('matches soundflags.h SNDLVL_TO_ATTN / ATTN_TO_SNDLVL and the data table', () => {
    for (const lvl of [0, 50, 60, 66, 70, 75, 80, 90, 100, 140])
      expect(sndlvlToAttn(lvl)).toBeCloseTo(soundlevelToAttenuation(lvl), 10);
    // The scripts' ATTN_* constants → their levels.
    expect(attnToSndlvl(0.8)).toBe(75); // ATTN_NORM
    expect(attnToSndlvl(2)).toBe(60); // ATTN_IDLE
    expect(attnToSndlvl(1.25)).toBe(66); // ATTN_STATIC
    expect(attnToSndlvl(0.27)).toBe(124); // ATTN_GUNFIRE (int cast)
    expect(attnToSndlvl(0)).toBe(0);
    for (const lvl of [60, 70, 75, 80, 90]) expect(attnToSndlvl(sndlvlToAttn(lvl))).toBe(lvl);
  });

  it('is full volume to 36·10^((L−60)/20) units, then 1/distance', () => {
    expect(fullVolumeRadius(60)).toBeCloseTo(36, 6);
    expect(fullVolumeRadius(75)).toBeCloseTo(36 * Math.pow(10, 0.75), 6); // ≈202.4
    const r = fullVolumeRadius(75);
    expect(distanceGain(75, 0)).toBe(1);
    expect(distanceGain(75, r * 0.99)).toBe(1);
    // −6 dB per doubling of distance (inverse distance).
    expect(distanceGain(75, 2 * r)).toBeCloseTo(0.5, 6);
    expect(distanceGain(75, 4 * r)).toBeCloseTo(0.25, 6);
    // Every 20 dB more multiplies the reach by ten.
    expect(fullVolumeRadius(95) / fullVolumeRadius(75)).toBeCloseTo(10, 6);
    expect(distanceGain(95, 20 * r)).toBeCloseTo(distanceGain(75, 2 * r), 6);
    expect(sndlvlToDistMult(75)).toBeCloseTo(1 / r, 12);
  });

  it('fades out under snd_gain_min and never rises with distance', () => {
    const silent = audibleRadius(75);
    expect(distanceGain(75, silent)).toBe(0);
    expect(distanceGain(75, silent * 2)).toBe(0);
    const edge = fullVolumeRadius(75) / SND_GAIN_MIN;
    expect(distanceGain(75, edge)).toBeCloseTo(SND_GAIN_MIN, 6);
    let last = 1;
    for (let d = 0; d < silent * 1.1; d += 97) {
      const g = distanceGain(75, d);
      expect(g).toBeLessThanOrEqual(last + 1e-12);
      expect(g).toBeGreaterThanOrEqual(0);
      last = g;
    }
  });

  it('does not attenuate SNDLVL_NONE', () => {
    expect(distanceGain(0, 1e6)).toBe(1);
    expect(audibleRadius(0)).toBe(Infinity);
  });

  it('gives ambient_generic radii their level (ComputeSoundlevel: 40 dB at the radius)', () => {
    expect(soundlevelForRadius(1250)).toBe(70); // the default radius
    expect(soundlevelForRadius(36)).toBe(40);
    expect(soundlevelForRadius(0)).toBe(0);
    expect(soundlevelForRadius(1250, true)).toBe(0); // "play everywhere"
  });
});

describe('falloff profiles', () => {
  const db = (g: number) => 20 * Math.log10(g);

  it('leaves TF2, HL2 and Portal on the plain curve', () => {
    for (const game of ['tf2', 'hl2', 'portal'])
      expect(falloffProfileFor(game)).toBe(SOURCE_FALLOFF);
    for (const d of [0, 500, 3000, 20000])
      expect(profileDistanceGain(SOURCE_FALLOFF, 75, d)).toBe(distanceGain(75, d));
  });

  it('CS:GO: footsteps fade out by ~1100 units, gunfire carries across the map, quieter', () => {
    const P = falloffProfileFor('csgo');
    expect(P).toBe(CSGO_FALLOFF);
    // Footsteps (75 dB): full near, clearly down at 800, silent past 1100.
    expect(profileDistanceGain(P, 75, 150)).toBe(1);
    expect(profileDistanceGain(P, 75, 800)).toBeLessThan(distanceGain(75, 800) * 0.8);
    expect(profileDistanceGain(P, 75, 1100)).toBe(0);
    expect(profileDistanceGain(P, 75, 3000)).toBe(0);
    expect(profileAudibleRadius(P, 75)).toBe(1100);
    // Foley (65 dB: reloads, draws): gone sooner.
    expect(profileDistanceGain(P, 65, 800)).toBe(0);
    // Gunfire (79 dB): the plain curve — audible map-wide, falling with distance.
    const shot = (d: number) => profileDistanceGain(P, 79, d);
    expect(shot(200)).toBe(1);
    expect(db(shot(1000))).toBeCloseTo(-9.9, 0);
    expect(db(shot(4000))).toBeCloseTo(-21.9, 0);
    expect(shot(6000)).toBeGreaterThan(0.03);
    expect(shot(1000)).toBeGreaterThan(shot(2000));
    // Explosions keep the curve too.
    expect(profileDistanceGain(P, 140, 5000)).toBe(distanceGain(140, 5000));
    // Never rises with distance.
    for (const lvl of [60, 65, 75, 79]) {
      let last = 1;
      for (let d = 0; d < 5000; d += 37) {
        const g = profileDistanceGain(P, lvl, d);
        expect(g).toBeLessThanOrEqual(last + 1e-12);
        last = g;
      }
    }
  });

  it('is what the CS:GO mixer applies', async () => {
    const { ctx, audio } = engine({ game: 'csgo' });
    await warm(audio, A, B);
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 800, y: 0, z: 0 } });
    const gain = ctx.sources[0].outputs[0].outputs[0] as unknown as { gain: { value: number } };
    expect(gain.gain.value).toBeCloseTo(profileDistanceGain(CSGO_FALLOFF, 75, 800), 9);
    expect(gain.gain.value).toBeLessThan(distanceGain(75, 800));
    expect(audio.distanceGain(79, 3000)).toBeCloseTo(distanceGain(79, 3000), 9); // a shot carries
    // A footstep across the map is culled outright; a TF2 one plays.
    expect(audio.emit({ name: 'Default.StepLeft', pos: { x: 3000, y: 0, z: 0 } })).toBeNull();
    const tf2 = engine({ game: 'tf2' });
    await warm(tf2.audio, B);
    expect(
      tf2.audio.emit({ name: 'Default.StepLeft', pos: { x: 3000, y: 0, z: 0 } }),
    ).not.toBeNull();
  });
});

describe('channels', () => {
  const slot = (entity: number | null, channel: number, looping = false) => ({
    entity,
    channel,
    looping,
  });

  it('replaces the same entity and channel, not CHAN_AUTO, statics or other entities', () => {
    expect(replacesOnChannel(slot(1, CHAN_WEAPON), slot(1, CHAN_WEAPON))).toBe(true);
    expect(replacesOnChannel(slot(1, CHAN_WEAPON), slot(2, CHAN_WEAPON))).toBe(false);
    expect(replacesOnChannel(slot(1, CHAN_WEAPON), slot(1, CHAN_VOICE))).toBe(false);
    expect(replacesOnChannel(slot(1, CHAN_AUTO), slot(1, CHAN_AUTO))).toBe(false);
    expect(replacesOnChannel(slot(1, CHAN_STATIC), slot(1, CHAN_STATIC))).toBe(false);
    expect(replacesOnChannel(slot(1, CHAN_WEAPON, true), slot(1, CHAN_WEAPON))).toBe(false);
    expect(replacesOnChannel(slot(1, CHAN_VOICE), slot(1, CHAN_REPLACE))).toBe(true);
    expect(replacesOnChannel(slot(null, CHAN_WEAPON), slot(null, CHAN_WEAPON))).toBe(false);
  });

  it('groups by folder and channel', () => {
    expect(soundGroupOf(CHAN_AUTO, 'sound/music/portal_still_alive.mp3')).toBe('music');
    expect(soundGroupOf(CHAN_VOICE, 'sound/npc/x.wav')).toBe('voice');
    expect(soundGroupOf(CHAN_AUTO, 'sound/vo/aperture_ai/x.wav')).toBe('voice');
    expect(soundGroupOf(CHAN_AUTO, 'sound/ui/hitsound.wav')).toBe('ui');
    expect(soundGroupOf(CHAN_WEAPON, 'sound/weapons/x.wav')).toBe('sfx');
  });

  it('applies the rules in the mixer', async () => {
    const { ctx, audio } = engine();
    await warm(audio, A, B);
    audio.emit({ name: 'Weapon_Test.Single', entity: 5, channel: CHAN_WEAPON });
    audio.emit({ name: 'Weapon_Test.Reload', entity: 5, channel: CHAN_WEAPON });
    expect(ctx.sources[0].stopped).toBe(true);
    expect(ctx.live()).toHaveLength(1);
    audio.emit({ name: 'Weapon_Test.Single', entity: 6, channel: CHAN_WEAPON });
    audio.emit({ name: 'Test.Auto', entity: 5 });
    audio.emit({ name: 'Test.Auto', entity: 5 });
    expect(ctx.live()).toHaveLength(4);
    // Script entries use their script channel, whatever the event says (SoundEmitterSystem).
    audio.emit({ name: 'Weapon_Test.Single', entity: 6, channel: CHAN_AUTO });
    expect(ctx.live()).toHaveLength(4);
    audio.emit({ name: 'Test.Auto', entity: 5, stop: true, channel: CHAN_AUTO });
    expect(audio.stats().playing).toBe(2);
  });

  it('stops a named sound on whatever channel its script plays it (the minigun fire loop)', async () => {
    const { ctx, audio } = engine();
    audio.setIndex({
      ...INDEX,
      entries: {
        ...INDEX.entries,
        // Weapon_Minigun.Fire: a CHAN_STATIC loop the weapon code stops as a CHAN_WEAPON sound.
        'Test.StaticLoop': {
          waves: [C],
          volume: [1, 1],
          pitch: [100, 100],
          soundlevel: 94,
          channel: CHAN_STATIC,
        },
      },
    });
    await warm(audio, C);
    const h = audio.emit({ name: 'Test.StaticLoop', entity: 4, channel: CHAN_WEAPON });
    expect(h?.looping).toBe(true);
    audio.emit({ name: 'Test.StaticLoop', entity: 5 });
    audio.emit({ name: 'Test.StaticLoop', entity: 4, channel: CHAN_WEAPON, stop: true });
    expect(ctx.sources[0].stopped).toBe(true);
    expect(ctx.sources[1].stopped).toBe(false); // another entity's
    expect(h?.playing).toBe(false);
    // An unnamed stop still matches by channel only.
    audio.emit({ name: '', entity: 5, channel: CHAN_WEAPON, stop: true });
    expect(ctx.sources[1].stopped).toBe(false);
    audio.emit({ name: '', entity: 5, channel: CHAN_STATIC, stop: true });
    expect(ctx.sources[1].stopped).toBe(true);
  });

  it('keeps loops and statics until stopped', async () => {
    const { ctx, audio } = engine();
    await warm(audio, B, C);
    const loop = audio.emit({ name: 'Test.Loop', entity: 9 });
    audio.emit({ name: 'Test.Static', entity: 9 });
    audio.emit({ name: 'Test.Static', entity: 9 });
    expect(ctx.live()).toHaveLength(3);
    const src = ctx.sources[0];
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBe(0.25);
    expect(src.playbackRate.value).toBeCloseTo(0.95, 6);
    loop?.stop();
    expect(src.stopped).toBe(true);
    expect(ctx.live()).toHaveLength(2);
  });
});

describe('decoded-audio budget (LRU)', () => {
  const buf = (frames: number) => new FakeBuffer(1, frames, 44100);

  it('evicts least recently used, unpinned buffers past the budget', async () => {
    const loads: string[] = [];
    const cache = new BufferCache<FakeBuffer>({
      maxBytes: 3 * 4000,
      load: async (s) => {
        loads.push(s);
        return buf(1000);
      },
    });
    expect(decodedBytes(buf(1000))).toBe(4000);
    await cache.get('a');
    await cache.get('b');
    await cache.get('c');
    expect(cache.bytes).toBe(12000);
    cache.peek('a'); // a is now the most recent
    await cache.get('d'); // evicts b
    expect(cache.has('b')).toBe(false);
    expect(['a', 'c', 'd'].every((k) => cache.has(k))).toBe(true);
    cache.retain('c');
    await cache.get('e'); // c pinned: evicts a
    expect(cache.has('a')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.bytes).toBeLessThanOrEqual(cache.maxBytes);
    cache.release('c');
    await cache.get('b');
    expect(loads).toEqual(['a', 'b', 'c', 'd', 'e', 'b']);
  });

  it('runs over budget only while everything is playing', async () => {
    const cache = new BufferCache<FakeBuffer>({ maxBytes: 4000, load: async () => buf(1000) });
    await cache.get('a');
    cache.retain('a');
    await cache.get('b');
    expect(cache.bytes).toBe(8000);
    cache.release('a');
    expect(cache.bytes).toBe(4000);
    expect(cache.has('b')).toBe(true);
  });

  it('shares one load per sound and does not cache failures', async () => {
    let n = 0;
    let fail = true;
    const cache = new BufferCache<FakeBuffer>({
      maxBytes: 1e6,
      load: async () => {
        n++;
        if (fail) throw new Error('offline');
        return buf(10);
      },
    });
    await expect(Promise.all([cache.get('x'), cache.get('x')])).rejects.toThrow('offline');
    expect(n).toBe(1);
    fail = false;
    await cache.get('x');
    expect(n).toBe(2);
  });

  it('is what the mixer decodes into', async () => {
    const { ctx, audio, fetched } = engine({ cacheBytes: 2 * 44100 * 4 });
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 10, y: 0, z: 0 } });
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 10, y: 0, z: 0 } });
    await flush();
    expect(fetched).toEqual([A]);
    expect(ctx.decodes).toBe(1);
    expect(ctx.live()).toHaveLength(2);
  });
});

describe('voice limit', () => {
  it('steals the quietest voice and drops sounds quieter than everything', async () => {
    const { ctx, audio } = engine({ maxVoices: 3 });
    await warm(audio, A);
    const r = 202.4;
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: r * 2, y: 0, z: 0 } }); // 0.5
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: r * 4, y: 0, z: 0 } }); // 0.25 (quietest)
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: r * 3, y: 0, z: 0 } }); // 0.33
    expect(audio.stats().playing).toBe(3);
    expect(audio.emit({ name: 'Weapon_Test.Single', pos: { x: r * 8, y: 0, z: 0 } })).toBeNull();
    expect(ctx.sources[1].stopped).toBe(false);
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 10, y: 0, z: 0 } }); // 1.0 steals the 0.25
    expect(ctx.sources[1].stopped).toBe(true);
    expect(audio.stats().playing).toBe(3);
  });

  it("never steals the local player's sounds for someone else's", async () => {
    const { audio, ctx, positions } = engine({ maxVoices: 2 });
    await warm(audio, A, B);
    audio.setLocalEntity(1);
    positions.set(1, { x: 0, y: 0, z: 0 });
    audio.emit({ name: 'Weapon_Test.Reload', entity: 1 }); // volume 0.5, local
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 300, y: 0, z: 0 } });
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 10, y: 0, z: 0 } });
    expect(ctx.sources[0].stopped).toBe(false);
    expect(ctx.sources[1].stopped).toBe(true);
  });

  it('defaults to 48 voices and a 64 MB budget on desktop, less on mobile', () => {
    const desktop = new AudioEngine({ game: 'tf2', context: null, mobile: false });
    const mobile = new AudioEngine({ game: 'tf2', context: null, mobile: true });
    expect(desktop.maxVoices).toBe(48);
    expect(desktop.cache.maxBytes).toBe(64 * 1024 * 1024);
    expect(mobile.maxVoices).toBeLessThanOrEqual(48);
    expect(mobile.cache.maxBytes).toBe(24 * 1024 * 1024);
  });
});

describe('mixer', () => {
  it('spatialises with Source attenuation and follows the entity', async () => {
    const { ctx, audio, positions } = engine();
    await warm(audio, A);
    positions.set(7, { x: 404.8, y: 0, z: 0 });
    audio.emit({ name: 'Weapon_Test.Single', entity: 7 });
    const src = ctx.sources[0];
    expect(chainOf(src)).toEqual([
      'FakeSource',
      'FakeFilter',
      'FakeGain',
      'FakePanner',
      'FakeGain',
      'FakeGain',
      'FakeGain',
      // Mix headroom (−6 dB); the fake context has no limiter, so it goes straight to the output.
      'FakeGain',
      'FakeNode',
    ]);
    const gain = src.outputs[0].outputs[0] as unknown as { gain: { value: number } };
    expect(gain.gain.value).toBeCloseTo(distanceGain(75, 404.8), 6);
    expect(ctx.panners[0].panningModel).toBe('HRTF');
    // The panner's own distance model is neutral (linear with no rolloff: gain 1 everywhere),
    // so the Source curve on the gain node is the only attenuation.
    expect(ctx.panners[0].distanceModel).toBe('linear');
    expect(ctx.panners[0].rolloffFactor).toBe(0);
    // Source x forward → Web Audio z; metres.
    expect(ctx.panners[0].positionZ.value).toBeCloseTo(404.8 * 0.01905, 6);
    positions.set(7, { x: 50, y: 0, z: 0 });
    audio.update();
    expect(gain.gain.value).toBe(1);
    expect(ctx.panners[0].positionZ.value).toBeCloseTo(50 * 0.01905, 6);
  });

  it('does not spatialise SNDLVL_NONE or the local player and culls inaudible one-shots', async () => {
    const { ctx, audio, positions } = engine();
    await warm(audio, A, E);
    audio.emit({ name: 'Test.Ui', pos: { x: 1e5, y: 0, z: 0 } });
    audio.setLocalEntity(3);
    positions.set(3, { x: 5000, y: 0, z: 0 });
    audio.emit({ name: 'Weapon_Test.Single', entity: 3 });
    expect(ctx.panners).toHaveLength(0);
    expect(ctx.live()).toHaveLength(2);
    expect(
      audio.emit({ name: 'Weapon_Test.Single', pos: { x: audibleRadius(75) + 1, y: 0, z: 0 } }),
    ).toBeNull();
  });

  it('plays raw paths and orients the listener (Source → Web Audio axes)', async () => {
    const { ctx, audio } = engine();
    await warm(audio, A);
    expect(normalizeSoundPath(')Weapons\\Test.WAV')).toBe('sound/weapons/test.wav');
    expect(
      audio.emit({ name: 'weapons/test.wav', pos: { x: 1, y: 0, z: 0 }, channel: CHAN_WEAPON }),
    ).not.toBeNull();
    expect(audio.emit({ name: 'missing/none.wav' })).toBeNull();
    expect(audio.stats().missing).toBe(1);
    audio.setListener({ x: 100, y: 200, z: 300 }, { x: 0, y: 90, z: 0 }); // looking +y (left)
    expect(ctx.listener.positionX.value).toBeCloseTo(200 * 0.01905, 6);
    expect(ctx.listener.positionY.value).toBeCloseTo(300 * 0.01905, 6);
    expect(ctx.listener.positionZ.value).toBeCloseTo(100 * 0.01905, 6);
    expect(ctx.listener.forwardX.value).toBeCloseTo(1, 6);
    expect(ctx.listener.forwardZ.value).toBeCloseTo(0, 6);
    expect(ctx.listener.upY.value).toBeCloseTo(1, 6);
  });

  it('applies group volumes and ducks effects under speech', async () => {
    const { audio, ctx } = engine();
    await warm(audio, A, D);
    audio.setVolume('music', 0.3);
    expect(audio.getVolume('music')).toBe(0.3);
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 1, y: 0, z: 0 } });
    const duckNode = ctx.sources[0].outputs[0].outputs[0].outputs[0].outputs[0]
      .outputs[0] as unknown as {
      gain: { value: number };
    };
    audio.update();
    expect(duckNode.gain.value).toBe(1);
    audio.emit({ name: 'Test.Voice', pos: { x: 1, y: 0, z: 0 } });
    audio.update();
    expect(duckNode.gain.value).toBe(VOICE_DUCK_GAIN);
    ctx.sources[1].finish();
    audio.update();
    expect(duckNode.gain.value).toBe(1);
  });

  it('occludes through a throttled trace', async () => {
    let traces = 0;
    let blocked = true;
    const { ctx, audio } = engine({
      occlusion: () => {
        traces++;
        return blocked;
      },
    });
    await warm(audio, A);
    for (let i = 0; i < 6; i++) audio.emit({ name: 'Test.Auto', pos: { x: 10 + i, y: 0, z: 0 } });
    await warm(audio, B);
    await flush();
    audio.update();
    expect(traces).toBe(4); // at most 4 traces per update
    audio.update();
    expect(traces).toBe(6);
    audio.update();
    expect(traces).toBe(6); // each voice at most every 0.25 s
    const src = ctx.sources[0];
    const filter = src.outputs[0] as unknown as {
      frequency: { value: number };
      outputs: { gain: { value: number } }[];
    };
    expect(filter.frequency.value).toBe(1200);
    expect(filter.outputs[0].gain.value).toBeCloseTo(OCCLUSION_GAIN, 6);
    blocked = false;
    ctx.currentTime = 1;
    audio.update();
    audio.update();
    expect(filter.frequency.value).toBe(20000);
    expect(filter.outputs[0].gain.value).toBe(1);
  });

  it('emits captions with the sound duration, honouring norepeat and audibility', async () => {
    const { ctx, audio } = engine();
    await warm(audio, D, A);
    audio.setCaptions({
      'test.voice': { text: '<i>Hello.</i>', color: '#db7093' },
      'weapon_test.single': { text: '[Bang]', sfx: true, norepeat: 5 },
    });
    const got: { token: string; duration: number; sfx: boolean }[] = [];
    audio.onCaption((c) => got.push(c));
    audio.emit({ name: 'Test.Voice', pos: { x: 1, y: 0, z: 0 } });
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 1, y: 0, z: 0 } });
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 1, y: 0, z: 0 } });
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({
      token: 'test.voice',
      text: '<i>Hello.</i>',
      color: '#db7093',
      sfx: false,
    });
    expect(got[0].duration).toBeCloseTo(1 + 1, 6); // the sound + cc_linger_time
    expect(got[1]).toMatchObject({ token: 'weapon_test.single', sfx: true });
    ctx.currentTime = 6;
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: audibleRadius(75) * 0.9, y: 0, z: 0 } });
    expect(got).toHaveLength(2); // too far to caption
    audio.emit({ name: 'Weapon_Test.Single', pos: { x: 1, y: 0, z: 0 } });
    expect(got).toHaveLength(3);
  });

  it('plays a scene on schedule with its caption tokens', async () => {
    const { ctx, audio } = engine();
    await warm(audio, D, A);
    audio.setScenes({
      'scenes/test/a.vcd': {
        duration: 3,
        speak: [
          { actor: 'Aperture_AI', sound: 'Test.Voice', start: 0.5, end: 1 },
          { actor: 'Aperture_AI', sound: 'Weapon_Test.Single', start: 2, end: 3, ccType: 2 },
        ],
      },
    });
    audio.setCaptions({ 'test.voice': { text: 'Hi' }, 'weapon_test.single': { text: 'x' } });
    const tokens: string[] = [];
    audio.onCaption((c) => tokens.push(c.token));
    audio.playScene('Scenes\\Test\\A.vcd', () => ({ pos: { x: 1, y: 0, z: 0 } }));
    audio.update();
    expect(ctx.sources).toHaveLength(0);
    ctx.currentTime = 0.6;
    audio.update();
    expect(ctx.sources).toHaveLength(1);
    ctx.currentTime = 2.1;
    audio.update();
    expect(ctx.sources).toHaveLength(2);
    expect(tokens).toEqual(['test.voice']);
  });

  it('plays footsteps from the surface table', async () => {
    const { ctx, audio } = engine();
    await warm(audio, B);
    expect(audio.footstep('concrete', 'left', { pos: { x: 1, y: 0, z: 0 } })).not.toBeNull(); // falls back to Default
    expect(ctx.live()).toHaveLength(1);
  });

  it('unlocks in a gesture, resumes an interrupted context and suspends while hidden', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    expect(ctx.state).toBe('running');
    expect(ctx.sources).toHaveLength(1); // the silent iOS unlock buffer
    audio.unlock();
    expect(ctx.sources).toHaveLength(1);
    ctx.state = 'interrupted';
    audio.unlock();
    expect(ctx.state).toBe('running');
    audio.onVisibility(true);
    expect(ctx.state).toBe('suspended');
    audio.unlock(); // a gesture while hidden does not resume
    expect(ctx.state).toBe('suspended');
    audio.onVisibility(false);
    expect(ctx.state).toBe('running');

    const target = new EventTarget();
    ctx.state = 'suspended';
    const detach = audio.attach(target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.state).toBe('running');
    detach();
    ctx.state = 'suspended';
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.state).toBe('suspended');
  });

  it('is a no-op without Web Audio', () => {
    const audio = new AudioEngine({ game: 'hl2', context: null });
    audio.setIndex(INDEX);
    expect(audio.available).toBe(false);
    expect(audio.emit({ name: 'Weapon_Test.Single' })).toBeNull();
    audio.update();
    audio.dispose();
  });
});

describe('state-driven loops', () => {
  async function setup() {
    const e = engine();
    await warm(e.audio, B, C);
    let now = 0;
    const loops = new EntityLoopSounds({ emit: (ev) => e.audio.emit(ev) });
    return {
      ...e,
      loops,
      at: (t: number) => (now = t),
      get now() {
        return now;
      },
    };
  }

  it('starts, swaps and stops with the wanted loop', async () => {
    const { ctx, loops } = await setup();
    loops.update([[3, 'Test.Loop']], 0);
    loops.update([[3, 'Test.Loop']], 0.1); // unchanged: not restarted
    expect(ctx.live()).toHaveLength(1);
    const first = ctx.sources[0];
    loops.update([[3, 'Test.Static']], 0.2); // the state moved on (spin → fire)
    expect(first.stopped).toBe(true);
    expect(ctx.live()).toHaveLength(1);
    loops.update([[3, '']], 0.3); // released
    expect(ctx.live()).toHaveLength(0);
    expect(loops.size).toBe(0);
  });

  it('silences an entity that is no longer reported (gone, out of the game)', async () => {
    const { ctx, loops } = await setup();
    loops.update(
      [
        [3, 'Test.Loop'],
        [4, 'Test.Loop'],
      ],
      0,
    );
    expect(ctx.live()).toHaveLength(2);
    loops.update([[4, 'Test.Loop']], 0.1);
    expect(ctx.sources[0].stopped).toBe(true);
    expect(ctx.live()).toHaveLength(1);
    loops.stopAll();
    expect(ctx.live()).toHaveLength(0);
  });

  it('retries a loop that did not start, but not a one-shot that ended', async () => {
    const e = engine();
    let index = false;
    const loops = new EntityLoopSounds({ emit: (ev) => (index ? e.audio.emit(ev) : null) });
    loops.update([[3, 'Test.Loop']], 0); // the index is not loaded yet
    await warm(e.audio, B, C);
    index = true;
    loops.update([[3, 'Test.Loop']], LOOP_RETRY_INTERVAL / 2);
    expect(e.ctx.live()).toHaveLength(0);
    loops.update([[3, 'Test.Loop']], LOOP_RETRY_INTERVAL);
    expect(e.ctx.live()).toHaveLength(1);
    // A wave without loop points plays once for as long as the state wants it.
    loops.update([[5, 'Test.Static']], 1);
    e.ctx.sources[1].finish();
    loops.update([[5, 'Test.Static']], 3);
    expect(e.ctx.sources).toHaveLength(2);
  });

  it('drops a start that arrives after the stop that ended it', () => {
    const f = new LateStartFilter(1 / 66);
    expect(f.admits(7, 'WeaponMedigun.HealingWorld', 100)).toBe(true);
    f.stopped(7, 'WeaponMedigun.HealingWorld', 102); // reliable: here first
    expect(f.admits(7, 'weaponmedigun.healingworld', 101)).toBe(false); // the snapshot's start, late
    expect(f.admits(7, 'WeaponMedigun.HealingWorld', 102)).toBe(true); // stop-then-start in a tick
    expect(f.admits(7, 'WeaponMedigun.HealingWorld', 140)).toBe(true);
    expect(f.admits(8, 'WeaponMedigun.HealingWorld', 101)).toBe(true);
    // Forgotten after a while.
    f.stopped(9, 'X', 102 + 66 * 5);
    expect(f.admits(7, 'WeaponMedigun.HealingWorld', 101)).toBe(true);
  });
});

describe('soundscapes', () => {
  const TEXT = `
"test.base"
{
  "dsp" "1"
  "playlooping" { "volume" "0.5" "pitch" "100" "wave" "ambient/atmosphere/ambience5.wav" }
  "playrandom"
  {
    "time" "4,6" "volume" "0.7,1" "pitch" "90,120" "position" "random" "soundlevel" "SNDLVL_60dB"
    "rndwave" { "wave" "ambient/a.wav" "wave" "ambient/b.wav" }
  }
}
"test.room"
{
  "playsoundscape" { "name" "test.base" "volume" "0.5" }
  "playlooping" { "volume" "1" "wave" ")ambient/machines/hum.wav" "position" "0" "attenuation" "0.8" }
}
"Test.Base" { "playlooping" { "volume" "1" "wave" "dup.wav" } }
`;

  it('parses the script (KeyValues) into rules', () => {
    const defs = parseSoundscapes(TEXT);
    expect(Object.keys(defs)).toEqual(['test.base', 'test.room']);
    expect(defs['test.base']).toEqual({
      dsp: 1,
      rules: [
        {
          type: 'looping',
          volume: [0.5, 0.5],
          pitch: [100, 100],
          wave: 'sound/ambient/atmosphere/ambience5.wav',
        },
        {
          type: 'random',
          time: [4, 6],
          volume: [0.7, 1],
          pitch: [90, 120],
          position: 'random',
          soundlevel: [60, 60],
          waves: ['sound/ambient/a.wav', 'sound/ambient/b.wav'],
        },
      ],
    });
    expect(defs['test.room'].rules[1]).toEqual({
      type: 'looping',
      volume: [1, 1],
      wave: 'sound/ambient/machines/hum.wav',
      position: 0,
      soundlevel: [75, 75],
    });
  });

  it('selects like CEnvSoundscape::UpdateForPlayer', () => {
    const env = (
      id: number,
      x: number,
      radius: number,
      soundscape = `s${id}`,
    ): SoundscapeEntity => ({
      id,
      soundscape,
      origin: { x, y: 0, z: 0 },
      radius,
    });
    const envs = [env(1, 0, 500), env(2, 300, 200), env(3, 1000, -1)];
    const state = { current: null };
    const all = () => true;
    expect(selectSoundscape(envs, { x: 100, y: 0, z: 0 }, state, all)?.id).toBe(1);
    // Closer and in range takes over.
    expect(selectSoundscape(envs, { x: 280, y: 0, z: 0 }, state, all)?.id).toBe(2);
    // Out of every finite radius: the infinite one, which is visible, takes over.
    expect(selectSoundscape(envs, { x: 900, y: 0, z: 0 }, state, all)?.id).toBe(3);
    // Nothing visible: the current one stays.
    expect(selectSoundscape(envs, { x: 100, y: 0, z: 0 }, state, () => false)?.id).toBe(3);
    // A blocked closer one never takes over.
    expect(
      selectSoundscape(envs, { x: 100, y: 0, z: 0 }, state, (from) => from.x === 1000)?.id,
    ).toBe(3);
  });

  it('crossfades loops over the fade time and schedules random sounds', () => {
    const loops: { wave: string; volume: number; stopped: boolean; pos: unknown }[] = [];
    const once: { wave: string; soundlevel: number; pos: unknown }[] = [];
    const host: SoundscapeHost = {
      startLoop: (wave, volume, _pitch, _sl, pos) => {
        const l = { wave, volume, stopped: false, pos };
        loops.push(l);
        return { setVolume: (v) => (l.volume = v), stop: () => (l.stopped = true) };
      },
      playOnce: (wave, _v, _p, soundlevel, pos) => once.push({ wave, soundlevel, pos }),
      listener: () => ({
        origin: { x: 0, y: 0, z: 0 },
        forward: { x: 1, y: 0, z: 0 },
        right: { x: 0, y: -1, z: 0 },
      }),
    };
    const player = new SoundscapePlayer(host, parseSoundscapes(TEXT), () => 0.5);
    player.start('test.room', [{ x: 64, y: 0, z: 0 }]);
    expect(loops.map((l) => l.wave)).toEqual([
      'sound/ambient/atmosphere/ambience5.wav',
      'sound/ambient/machines/hum.wav',
    ]);
    expect(loops[1].pos).toEqual({ x: 64, y: 0, z: 0 });
    player.update(1.5); // halfway through the 3 s fade
    expect(loops[0].volume).toBeCloseTo(0.25, 6); // 0.5 × the sub-soundscape's 0.5
    expect(loops[1].volume).toBeCloseTo(0.5, 6);
    // First random sound at half its interval (0.5 × 5 s), 36 units away, at its level.
    expect(once).toHaveLength(0);
    player.update(2.6);
    expect(once).toHaveLength(1);
    expect(once[0].soundlevel).toBe(60);
    const p = once[0].pos as { x: number; y: number };
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(36, 6);
    // Switch: the shared ambience loop carries on, the hum fades out and stops.
    player.start('test.base');
    expect(loops).toHaveLength(2);
    player.update(10);
    expect(loops[0].stopped).toBe(false);
    expect(loops[0].volume).toBeCloseTo(0.5, 6);
    expect(loops[1].stopped).toBe(true);
    player.start(null);
    expect(loops[0].stopped).toBe(true);
    expect(player.stats).toEqual({ loops: 0, randoms: 0 });
  });
});

describe('captions', () => {
  it('reduces the HUD markup', () => {
    expect(reduceCaption('<clr:194,40,32><I>*GNASH*')).toEqual({
      text: '<i>*GNASH*</i>',
      color: '#c22820',
    });
    expect(reduceCaption('<sfx><norepeat:10>[Energy Ball Bounce]')).toEqual({
      text: '[Energy Ball Bounce]',
      sfx: true,
      norepeat: 10,
    });
    expect(
      reduceCaption(
        '<clr:255,0,0>This is red<I> and italics<B> and<cr>bold<B><I><clr:255,255,255> white again.',
      ),
    ).toEqual({
      text: 'This is red<i> and italics<b> and\nbold</b></i><color=#ffffff> white again.</color>',
      color: '#ff0000',
    });
    expect(reduceCaption('<len:3.5>Hi')).toEqual({ text: 'Hi', len: 3.5 });
    expect(captionDuration({ text: 'x' }, 2)).toBe(3);
    expect(captionDuration({ text: 'x', len: 4 }, 2)).toBe(4);
  });

  it('hashes tokens and scene names as the engine does', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
    expect(sceneCrc('scenes/Test_Chamber/ai_00_a_entry.vcd')).toBe(
      crc32('scenes\\test_chamber\\ai_00_a_entry.vcd'),
    );
  });
});
