/**
 * Key bindings the console way (`bind <key> <command>`): Source's key names
 * (`w`, `mouse1`, `kp_end`, `semicolon`…) mapped to `KeyboardEvent.code`
 * values, the commands that ARE game actions (`+forward`, `slot1`,
 * `voice_menu_1`…), and the console's own table for every other binding.
 *
 * A bind to an action command is the same thing as setting that key in the
 * Options panel: GameConsole writes it into the settings' key bindings, so
 * the panel and the console show one set of binds. A bind to anything else
 * (an alias, `say gg`, `toggle cl_showfps`) lives in the console's table and
 * is saved in config.cfg. A key is in at most one of the two.
 *
 * Environment-agnostic.
 */

import type { Action } from '../client/input/actions';

/** Source key name → KeyboardEvent.code (or the input layer's Mouse* / MWheel* codes). */
const NAMED: Record<string, string> = {
  space: 'Space',
  tab: 'Tab',
  enter: 'Enter',
  escape: 'Escape',
  backspace: 'Backspace',
  capslock: 'CapsLock',
  shift: 'ShiftLeft',
  rshift: 'ShiftRight',
  ctrl: 'ControlLeft',
  rctrl: 'ControlRight',
  alt: 'AltLeft',
  ralt: 'AltRight',
  lwin: 'MetaLeft',
  rwin: 'MetaRight',
  uparrow: 'ArrowUp',
  downarrow: 'ArrowDown',
  leftarrow: 'ArrowLeft',
  rightarrow: 'ArrowRight',
  ins: 'Insert',
  del: 'Delete',
  home: 'Home',
  end: 'End',
  pgup: 'PageUp',
  pgdn: 'PageDown',
  pause: 'Pause',
  semicolon: 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '`': 'Backquote',
  kp_slash: 'NumpadDivide',
  kp_multiply: 'NumpadMultiply',
  kp_minus: 'NumpadSubtract',
  kp_plus: 'NumpadAdd',
  kp_enter: 'NumpadEnter',
  kp_del: 'NumpadDecimal',
  kp_ins: 'Numpad0',
  kp_end: 'Numpad1',
  kp_downarrow: 'Numpad2',
  kp_pgdn: 'Numpad3',
  kp_leftarrow: 'Numpad4',
  kp_5: 'Numpad5',
  kp_rightarrow: 'Numpad6',
  kp_home: 'Numpad7',
  kp_uparrow: 'Numpad8',
  kp_pgup: 'Numpad9',
  mouse1: 'Mouse1',
  mouse2: 'Mouse2',
  mouse3: 'Mouse3',
  mouse4: 'Mouse4',
  mouse5: 'Mouse5',
  mwheelup: 'MWheelUp',
  mwheeldown: 'MWheelDown',
};

const BY_CODE = new Map<string, string>();
for (const [name, code] of Object.entries(NAMED)) if (!BY_CODE.has(code)) BY_CODE.set(code, name);

/** `w` → `KeyW`, `5` → `Digit5`, `f5` → `F5`, `kp_end` → `Numpad1`; null for an unknown name. */
export function keyNameToCode(raw: string): string | null {
  const name = raw.toLowerCase();
  if (/^[a-z]$/.test(name)) return `Key${name.toUpperCase()}`;
  if (/^[0-9]$/.test(name)) return `Digit${name}`;
  const f = /^f([1-9]|1[0-2])$/.exec(name);
  if (f) return `F${f[1]}`;
  return NAMED[name] ?? null;
}

/** The Source key name of a code (`KeyW` → `w`), or null for a code the console cannot name. */
export function codeToKeyName(code: string): string | null {
  const k = /^Key([A-Z])$/.exec(code);
  if (k) return k[1].toLowerCase();
  const d = /^Digit([0-9])$/.exec(code);
  if (d) return d[1];
  const f = /^F([1-9]|1[0-2])$/.exec(code);
  if (f) return `f${f[1]}`;
  return BY_CODE.get(code) ?? null;
}

/** Every key name (completion). */
export function allKeyNames(): string[] {
  const out: string[] = [];
  for (let c = 97; c <= 122; c++) out.push(String.fromCharCode(c));
  for (let d = 0; d <= 9; d++) out.push(String(d));
  for (let f = 1; f <= 12; f++) out.push(`f${f}`);
  out.push(...Object.keys(NAMED));
  return out;
}

/**
 * Console commands that are game actions (cfg/config_default.cfg's binds):
 * binding one of these sets the action's key in the settings.
 */
export const ACTION_COMMANDS: Readonly<Record<string, Action>> = {
  '+forward': 'forward',
  '+back': 'back',
  '+moveleft': 'moveleft',
  '+moveright': 'moveright',
  '+jump': 'jump',
  '+duck': 'duck',
  '+attack': 'attack',
  '+attack2': 'attack2',
  '+attack3': 'attack3',
  '+reload': 'reload',
  '+use': 'use',
  '+speed': 'speed',
  '+walk': 'walk',
  '+zoom': 'zoom',
  '+showscores': 'showscores',
  '+score': 'showscores',
  '+inspect': 'inspect',
  slot1: 'slot1',
  slot2: 'slot2',
  slot3: 'slot3',
  slot4: 'slot4',
  slot5: 'slot5',
  slot6: 'slot6',
  slot7: 'slot7',
  slot8: 'slot8',
  slot9: 'slot9',
  lastinv: 'lastinv',
  invnext: 'invnext',
  invprev: 'invprev',
  say: 'say',
  messagemode: 'say',
  say_team: 'say_team',
  messagemode2: 'say_team',
  voice_menu_1: 'voice_menu_1',
  voice_menu_2: 'voice_menu_2',
  voice_menu_3: 'voice_menu_3',
  'voicemenu 0 0': 'medic',
  changeclass: 'changeclass',
  changeteam: 'changeteam',
  taunt: 'taunt',
  dropitem: 'dropitem',
  lastdisguise: 'lastdisguise',
  'impulse 100': 'flashlight',
};

/** The command a bound action shows as (`forward` → `+forward`). */
export function actionCommand(action: Action): string {
  for (const [cmd, a] of Object.entries(ACTION_COMMANDS)) if (a === action) return cmd;
  return action;
}

/** The action a bind command names, or null (case and spacing as the engine compares them). */
export function commandAction(command: string): Action | null {
  const c = command.trim().replace(/\s+/g, ' ').toLowerCase();
  return ACTION_COMMANDS[c] ?? null;
}

/** The console's own binds: key code → command text. */
export class BindTable {
  private readonly map = new Map<string, string>();

  get(code: string): string | null {
    return this.map.get(code) ?? null;
  }

  set(code: string, command: string): void {
    this.map.set(code, command.slice(0, 510));
  }

  remove(code: string): boolean {
    return this.map.delete(code);
  }

  clear(): void {
    this.map.clear();
  }

  entries(): Array<[string, string]> {
    return [...this.map.entries()].sort((a, b) => (codeToKeyName(a[0]) ?? a[0]).localeCompare(codeToKeyName(b[0]) ?? b[0]));
  }

  get size(): number {
    return this.map.size;
  }

  /** `bind "f" "say gg"` lines for config.cfg. */
  configLines(): string[] {
    const out: string[] = [];
    for (const [code, cmd] of this.entries()) {
      const name = codeToKeyName(code);
      if (name) out.push(`bind "${name}" "${cmd.replace(/"/g, "'")}"`);
    }
    return out;
  }
}
