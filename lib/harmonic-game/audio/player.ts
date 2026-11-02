/**
 * Harmonic's audio backend (`SpAudioBackend`, injected through `SpContent.createAudio`): turns the
 * simulation's events and the `HarmonicSoundEvent` bus into sound on the page's shared context
 * (`getAudioContext()` — never a context of its own). Browser only.
 *
 *   sim events ──mapSimEvent──┐
 *   harmonicSounds bus ───────┴─► sfx voices (cached synthesised buffers, positional)
 *                               ► area beds (equal-power crossfade) ► generative music
 *
 * Positional sounds use the engine's distance curve (`attenuation.ts`, applied per frame) in front
 * of a PannerNode whose own attenuation is neutral, so nothing falls off twice. Volumes come from
 * the game settings (master / sfx / voice / music).
 */
import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';
import type { SpAudioBackend, SpAudioContext } from '../../tf2-game/client/sp-client';
import { distanceGain } from '../../tf2-game/audio/attenuation';
import { angleVectors, vec3, type Vec3 } from '../../tf2-game/core/vec';
import type { SpEvent } from '../../sp-game/world/events';
import {
  AREA_PROFILES,
  areaForLevel,
  BedCrossfader,
  bedName,
  musicMix,
  MusicPlanner,
  semitoneRate,
  type AreaId,
} from './ambience';
import { mapSimEvent } from './event-map';
import { harmonicSounds, type HarmonicSoundEvent } from './events';
import { mulberry32, seedFor } from './rng';
import { AREAS, SOUND_BANK, type HarmonicSoundName } from './recipes';
import { SoundSynth } from './synth';

/** One playback, as recorded for the dev-tools hook and the smoke test. */
export interface PlayRecord {
  sound: HarmonicSoundName;
  variant: number;
  /** Seconds on the audio clock. */
  at: number;
  positional: boolean;
  volume: number;
  /** Where the request came from. */
  source: 'sim' | 'bus' | 'ambience';
}

export interface HarmonicAudioDebug {
  state: AudioContextState | 'none';
  voices: number;
  area: AreaId | null;
  intensity: number;
  /** Total plays since creation. */
  plays: number;
  /** The latest plays (newest last, capped). */
  recent: readonly PlayRecord[];
  counts: Readonly<Record<string, number>>;
}

interface Voice {
  sound: HarmonicSoundName;
  entity: number | undefined;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** Distance gain + panner, for positional voices. */
  dist: GainNode | null;
  panner: PannerNode | null;
  pos: Vec3 | null;
  soundlevel: number;
  loop: boolean;
  startedAt: number;
}

const MAX_VOICES = 32;
const MAX_RECENT = 200;
/** The smallest gap between two plays of one sound on one entity (s). */
const MIN_REPEAT = 0.045;
const UNIT_TO_M = 0.0254;
const LOCAL_ENTITY = 1;
const MUSIC_HORIZON = 3;

/** Names preloaded at attach, in the order the first minute needs them. */
const PRELOAD: readonly HarmonicSoundName[] = [
  'step.concrete',
  'step.metal',
  'step.snow',
  'step.ice',
  'player.jump',
  'player.land',
  'button.press',
  'door.open',
  'door.close',
  'pulse.fire',
  'melee.swing',
  'melee.hit',
  'impact.concrete',
  'misc.soft',
  'pickup',
  'player.hurt',
];

export class HarmonicAudioPlayer implements SpAudioBackend {
  private readonly ctx: AudioContext | null;
  private readonly synth: SoundSynth | null;
  private readonly master: GainNode | null;
  private readonly groups: Record<'sfx' | 'voice' | 'music', GainNode> | null;
  private readonly voices: Voice[] = [];
  private readonly rng = mulberry32(seedFor('harmonic.audio.player'));
  private readonly lastVariant = new Map<string, number>();
  private readonly lastPlay = new Map<string, number>();
  private readonly cross = new BedCrossfader();
  private readonly beds = new Map<AreaId, { src: AudioBufferSourceNode; gain: GainNode }>();
  private readonly planner: MusicPlanner;
  private readonly abort = new AbortController();
  private music: { drone: Voice | null; pulse: Voice | null; started: boolean } = {
    drone: null,
    pulse: null,
    started: false,
  };
  private intensity = 0;
  private intensityNow = 0;
  private area: AreaId | null = null;
  private nextOccasional = new Map<string, number>();
  private listenerPos: Vec3 = vec3();
  private plays = 0;
  private readonly recent: PlayRecord[] = [];
  private readonly counts: Record<string, number> = {};
  private readonly unsubs: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly host: SpAudioContext) {
    this.ctx = getAudioContext();
    this.planner = new MusicPlanner(mulberry32(seedFor('harmonic.music')));
    if (!this.ctx) {
      this.synth = null;
      this.master = null;
      this.groups = null;
      return;
    }
    const ctx = this.ctx;
    this.synth = new SoundSynth(ctx);
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const mk = (): GainNode => {
      const g = ctx.createGain();
      g.connect(this.master!);
      return g;
    };
    this.groups = { sfx: mk(), voice: mk(), music: mk() };
    this.setVolumes(host.settings.volume);
    this.setArea(areaForLevel(host.map), true);
    this.unsubs.push(harmonicSounds.on((ev) => this.handle(ev, 'bus')));
    if (typeof window !== 'undefined' && import.meta.env?.DEV) {
      (window as unknown as { __harmonicAudio?: HarmonicAudioPlayer }).__harmonicAudio = this;
    }
  }

  // ─── SpAudioBackend ────────────────────────────────────────────────────

  attach(): () => void {
    const ctx = this.ctx;
    if (!ctx || typeof window === 'undefined') return () => {};
    const unlock = (): void => resumeAudioContext();
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    for (const e of events) window.addEventListener(e, unlock, { passive: true });
    const vis = (): void => {
      if (document.hidden) void ctx.suspend().catch(() => {});
      else resumeAudioContext();
    };
    document.addEventListener('visibilitychange', vis);
    resumeAudioContext();
    // Render the first sounds a player needs while the level loads, one per task.
    void this.synth?.prepare(PRELOAD, this.abort.signal);
    return () => {
      for (const e of events) window.removeEventListener(e, unlock);
      document.removeEventListener('visibilitychange', vis);
    };
  }

  onEvent(ev: SpEvent): void {
    for (const out of mapSimEvent(ev)) this.handle(out, 'sim');
  }

  onLevel(map: string): void {
    this.setArea(areaForLevel(map), false);
  }

  setListener(origin: Vec3, angles: Vec3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.listenerPos = origin;
    const fwd = vec3();
    const up = vec3();
    angleVectors(angles, fwd, undefined, up);
    const l = ctx.listener;
    const x = origin.x * UNIT_TO_M;
    const y = origin.y * UNIT_TO_M;
    const z = origin.z * UNIT_TO_M;
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fwd.x;
      l.forwardY.value = fwd.y;
      l.forwardZ.value = fwd.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(
        fwd.x,
        fwd.y,
        fwd.z,
        up.x,
        up.y,
        up.z,
      );
    }
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    const now = ctx.currentTime;
    this.updateVoices(now);
    if (ctx.state !== 'running') return;
    this.updateBeds(now);
    this.updateMusic(now);
    this.updateOccasional(now);
  }

  setVolumes(v: { master: number; sfx: number; voice: number; music: number }): void {
    if (!this.ctx || !this.master || !this.groups) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(clamp01(v.master), t, 0.02);
    this.groups.sfx.gain.setTargetAtTime(clamp01(v.sfx), t, 0.02);
    this.groups.voice.gain.setTargetAtTime(clamp01(v.voice), t, 0.02);
    this.groups.music.gain.setTargetAtTime(clamp01(v.music), t, 0.02);
  }

  stopAll(): void {
    for (const v of [...this.voices]) this.stopVoice(v, 0.05);
  }

  onVisibility(): void {
    // attach() owns suspend/resume.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    for (const u of this.unsubs.splice(0)) u();
    this.stopAll();
    for (const b of this.beds.values()) {
      try {
        b.src.stop();
      } catch {
        /* already stopped */
      }
      b.gain.disconnect();
    }
    this.beds.clear();
    this.master?.disconnect();
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __harmonicAudio?: HarmonicAudioPlayer };
      if (w.__harmonicAudio === this) delete w.__harmonicAudio;
    }
  }

  /** Playback instrumentation (dev tools, the smoke test). */
  debug(): HarmonicAudioDebug {
    return {
      state: this.ctx?.state ?? 'none',
      voices: this.voices.length,
      area: this.area,
      intensity: this.intensity,
      plays: this.plays,
      recent: this.recent,
      counts: this.counts,
    };
  }

  // ─── Events ────────────────────────────────────────────────────────────

  private handle(ev: HarmonicSoundEvent, source: PlayRecord['source']): void {
    if (!this.ctx || this.disposed) return;
    switch (ev.type) {
      case 'sfx':
        this.playSfx(ev, source);
        break;
      case 'stop':
        for (const v of [...this.voices]) {
          if (v.sound === ev.sound && (ev.entity === undefined || v.entity === ev.entity))
            this.stopVoice(v, 0.25);
        }
        break;
      case 'area':
        this.setArea(ev.area, !!ev.instant);
        break;
      case 'music':
        this.intensity = clamp01(ev.intensity);
        break;
    }
  }

  private setArea(area: AreaId, instant: boolean): void {
    this.area = area;
    this.cross.setArea(area, this.ctx?.currentTime ?? 0, instant);
  }

  private pickVariant(sound: HarmonicSoundName, forced: number | undefined): number {
    const n = SOUND_BANK[sound].variants;
    if (forced !== undefined) return ((Math.floor(forced) % n) + n) % n;
    if (n === 1) return 0;
    let v = Math.floor(this.rng() * n);
    if (v === this.lastVariant.get(sound)) v = (v + 1) % n;
    this.lastVariant.set(sound, v);
    return v;
  }

  private playSfx(
    ev: Extract<HarmonicSoundEvent, { type: 'sfx' }>,
    source: PlayRecord['source'],
  ): Voice | null {
    const ctx = this.ctx;
    const synth = this.synth;
    const groups = this.groups;
    if (!ctx || !synth || !groups) return null;
    const def = SOUND_BANK[ev.sound];
    if (!def) return null;
    const now = ctx.currentTime;

    // Rapid repeats of one sound on one entity are dropped (footsteps, sparks).
    const key = `${ev.sound}@${ev.entity ?? 0}`;
    const last = this.lastPlay.get(key);
    if (last !== undefined && now - last < MIN_REPEAT && !def.loop) return null;
    this.lastPlay.set(key, now);
    // A loop already playing for this entity is not started twice.
    if (def.loop && this.voices.some((v) => v.sound === ev.sound && v.entity === ev.entity))
      return null;

    if (this.voices.length >= MAX_VOICES) {
      const victim = this.voices.find((v) => !v.loop);
      if (!victim) return null;
      this.stopVoice(victim, 0.02);
    }

    const variant = this.pickVariant(ev.sound, ev.variant);
    const buffer = synth.buffer(ev.sound, variant);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!def.loop;
    src.playbackRate.value = Math.max(0.25, Math.min(4, ev.rate ?? 1));
    const gain = ctx.createGain();
    const volume = def.volume * clamp01(ev.volume ?? 1);
    gain.gain.value = volume;

    const entityPos = ev.entity !== undefined ? this.host.entityPosition(ev.entity) : null;
    const pos = entityPos ?? ev.pos ?? null;
    const spatial =
      def.positional && pos !== null && def.soundlevel > 0 && ev.entity !== LOCAL_ENTITY;
    let dist: GainNode | null = null;
    let panner: PannerNode | null = null;
    src.connect(gain);
    if (spatial && pos) {
      dist = ctx.createGain();
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      // Neutral attenuation: `dist` carries the engine curve.
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;
      panner.refDistance = 1;
      panner.maxDistance = 1e6;
      setPannerPos(panner, pos);
      gain.connect(dist);
      dist.connect(panner);
      panner.connect(
        groups[def.group === 'voice' ? 'voice' : def.group === 'music' ? 'music' : 'sfx'],
      );
      dist.gain.value = distanceGain(def.soundlevel, distanceBetween(this.listenerPos, pos));
    } else {
      gain.connect(
        groups[def.group === 'voice' ? 'voice' : def.group === 'music' ? 'music' : 'sfx'],
      );
    }

    const voice: Voice = {
      sound: ev.sound,
      entity: ev.entity,
      src,
      gain,
      dist,
      panner,
      pos: spatial ? pos : null,
      soundlevel: def.soundlevel,
      loop: !!def.loop,
      startedAt: now,
    };
    src.onended = () => this.removeVoice(voice);
    this.voices.push(voice);
    src.start();

    this.plays++;
    this.counts[ev.sound] = (this.counts[ev.sound] ?? 0) + 1;
    this.recent.push({ sound: ev.sound, variant, at: now, positional: spatial, volume, source });
    if (this.recent.length > MAX_RECENT) this.recent.splice(0, this.recent.length - MAX_RECENT);
    return voice;
  }

  private stopVoice(v: Voice, fade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, fade / 3);
      v.src.stop(t + fade + 0.05);
    } catch {
      /* already stopped */
    }
    // Free the slot now; the node tail-fades on its own.
    this.removeVoice(v);
  }

  private removeVoice(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  private updateVoices(now: number): void {
    for (const v of this.voices) {
      if (!v.pos || !v.dist || !v.panner) continue;
      const p = v.entity !== undefined ? (this.host.entityPosition(v.entity) ?? v.pos) : v.pos;
      v.pos = p;
      setPannerPos(v.panner, p);
      v.dist.gain.setTargetAtTime(
        distanceGain(v.soundlevel, distanceBetween(this.listenerPos, p)),
        now,
        0.03,
      );
    }
  }

  // ─── Beds, music, weather ──────────────────────────────────────────────

  private ensureLoop(
    sound: HarmonicSoundName,
    group: 'sfx' | 'music',
  ): { src: AudioBufferSourceNode; gain: GainNode } | null {
    const ctx = this.ctx;
    if (!ctx || !this.synth || !this.groups) return null;
    const src = ctx.createBufferSource();
    src.buffer = this.synth.buffer(sound, 0);
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(this.groups[group]);
    src.start();
    return { src, gain };
  }

  private updateBeds(now: number): void {
    const gains = this.cross.gains(now);
    const audible = new Set(this.cross.audible(now));
    for (const area of AREAS) {
      let bed = this.beds.get(area);
      if (audible.has(area) && !bed) {
        const made = this.ensureLoop(bedName(area), 'sfx');
        if (made) {
          this.beds.set(area, made);
          bed = made;
        }
      }
      if (!bed) continue;
      if (!audible.has(area)) {
        // Faded out: release the node (its buffer stays cached).
        try {
          bed.src.stop();
        } catch {
          /* already stopped */
        }
        bed.gain.disconnect();
        this.beds.delete(area);
        continue;
      }
      bed.gain.gain.setTargetAtTime(gains[area] * AREA_PROFILES[area].bedGain, now, 0.08);
    }
  }

  private updateMusic(now: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.synth || !this.groups) return;
    const profile = AREA_PROFILES[this.area ?? 'ice_open'];
    const rate = semitoneRate(profile.musicSemitones);
    if (!this.music.started) {
      this.music.started = true;
      const mk = (name: HarmonicSoundName): Voice | null => {
        const l = this.ensureLoop(name, 'music');
        if (!l) return null;
        l.src.playbackRate.value = rate;
        return {
          sound: name,
          entity: undefined,
          src: l.src,
          gain: l.gain,
          dist: null,
          panner: null,
          pos: null,
          soundlevel: 0,
          loop: true,
          startedAt: now,
        };
      };
      this.music.drone = mk('music.drone');
      this.music.pulse = mk('music.pulse');
    }
    // Smooth the intensity so a combat flag does not step the mix.
    this.intensityNow += (this.intensity - this.intensityNow) * 0.02;
    const mix = musicMix(this.intensityNow);
    this.music.drone?.gain.gain.setTargetAtTime(mix.drone * 0.5, now, 0.5);
    this.music.drone?.src.playbackRate.setTargetAtTime(rate, now, 2);
    this.music.pulse?.gain.gain.setTargetAtTime(mix.pulse * 0.6, now, 0.4);
    // Slow tones from the harmonic series.
    for (const t of this.planner.plan(now, MUSIC_HORIZON, this.intensityNow)) {
      const src = ctx.createBufferSource();
      src.buffer = this.synth.buffer('music.tone', t.variant);
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = t.gain * 0.7;
      const pan = ctx.createStereoPanner();
      pan.pan.value = t.pan;
      src.connect(g);
      g.connect(pan);
      pan.connect(this.groups.music);
      src.start(Math.max(ctx.currentTime, t.at));
      src.onended = () => pan.disconnect();
    }
  }

  private updateOccasional(now: number): void {
    const area = this.area;
    if (!area) return;
    for (const o of AREA_PROFILES[area].occasional) {
      const key = `${area}/${o.sound}`;
      const due = this.nextOccasional.get(key);
      if (due === undefined) {
        this.nextOccasional.set(key, now + o.every * (0.3 + this.rng()));
      } else if (now >= due) {
        this.nextOccasional.set(key, now + o.every * (0.5 + this.rng()));
        this.playSfx(
          { type: 'sfx', sound: o.sound, volume: o.gain, rate: 0.9 + this.rng() * 0.2 },
          'ambience',
        );
      }
    }
  }
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function setPannerPos(p: PannerNode, pos: Vec3): void {
  const x = pos.x * UNIT_TO_M;
  const y = pos.y * UNIT_TO_M;
  const z = pos.z * UNIT_TO_M;
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else {
    (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
  }
}

/** The `SpContent.createAudio` factory Harmonic's content injects. Null without Web Audio. */
export function createHarmonicAudio(host: SpAudioContext): SpAudioBackend | null {
  if (!getAudioContext()) return null;
  return new HarmonicAudioPlayer(host);
}
