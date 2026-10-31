/**
 * The game client's sound mixer: one per game client, over the page's shared AudioContext
 * (`getAudioContext()` — never a context of its own).
 *
 *   const audio = new AudioEngine({ game: 'portal', entityPosition: (id) => interp(id) });
 *   await audio.load();                 // snd/index.json (+ soundscapes, scenes, captions)
 *   const detach = audio.attach();      // unlock on first gesture, suspend while hidden
 *   audio.onCaption((c) => hud.caption(c));
 *   // every frame:
 *   for (const ev of soundEvents) audio.emit(ev);
 *   audio.setListener(eyePos, eyeAngles);
 *   audio.update();
 *
 * What it does, after the engine (snd_dma.cpp, SoundEmitterSystem.cpp, c_soundscape.cpp):
 *  - Script entries (`Weapon_RPG.Single`) pick a random wave, volume and pitch from their ranges
 *    and play on their script channel; raw paths (`ambient/wind1.wav`) on the event's channel.
 *    An event's `volume` / `pitch` replace the script's (SND_CHANGE_VOL / SND_CHANGE_PITCH).
 *  - Channels: a new sound on an entity's channel replaces the one playing there (not
 *    CHAN_AUTO; CHAN_STATIC, CHAN_STREAM and loops are never replaced) — channels.ts.
 *  - Distance: Source's sound-level curve (attenuation.ts), applied per frame from the listener
 *    to the sound — which follows its entity's interpolated position (`entityPosition`), or the
 *    event's position while the entity is unknown here (out of the PVS) — times the game's
 *    falloff profile (CS:GO's quiet sounds stop carrying). Panning is a PannerNode (HRTF on
 *    desktop, equal-power on mobile) whose own distance model is neutral (linear, rolloff 0: gain
 *    1 at every distance), so nothing attenuates twice. SNDLVL_NONE sounds and the local player's
 *    own sounds are not spatialised.
 *  - Loops use the wave's loop points from the index and play until stopped or replaced. A stop
 *    by name matches the entity's sound of that name on any channel: the script, not the event,
 *    says which channel it plays on (CBaseEntity::StopSound looks the channel up the same way).
 *  - Volume groups master / sfx / voice / music / ui; speech ducks effects by 6 dB.
 *  - Occlusion: a throttled caller-supplied trace; a blocked sound is low-passed and 6 dB down.
 *  - At most `maxVoices` (48) voices: the quietest one is stolen, never the local player's for
 *    someone else's, and a new sound quieter than everything playing is dropped.
 *  - Decoded audio is cached under a byte budget (buffer-cache.ts).
 *  - Soundscapes (HL2 / Portal): the player's env_soundscape's loops and random sounds, with
 *    the 3-second crossfade (soundscapes.ts). Choreographed scenes' speech on a schedule.
 *  - Captions (HL2 / Portal): a captioned sound that starts audibly emits {token, text,
 *    duration} to `onCaption` listeners.
 *  - Autoplay: `attach()` resumes the context inside the first gesture handler (and plays a
 *    silent buffer, which iOS needs), on every later gesture too (iOS re-suspends, Safari has an
 *    `interrupted` state), and suspends it while the tab is hidden.
 *
 * Plain TypeScript, no React. Without Web Audio (SSR, old browsers) every call is a no-op.
 */
import { getAudioContext } from '@/lib/shared/platform';
import {
  fetchGameJson,
  loadSoundIndex,
  soundUrl,
  type SoundIndex,
  type SoundEntry,
} from '../assets/urls';
import type { GameId } from '../assets/versions';
import { angleVectors, vec3, type QAngle, type Vec3 } from '../core/vec';
import { SURFACE_SOUNDS } from '../data/sounds';
import {
  falloffProfileFor,
  profileDistanceGain,
  SNDLVL_NORM,
  type FalloffProfile,
} from './attenuation';
import { BufferCache } from './buffer-cache';
import { captionDuration, type Caption, type CaptionDocument, type CaptionEvent } from './captions';
import {
  CHAN_AUTO,
  CHAN_BODY,
  CHAN_STATIC,
  CHAN_VOICE,
  replacesOnChannel,
  soundGroupOf,
  stopMatches,
  VOLUME_GROUPS,
  type SoundGroup,
  type VolumeGroup,
} from './channels';
import type { SceneDocument, SceneSpeakEvent } from './scene-image';
import { sceneKey } from './scene-image';
import {
  selectSoundscape,
  SoundscapePlayer,
  type SoundscapeDocument,
  type SoundscapeEntity,
  type SoundscapeLoop,
  type SoundscapeSelection,
} from './soundscapes';

/** A sound to play: the simulation's SoundEvent fits, plus a few client-side extras. */
export interface AudioEmit {
  /** Script entry name, or a raw path (`sound/…` or relative to `sound/`). */
  name: string;
  /** Entity the sound follows (and whose channels it uses); 0 / undefined for none. */
  entity?: number;
  /** World position (Source units) when not attached, or until the entity is known. */
  pos?: Vec3;
  /** Replaces the script's volume (0..1). */
  volume?: number;
  /** Replaces the script's pitch (percent). */
  pitch?: number;
  /** Channel for a raw path (script entries use their own). */
  channel?: number;
  /** Replaces the script's sound level (dB). */
  soundlevel?: number;
  /** Stop the entity's sound on this channel (and of this name, when it is one) instead. */
  stop?: boolean;
  /** Volume group, instead of the one its channel and folder give. */
  group?: SoundGroup;
  /** Caption token instead of the entry name; false for none. */
  caption?: string | false;
  /** Seconds before it starts. */
  delay?: number;
  /** Force looping (soundscape loops); otherwise the index's loop points decide. */
  loop?: boolean;
}

export interface VoiceHandle {
  readonly id: number;
  stop(): void;
  setVolume(volume: number): void;
  readonly playing: boolean;
  /** Whether it loops (until stopped) rather than ending by itself. */
  readonly looping: boolean;
}

export interface AudioEngineOptions {
  game: GameId;
  /** The shared context; defaults to `getAudioContext()`. Tests pass a fake. */
  context?: AudioContext | null;
  /** Mobile budgets and equal-power panning; detected when omitted. */
  mobile?: boolean;
  /** Voice limit (default 48 desktop, 32 mobile). */
  maxVoices?: number;
  /** Decoded-audio budget in bytes (default 64 MB desktop, 24 MB mobile). */
  cacheBytes?: number;
  /** An entity's current (interpolated) position, or null when unknown. */
  entityPosition?: (entity: number) => Vec3 | null;
  /** True when the line between two points is blocked (world geometry). */
  occlusion?: (from: Vec3, to: Vec3) => boolean;
  /** Fetches a sound file's bytes (default: `soundUrl` over fetch). */
  fetchSound?: (sha: string) => Promise<ArrayBuffer | null>;
  /** The sound index (default: `loadSoundIndex(game)`). */
  loadIndex?: () => Promise<SoundIndex | null>;
  /** A JSON side document (default: `fetchGameJson('snd/<name>.json', game)`). */
  loadDocument?: (name: 'soundscapes' | 'scenes' | 'captions') => Promise<unknown>;
  /** Initial group volumes (0..1); default 1. */
  volumes?: Partial<Record<VolumeGroup, number>>;
  /** Distance falloff on top of the Source curve; default the game's (`falloffProfileFor`). */
  falloff?: FalloffProfile;
  random?: () => number;
}

interface Voice {
  id: number;
  name: string;
  sha: string;
  path: string | null;
  entity: number | null;
  channel: number;
  looping: boolean;
  group: SoundGroup;
  volume: number;
  soundlevel: number;
  rate: number;
  pos: Vec3 | null;
  spatial: boolean;
  local: boolean;
  caption: string | null;
  delay: number;
  state: 'pending' | 'playing' | 'ended';
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  filter: BiquadFilterNode | null;
  panner: PannerNode | null;
  distance: number;
  occluded: boolean;
  nextOcclusion: number;
  requestedAt: number;
  retained: boolean;
}

interface ActiveScene {
  speak: SceneSpeakEvent[];
  next: number;
  start: number;
  actor: (name: string) => { entity?: number; pos?: Vec3 } | null;
}

/** Desktop and mobile budgets. */
export const AUDIO_BUDGETS = {
  desktop: { maxVoices: 48, cacheBytes: 64 * 1024 * 1024 },
  mobile: { maxVoices: 32, cacheBytes: 24 * 1024 * 1024 },
} as const;

/** Occlusion: one trace per voice at most this often (s), at most this many per update. */
export const OCCLUSION_INTERVAL = 0.25;
export const OCCLUSION_TRACES_PER_UPDATE = 4;
/** An occluded sound is cut to this low-pass frequency (Hz) and gain (−6 dB). */
export const OCCLUSION_LOWPASS_HZ = 1200;
export const OCCLUSION_GAIN = 0.5;
const OPEN_LOWPASS_HZ = 20000;
/** Speech ducks effects by 6 dB. */
export const VOICE_DUCK_GAIN = 0.5;
/** A captioned sound quieter than this (distance gain) shows no caption. */
const CAPTION_MIN_GAIN = 0.05;
/** A one-shot whose decode took longer than this is dropped rather than played late. */
const MAX_START_LATENCY = 1.5;
/** Source units → metres for Web Audio (render/coords.ts). */
const UNIT = 0.01905;
const SMOOTH = 0.03;
/** Fixed mix headroom (−6 dB) before the output limiter. */
const MIX_HEADROOM = 0.5;
/** Output limiter threshold: peaks above this are held down rather than clipping. */
const LIMITER_THRESHOLD_DB = -6;

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS reports a Mac.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

const PREFIX_CHARS = /^[*#@><^)}$!?&~`+%]+/;

/** A raw sound path as the index keys it: `sound/` + lowercase forward-slash path. */
export function normalizeSoundPath(name: string): string {
  const p = name
    .trim()
    .replace(PREFIX_CHARS, '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .toLowerCase();
  return p.startsWith('sound/') ? p : 'sound/' + p;
}

function isRawPath(name: string): boolean {
  return /\.(wav|mp3|ogg)$/i.test(name.trim());
}

function draw([a, b]: readonly [number, number], r: () => number): number {
  return a + (b - a) * r();
}

export class AudioEngine {
  readonly game: GameId;
  readonly mobile: boolean;
  readonly maxVoices: number;
  readonly cache: BufferCache<AudioBuffer>;

  private readonly ctx: AudioContext | null;
  private readonly opts: AudioEngineOptions;
  private readonly rand: () => number;
  private readonly falloff: FalloffProfile;
  private index: SoundIndex | null = null;
  private entriesLower = new Map<string, [string, SoundEntry]>();
  private pathOfSha = new Map<string, string>();
  private captions: Record<string, Caption> = {};
  private scenes: SceneDocument['scenes'] = {};
  private readonly soundscape: SoundscapePlayer;
  private readonly selection: SoundscapeSelection = { current: null };
  private master: GainNode | null = null;
  private duck: GainNode | null = null;
  private groups = new Map<SoundGroup, GainNode>();
  private volumes: Record<VolumeGroup, number>;
  private voices: Voice[] = [];
  private nextId = 1;
  private listenerPos: Vec3 = vec3();
  private listenerForward: Vec3 = vec3(1, 0, 0);
  private listenerRight: Vec3 = vec3(0, -1, 0);
  private listenerUp: Vec3 = vec3(0, 0, 1);
  private localEntity: number | null = null;
  private captionListeners = new Set<(c: CaptionEvent) => void>();
  private captionShown = new Map<string, number>();
  private activeScenes: ActiveScene[] = [];
  private unlocked = false;
  private hiddenSuspend = false;
  private missing = new Set<string>();
  private detachers: (() => void)[] = [];
  private disposed = false;

  constructor(options: AudioEngineOptions) {
    this.opts = options;
    this.game = options.game;
    this.mobile = options.mobile ?? isMobileDevice();
    const budget = this.mobile ? AUDIO_BUDGETS.mobile : AUDIO_BUDGETS.desktop;
    this.maxVoices = options.maxVoices ?? budget.maxVoices;
    this.rand = options.random ?? Math.random;
    this.falloff = options.falloff ?? falloffProfileFor(this.game);
    this.ctx = options.context === undefined ? getAudioContext() : options.context;
    this.volumes = Object.fromEntries(
      VOLUME_GROUPS.map((g) => [g, clamp01(options.volumes?.[g] ?? 1)]),
    ) as Record<VolumeGroup, number>;
    this.cache = new BufferCache<AudioBuffer>({
      maxBytes: options.cacheBytes ?? budget.cacheBytes,
      load: (sha) => this.loadBuffer(sha),
    });
    this.soundscape = new SoundscapePlayer(
      {
        startLoop: (wave, volume, pitch, soundlevel, pos) =>
          this.startSoundscapeLoop(wave, volume, pitch, soundlevel, pos),
        playOnce: (wave, volume, pitch, soundlevel, pos) => {
          this.emit({
            name: wave,
            volume,
            pitch,
            soundlevel,
            pos: pos ?? undefined,
            channel: CHAN_STATIC,
          });
        },
        listener: () => ({
          origin: this.listenerPos,
          forward: this.listenerForward,
          right: this.listenerRight,
        }),
      },
      {},
      this.rand,
    );
    this.buildGraph();
  }

  /** Whether Web Audio is available at all. */
  get available(): boolean {
    return this.ctx !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get loaded(): boolean {
    return this.index !== null;
  }

  // ------------------------------------------------------------------------------- loading

  /** Load the game's sound index (and, for HL2 / Portal, soundscapes, scenes and captions). */
  async load(): Promise<void> {
    const loadIndex = this.opts.loadIndex ?? (() => loadSoundIndex(this.game));
    const index = await loadIndex();
    if (index) this.setIndex(index);
    if (this.game === 'tf2') return;
    const loadDoc =
      this.opts.loadDocument ??
      ((name: string) => fetchGameJson<unknown>(`snd/${name}.json`, this.game));
    const [scapes, scenes, captions] = await Promise.all([
      loadDoc('soundscapes').catch(() => null),
      loadDoc('scenes').catch(() => null),
      loadDoc('captions').catch(() => null),
    ]);
    if (scapes) this.soundscape.setDefinitions((scapes as SoundscapeDocument).soundscapes ?? {});
    if (scenes) this.scenes = (scenes as SceneDocument).scenes ?? {};
    if (captions) this.captions = (captions as CaptionDocument).captions ?? {};
  }

  /** Use an index directly (tests, or an index fetched elsewhere). */
  setIndex(index: SoundIndex): void {
    this.index = index;
    this.entriesLower = new Map(
      Object.entries(index.entries).map(([k, e]) => [k.toLowerCase(), [k, e]]),
    );
    this.pathOfSha = new Map();
    for (const [path, file] of Object.entries(index.files)) {
      const sha = file.replace(/\.mp3$/, '');
      if (!this.pathOfSha.has(sha)) this.pathOfSha.set(sha, path);
    }
  }

  setCaptions(captions: Record<string, Caption>): void {
    this.captions = captions;
  }

  setScenes(scenes: SceneDocument['scenes']): void {
    this.scenes = scenes;
  }

  setSoundscapes(doc: SoundscapeDocument['soundscapes']): void {
    this.soundscape.setDefinitions(doc);
  }

  private async loadBuffer(sha: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    const fetchSound =
      this.opts.fetchSound ??
      (async (s: string) => {
        const res = await fetch(soundUrl(s, this.game));
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`sound ${s}: HTTP ${res.status}`);
        return res.arrayBuffer();
      });
    const bytes = await fetchSound(sha);
    if (!bytes) return null;
    return decode(ctx, bytes);
  }

  // ------------------------------------------------------------------------------- mixing graph

  private buildGraph(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    // Source mixes with headroom; played straight to full scale, a few
    // overlapping gunshots and explosions are far too loud and clip. A fixed
    // headroom gain plus a limiter keeps the mix at a comfortable level
    // whatever the user's own volume setting.
    const headroom = ctx.createGain();
    headroom.gain.value = MIX_HEADROOM;
    this.master.connect(headroom);
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = LIMITER_THRESHOLD_DB;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      headroom.connect(limiter);
      limiter.connect(ctx.destination);
    } else {
      headroom.connect(ctx.destination);
    }
    this.duck = ctx.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(this.master);
    for (const g of VOLUME_GROUPS) {
      if (g === 'master') continue;
      const node = ctx.createGain();
      node.gain.value = this.volumes[g];
      node.connect(g === 'sfx' ? this.duck : this.master);
      this.groups.set(g, node);
    }
  }

  /** Set a group's volume (0..1): the user's settings. */
  setVolume(group: VolumeGroup, volume: number): void {
    this.volumes[group] = clamp01(volume);
    const node = group === 'master' ? this.master : this.groups.get(group);
    if (node && this.ctx)
      node.gain.setTargetAtTime(this.volumes[group], this.ctx.currentTime, SMOOTH);
  }

  getVolume(group: VolumeGroup): number {
    return this.volumes[group];
  }

  /** The entity whose sounds are the listener's own (not spatialised). */
  setLocalEntity(entity: number | null): void {
    this.localEntity = entity;
  }

  /** The camera: eye position (Source units) and angles (pitch, yaw, roll in degrees). */
  setListener(pos: Vec3, angles: QAngle): void {
    const f = vec3();
    const r = vec3();
    const u = vec3();
    angleVectors(angles, f, r, u);
    this.setListenerVectors(pos, f, u, r);
  }

  /** The camera from vectors (Source space). */
  setListenerVectors(pos: Vec3, forward: Vec3, up: Vec3, right?: Vec3): void {
    this.listenerPos = { x: pos.x, y: pos.y, z: pos.z };
    this.listenerForward = { x: forward.x, y: forward.y, z: forward.z };
    this.listenerUp = { x: up.x, y: up.y, z: up.z };
    this.listenerRight = right
      ? { x: right.x, y: right.y, z: right.z }
      : {
          x: forward.y * up.z - forward.z * up.y,
          y: forward.z * up.x - forward.x * up.z,
          z: forward.x * up.y - forward.y * up.x,
        };
    const l = this.ctx?.listener;
    if (!l) return;
    // Source (x fwd, y left, z up) → Web Audio (x, y up, z): (y, z, x), metres.
    const px = pos.y * UNIT;
    const py = pos.z * UNIT;
    const pz = pos.x * UNIT;
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = py;
      l.positionZ.value = pz;
      l.forwardX.value = forward.y;
      l.forwardY.value = forward.z;
      l.forwardZ.value = forward.x;
      l.upX.value = up.y;
      l.upY.value = up.z;
      l.upZ.value = up.x;
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(forward.y, forward.z, forward.x, up.y, up.z, up.x);
    }
  }

  get listener(): { pos: Vec3; forward: Vec3; up: Vec3 } {
    return { pos: this.listenerPos, forward: this.listenerForward, up: this.listenerUp };
  }

  // ------------------------------------------------------------------------------- playback

  /** Play (or stop) a sound. Returns a handle, or null when nothing will play. */
  emit(ev: AudioEmit): VoiceHandle | null {
    if (!this.ctx || this.disposed) return null;
    const entity = ev.entity ? ev.entity : null;
    if (ev.stop) {
      this.stopSound(entity, ev.channel ?? CHAN_AUTO, ev.name);
      return null;
    }
    if (!this.index) return null;
    const resolved = this.resolve(ev.name);
    if (!resolved) return null;
    const { sha, entry } = resolved;
    const path = resolved.path ?? this.pathOfSha.get(sha) ?? null;
    const channel = entry ? entry.channel : (ev.channel ?? CHAN_AUTO);
    const volume = clamp01(ev.volume ?? (entry ? draw(entry.volume, this.rand) : 1));
    const pitch = ev.pitch ?? (entry ? draw(entry.pitch, this.rand) : 100);
    const soundlevel = ev.soundlevel ?? (entry ? entry.soundlevel : SNDLVL_NORM);
    const loopInfo = this.index.loops[sha + '.mp3'];
    const looping = ev.loop ?? Boolean(loopInfo);
    const local = entity !== null && entity === this.localEntity;
    let pos: Vec3 | null = null;
    if (entity !== null && this.opts.entityPosition) pos = this.opts.entityPosition(entity) ?? null;
    if (!pos && ev.pos) pos = { x: ev.pos.x, y: ev.pos.y, z: ev.pos.z };
    const spatial = soundlevel > 0 && !local && pos !== null;
    const group = ev.group ?? soundGroupOf(channel, path);
    const distance = spatial && pos ? dist(pos, this.listenerPos) : 0;
    const audibility = volume * (spatial ? this.distanceGain(soundlevel, distance) : 1);
    // Out of earshot: a one-shot is culled (a loop may come into range).
    if (!looping && spatial && audibility <= 0) return null;

    // Channel rules: replace the entity's sound on the same channel.
    const slot = { entity, channel, looping };
    for (const v of this.voices) {
      if (v.state !== 'ended' && replacesOnChannel(v, slot)) this.endVoice(v);
    }
    // Voice limit: steal the quietest, or drop this one.
    if (!this.makeRoom(audibility, local)) return null;

    const voice: Voice = {
      id: this.nextId++,
      name: ev.name,
      sha,
      path,
      entity,
      channel,
      looping,
      group,
      volume,
      soundlevel,
      rate: Math.max(0.01, pitch / 100),
      pos,
      spatial,
      local,
      caption:
        ev.caption === false
          ? null
          : (ev.caption ?? (entry ? resolved.key : ev.name)).toLowerCase(),
      delay: Math.max(0, ev.delay ?? 0),
      state: 'pending',
      source: null,
      gain: null,
      filter: null,
      panner: null,
      distance,
      occluded: false,
      nextOcclusion: 0,
      requestedAt: this.ctx.currentTime,
      retained: false,
    };
    this.voices.push(voice);
    const ready = this.cache.peek(sha);
    if (ready) this.startVoice(voice, ready);
    else
      this.cache.get(sha).then(
        (buffer) => {
          if (voice.state !== 'pending') return;
          if (!buffer) {
            voice.state = 'ended';
            this.prune();
            return;
          }
          const late = (this.ctx?.currentTime ?? 0) - voice.requestedAt;
          if (!voice.looping && voice.group !== 'voice' && late > MAX_START_LATENCY) {
            voice.state = 'ended';
            this.prune();
            return;
          }
          this.startVoice(voice, buffer);
        },
        () => {
          voice.state = 'ended';
          this.prune();
        },
      );
    return this.handle(voice);
  }

  /**
   * Stop sounds of an entity on a channel (CHAN_AUTO / CHAN_REPLACE: any), or by name on any of
   * its channels; with no entity, the positional sounds of that name.
   *
   * A named stop ignores the channel: a script entry plays on its script's channel whatever the
   * emitter passed (`Weapon_Minigun.Fire` is CHAN_STATIC though the weapon stops it as a
   * CHAN_WEAPON sound), and Source's StopSound(entity, name) takes the channel from the script
   * too — matching the event's channel left such loops playing forever.
   */
  stopSound(entity: number | null, channel: number, name?: string): void {
    const n = name?.toLowerCase();
    // Sounds from a bare position are stopped by name only (there is no entity to match).
    if (entity === null && !n) return;
    for (const v of this.voices) {
      if (v.state === 'ended') continue;
      if (entity === null) {
        if (v.entity !== null) continue;
      } else if (n ? v.entity !== entity : !stopMatches(v, entity, channel)) continue;
      if (n && v.name.toLowerCase() !== n) continue;
      this.endVoice(v);
    }
    this.prune();
  }

  /** Stop everything (soundscape and scenes included). */
  stopAll(): void {
    this.soundscape.stop();
    this.activeScenes = [];
    for (const v of this.voices) this.endVoice(v);
    this.prune();
  }

  /** Footstep (CBasePlayer::PlayStepSound) on a surface ('concrete', 'metalgrate' …). */
  footstep(
    surface: string,
    foot: 'left' | 'right',
    opts: { entity?: number; pos?: Vec3; volume?: number } = {},
  ): VoiceHandle | null {
    const s = SURFACE_SOUNDS[surface.toLowerCase()] ?? SURFACE_SOUNDS.default;
    const fallback = SURFACE_SOUNDS.default;
    let name = foot === 'left' ? s.stepLeft : s.stepRight;
    if (!name || !this.resolve(name))
      name = foot === 'left' ? fallback.stepLeft : fallback.stepRight;
    if (!name) return null;
    return this.emit({
      name,
      entity: opts.entity,
      pos: opts.pos,
      volume: opts.volume,
      channel: CHAN_BODY,
    });
  }

  /**
   * Play a choreographed scene's speech (logic_choreographed_scene). `actor` maps the scene's
   * actor names to who speaks (an entity, or a position). Returns a canceller.
   */
  playScene(
    file: string,
    actor: (name: string) => { entity?: number; pos?: Vec3 } | null = () => null,
  ): () => void {
    const scene = this.scenes[sceneKey(file)];
    if (!scene || !this.ctx) return () => {};
    const active: ActiveScene = { speak: scene.speak, next: 0, start: this.ctx.currentTime, actor };
    this.activeScenes.push(active);
    this.updateScenes();
    return () => {
      this.activeScenes = this.activeScenes.filter((s) => s !== active);
    };
  }

  // ------------------------------------------------------------------------------- soundscapes

  /** Play a soundscape (null stops it); `positions` are its env_soundscape's targets. */
  setSoundscape(name: string | null, positions: readonly (Vec3 | null)[] = []): void {
    if (name !== this.soundscape.current) this.soundscape.start(name, positions);
  }

  get currentSoundscape(): string | null {
    return this.soundscape.current;
  }

  /**
   * Pick the player's soundscape from the map's env_soundscapes (the server's rule) and play it.
   * `visible` is a trace from the env_soundscape to the listener.
   */
  updateSoundscape(
    envs: readonly SoundscapeEntity[],
    visible: (from: Vec3, to: Vec3) => boolean,
  ): void {
    const before = this.selection.current;
    const env = selectSoundscape(envs, this.listenerPos, this.selection, visible);
    if (env && (env !== before || this.soundscape.current !== env.soundscape))
      this.soundscape.start(env.soundscape, env.positions ?? []);
  }

  private startSoundscapeLoop(
    wave: string,
    volume: number,
    pitch: number,
    soundlevel: number,
    pos: Vec3 | null,
  ): SoundscapeLoop | null {
    const handle = this.emit({
      name: wave,
      volume,
      pitch,
      soundlevel,
      pos: pos ?? undefined,
      channel: CHAN_STATIC,
      loop: true,
      caption: false,
    });
    return handle && { setVolume: (v) => handle.setVolume(v), stop: () => handle.stop() };
  }

  // ------------------------------------------------------------------------------- captions

  /** Subscribe to captions (HL2 / Portal subtitles). */
  onCaption(listener: (c: CaptionEvent) => void): () => void {
    this.captionListeners.add(listener);
    return () => this.captionListeners.delete(listener);
  }

  // ------------------------------------------------------------------------------- frame

  /** Per frame: follow entities, distance and occlusion, ducking, soundscape, scenes. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    const now = ctx.currentTime;
    let traces = 0;
    let speaking = false;
    for (const v of this.voices) {
      if (v.state === 'ended') continue;
      if (v.entity !== null && this.opts.entityPosition) {
        const p = this.opts.entityPosition(v.entity);
        if (p) v.pos = { x: p.x, y: p.y, z: p.z };
      }
      if (v.spatial && v.pos) {
        v.distance = dist(v.pos, this.listenerPos);
        if (this.opts.occlusion && now >= v.nextOcclusion && traces < OCCLUSION_TRACES_PER_UPDATE) {
          traces++;
          v.nextOcclusion = now + OCCLUSION_INTERVAL;
          v.occluded = this.opts.occlusion(this.listenerPos, v.pos);
        }
      }
      if (v.state === 'playing') {
        this.applyVoice(v, false);
        if (v.group === 'voice') speaking = true;
      }
    }
    if (this.duck) this.duck.gain.setTargetAtTime(speaking ? VOICE_DUCK_GAIN : 1, now, 0.15);
    this.soundscape.update(now);
    this.updateScenes();
    this.prune();
  }

  /** Voices alive (pending or playing) and cache use: for HUD debug and tests. */
  stats(): {
    voices: number;
    playing: number;
    pending: number;
    cacheBytes: number;
    cached: number;
    missing: number;
  } {
    let playing = 0;
    let pending = 0;
    for (const v of this.voices) {
      if (v.state === 'playing') playing++;
      else if (v.state === 'pending') pending++;
    }
    return {
      voices: playing + pending,
      playing,
      pending,
      cacheBytes: this.cache.bytes,
      cached: this.cache.size,
      missing: this.missing.size,
    };
  }

  // ------------------------------------------------------------------------------- page

  /**
   * Resume audio in the user's gesture handlers (autoplay policy; iOS also needs a sound
   * started inside the gesture) and suspend it while the tab is hidden. Returns a detacher.
   */
  attach(target: EventTarget | null = typeof window === 'undefined' ? null : window): () => void {
    const ctx = this.ctx;
    if (!ctx || !target) return () => {};
    const gesture = () => this.unlock();
    const events = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown'];
    for (const e of events) target.addEventListener(e, gesture, { capture: true, passive: true });
    const doc = typeof document === 'undefined' ? null : document;
    const visibility = () => this.onVisibility(doc?.visibilityState === 'hidden');
    doc?.addEventListener('visibilitychange', visibility);
    const detach = () => {
      for (const e of events) target.removeEventListener(e, gesture, { capture: true });
      doc?.removeEventListener('visibilitychange', visibility);
    };
    this.detachers.push(detach);
    return detach;
  }

  /** Call inside a user gesture: resume (`suspended` or Safari's `interrupted`) and unlock iOS. */
  unlock(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    if (ctx.state !== 'running' && !this.hiddenSuspend) {
      try {
        void Promise.resolve(ctx.resume()).catch(() => {});
      } catch {
        // resume() throws on a closed context
      }
    }
    if (!this.unlocked) {
      this.unlocked = true;
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // nothing to unlock
      }
    }
  }

  /** Tab hidden → suspend; visible again → resume what we suspended. */
  onVisibility(hidden: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) {
      if (ctx.state === 'running') {
        this.hiddenSuspend = true;
        void Promise.resolve(ctx.suspend()).catch(() => {});
      }
    } else if (this.hiddenSuspend) {
      this.hiddenSuspend = false;
      void Promise.resolve(ctx.resume()).catch(() => {});
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.stopAll();
    for (const d of this.detachers) d();
    this.detachers = [];
    this.disposed = true;
    try {
      this.master?.disconnect();
    } catch {
      // already disconnected
    }
  }

  // ------------------------------------------------------------------------------- internals

  private resolve(
    name: string,
  ): { sha: string; entry: SoundEntry | null; key: string; path: string | null } | null {
    const index = this.index;
    if (!index) return null;
    const hit = this.entriesLower.get(name.trim().toLowerCase());
    if (hit && hit[1].waves.length) {
      const waves = hit[1].waves;
      const sha = waves[Math.min(waves.length - 1, Math.floor(this.rand() * waves.length))];
      return { sha, entry: hit[1], key: hit[0], path: null };
    }
    if (isRawPath(name)) {
      const path = normalizeSoundPath(name);
      const file = index.files[path];
      if (file) return { sha: file.replace(/\.mp3$/, ''), entry: null, key: path, path };
    }
    this.missing.add(name);
    return null;
  }

  /** The distance gain (0..1) of a sound of `soundlevel` dB `dist` units away, under the profile. */
  distanceGain(soundlevel: number, dist: number): number {
    return profileDistanceGain(this.falloff, soundlevel, dist);
  }

  /** Make room for one more voice; false when the new one should be dropped. */
  private makeRoom(audibility: number, local: boolean): boolean {
    const alive = this.voices.filter((v) => v.state !== 'ended');
    if (alive.length < this.maxVoices) return true;
    let victim: Voice | null = null;
    let quietest = Infinity;
    for (const v of alive) {
      // Never take the local player's sounds for someone else's.
      if (v.local && !local) continue;
      const a = this.audibility(v);
      if (a < quietest) {
        quietest = a;
        victim = v;
      }
    }
    if (!victim || quietest > audibility) return false;
    this.endVoice(victim);
    this.prune();
    return true;
  }

  private audibility(v: Voice): number {
    const d = v.spatial ? this.distanceGain(v.soundlevel, v.distance) : 1;
    return v.volume * d * (v.occluded ? OCCLUSION_GAIN : 1);
  }

  private startVoice(v: Voice, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    const out = this.groups.get(v.group);
    if (!out) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = v.rate;
    const loop = this.index?.loops[v.sha + '.mp3'];
    if (v.looping) {
      src.loop = true;
      if (loop) {
        src.loopStart = loop.start;
        src.loopEnd = loop.end ?? buffer.duration;
      }
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    if (v.spatial) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = OPEN_LOWPASS_HZ;
      const panner = ctx.createPanner();
      panner.panningModel = this.mobile ? 'equalpower' : 'HRTF';
      // Distance is Source's curve on the gain node, not the panner's.
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(out);
      v.filter = filter;
      v.panner = panner;
    } else {
      src.connect(gain);
      gain.connect(out);
    }
    v.source = src;
    v.gain = gain;
    v.state = 'playing';
    this.cache.retain(v.sha);
    v.retained = true;
    src.onended = () => {
      if (v.state !== 'ended') {
        v.state = 'ended';
        disconnectVoice(v);
        this.release(v);
        this.prune();
      }
    };
    this.applyVoice(v, true);
    src.start(ctx.currentTime + v.delay);
    this.caption(v, buffer.duration / v.rate);
  }

  private applyVoice(v: Voice, immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !v.gain) return;
    const now = ctx.currentTime;
    const d = v.spatial ? this.distanceGain(v.soundlevel, v.distance) : 1;
    const g = v.volume * d * (v.occluded ? OCCLUSION_GAIN : 1);
    if (immediate) v.gain.gain.value = g;
    else v.gain.gain.setTargetAtTime(g, now, SMOOTH);
    if (v.filter) {
      const f = v.occluded ? OCCLUSION_LOWPASS_HZ : OPEN_LOWPASS_HZ;
      if (immediate) v.filter.frequency.value = f;
      else v.filter.frequency.setTargetAtTime(f, now, 0.08);
    }
    if (v.panner && v.pos) {
      const x = v.pos.y * UNIT;
      const y = v.pos.z * UNIT;
      const z = v.pos.x * UNIT;
      if (v.panner.positionX) {
        v.panner.positionX.value = x;
        v.panner.positionY.value = y;
        v.panner.positionZ.value = z;
      } else {
        v.panner.setPosition(x, y, z);
      }
    }
  }

  private caption(v: Voice, seconds: number): void {
    if (!v.caption || !this.captionListeners.size) return;
    const c = this.captions[v.caption];
    if (!c) return;
    if (v.spatial && this.distanceGain(v.soundlevel, v.distance) < CAPTION_MIN_GAIN) return;
    const now = this.ctx?.currentTime ?? 0;
    if (c.norepeat) {
      const last = this.captionShown.get(v.caption);
      if (last !== undefined && now - last < c.norepeat) return;
    }
    this.captionShown.set(v.caption, now);
    const ev: CaptionEvent = {
      token: v.caption,
      text: c.text,
      sfx: Boolean(c.sfx),
      duration: captionDuration(c, v.looping ? 0 : seconds),
      delay: v.delay + (c.delay ?? 0),
    };
    if (c.color) ev.color = c.color;
    for (const l of this.captionListeners) l(ev);
  }

  private updateScenes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.activeScenes.length) return;
    const now = ctx.currentTime;
    for (const s of this.activeScenes) {
      while (s.next < s.speak.length && now - s.start >= s.speak[s.next].start) {
        const e = s.speak[s.next++];
        const who = s.actor(e.actor) ?? {};
        this.emit({
          name: e.sound,
          entity: who.entity,
          pos: who.pos,
          channel: CHAN_VOICE,
          caption: e.ccType === 1 || e.ccType === 2 ? false : (e.cc ?? e.sound),
        });
      }
    }
    this.activeScenes = this.activeScenes.filter((s) => s.next < s.speak.length);
  }

  private endVoice(v: Voice): void {
    if (v.state === 'ended') return;
    const wasPlaying = v.state === 'playing';
    v.state = 'ended';
    if (wasPlaying && v.source) {
      v.source.onended = null;
      try {
        v.source.stop();
      } catch {
        // never started or already stopped
      }
      disconnectVoice(v);
    }
    this.release(v);
  }

  private release(v: Voice): void {
    if (v.retained) {
      v.retained = false;
      this.cache.release(v.sha);
    }
  }

  private prune(): void {
    if (this.voices.some((v) => v.state === 'ended'))
      this.voices = this.voices.filter((v) => v.state !== 'ended');
  }

  private handle(v: Voice): VoiceHandle {
    return {
      id: v.id,
      stop: () => {
        this.endVoice(v);
        this.prune();
      },
      setVolume: (volume: number) => {
        v.volume = clamp01(volume);
        if (v.state === 'playing') this.applyVoice(v, false);
      },
      get playing() {
        return v.state !== 'ended';
      },
      get looping() {
        return v.looping;
      },
    };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** decodeAudioData, promise or (older Safari) callback form. */
function decode(ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

function disconnectVoice(v: Voice): void {
  for (const node of [v.source, v.filter, v.gain, v.panner]) {
    try {
      node?.disconnect();
    } catch {
      // already disconnected
    }
  }
}
