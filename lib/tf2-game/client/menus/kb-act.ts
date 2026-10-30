/**
 * The Options dialog's key list, as the game builds it: `scripts/kb_act.lst` (the engine's
 * COptionsSubKeyboard reads it) is a flat KeyValues list of `"<command>" "<#Token>"` pairs, with
 * `"blank"` rows for the section titles (`"blank" "#Valve_Movement_Title"`) and the `=====` rules
 * between them. The file comes from the game through the HUD base channel (`scripts/tf2-assets/hud.py`:
 * TF2's own copy, and Half-Life 2's as `hl2/scripts/kb_act.lst`); the labels are its `#Token`s,
 * resolved from the game's localisation at run time.
 *
 * A row is shown when its command is one of this game's actions (`commandAction` in console/binds.ts:
 * `+forward`, `slot3`, `voice_menu_1`, …) — a bind there is the same thing as the console's `bind`. A
 * command the game does not have (`+voicerecord`, `callvote`, `save_replay`…) is left out, not faked; a
 * section left empty goes with it. Without the file (nothing published yet) the list is the game's
 * own bindable actions in their default order, labelled by the caller.
 *
 * Rebinding follows Source's `bind`: a key belongs to one action, so binding it takes it off the
 * action that had it (`rebindChecked` says which). Escape and the backquote key are reserved (the
 * menu and the console), as in the console's own `bind`.
 *
 * Environment-agnostic; tested in menus.test.ts.
 */

import { parseKv } from '@/lib/tf2-hud/kv/parse';
import type { HudGame } from '../hud-state';
import { commandAction } from '../../console/binds';
import { bindableActions, FIXED_ACTIONS, rebind, type Action, type Keybinds } from '../input/actions';

/** Where the key list is published (per game: HL2's own file serves Half-Life 2 and Portal). */
export function kbActFile(game: HudGame): string {
  // CS:GO's list is not in the HUD base: its Keyboard tab lists this game's own actions and words.
  return game === 'tf2' ? 'scripts/kb_act.lst' : game === 'csgo' ? 'csgo/scripts/kb_act.lst' : 'hl2/scripts/kb_act.lst';
}

export interface KbActRow {
  kind: 'title' | 'bind';
  /** The command (`+forward`); empty for a title. */
  command: string;
  /** The label: a `#Token`, or plain text. */
  label: string;
}

/** Parses kb_act.lst into its rows, dropping the `=====` rules. Tolerates junk (it is game data). */
export function parseKbAct(text: string): KbActRow[] {
  const doc = parseKv(text);
  const rows: KbActRow[] = [];
  for (const n of doc.roots) {
    if (n.children || !n.value) continue;
    const key = n.key.text.trim();
    const value = n.value.text.trim();
    if (!key || !value) continue;
    if (key.toLowerCase() === 'blank') {
      if (/^=+$/.test(value)) continue;
      rows.push({ kind: 'title', command: '', label: value });
    } else {
      rows.push({ kind: 'bind', command: key, label: value });
    }
    if (rows.length >= 512) break;
  }
  return rows;
}

/** Commands kb_act.lst names that are this game's actions under another spelling. */
const EXTRA_COMMANDS: Readonly<Record<string, Action>> = {
  '+taunt': 'taunt',
  '+helpme': 'medic',
  'voicemenu 0 0': 'medic',
  phys_swap: 'attack2',
};

/** The action a key-list command binds, or null when this game has no such action. */
export function kbCommandAction(command: string, game: HudGame): Action | null {
  const c = command.trim().replace(/\s+/g, ' ').toLowerCase();
  const action = commandAction(c) ?? EXTRA_COMMANDS[c] ?? null;
  if (!action || FIXED_ACTIONS.has(action)) return null;
  return bindableActions(game).includes(action) ? action : null;
}

export type KeyListRow =
  | { kind: 'title'; id: string; label: string }
  | { kind: 'bind'; id: string; action: Action; command: string; label: string | null };

/**
 * The rows the Keyboard tab shows. From the game's list when there is one (titles and labels from it,
 * only rows this game can bind, empty sections dropped); otherwise every bindable action in order with
 * `label: null` (the caller labels it from its own strings).
 */
export function keyListRows(game: HudGame, kbAct: readonly KbActRow[] | null): KeyListRow[] {
  if (!kbAct || !kbAct.some((r) => r.kind === 'bind')) {
    return bindableActions(game).map((a) => ({ kind: 'bind', id: `a:${a}`, action: a, command: a, label: null }));
  }
  const out: KeyListRow[] = [];
  let title: KeyListRow | null = null;
  kbAct.forEach((r, i) => {
    if (r.kind === 'title') {
      title = { kind: 'title', id: `t:${i}`, label: r.label };
      return;
    }
    const action = kbCommandAction(r.command, game);
    if (!action) return;
    if (title) {
      out.push(title);
      title = null;
    }
    out.push({ kind: 'bind', id: `b:${i}`, action, command: r.command, label: r.label });
  });
  return out;
}

/** Codes nothing in the key list can take: Escape opens the menu, the backquote key the console. */
export const RESERVED_CODES: ReadonlySet<string> = new Set(['Escape', 'Backquote']);

export type RebindResult =
  | { ok: true; keybinds: Keybinds; displaced: Action[] }
  | { ok: false; reason: 'reserved' };

/**
 * Binds `code` to `action` as its first key (Source's `bind`), reporting the actions that lose it. A
 * reserved key is refused and the binds are unchanged.
 */
export function rebindChecked(binds: Keybinds, action: Action, code: string): RebindResult {
  if (RESERVED_CODES.has(code)) return { ok: false, reason: 'reserved' };
  const displaced = (Object.entries(binds) as Array<[Action, string[] | undefined]>)
    .filter(([a, keys]) => a !== action && (keys ?? []).includes(code))
    .map(([a]) => a);
  return { ok: true, keybinds: rebind(binds, action, code), displaced };
}
