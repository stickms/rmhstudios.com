/**
 * Input actions and their default key bindings, per game. An action is
 * either HELD (a `+command` in Source terms: it sets a button bit while down)
 * or an IMPULSE (a one-shot command: weapon slots, chat, voice menus, menus).
 *
 * Key codes are `KeyboardEvent.code` values ("KeyW", "Space", "ControlLeft"),
 * plus "Mouse1"…"Mouse5" for buttons (Source's MOUSE1 = left) and
 * "MWheelUp" / "MWheelDown" for the wheel. Defaults follow each game's
 * `cfg/config_default.cfg`.
 *
 * Environment-agnostic.
 */

import type { HudGame } from '../hud-state';

export const HELD_ACTIONS = [
  'forward',
  'back',
  'moveleft',
  'moveright',
  'jump',
  'duck',
  'attack',
  'attack2',
  'attack3',
  'reload',
  'use',
  'speed',
  'walk',
  'zoom',
  'showscores',
  'inspect',
] as const;
export type HeldAction = (typeof HELD_ACTIONS)[number];

export const IMPULSE_ACTIONS = [
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'slot5',
  'slot6',
  'slot7',
  'slot8',
  'slot9',
  'lastinv',
  'invnext',
  'invprev',
  'say',
  'say_team',
  'voice_menu_1',
  'voice_menu_2',
  'voice_menu_3',
  'medic',
  'changeclass',
  'changeteam',
  'taunt',
  'dropitem',
  'lastdisguise',
  'flashlight',
  'menu',
  // Menu navigation (gamepad d-pad / A / B while a menu is open; touch too).
  'menu_up',
  'menu_down',
  'menu_left',
  'menu_right',
  'menu_accept',
  'menu_back',
] as const;
export type ImpulseAction = (typeof IMPULSE_ACTIONS)[number];

export type Action = HeldAction | ImpulseAction;

const HELD_SET: ReadonlySet<string> = new Set(HELD_ACTIONS);
const IMPULSE_SET: ReadonlySet<string> = new Set(IMPULSE_ACTIONS);
export const isHeldAction = (a: string): a is HeldAction => HELD_SET.has(a);
export const isImpulseAction = (a: string): a is ImpulseAction => IMPULSE_SET.has(a);
export const isAction = (a: string): a is Action => HELD_SET.has(a) || IMPULSE_SET.has(a);

/** Actions that are never rebindable (Escape always opens the menu, menu navigation is fixed). */
export const FIXED_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'menu',
  'menu_up',
  'menu_down',
  'menu_left',
  'menu_right',
  'menu_accept',
  'menu_back',
]);

/** `slotN` → N, else 0. */
export function slotOf(action: string): number {
  const m = /^slot(\d)$/.exec(action);
  return m ? Number(m[1]) : 0;
}

export type Keybinds = Partial<Record<Action, string[]>>;

const COMMON: Keybinds = {
  forward: ['KeyW'],
  back: ['KeyS'],
  moveleft: ['KeyA'],
  moveright: ['KeyD'],
  jump: ['Space'],
  duck: ['ControlLeft'],
  attack: ['Mouse1'],
  attack2: ['Mouse2'],
  menu: ['Escape'],
};

/** TF2's config_default.cfg. */
const TF2_BINDS: Keybinds = {
  ...COMMON,
  attack3: ['Mouse3'],
  reload: ['KeyR'],
  medic: ['KeyE'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  slot6: ['Digit6'],
  slot7: ['Digit7'],
  slot8: ['Digit8'],
  slot9: ['Digit9'],
  lastinv: ['KeyQ'],
  invprev: ['MWheelUp'],
  invnext: ['MWheelDown'],
  showscores: ['Tab'],
  say: ['KeyY'],
  say_team: ['KeyU'],
  voice_menu_1: ['KeyZ'],
  voice_menu_2: ['KeyX'],
  voice_menu_3: ['KeyC'],
  changeclass: ['Comma'],
  changeteam: ['Period'],
  taunt: ['KeyG'],
  inspect: ['KeyF'],
  dropitem: ['KeyL'],
  lastdisguise: ['KeyB'],
};

/** Half-Life 2's config_default.cfg. */
const HL2_BINDS: Keybinds = {
  ...COMMON,
  reload: ['KeyR'],
  use: ['KeyE'],
  speed: ['ShiftLeft'],
  walk: ['AltLeft'],
  zoom: ['KeyZ'],
  flashlight: ['KeyF'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  slot6: ['Digit6'],
  lastinv: ['KeyQ'],
  invprev: ['MWheelUp'],
  invnext: ['MWheelDown'],
};

/** Portal's config_default.cfg: mouse1 fires blue, mouse2 orange. */
const PORTAL_BINDS: Keybinds = {
  ...COMMON,
  use: ['KeyE'],
  walk: ['AltLeft'],
};

export function defaultKeybinds(game: HudGame): Keybinds {
  const src = game === 'hl2' ? HL2_BINDS : game === 'portal' ? PORTAL_BINDS : TF2_BINDS;
  const out: Keybinds = {};
  for (const [a, keys] of Object.entries(src) as Array<[Action, string[]]>) out[a] = [...keys];
  return out;
}

/** The actions each game shows in its key-binding list, in order. */
export function bindableActions(game: HudGame): Action[] {
  const base: Action[] = ['forward', 'back', 'moveleft', 'moveright', 'jump', 'duck', 'attack', 'attack2'];
  if (game === 'portal') return [...base, 'use', 'walk'];
  if (game === 'hl2')
    return [
      ...base,
      'reload',
      'use',
      'speed',
      'walk',
      'zoom',
      'flashlight',
      'slot1',
      'slot2',
      'slot3',
      'slot4',
      'slot5',
      'slot6',
      'lastinv',
      'invprev',
      'invnext',
    ];
  return [
    ...base,
    'attack3',
    'reload',
    'medic',
    'slot1',
    'slot2',
    'slot3',
    'slot4',
    'slot5',
    'slot6',
    'slot7',
    'slot8',
    'slot9',
    'lastinv',
    'invprev',
    'invnext',
    'showscores',
    'say',
    'say_team',
    'voice_menu_1',
    'voice_menu_2',
    'voice_menu_3',
    'changeclass',
    'changeteam',
    'taunt',
    'inspect',
    'dropitem',
    'lastdisguise',
  ];
}

/** Code → actions, for event handling. */
export function bindingIndex(binds: Keybinds): Map<string, Action[]> {
  const idx = new Map<string, Action[]>();
  for (const [action, keys] of Object.entries(binds) as Array<[Action, string[] | undefined]>) {
    for (const k of keys ?? []) {
      const list = idx.get(k);
      if (list) list.push(action);
      else idx.set(k, [action]);
    }
  }
  return idx;
}

/** Binds `code` to `action` as its primary key, removing the code from every other action (Source's `bind`). */
export function rebind(binds: Keybinds, action: Action, code: string, maxPerAction = 2): Keybinds {
  const out: Keybinds = {};
  for (const [a, keys] of Object.entries(binds) as Array<[Action, string[] | undefined]>) {
    const kept = (keys ?? []).filter((k) => k !== code);
    if (kept.length) out[a] = kept;
  }
  const cur = out[action] ?? [];
  out[action] = [code, ...cur].slice(0, maxPerAction);
  return out;
}

export function unbind(binds: Keybinds, action: Action): Keybinds {
  const out = { ...binds };
  delete out[action];
  return out;
}

/** A mouse button (MouseEvent.button 0…4) as a binding code. */
export const mouseCode = (button: number): string => `Mouse${button === 0 ? 1 : button === 2 ? 2 : button === 1 ? 3 : button + 1}`;
