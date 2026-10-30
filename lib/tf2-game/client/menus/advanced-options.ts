/**
 * TF2's Advanced Options: the game's `cfg/user_default.scr`, the option script CTFAdvancedOptionsDialog
 * reads (game/client/tf/vgui/tf_controls.cpp: CScriptObject entries — a cvar, a `#Token` prompt and
 * tooltip, a type, a default). Published with the HUD base; parsed here, and shown by the Options
 * dialog's Multiplayer tab under Advanced:
 *
 *   "cl_autoreload" { "#TF_autoreload" "#Tooltip_autoreload" { BOOL } { "0" } }
 *   "tf_dingaling_volume" { "#TF_Dingaling_Volume" "#Tooltip_Dingaling_Volume" { SLIDER 0 1 } { "0.75" } }
 *   "category2" { "#TF_OptionCategory_Combat" { CATEGORY } }
 *
 * Only entries whose cvar this game has are shown — the settings-backed cvars (so the dialog, the
 * console and config.cfg stay one value) and the console's fixed ones; everything else (Steam,
 * replays, MvM, the items it does not simulate) is left out rather than faked, and a category with
 * nothing left goes with it.
 *
 * Environment-agnostic; tested in menus.test.ts.
 */

export const USER_SCR_FILE = 'cfg/user_default.scr';

export type ScrType = 'bool' | 'number' | 'string' | 'list' | 'slider' | 'button' | 'category';

export interface ScrItem {
  cvar: string;
  type: ScrType;
  /** `#Token` (or text). */
  prompt: string;
  tooltip?: string;
  min?: number;
  max?: number;
  /** LIST: label → value. */
  items?: Array<{ label: string; value: string }>;
  default?: string;
}

/** Splits the script into quoted strings, braces and bare words; `//` comments are dropped. */
function tokenize(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n && out.length < 50_000) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '{' || c === '}') {
      out.push(c);
      i++;
      continue;
    }
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      const stop = end < 0 ? n : end;
      out.push(text.slice(i + 1, stop));
      i = stop + 1;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !/[\s{}"]/.test(text[j])) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

const TYPES: Readonly<Record<string, ScrType>> = {
  bool: 'bool',
  number: 'number',
  string: 'string',
  list: 'list',
  slider: 'slider',
  button: 'button',
  category: 'category',
};

/** The entries of the script's `DESCRIPTION` block, in order. Malformed entries are skipped. */
export function parseUserScr(text: string): ScrItem[] {
  const t = tokenize(text);
  let i = t.findIndex((x) => x.toUpperCase() === 'DESCRIPTION');
  if (i < 0) return [];
  while (i < t.length && t[i] !== '{') i++;
  i++;
  const items: ScrItem[] = [];
  /** Index after the `}` matching the `{` at `at`. */
  const skip = (at: number): number => {
    let depth = 0;
    for (let k = at; k < t.length; k++) {
      if (t[k] === '{') depth++;
      else if (t[k] === '}' && --depth === 0) return k + 1;
    }
    return t.length;
  };
  while (i < t.length && t[i] !== '}') {
    const cvar = t[i];
    if (t[i + 1] !== '{') {
      i++;
      continue;
    }
    const end = skip(i + 1);
    const body = t.slice(i + 2, end - 1);
    i = end;
    // prompt [tooltip] { TYPE args… } [{ default }]
    const strings: string[] = [];
    let k = 0;
    while (k < body.length && body[k] !== '{') strings.push(body[k++]);
    if (body[k] !== '{') continue;
    const typeEnd = body.indexOf('}', k);
    if (typeEnd < 0) continue;
    const spec = body.slice(k + 1, typeEnd);
    const type = TYPES[(spec[0] ?? '').toLowerCase()];
    if (!type || !strings[0]) continue;
    const item: ScrItem = { cvar, type, prompt: strings[0] };
    if (strings[1]) item.tooltip = strings[1];
    if (type === 'slider' || type === 'number') {
      const lo = Number(spec[1]);
      const hi = Number(spec[2]);
      if (Number.isFinite(lo) && Number.isFinite(hi) && !(lo === -1 && hi === -1)) {
        item.min = lo;
        item.max = hi;
      }
    } else if (type === 'list') {
      item.items = [];
      for (let p = 1; p + 1 < spec.length; p += 2) item.items.push({ label: spec[p], value: spec[p + 1] });
    }
    const def = body.indexOf('{', typeEnd);
    if (def >= 0 && body[def + 1] !== undefined && body[def + 1] !== '}') item.default = body[def + 1];
    items.push(item);
    if (items.length >= 1000) break;
  }
  return items;
}

export interface AdvancedGroup {
  /** The category's prompt (`#TF_OptionCategory_Combat`), or null for entries before any category. */
  title: string | null;
  items: ScrItem[];
}

/**
 * The categories and entries the dialog shows: entries whose cvar `has` accepts (and whose type the
 * dialog draws), grouped under their category; empty categories dropped. Buttons (`open_chat_filter_…`)
 * open Steam dialogs this game does not have and are never shown.
 */
export function advancedGroups(items: readonly ScrItem[], has: (cvar: string) => boolean): AdvancedGroup[] {
  const out: AdvancedGroup[] = [];
  let cur: AdvancedGroup = { title: null, items: [] };
  const flush = () => {
    if (cur.items.length) out.push(cur);
  };
  for (const it of items) {
    if (it.type === 'category') {
      flush();
      cur = { title: it.prompt, items: [] };
      continue;
    }
    if (it.type === 'button' || it.type === 'string' || !has(it.cvar)) continue;
    cur.items.push(it);
  }
  flush();
  return out;
}
