/**
 * HUD animation scripts (`scripts/hudanimations_*.txt`): named events, each a list of commands that start at
 * a time offset. The format is not KeyValues; it is a line-ish language:
 *
 *   event HudHealthBonusPulse
 *   {
 *       Animate PlayerStatusHealthBonusImage Alpha "255" Linear 0.0 0.2
 *       RunEvent HudHealthBonusPulseLoop 0.4
 *   }
 *
 * Parsing is forgiving: an unknown command is skipped (and noted), never fatal, because HUDs in the wild use
 * commands this editor does not simulate (FireCommand, PlaySound).
 */

export type InterpKind =
  'linear' | 'accel' | 'deaccel' | 'spline' | 'pulse' | 'flicker' | 'gain' | 'bias' | 'bounce';

export interface Interp {
  kind: InterpKind;
  /** Pulse frequency, flicker randomness, or the gain/bias value. */
  param?: number;
}

export type AnimCommand =
  | {
      t: 'animate';
      panel: string;
      variable: string;
      target: string;
      interp: Interp;
      start: number;
      duration: number;
    }
  | { t: 'run'; event: string; start: number }
  | { t: 'stop'; event: string; start: number }
  | { t: 'stopAnimation'; panel: string; variable: string; start: number }
  | { t: 'stopPanel'; panel: string; start: number }
  | { t: 'visible'; panel: string; value: boolean; start: number };

export interface AnimEvent {
  name: string;
  commands: AnimCommand[];
}

export interface AnimScript {
  /** Keyed by lower-case event name. */
  events: Map<string, AnimEvent>;
  /** Commands that were understood but are not simulated, and ones that could not be read. */
  notes: string[];
}

export const emptyScript = (): AnimScript => ({ events: new Map(), notes: [] });

/* ───────────────────────── tokens ───────────────────────── */

function tokenize(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') {
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && text[j] !== '"') s += text[j++];
      out.push(`"${s}`); // a leading quote marks a quoted token
      i = j + 1;
    } else if (c === '{' || c === '}') {
      out.push(c);
      i++;
    } else if (c === '[') {
      // A platform conditional such as [$X360]: dropped (the default is PC).
      while (i < n && text[i] !== ']') i++;
      i++;
    } else {
      let j = i;
      while (j < n && !/[\s{}"]/.test(text[j])) j++;
      out.push(text.slice(i, j));
      i = j;
    }
  }
  return out;
}

const unq = (t: string): string => (t.startsWith('"') ? t.slice(1) : t);
const num = (t: string | undefined): number => {
  const v = Number.parseFloat(unq(t ?? ''));
  return Number.isFinite(v) ? v : 0;
};

const INTERPS: Record<string, InterpKind> = {
  linear: 'linear',
  accel: 'accel',
  deaccel: 'deaccel',
  spline: 'spline',
  pulse: 'pulse',
  flicker: 'flicker',
  gain: 'gain',
  bias: 'bias',
  bounce: 'bounce',
};
const PARAM_INTERPS = new Set<InterpKind>(['pulse', 'flicker', 'gain', 'bias']);

/** Commands and how many arguments follow them. Animate's count varies (see below). */
const ARITY: Record<string, number> = {
  runevent: 2,
  runeventchild: 3,
  stopevent: 2,
  stopanimation: 3,
  stoppanelanimations: 2,
  setvisible: 3,
  setinputenabled: 3,
  firecommand: 2,
  playsound: 2,
  setfont: 4,
  settexture: 4,
  setstring: 4,
};

export function parseAnimScript(text: string): AnimScript {
  const script = emptyScript();
  const tokens = tokenize(text);
  let i = 0;
  const at = () => tokens[i];

  while (i < tokens.length) {
    if (unq(at()).toLowerCase() !== 'event' || at().startsWith('"')) {
      i++;
      continue;
    }
    const name = unq(tokens[i + 1] ?? '');
    i += 2;
    if (at() !== '{') {
      script.notes.push(`event ${name}: expected {`);
      continue;
    }
    i++;
    const commands: AnimCommand[] = [];
    while (i < tokens.length && at() !== '}') {
      const word = at().toLowerCase();
      i++;
      if (word === 'animate') {
        const [panel, variable, target, interpWord] = [
          tokens[i],
          tokens[i + 1],
          tokens[i + 2],
          tokens[i + 3],
        ];
        const kind = INTERPS[unq(interpWord ?? '').toLowerCase()];
        if (!panel || !variable || target === undefined || !kind) {
          script.notes.push(`event ${name}: could not read an Animate command`);
          i += 1;
          continue;
        }
        let k = i + 4;
        const interp: Interp = { kind };
        if (PARAM_INTERPS.has(kind)) interp.param = num(tokens[k++]);
        commands.push({
          t: 'animate',
          panel: unq(panel),
          variable: unq(variable),
          target: unq(target),
          interp,
          start: num(tokens[k]),
          duration: num(tokens[k + 1]),
        });
        i = k + 2;
        continue;
      }
      const arity = ARITY[word];
      if (arity === undefined) {
        script.notes.push(`event ${name}: skipped ${word}`);
        continue;
      }
      const a = tokens.slice(i, i + arity).map(unq);
      i += arity;
      switch (word) {
        case 'runevent':
          commands.push({ t: 'run', event: a[0], start: num(a[1]) });
          break;
        case 'runeventchild': // [panel, event, time]: the panel only scopes where the event is found
          commands.push({ t: 'run', event: a[1], start: num(a[2]) });
          break;
        case 'stopevent':
          commands.push({ t: 'stop', event: a[0], start: num(a[1]) });
          break;
        case 'stopanimation':
          commands.push({ t: 'stopAnimation', panel: a[0], variable: a[1], start: num(a[2]) });
          break;
        case 'stoppanelanimations':
          commands.push({ t: 'stopPanel', panel: a[0], start: num(a[1]) });
          break;
        case 'setvisible':
          commands.push({ t: 'visible', panel: a[0], value: num(a[1]) !== 0, start: num(a[2]) });
          break;
        default:
          script.notes.push(`${name}: ${word} is not simulated`);
      }
    }
    i++; // the closing brace
    script.events.set(name.toLowerCase(), { name, commands });
  }
  return script;
}

/** Merge scripts in load order; an event defined again replaces the earlier one. */
export function mergeScripts(scripts: readonly AnimScript[]): AnimScript {
  const out = emptyScript();
  for (const s of scripts) {
    for (const [k, e] of s.events) out.events.set(k, e);
    out.notes.push(...s.notes);
  }
  return out;
}

/** The files a `hudanimations_manifest.txt` lists, in order. */
export function manifestFiles(text: string | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(/"file"\s+"([^"]+)"/gi)].map((m) => m[1].replace(/\\/g, '/'));
}
