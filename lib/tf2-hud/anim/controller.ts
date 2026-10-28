/**
 * Runs HUD animation events. Deterministic: time only moves when `advance(now)` is called, so the same calls
 * always give the same values, and it can be tested without a clock.
 *
 * The rules follow the game's animation controller:
 *  - an `Animate` starts at its time, from the variable's value at that moment, and a new one on the same
 *    panel and variable replaces the old;
 *  - `RunEvent` starts another event, `StopEvent` cancels everything an event has pending or running (the
 *    values it already set stay where they are);
 *  - events may loop by running themselves, so the work done per `advance` is bounded.
 */

import type { Rgba } from '../scheme/scheme';
import { weight } from './interp';
import type { AnimCommand, AnimScript } from './parse';

export type Channel = 'alpha' | 'fg' | 'bg' | 'x' | 'y' | 'w' | 'h' | 'vis';

/** A position or size as the file writes it: `r120` is 120 from the end, `f20` fills but 20. */
export interface DimValue {
  prefix: '' | 'r' | 'c' | 'f';
  value: number;
}

export type AnimValue = number | Rgba | DimValue | boolean;

export interface AnimEnv {
  /** The value a panel has with no animation on it (lower-case panel name), if it has one. */
  base(panel: string, channel: Channel): AnimValue | undefined;
  /** A scheme colour name or `r g b a` literal as a colour. */
  color(raw: string): Rgba | undefined;
}

type Animate = Extract<AnimCommand, { t: 'animate' }>;

interface Sched {
  at: number;
  seq: number;
  cmd: AnimCommand;
  event: string;
}

interface Active {
  panel: string;
  channel: Channel;
  variable: string;
  from: AnimValue;
  to: AnimValue;
  cmd: Animate;
  start: number;
  event: string;
  seed: number;
}

const key = (panel: string, ch: Channel) => `${panel}|${ch}`;
const isRgba = (v: AnimValue): v is Rgba => typeof v === 'object' && 'r' in v;
const isDim = (v: AnimValue): v is DimValue => typeof v === 'object' && 'prefix' in v;

export function sameValue(a: AnimValue | undefined, b: AnimValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || typeof a !== typeof b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (isRgba(a) && isRgba(b)) return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  if (isDim(a) && isDim(b)) return a.prefix === b.prefix && a.value === b.value;
  return false;
}

const DIM = /^([rcf]?)(-?\d*\.?\d+)$/i;

function parseDimValue(raw: string | undefined): DimValue | undefined {
  const m = DIM.exec((raw ?? '').trim());
  return m
    ? { prefix: m[1].toLowerCase() as DimValue['prefix'], value: Number.parseFloat(m[2]) }
    : undefined;
}

/** What a variable name changes, with the target parsed. */
export function parseTarget(
  variable: string,
  target: string,
  env: AnimEnv,
): { channel: Channel; to: AnimValue }[] {
  const v = variable.toLowerCase();
  const out: { channel: Channel; to: AnimValue }[] = [];
  const add = (channel: Channel, to: AnimValue | undefined) => {
    if (to !== undefined) out.push({ channel, to });
  };
  const parts = target.trim().split(/\s+/);
  switch (v) {
    case 'alpha': {
      const n = Number.parseFloat(target);
      add('alpha', Number.isFinite(n) ? n : undefined);
      break;
    }
    case 'fgcolor':
    case 'textcolor':
      add('fg', env.color(target));
      break;
    case 'bgcolor':
      add('bg', env.color(target));
      break;
    case 'position':
      add('x', parseDimValue(parts[0]));
      add('y', parseDimValue(parts[1]));
      break;
    case 'xpos':
      add('x', parseDimValue(parts[0]));
      break;
    case 'ypos':
      add('y', parseDimValue(parts[0]));
      break;
    case 'size':
      add('w', parseDimValue(parts[0]));
      add('h', parseDimValue(parts[1]));
      break;
    case 'wide':
      add('w', parseDimValue(parts[0]));
      break;
    case 'tall':
      add('h', parseDimValue(parts[0]));
      break;
    default:
      break; // Blur, PulseAmount, TextScan… have no effect on this preview.
  }
  return out;
}

function lerp(from: AnimValue, to: AnimValue, w: number): AnimValue {
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * w;
  if (typeof to === 'boolean') return w >= 1 ? to : from;
  if (isRgba(from) && isRgba(to)) {
    const c = (a: number, b: number) => Math.round(a + (b - a) * w);
    return { r: c(from.r, to.r), g: c(from.g, to.g), b: c(from.b, to.b), a: c(from.a, to.a) };
  }
  if (isDim(from) && isDim(to)) {
    // Different anchors cannot be blended; take the target's from the half-way point.
    if (from.prefix !== to.prefix) return w < 0.5 ? from : to;
    return { prefix: to.prefix, value: from.value + (to.value - from.value) * w };
  }
  return to;
}

/** Work done per `advance`, so an event that reruns itself with no delay cannot hang the page. */
const MAX_STEPS = 5000;

export class AnimController {
  private sched: Sched[] = [];
  private active: Active[] = [];
  private state = new Map<string, AnimValue>();
  private seq = 0;
  private seeds = 0;
  private now = 0;

  constructor(
    private script: AnimScript,
    private env: AnimEnv,
  ) {}

  setEnv(env: AnimEnv): void {
    this.env = env;
  }

  /** Something is scheduled or moving, so time still matters. */
  get busy(): boolean {
    return this.sched.length > 0 || this.active.length > 0;
  }

  /** Start an event. False when the script has no such event. */
  fire(event: string, at: number = this.now): boolean {
    const ev = this.script.events.get(event.toLowerCase());
    if (!ev) return false;
    const name = ev.name.toLowerCase();
    for (const cmd of ev.commands) {
      this.sched.push({ at: at + cmd.start, seq: this.seq++, cmd, event: name });
    }
    return true;
  }

  /** Cancel everything and forget every animated value: the HUD goes back to its files. */
  reset(): void {
    this.sched = [];
    this.active = [];
    this.state.clear();
  }

  /** Move time to `now`. Returns whether any value changed. */
  advance(now: number): boolean {
    let changed = false;
    for (let steps = 0; steps < MAX_STEPS; steps++) {
      let next = -1;
      for (let i = 0; i < this.sched.length; i++) {
        const s = this.sched[i];
        if (s.at > now) continue;
        const best = this.sched[next];
        if (next < 0 || s.at < best.at || (s.at === best.at && s.seq < best.seq)) next = i;
      }
      if (next < 0) break;
      const [s] = this.sched.splice(next, 1);
      // Bring what is already moving up to the moment this command starts, so it begins from there.
      changed = this.step(s.at) || changed;
      changed = this.exec(s) || changed;
    }
    changed = this.step(now) || changed;
    this.now = Math.max(this.now, now);
    return changed;
  }

  /** The current animated value of every (panel, channel) an animation has touched. */
  values(): ReadonlyMap<string, AnimValue> {
    return this.state;
  }

  private current(panel: string, ch: Channel): AnimValue | undefined {
    return this.state.get(key(panel, ch)) ?? this.env.base(panel, ch);
  }

  private set(panel: string, ch: Channel, v: AnimValue): boolean {
    const k = key(panel, ch);
    if (sameValue(this.state.get(k), v)) return false;
    this.state.set(k, v);
    return true;
  }

  private exec(s: Sched): boolean {
    const cmd = s.cmd;
    switch (cmd.t) {
      case 'animate': {
        let changed = false;
        const panel = cmd.panel.toLowerCase();
        for (const { channel, to } of parseTarget(cmd.variable, cmd.target, this.env)) {
          this.active = this.active.filter((a) => !(a.panel === panel && a.channel === channel));
          const from = this.current(panel, channel) ?? to;
          if (cmd.duration <= 0) {
            changed = this.set(panel, channel, to) || changed;
          } else {
            this.active.push({
              panel,
              channel,
              variable: cmd.variable.toLowerCase(),
              from,
              to,
              cmd,
              start: s.at,
              event: s.event,
              seed: this.seeds++,
            });
          }
        }
        return changed;
      }
      case 'run':
        this.fire(cmd.event, s.at);
        return false;
      case 'stop': {
        const name = cmd.event.toLowerCase();
        this.sched = this.sched.filter((x) => x.event !== name);
        this.active = this.active.filter((a) => a.event !== name);
        return false;
      }
      case 'stopAnimation': {
        const panel = cmd.panel.toLowerCase();
        const v = cmd.variable.toLowerCase();
        this.active = this.active.filter((a) => !(a.panel === panel && a.variable === v));
        return false;
      }
      case 'stopPanel': {
        const panel = cmd.panel.toLowerCase();
        this.active = this.active.filter((a) => a.panel !== panel);
        return false;
      }
      case 'visible':
        return this.set(cmd.panel.toLowerCase(), 'vis', cmd.value);
    }
  }

  private step(t: number): boolean {
    let changed = false;
    const done: Active[] = [];
    for (const a of this.active) {
      const dur = a.cmd.duration;
      const f = dur <= 0 ? 1 : (t - a.start) / dur;
      const w = weight(a.cmd.interp, f, Math.floor((t - a.start) * 60), a.seed);
      const v = f >= 1 ? a.to : lerp(a.from, a.to, w);
      changed = this.set(a.panel, a.channel, v) || changed;
      if (f >= 1) done.push(a);
    }
    if (done.length) this.active = this.active.filter((a) => !done.includes(a));
    return changed;
  }
}
