/**
 * TF2's main menu and its in-game (Esc) menu, built from the game's own files the way
 * CHudMainMenuOverride builds them (game/client/tf/tf_hud_mainmenuoverride.cpp):
 *
 *  - `resource/ui/mainmenuoverride.res` lays out the screen: the background, the logo, the footer and
 *    the buttons it places itself (Items, the options gears, Workshop), plus `button_kv`, the template
 *    of a menu button;
 *  - `resource/gamemenu.res` lists the menu's entries (label, command, sub-image, `OnlyInGame` /
 *    `OnlyAtMenu`). An entry whose name is also a panel of mainmenuoverride.res is placed by that panel
 *    (MMBS_CUSTOM); every other one is a `button_kv` button stacked from (`GetWide() / 2 +
 *    button_x_offset`, `button_y`) down by its height + `button_y_delta` (a spacer: YRES(20)).
 *
 * TF2's own gamemenu.res holds almost nothing (the in-game vote / mute / report buttons, VR): the
 * game's play buttons live in its matchmaking dashboard. So this game's entries — Find a Game, Offline
 * practice, Developer console, Quit; in game Resume, Server, Change team / class, Disconnect — take the
 * `button_kv` template where no file names them; a custom HUD that ships its own gamemenu.res (HUD
 * authors reorder and restyle the menu there) gets its entries matched by command
 * (`menuCommand`). Labels are `#Token`s from the game's localisation (`#MMenu_FindAGame`,
 * `#GameUI_GameMenu_Quit`…) with the caller's own words where the game has no token.
 *
 * Panels of TF2's file this game has nothing behind (ranked, MOTD, notifications, the store, friends,
 * replays, VR…) are hidden. The background is the game's console background (scripts/
 * chapterbackgrounds.txt → `console/background_<map>[_widescreen]`) when the caller has one; the
 * character art (scripts/characterbackgrounds.txt) the same.
 *
 * The scene is the HUD editor's (lib/tf2-hud/scene/build.ts), so the menu lands exactly where the
 * editor previews mainmenuoverride.res; the result also carries hit targets (button rectangles and what
 * each does) for the accessible button layer the UI lays over the canvas. Pure; tested in
 * menus.test.ts.
 */

import { buildScene, imagePath, parseCached, type SceneContext } from '@/lib/tf2-hud/scene/build';
import { activeEntries, propsOf, type Props } from '@/lib/tf2-hud/kv/props';
import { borderOf } from '@/lib/tf2-hud/scheme/scheme';
import type { KvNode } from '@/lib/tf2-hud/kv/types';
import { scaled, screenScale, type Rect, type Screen } from '@/lib/tf2-hud/layout/geometry';
import type { DrawOp, PanelNode, Scene } from '@/lib/tf2-hud/scene/types';
import type { SceneSource } from '../custom-hud/scene';

export const MAIN_MENU_FILE = 'resource/ui/mainmenuoverride.res';
export const GAME_MENU_FILE = 'resource/gamemenu.res';
export const CHAPTER_BACKGROUNDS_FILE = 'scripts/chapterbackgrounds.txt';
export const CHARACTER_BACKGROUNDS_FILE = 'scripts/characterbackgrounds.txt';
/** The template buttons are built in a file of their own (never read from disk). */
export const ENTRY_FILE = 'resource/ui/_rmh_gamemenu_entries.res';

/** Every file the menus read. */
export const GAME_MENU_FILES: readonly string[] = [MAIN_MENU_FILE, GAME_MENU_FILE, CHAPTER_BACKGROUNDS_FILE, CHARACTER_BACKGROUNDS_FILE];

export type MenuCommand =
  | 'find'
  | 'offline'
  | 'loadout'
  | 'options'
  | 'advanced'
  | 'console'
  | 'hud'
  | 'quit'
  | 'resume'
  | 'server'
  | 'team'
  | 'class'
  | 'disconnect'
  /** Back to the HUD editor opened over the match (this game's own). */
  | 'editor';

const COMMANDS: Readonly<Record<string, MenuCommand>> = {
  resumegame: 'resume',
  disconnect: 'disconnect',
  quit: 'quit',
  quitnoconfirm: 'quit',
  'quit prompt': 'quit',
  openserverbrowser: 'find',
  find_game: 'find',
  show_matchmaking: 'find',
  openmatchmakinglobby: 'find',
  openquickplaydialog: 'find',
  quickplay: 'find',
  play_casual: 'find',
  opencreatemultiplayergamedialog: 'offline',
  offlinepractice: 'offline',
  training_showdlg: 'offline',
  open_charinfo: 'loadout',
  open_charinfo_direct: 'loadout',
  openloadout: 'loadout',
  openoptionsdialog: 'options',
  opentf2options: 'advanced',
  toggleconsole: 'console',
  showconsole: 'console',
  opensteamworkshopdialog: 'hud',
  changeteam: 'team',
  changeclass: 'class',
};

/** What a menu button's `command` does here (`engine ` stripped, as the menu passes it on); null otherwise. */
export function menuCommand(raw: string | undefined): MenuCommand | null {
  const c = (raw ?? '').trim().toLowerCase().replace(/^engine\s+/, '').replace(/\s+/g, ' ');
  return COMMANDS[c] ?? null;
}

/** One of this game's menu entries, as the caller offers it right now. */
export interface MenuEntry {
  command: MenuCommand;
  /** The game's `#Token` for its label, if it has one. */
  token?: string;
  /** The caller's own label (used when the localisation has no `token`). */
  text: string;
  /** The `subimage` a template button shows (a `materials/vgui/` name: `glyph_options`). */
  image?: string;
}

export interface GameMenuInput {
  source: SceneSource;
  screen: Screen;
  /** The in-game (Esc) menu: `OnlyInGame` entries, no background. */
  inGame: boolean;
  entries: readonly MenuEntry[];
  /** The target name the pointer / focus is on (its `armed` look). */
  hover?: string | null;
  /** The console background (`../console/background_upward_widescreen`), main menu only. */
  background?: string | null;
  /** The character art (`../console/characters/heavy`), main menu only. */
  character?: string | null;
  /**
   * Draw the screen without its buttons (a phone, where the file's buttons are smaller than a finger:
   * the UI lists the entries itself over the background). No targets.
   */
  compact?: boolean;
  /**
   * Whether a texture is there (`false`: missing, `undefined`: still loading). A button whose
   * scalable-image border texture is missing is drawn as a plain panel in the scheme's tan instead
   * (no imitation of the art), so its label stays readable.
   */
  hasImage?: (path: string) => boolean | undefined;
}

export interface GameMenuTarget {
  /** Stable: the entry / panel name. */
  name: string;
  command: MenuCommand;
  rect: Rect;
  /** The label as the player reads it (resolved), for the accessible layer; '' for icon buttons. */
  label: string;
  /** The button's picture (to tell when it is missing). */
  image?: string;
  /** Placed by mainmenuoverride.res itself (the footer's icon buttons), rather than a list entry. */
  placed: boolean;
}

export interface GameMenuResult {
  scene: Scene;
  targets: GameMenuTarget[];
  /** The list's template button height in pixels (the UI's touch-size check). */
  buttonTall: number;
}

/** TF2's main menu panels this game has nothing behind. */
const HIDDEN = new Set(
  [
    'mouseoveritempanel',
    'rankmodelpanel',
    'cycleranktypebutton',
    'ranktooltippanel',
    'rankpanel',
    'nogcmessage',
    'nogcimage',
    'rankborder',
    'tooltippanel',
    'notifications_showbuttonpanel',
    'watchstreambutton',
    'questlogbutton',
    'motd_showbuttonpanel',
    'motd_panel',
    'notifications_panel',
    'vrbgpanel',
    'vrmodebutton',
    'competitiveaccessinfopanel',
    'friendscontainer',
    'eventpromo',
    'safemode',
    'showpromocodesbutton',
    'reportplayerbutton',
    'callvotebutton',
    'muteplayersbutton',
    'requestcoachbutton',
    'storehasnewitemsimage',
    'generalstorebutton',
    'settingsbuttonsdk',
    'tf2settingsbuttonsdk',
    'newuserforumsbutton',
    'achievementsbutton',
    'commentarybutton',
    'coachplayersbutton',
    'replaybutton',
    'reportbugbutton',
    'backtoreplaysbutton',
    'icon_generator',
  ].map((s) => s.toLowerCase()),
);

interface GameMenuItem {
  name: string;
  label?: string;
  command?: string;
  subimage?: string;
  onlyInGame: boolean;
  onlyAtMenu: boolean;
}

/** gamemenu.res's entries, in order (an entry without a command is a spacer). */
export function parseGameMenu(text: string | undefined, env: SceneSource['env']): GameMenuItem[] {
  if (!text) return [];
  const top = parseCached(text).roots.find((n) => n.children);
  if (!top?.children) return [];
  return activeEntries(top, env)
    .filter((e) => e.children)
    .slice(0, 64)
    .map((e) => {
      const p = propsOf(e, { env });
      return {
        name: e.key.text,
        label: p.get('label'),
        command: p.get('command'),
        subimage: p.get('subimage'),
        onlyInGame: p.bool('onlyingame', false),
        onlyAtMenu: p.bool('onlyatmenu', false),
      };
    });
}

/** `console/background_<map>` names from chapterbackgrounds.txt (its `chapters` block). */
export function parseChapterBackgrounds(text: string | undefined): string[] {
  if (!text) return [];
  const doc = parseCached(text);
  const out: string[] = [];
  for (const root of doc.roots) {
    if (!root.children) continue;
    for (const c of root.children) if (c.value && /^[a-z0-9_]+$/i.test(c.value.text)) out.push(c.value.text);
    if (out.length) break;
  }
  return [...new Set(out)];
}

/** The `image` of each character in characterbackgrounds.txt (`../console/characters/heavy`). */
export function parseCharacterBackgrounds(text: string | undefined): string[] {
  if (!text) return [];
  const top = parseCached(text).roots.find((n) => n.children);
  const out: string[] = [];
  for (const c of top?.children ?? []) {
    if (!c.children) continue;
    const img = c.children.find((x) => x.value && x.key.text.toLowerCase() === 'image')?.value?.text;
    if (img && /^[a-z0-9_./]+$/i.test(img)) out.push(img);
  }
  return out;
}

/**
 * The background image for the screen's shape: the engine draws `console/<name>_widescreen` from 16:10
 * up, `console/<name>` below (CBasePanel's background), as a path ImagePanel resolves under vgui/.
 */
export function backgroundImage(name: string, screen: Screen): string {
  return `../console/${name}${screen.w / Math.max(1, screen.h) >= 1.6 ? '_widescreen' : ''}`;
}

/** The scalar keys of the conditional blocks (`if_wider`) a block holds, for the active conditions. */
function conditionKeys(block: KvNode, env: SceneSource['env'], conditions: ReadonlySet<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of activeEntries(block, env)) {
    if (!c.children || !conditions.has(c.key.text.toLowerCase())) continue;
    for (const kv of activeEntries(c, env)) if (kv.value) out[kv.key.text.toLowerCase()] = kv.value.text;
  }
  return out;
}

/** A block's child block by name. */
const childBlock = (block: KvNode, env: SceneSource['env'], name: string): KvNode | undefined =>
  activeEntries(block, env).find((c) => c.children && c.key.text.toLowerCase() === name.toLowerCase());

/** What an armed (hovered / focused) button paints with, from its own `*_armed` keys. */
function armedOverrides(p: Props): Record<string, string> {
  const out: Record<string, string> = {};
  const fg = p.get('armedfgcolor_override');
  const bg = p.get('armedbgcolor_override');
  const border = p.get('border_armed');
  if (fg) {
    out.defaultfgcolor_override = fg;
    out.fgcolor_override = fg;
  }
  if (bg) {
    out.defaultbgcolor_override = bg;
    out.bgcolor_override = bg;
  }
  if (border) out.border = border;
  return out;
}

const shiftRect = (r: Rect, dx: number, dy: number): Rect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });

function shiftNode(n: PanelNode, dx: number, dy: number): PanelNode {
  return {
    ...n,
    rect: shiftRect(n.rect, dx, dy),
    clip: n.clip ? shiftRect(n.clip, dx, dy) : undefined,
    ops: n.ops.map((o) => ({ ...o, rect: shiftRect(o.rect, dx, dy) }) as DrawOp),
  };
}

const kvQuote = (s: string) => `"${s.replace(/["\\\r\n]/g, ' ')}"`;

/** Builds the menu, or null when the HUD has no mainmenuoverride.res (the UI falls back to its own list). */
export function buildGameMenu(input: GameMenuInput): GameMenuResult | null {
  const src = input.source;
  const env = src.env;
  const text = src.readText(MAIN_MENU_FILE);
  if (text === undefined) return null;
  const top = parseCached(text).roots.find((n) => n.children);
  const blocks = top?.children ? activeEntries(top, env).filter((e) => e.children) : [];
  const frameEntry = blocks[0];
  if (!top || !frameEntry) return null;
  const frameProps = propsOf(frameEntry, { env });
  const buttonKv = childBlock(frameEntry, env, 'button_kv');
  const byName = new Map(blocks.map((b) => [b.key.text.toLowerCase(), b] as const));
  const scale = screenScale(input.screen);
  const conditions = new Set([input.screen.w / Math.max(1, input.screen.h) >= 1.6 ? 'if_wider' : 'if_taller']);
  const resolve = (e: MenuEntry): string => (e.token && src.strings.has(e.token.slice(1).toLowerCase()) ? e.token : e.text);
  const display = (label: string): string =>
    label.startsWith('#') ? (src.strings.get(label.slice(1).toLowerCase()) ?? label.slice(1)) : label;
  const wanted = new Map(input.entries.map((e) => [e.command, e] as const));

  // 1. gamemenu.res, in its order: the entries this game has (by command), and spacers.
  type Item = { spacer: true } | { spacer: false; name: string; entry: MenuEntry; label: string; image?: string; custom: boolean };
  const items: Item[] = [];
  const used = new Set<MenuCommand>();
  const dropped = new Set<string>();
  for (const g of parseGameMenu(src.readText(GAME_MENU_FILE), env)) {
    if (!g.command) {
      items.push({ spacer: true });
      continue;
    }
    const cmd = menuCommand(g.command);
    const entry = cmd ? wanted.get(cmd) : undefined;
    const shownHere = !(g.onlyInGame && !input.inGame) && !(g.onlyAtMenu && input.inGame);
    if (!cmd || !entry || used.has(cmd) || !shownHere) {
      dropped.add(g.name.toLowerCase());
      continue;
    }
    used.add(cmd);
    const label = g.label && (!g.label.startsWith('#') || src.strings.has(g.label.slice(1).toLowerCase())) ? g.label : resolve(entry);
    items.push({ spacer: false, name: g.name, entry, label, image: g.subimage || entry.image, custom: byName.has(g.name.toLowerCase()) });
  }

  // 2. Buttons mainmenuoverride.res places itself with a command this game has (Items, the gears, Workshop).
  const compactHidden = new Set<string>();
  const gateMain = (name: string): boolean | undefined => {
    const n = name.toLowerCase();
    if (HIDDEN.has(n) || dropped.has(n) || compactHidden.has(n)) return false;
    if (n === 'background') return !input.inGame && !!input.background;
    if (n === 'tfcharacterimage') return !input.inGame && !!input.character;
    return undefined;
  };
  const placed = new Map<string, MenuCommand>();
  for (const b of blocks.slice(1)) {
    const name = b.key.text.toLowerCase();
    if (gateMain(name) === false || items.some((i) => !i.spacer && i.name.toLowerCase() === name)) continue;
    const p = propsOf(b, { env });
    if (!p.bool('visible', true)) continue;
    const cmd = menuCommand(p.get('command'));
    if (cmd && wanted.has(cmd) && !used.has(cmd)) {
      placed.set(name, cmd);
      used.add(cmd);
    }
  }

  // 3. The rest of this game's entries, in the caller's order, as template buttons.
  for (const e of input.entries) {
    if (used.has(e.command)) continue;
    used.add(e.command);
    items.push({ spacer: false, name: `RmhMenu_${e.command}`, entry: e, label: resolve(e), image: e.image, custom: false });
  }
  // No spacer at either end or twice in a row.
  let list = items.filter((it, i, all) => !it.spacer || (i > 0 && i < all.length - 1 && !all[i - 1].spacer));
  if (input.compact) {
    for (const it of list) if (!it.spacer && it.custom) compactHidden.add(it.name.toLowerCase());
    for (const name of placed.keys()) compactHidden.add(name);
    placed.clear();
    list = [];
  }

  // The template buttons' file: a full-screen frame and one block per entry at (0, 0), moved below.
  const templates = list.filter((i): i is Extract<Item, { spacer: false }> => !i.spacer && !i.custom);
  const inner = buttonKv?.open && buttonKv.close ? text.slice(buttonKv.open.end, buttonKv.close.start) : '';
  const entryText = [
    '"Resource/UI/_RmhGameMenuEntries.res"',
    '{',
    '  "RmhGameMenuFrame" { "ControlName" "EditablePanel" "fieldName" "RmhGameMenuFrame" "xpos" "0" "ypos" "0" "wide" "f0" "tall" "f0" }',
    ...templates.map((t) => `  ${kvQuote(t.name)} { "ControlName" "EditablePanel" "xpos" "0" "ypos" "0" ${inner} }`),
    '}',
  ].join('\n');
  const readText = (p: string) => (p === ENTRY_FILE ? entryText : src.readText(p));

  const hover = input.hover?.toLowerCase() ?? null;
  const subButtonOf = (file: string, name: string): Props | undefined => {
    const host = file === ENTRY_FILE ? buttonKv : byName.get(name.toLowerCase());
    const sb = host ? childBlock(host, env, 'SubButton') : undefined;
    return sb ? propsOf(sb, { env }) : host && file !== ENTRY_FILE ? propsOf(host, { env }) : undefined;
  };
  const itemByName = new Map(list.flatMap((i) => (i.spacer ? [] : [[i.name.toLowerCase(), i] as const])));

  const ctx: SceneContext = {
    readText,
    scheme: src.scheme,
    env,
    screen: input.screen,
    minmode: src.minmode,
    showHidden: false,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: new Map(),
    strings: src.strings,
    progress: 0,
    gate: (file, name) => (file === MAIN_MENU_FILE ? gateMain(name) : undefined),
    overridesFor: (file, keyPath) => {
      if (file !== MAIN_MENU_FILE && file !== ENTRY_FILE) return undefined;
      const [, owner = '', child = '', grandchild = ''] = keyPath;
      const ownerKey = owner.toLowerCase();
      const out: Record<string, string> = {};
      if (file === MAIN_MENU_FILE && keyPath.length >= 2) {
        // The aspect conditions (`if_wider` / `if_taller`) of the block itself.
        const block = byName.get(ownerKey);
        let node = block;
        for (const k of keyPath.slice(2)) node = node ? childBlock(node, env, k) : undefined;
        if (node) Object.assign(out, conditionKeys(node, env, conditions));
        if (keyPath.length === 2 && ownerKey === 'background' && input.background) out.image = input.background;
        if (keyPath.length === 2 && ownerKey === 'tfcharacterimage' && input.character) out.image = input.character;
      }
      const item = itemByName.get(ownerKey);
      const placedCmd = file === MAIN_MENU_FILE ? placed.get(ownerKey) : undefined;
      if (!item && !placedCmd) return Object.keys(out).length ? out : undefined;
      const armed = hover === ownerKey;
      const buttonProps = subButtonOf(file, owner);
      const isSubButton = child.toLowerCase() === 'subbutton' && keyPath.length === 3;
      const isOwnButton = keyPath.length === 2 && !!placedCmd;
      const isSubImage =
        (child.toLowerCase() === 'subbutton' && grandchild.toLowerCase() === 'subimage' && keyPath.length === 4) ||
        (!!placedCmd && child.toLowerCase() === 'subimage' && keyPath.length === 3);
      if (isSubButton && item) out.labeltext = item.label;
      if ((isSubButton || isOwnButton) && armed && buttonProps) Object.assign(out, armedOverrides(buttonProps));
      if ((isSubButton || isOwnButton) && buttonProps && input.hasImage) {
        const name = out.border ?? buttonProps.get('border') ?? buttonProps.get('border_default');
        const art = borderOf(src.scheme, name)?.image;
        if (art && input.hasImage(imagePath(art.name)) === false) {
          out.border = '';
          out.paintbackground = '1';
          out.defaultbgcolor_override = armed ? 'TanDark' : 'TanLight';
        }
      }
      if (isSubImage) {
        if (item?.image) out.image = item.image;
        const tint = buttonProps?.get(armed ? 'image_armedcolor' : 'image_drawcolor');
        if (tint) out.drawcolor = tint;
      }
      return Object.keys(out).length ? out : undefined;
    },
  };
  const built = buildScene(ctx, [MAIN_MENU_FILE, ENTRY_FILE]);

  // Stack the template buttons as PerformLayout does (custom buttons keep their place and take no row).
  const kvTall = buttonKv ? propsOf(buttonKv, { env }).num('tall', 26) : 26;
  const tallPx = scaled(kvTall, scale);
  const offsets = new Map<string, { dx: number; dy: number }>();
  let y = scaled(frameProps.num('button_y', 0), scale);
  const x = Math.trunc(input.screen.w * 0.5 + scaled(frameProps.num('button_x_offset', 0), scale));
  for (const it of list) {
    if (it.spacer) {
      y += scaled(20, scale);
      continue;
    }
    if (it.custom) continue;
    offsets.set(it.name.toLowerCase(), { dx: x, dy: y });
    y += tallPx + scaled(frameProps.num('button_y_delta', 0), scale);
  }
  const nodes = built.nodes.map((n) => {
    if (n.file !== ENTRY_FILE || n.isFrame) return n;
    const o = offsets.get((n.keyPath[1] ?? '').toLowerCase());
    return o ? shiftNode(n, o.dx, o.dy) : n;
  });

  // Hit targets: each entry's SubButton (or the placed panel itself when it is the button).
  const targets: GameMenuTarget[] = [];
  const nodeAt = (file: string, path: string[]) =>
    nodes.find((n) => n.file === file && n.shown && n.keyPath.length === path.length && n.keyPath.every((k, i) => i === 0 || k.toLowerCase() === path[i].toLowerCase()));
  for (const it of list) {
    if (it.spacer) continue;
    const file = it.custom ? MAIN_MENU_FILE : ENTRY_FILE;
    const node = nodeAt(file, ['', it.name, 'SubButton']) ?? nodeAt(file, ['', it.name]);
    if (!node || node.rect.w <= 0 || node.rect.h <= 0) continue;
    targets.push({
      name: it.name,
      command: it.entry.command,
      rect: node.rect,
      label: display(it.label),
      image: it.image ? imagePath(it.image) : undefined,
      placed: false,
    });
  }
  for (const [name, command] of placed) {
    const node = nodeAt(MAIN_MENU_FILE, ['', name]);
    if (!node || node.rect.w <= 0 || node.rect.h <= 0) continue;
    const p = byName.get(name) ? propsOf(byName.get(name)!, { env }) : undefined;
    const label = p?.get('labeltext') ?? '';
    const sub = byName.get(name) ? childBlock(byName.get(name)!, env, 'SubImage') : undefined;
    const subImage = sub ? propsOf(sub, { env }).get('image') : undefined;
    targets.push({
      name: byName.get(name)!.key.text,
      command,
      rect: node.rect,
      label: label ? display(label) : '',
      image: subImage ? imagePath(subImage) : undefined,
      placed: true,
    });
  }
  return { scene: { ...built, nodes }, targets, buttonTall: tallPx };
}
