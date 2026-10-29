/**
 * Soundscapes (SDK: game/client/c_soundscape.cpp, game/server/soundscape.cpp).
 *
 * A soundscape (scripts/soundscapes_*.txt) is a list of rules: `playlooping` a wave forever,
 * `playrandom` one of a set of waves every `time` seconds, `playsoundscape` another soundscape
 * (scaled, its positions offset), and a `dsp` room type. An env_soundscape in the map names one;
 * the server makes the closest env_soundscape within its radius that can see the player the
 * player's soundscape (CEnvSoundscape::UpdateForPlayer), and it stays so until another takes
 * over. The client then crossfades: the old loops fade to silence and the new ones in, linearly
 * over `soundscape_fadetime` (3 s), a loop present in both carrying on untouched; the random
 * sounds switch at once.
 *
 * Sounds without a `position` are ambient (everywhere, unspatialised); with one they play at the
 * env_soundscape's `position<N>` target at their sound level (looping default SNDLVL_NORM,
 * random default SNDLVL_NONE); `position "random"` places each random sound 36 units from the
 * listener in a random horizontal direction.
 *
 * `parseSoundscapes` reads the script text (the sound exporter's sourcegame.parse_soundscapes
 * writes the same shape to snd/soundscapes.json); `selectSoundscape` is the server's choice;
 * `SoundscapePlayer` is the client's playback, over a host the AudioEngine implements.
 */
import { parseKeyValues, type KvNode } from '../formats/keyvalues';
import type { Vec3 } from '../core/vec';
import { attnToSndlvl, SNDLVL_NORM } from './attenuation';

/** [min, max]; one value is drawn uniformly per use. */
export type Interval = [number, number];

export interface LoopingRule {
  type: 'looping';
  /** `sound/…` path (lowercase) or a script entry name. */
  wave: string;
  volume?: Interval;
  pitch?: Interval;
  soundlevel?: Interval;
  position?: number;
}

export interface RandomRule {
  type: 'random';
  waves: string[];
  time?: Interval;
  volume?: Interval;
  pitch?: Interval;
  soundlevel?: Interval;
  position?: number | 'random';
}

export interface SubSoundscapeRule {
  type: 'soundscape';
  name: string;
  volume?: Interval;
  position?: number;
  positionOverride?: number;
  ambientPositionOverride?: number;
}

export type SoundscapeRule = LoopingRule | RandomRule | SubSoundscapeRule;

export interface SoundscapeDef {
  /** Room type for the DSP (not mixed in the browser). */
  dsp?: number;
  rules: SoundscapeRule[];
}

/** `snd/soundscapes.json` — written by scripts/tf2-game/sounds.py for HL2 and Portal. */
export interface SoundscapeDocument {
  v: 1;
  soundscapes: Record<string, SoundscapeDef>;
}

/** soundscape_fadetime (seconds). */
export const SOUNDSCAPE_FADE_TIME = 3;
/** c_soundscape.cpp DEFAULT_SOUND_RADIUS: where `position "random"` sounds are placed. */
export const SOUNDSCAPE_RANDOM_RADIUS = 36;
const MAX_RECURSION = 8;

// ------------------------------------------------------------------------------------- parsing

const NUM = /-?\d+(?:\.\d+)?|-?\.\d+/g;

function interval(value: string): Interval {
  const nums = (value.match(NUM) ?? []).map(Number);
  if (!nums.length) return [0, 0];
  return [nums[0], nums.length > 1 ? nums[1] : nums[0]];
}

const SNDLVL_NAMES: Record<string, number> = {
  sndlvl_none: 0,
  sndlvl_idle: 60,
  sndlvl_talking: 80,
  sndlvl_static: 66,
  sndlvl_norm: 75,
  sndlvl_gunfire: 140,
};

function soundlevelInterval(value: string): Interval {
  const v = value.trim().toLowerCase();
  if (v.startsWith('sndlvl_')) {
    const m = /^sndlvl_(\d+)db$/.exec(v);
    const lvl = m ? Number(m[1]) : (SNDLVL_NAMES[v] ?? SNDLVL_NORM);
    return [lvl, lvl];
  }
  return interval(v);
}

function attnInterval(value: string): Interval {
  const [a, b] = interval(value);
  return [attnToSndlvl(a), attnToSndlvl(b)];
}

/** A wave as the exporter keys it: prefix characters dropped, `sound/` + lowercase path. */
export function soundscapeWave(value: string): string {
  const w = value.trim().replace(/^[*#@><^)}$!?&~`+%]+/, '');
  if (/\.(wav|mp3)$/i.test(w)) {
    return 'sound/' + w.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').toLowerCase();
  }
  return w;
}

function leaf(n: KvNode): string {
  return n.value ?? '';
}

function parseRule(node: KvNode): SoundscapeRule | null {
  const kind = node.key.toLowerCase();
  if (kind === 'playlooping') {
    const r: LoopingRule = { type: 'looping', wave: '' };
    for (const c of node.children) {
      const k = c.key.toLowerCase();
      if (k === 'volume') r.volume = interval(leaf(c));
      else if (k === 'pitch') r.pitch = interval(leaf(c));
      else if (k === 'wave') r.wave = soundscapeWave(leaf(c));
      else if (k === 'position') r.position = Math.trunc(interval(leaf(c))[0]);
      else if (k === 'attenuation') r.soundlevel = attnInterval(leaf(c));
      else if (k === 'soundlevel') r.soundlevel = soundlevelInterval(leaf(c));
    }
    return r;
  }
  if (kind === 'playrandom') {
    const r: RandomRule = { type: 'random', waves: [] };
    for (const c of node.children) {
      const k = c.key.toLowerCase();
      if (k === 'volume') r.volume = interval(leaf(c));
      else if (k === 'pitch') r.pitch = interval(leaf(c));
      else if (k === 'time') r.time = interval(leaf(c));
      else if (k === 'rndwave')
        r.waves = c.children.filter((w) => !w.isBlock).map((w) => soundscapeWave(leaf(w)));
      else if (k === 'position')
        r.position =
          leaf(c).trim().toLowerCase() === 'random' ? 'random' : Math.trunc(interval(leaf(c))[0]);
      else if (k === 'attenuation') r.soundlevel = attnInterval(leaf(c));
      else if (k === 'soundlevel') r.soundlevel = soundlevelInterval(leaf(c));
    }
    return r;
  }
  if (kind === 'playsoundscape') {
    const r: SubSoundscapeRule = { type: 'soundscape', name: '' };
    for (const c of node.children) {
      const k = c.key.toLowerCase();
      if (k === 'name') r.name = leaf(c);
      else if (k === 'volume') r.volume = interval(leaf(c));
      else if (k === 'position') r.position = Math.trunc(interval(leaf(c))[0]);
      else if (k === 'positionoverride') r.positionOverride = Math.trunc(interval(leaf(c))[0]);
      else if (k === 'ambientpositionoverride')
        r.ambientPositionOverride = Math.trunc(interval(leaf(c))[0]);
    }
    return r;
  }
  return null;
}

/** A soundscapes_*.txt file → its soundscapes, in file order (the first of a name wins). */
export function parseSoundscapes(text: string): Record<string, SoundscapeDef> {
  const out: Record<string, SoundscapeDef> = {};
  const seen = new Set<string>();
  for (const node of parseKeyValues(text).root.children) {
    if (!node.isBlock || seen.has(node.key.toLowerCase())) continue;
    seen.add(node.key.toLowerCase());
    const def: SoundscapeDef = { rules: [] };
    for (const c of node.children) {
      if (c.key.toLowerCase() === 'dsp' && !c.isBlock) def.dsp = Math.trunc(interval(leaf(c))[0]);
      else if (c.isBlock) {
        const r = parseRule(c);
        if (r) def.rules.push(r);
      }
    }
    out[node.key] = def;
  }
  return out;
}

/** Case-insensitive lookup (FindSoundscapeByName). */
export function findSoundscape(
  all: Record<string, SoundscapeDef>,
  name: string,
): SoundscapeDef | null {
  if (all[name]) return all[name];
  const lower = name.toLowerCase();
  for (const k of Object.keys(all)) if (k.toLowerCase() === lower) return all[k];
  return null;
}

// ----------------------------------------------------------------------------------- selection

/** An env_soundscape (or _triggerable) as the selection needs it. */
export interface SoundscapeEntity {
  /** Stable id (entity index). */
  id: number;
  soundscape: string;
  origin: Vec3;
  /** `radius`; -1 = everywhere. */
  radius: number;
  disabled?: boolean;
  /** `position0`…`position7` targets' origins (null when unset). */
  positions?: readonly (Vec3 | null)[];
}

/** The server's per-player selection state (ss_update_t, persisted between updates). */
export interface SoundscapeSelection {
  current: SoundscapeEntity | null;
}

/**
 * CEnvSoundscape::UpdateForPlayer over every env_soundscape: the current one stays while it is
 * in range and visible; another takes over when it is in range, visible and either the current
 * one is not in range or it is closer. `visible(from, to)` is the trace (MASK_SOLID_BRUSHONLY).
 * Returns the soundscape the player now has (unchanged when nothing qualifies).
 */
export function selectSoundscape(
  envs: readonly SoundscapeEntity[],
  ear: Vec3,
  state: SoundscapeSelection,
  visible: (from: Vec3, to: Vec3) => boolean,
): SoundscapeEntity | null {
  let current =
    state.current && envs.find((e) => e.id === state.current?.id) ? state.current : null;
  let currentDistance = 0;
  let inRange = false;
  if (current && current.disabled) current = null;
  // The current one is evaluated where the loop reaches it, like the server does; doing it
  // first gives the same result (its range check never changes the others').
  if (current) {
    currentDistance = dist(current.origin, ear);
    inRange =
      (current.radius === -1 || current.radius > currentDistance) && visible(current.origin, ear);
  }
  for (const env of envs) {
    if (env.disabled || env === current || env.id === current?.id) continue;
    const range = dist(env.origin, ear);
    if ((!inRange || range < currentDistance) && (env.radius === -1 || env.radius > range)) {
      if (visible(env.origin, ear)) {
        current = env;
        currentDistance = range;
        inRange = true;
      }
    }
  }
  state.current = current;
  return current;
}

function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ------------------------------------------------------------------------------------ playback

/** A looping sound the host keeps playing; volume changes are immediate (the player fades). */
export interface SoundscapeLoop {
  setVolume(volume: number): void;
  stop(): void;
}

export interface SoundscapeHost {
  /** Start a loop (silent at first); `pos` null = ambient. */
  startLoop(
    wave: string,
    volume: number,
    pitch: number,
    soundlevel: number,
    pos: Vec3 | null,
  ): SoundscapeLoop | null;
  /** Play one random sound; `pos` null = ambient. */
  playOnce(wave: string, volume: number, pitch: number, soundlevel: number, pos: Vec3 | null): void;
  /** Listener origin, forward and right (for `position "random"`). */
  listener(): { origin: Vec3; forward: Vec3; right: Vec3 };
}

interface ActiveLoop {
  wave: string;
  pitch: number;
  ambient: boolean;
  pos: Vec3 | null;
  current: number;
  target: number;
  generation: number;
  handle: SoundscapeLoop | null;
}

interface ActiveRandom {
  rule: RandomRule;
  master: number;
  ambient: boolean;
  random: boolean;
  pos: Vec3 | null;
  next: number;
}

interface SubParams {
  master: number;
  start: number;
  depth: number;
  positionOverride: number;
  ambientPositionOverride: number;
}

export class SoundscapePlayer {
  private loops: ActiveLoop[] = [];
  private randoms: ActiveRandom[] = [];
  private generation = 0;
  private name: string | null = null;
  private time = 0;

  constructor(
    private readonly host: SoundscapeHost,
    private defs: Record<string, SoundscapeDef> = {},
    private readonly rand: () => number = Math.random,
    readonly fadeTime = SOUNDSCAPE_FADE_TIME,
  ) {}

  setDefinitions(defs: Record<string, SoundscapeDef>): void {
    this.defs = defs;
  }

  /** The soundscape playing (or fading in), or null. */
  get current(): string | null {
    return this.name;
  }

  /** Loops alive (fading included) and random-sound rules active: for tests and debugging. */
  get stats(): { loops: number; randoms: number } {
    return { loops: this.loops.length, randoms: this.randoms.length };
  }

  /**
   * StartNewSoundscape: crossfade to `name` (null stops everything at once). `positions` are
   * the env_soundscape's position targets.
   */
  start(name: string | null, positions: readonly (Vec3 | null)[] = []): void {
    const def = name ? findSoundscape(this.defs, name) : null;
    for (const l of this.loops) {
      l.target = 0;
      if (!def) l.current = 0;
    }
    this.generation++;
    this.randoms = [];
    this.name = def ? name : null;
    if (def) {
      this.startSub(def, positions, {
        master: 1,
        start: 0,
        depth: 0,
        positionOverride: -1,
        ambientPositionOverride: -1,
      });
    }
    this.applyVolumes();
  }

  /** Advance to `time` (seconds, monotonic): fades loops, plays due random sounds. */
  update(time: number): void {
    const dt = Math.max(0, time - this.time);
    this.time = time;
    const step = this.fadeTime > 0 ? dt / this.fadeTime : 1;
    for (const l of this.loops) {
      if (l.current < l.target) l.current = Math.min(l.target, l.current + step);
      else if (l.current > l.target) l.current = Math.max(l.target, l.current - step);
    }
    this.applyVolumes();
    for (const r of this.randoms) {
      if (time < r.next) continue;
      this.playRandom(r);
      r.next = time + this.draw(r.rule.time ?? [0, 0]);
    }
  }

  stop(): void {
    this.start(null);
  }

  private draw([a, b]: Interval): number {
    return a + (b - a) * this.rand();
  }

  private startSub(def: SoundscapeDef, positions: readonly (Vec3 | null)[], p: SubParams): void {
    for (const rule of def.rules) {
      if (rule.type === 'looping') this.addLooping(rule, positions, p);
      else if (rule.type === 'random') this.addRandom(rule, positions, p);
      else this.addSub(rule, positions, p);
    }
  }

  private resolvePosition(index: number | undefined, p: SubParams): { index: number } {
    let i = index === undefined ? -1 : p.start + index;
    if (i < 0) i = p.ambientPositionOverride;
    else if (p.positionOverride >= 0) i = p.positionOverride;
    return { index: i };
  }

  private addLooping(rule: LoopingRule, positions: readonly (Vec3 | null)[], p: SubParams): void {
    const volume = p.master * (rule.volume ? this.draw(rule.volume) : 0);
    const pitch = rule.pitch ? this.draw(rule.pitch) : 100;
    const soundlevel = rule.soundlevel ? this.draw(rule.soundlevel) : SNDLVL_NORM;
    if (!volume || !rule.wave) return;
    const { index } = this.resolvePosition(rule.position, p);
    let pos: Vec3 | null = null;
    if (index >= 0) {
      pos = positions[index] ?? null;
      if (!pos) return; // the position is not available: suppressed
    }
    const ambient = pos === null;
    // A loop of the previous soundscape with the same wave and pitch (and place) carries on.
    let slot = this.loops.find(
      (l) =>
        l.generation !== this.generation &&
        l.pitch === Math.round(pitch) &&
        l.wave.toLowerCase() === rule.wave.toLowerCase() &&
        l.ambient === ambient &&
        (ambient || (l.pos && pos && near(l.pos, pos))),
    );
    if (!slot) {
      const handle = this.host.startLoop(
        rule.wave,
        0,
        Math.round(pitch),
        ambient ? 0 : soundlevel,
        pos,
      );
      slot = {
        wave: rule.wave,
        pitch: Math.round(pitch),
        ambient,
        pos,
        current: 0,
        target: 0,
        generation: this.generation,
        handle,
      };
      this.loops.push(slot);
    }
    slot.target = volume;
    slot.generation = this.generation;
  }

  private addRandom(rule: RandomRule, positions: readonly (Vec3 | null)[], p: SubParams): void {
    if (!rule.waves.length) return;
    // `position "random"` reads as no index (then the ambient override applies, unused while
    // random); a numeric position takes the sub-soundscape's override.
    const random = rule.position === 'random';
    const { index } = this.resolvePosition(
      typeof rule.position === 'number' ? rule.position : undefined,
      p,
    );
    let pos: Vec3 | null = null;
    if (index >= 0 && !random) {
      pos = positions[index] ?? null;
      if (!pos) return;
    }
    this.randoms.push({
      rule,
      master: p.master,
      ambient: !random && pos === null,
      random,
      pos,
      next: this.time + 0.5 * this.draw(rule.time ?? [0, 0]),
    });
  }

  private addSub(rule: SubSoundscapeRule, positions: readonly (Vec3 | null)[], p: SubParams): void {
    if (p.depth + 1 > MAX_RECURSION) return;
    const def = findSoundscape(this.defs, rule.name);
    if (!def) return;
    const sub: SubParams = { ...p, depth: p.depth + 1 };
    if (rule.volume) sub.master = p.master * this.draw(rule.volume);
    if (rule.position !== undefined) sub.start = p.start + rule.position;
    if (rule.positionOverride !== undefined && p.positionOverride < 0) {
      sub.positionOverride = p.start + rule.positionOverride;
      sub.ambientPositionOverride = p.start + rule.positionOverride;
    }
    if (rule.ambientPositionOverride !== undefined && p.ambientPositionOverride < 0)
      sub.ambientPositionOverride = p.start + rule.ambientPositionOverride;
    this.startSub(def, positions, sub);
  }

  private playRandom(r: ActiveRandom): void {
    const wave =
      r.rule.waves[
        Math.min(r.rule.waves.length - 1, Math.floor(this.rand() * r.rule.waves.length))
      ];
    const volume = r.master * this.draw(r.rule.volume ?? [0, 0]);
    const pitch = Math.trunc(this.draw(r.rule.pitch ?? [100, 100]));
    const soundlevel = Math.trunc(this.draw(r.rule.soundlevel ?? [0, 0]));
    let pos = r.pos;
    if (r.random) {
      const { origin, forward, right } = this.host.listener();
      const a = (this.rand() * 360 - 180) * (Math.PI / 180);
      const s = Math.sin(a);
      const c = Math.cos(a);
      pos = {
        x: origin.x + SOUNDSCAPE_RANDOM_RADIUS * (c * right.x + s * forward.x),
        y: origin.y + SOUNDSCAPE_RANDOM_RADIUS * (c * right.y + s * forward.y),
        z: origin.z + SOUNDSCAPE_RANDOM_RADIUS * (c * right.z + s * forward.z),
      };
    }
    this.host.playOnce(
      wave,
      volume,
      pitch || 100,
      r.ambient ? 0 : soundlevel,
      r.ambient ? null : pos,
    );
  }

  /** Push the current volumes to the host; a loop faded out completely is stopped. */
  private applyVolumes(): void {
    const keep: ActiveLoop[] = [];
    for (const l of this.loops) {
      if (l.target === 0 && l.current === 0) {
        l.handle?.stop();
        continue;
      }
      l.handle?.setVolume(l.current);
      keep.push(l);
    }
    this.loops = keep;
  }
}

function near(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) <= 0.1 && Math.abs(a.y - b.y) <= 0.1 && Math.abs(a.z - b.z) <= 0.1;
}
