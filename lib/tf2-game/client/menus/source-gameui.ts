/**
 * The classic Source GameUI main menu of Half-Life 2 and Portal, from the game's own files (the
 * `<game>-menu` channel, scripts/tf2-game/menu_ui.py): `resource/gamemenu.res` lists the entries
 * (label, command, `OnlyInGame` / `notsingle` / `ConsoleOnly`), `gameinfo.txt` names the game
 * (`title`, `title2`, drawn in the scheme's `ClientTitleFont`), `scripts/chapterbackgrounds.txt` the
 * console backgrounds, and the schemes (`sourcescheme.res`, `clientscheme.res`) the colours and fonts of
 * the menu and its dialogs (`MainMenu.TextColor`, `Frame.BgColor`…). Pure; tested in menus.test.ts.
 */

import { parseKv } from '@/lib/tf2-hud/kv/parse';
import type { KvNode } from '@/lib/tf2-hud/kv/types';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';
import { EMPTY_SCHEME, parseScheme, resolveColor, rgbaCss, type Scheme } from '@/lib/tf2-hud/scheme/scheme';
import { fetchGameJson, gameAssetUrl } from '../../assets/urls';
import type { GameId } from '../../assets/versions';

/** `menu/index.json` (menu_ui.py): install paths -> published files. */
export interface MenuChannelIndex {
  v: number;
  game: GameId;
  /** `files/<sha>.json`: `{ path: text }` of the menu's text files. */
  files: string | null;
  lang: Record<string, string>;
  images: Record<string, string>;
  icons: Record<string, string>;
  fonts: Record<string, string>;
  video: { path: string; file: string } | null;
}

export interface MenuChannel {
  index: MenuChannelIndex;
  files: Record<string, string>;
  /** Lower-case token -> text, the site's language over English. */
  tokens: Map<string, string>;
  game: GameId;
}

/** A published file of the channel, by its `menu/…` path. */
export const menuAssetUrl = (rel: string, game: GameId): string => gameAssetUrl(`menu/${rel}`, game);

/** The channel's index, text files and words (null before the channel is published). */
export async function loadMenuChannel(game: GameId, language = 'english'): Promise<MenuChannel | null> {
  const index = await fetchGameJson<MenuChannelIndex>('menu/index.json', game).catch(() => null);
  if (!index) return null;
  const [files, english, local] = await Promise.all([
    index.files ? fetchGameJson<Record<string, string>>(`menu/${index.files}`, game).catch(() => null) : null,
    index.lang.english ? fetchGameJson<{ tokens: Record<string, string> }>(`menu/${index.lang.english}`, game).catch(() => null) : null,
    language !== 'english' && index.lang[language]
      ? fetchGameJson<{ tokens: Record<string, string> }>(`menu/${index.lang[language]}`, game).catch(() => null)
      : null,
  ]);
  const tokens = new Map<string, string>(Object.entries({ ...(english?.tokens ?? {}), ...(local?.tokens ?? {}) }));
  return { index, files: files ?? {}, tokens, game };
}

/** A `#Token` (or plain text) in the channel's words, else `fallback`. */
export function menuText(channel: MenuChannel | null, raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('#')) return raw;
  return channel?.tokens.get(raw.slice(1).toLowerCase()) ?? fallback;
}

// ─── gamemenu.res ─────────────────────────────────────────────────────────────────────────────

/** What this game does for a GameUI command (anything else is hidden). */
export type SourceMenuAction = 'resume' | 'newgame' | 'loadgame' | 'options' | 'quit';

const COMMANDS: Record<string, SourceMenuAction> = {
  resumegame: 'resume',
  opennewgamedialog: 'newgame',
  openloadgamedialog: 'loadgame',
  openoptionsdialog: 'options',
  quit: 'quit',
  quitnoconfirm: 'quit',
};

export interface SourceMenuEntry {
  label: string;
  action: SourceMenuAction;
  onlyInGame: boolean;
}

const lower = (s: string) => s.toLowerCase();
const truthy = (v: string | undefined) => v !== undefined && v !== '0' && v !== '';

function valuesOf(node: KvNode): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of node.children ?? []) if (c.value) out.set(lower(c.key.text), c.value.text);
  return out;
}

/**
 * The entries of gamemenu.res in the file's order, those this game can do (New Game, Load Game,
 * Options, Quit; Resume in game), skipping multiplayer-only and console-only ones.
 */
export function parseGameMenu(text: string | undefined): SourceMenuEntry[] {
  if (!text) return [];
  const root = parseKv(text).roots.find((n) => n.children);
  const out: SourceMenuEntry[] = [];
  for (const node of root?.children ?? []) {
    if (!node.children) continue;
    const v = valuesOf(node);
    const action = COMMANDS[lower(v.get('command') ?? '')];
    if (!action) continue;
    if (truthy(v.get('notsingle')) || truthy(v.get('consoleonly'))) continue;
    out.push({ label: v.get('label') ?? '', action, onlyInGame: truthy(v.get('onlyingame')) });
  }
  return out;
}

// ─── gameinfo.txt ─────────────────────────────────────────────────────────────────────────────

/** The game's `title` and `title2` (the menu's logo text), when it names them. */
export function parseGameTitle(text: string | undefined): { title: string; title2: string } | null {
  if (!text) return null;
  const root = parseKv(text).roots.find((n) => n.children);
  const v = root ? valuesOf(root) : new Map<string, string>();
  const title = v.get('title') ?? '';
  return title ? { title, title2: v.get('title2') ?? '' } : null;
}

// ─── backgrounds ──────────────────────────────────────────────────────────────────────────────

/** `scripts/chapterbackgrounds.txt`'s names in order (`background01`…). */
export function parseChapterList(text: string | undefined): string[] {
  if (!text) return [];
  const root = parseKv(text).roots.find((n) => n.children);
  return (root?.children ?? []).filter((c) => c.value && /^[a-z0-9_]+$/i.test(c.value.text)).map((c) => c.value!.text);
}

/**
 * The console background for the chapter reached (GameUI shows the last chapter's), in the screen's
 * shape: `console/<name>_widescreen` from 16:10 up where published, else `console/<name>`.
 */
export function backgroundFor(channel: MenuChannel, chapter: number, aspect: number): string | null {
  const names = parseChapterList(channel.files['scripts/chapterbackgrounds.txt']);
  const images = channel.index.images;
  const list = names.length ? names : Object.keys(images).filter((k) => /^console\/background\w*$/.test(k) && !k.endsWith('_widescreen')).map((k) => k.slice(8));
  const name = list[Math.max(0, Math.min(list.length - 1, chapter))];
  if (!name) return null;
  const wide = images[`console/${name}_widescreen`];
  const narrow = images[`console/${name}`];
  return (aspect >= 1.6 ? wide ?? narrow : narrow ?? wide) ?? null;
}

// ─── schemes ──────────────────────────────────────────────────────────────────────────────────

export interface GameUiStyle {
  /** CSS custom properties for the menu and its dialogs. */
  vars: Record<string, string>;
  /** Scheme font name -> family, size (px at 480 lines) and weight. */
  titleFont: { family: string; tall: number; weight: number } | null;
  menuFont: { family: string; tall: number; weight: number } | null;
  /** Font files to register: family -> `font/<sha>.ttf`. */
  fontFiles: Array<{ family: string; file: string }>;
}

function schemeOf(text: string | undefined): Scheme {
  return text ? parseScheme(text, PC_ENV) : EMPTY_SCHEME;
}

/** The first of `names` the schemes define, as CSS (client scheme over source scheme). */
function colorCss(schemes: Scheme[], names: string[], fallback: string): string {
  for (const n of names)
    for (const s of schemes) {
      const c = resolveColor(s, s.base.get(lower(n)) ?? s.colors.get(lower(n)));
      if (c) return rgbaCss(c);
    }
  return fallback;
}

function fontOf(schemes: Scheme[], name: string): { family: string; tall: number; weight: number } | null {
  for (const s of schemes) {
    const defs = s.fonts.get(lower(name));
    const d = defs?.find((f) => !f.yres || (f.yres[0] <= 480 && f.yres[1] >= 480)) ?? defs?.[0];
    if (d) return { family: d.name, tall: d.tall, weight: d.weight };
  }
  return null;
}

/** The menu's colours and fonts from the game's schemes (Source's defaults where a scheme is silent). */
export function gameUiStyle(channel: MenuChannel): GameUiStyle {
  const client = schemeOf(channel.files['resource/clientscheme.res']);
  const source = schemeOf(channel.files['resource/sourcescheme.res']);
  const both = [client, source];
  const vars: Record<string, string> = {
    '--gui-menu-text': colorCss(both, ['MainMenu.TextColor'], 'rgba(255,255,255,0.86)'),
    '--gui-menu-armed': colorCss(both, ['MainMenu.ArmedTextColor'], 'rgba(255,255,255,1)'),
    '--gui-menu-depressed': colorCss(both, ['MainMenu.DepressedTextColor'], 'rgba(192,192,192,1)'),
    '--gui-frame-bg': colorCss([source], ['Frame.BgColor'], 'rgba(46,43,42,0.94)'),
    '--gui-frame-title': colorCss([source], ['FrameTitleBar.TextColor', 'Frame.TitleTextInsetX'], 'rgba(255,255,255,0.9)'),
    '--gui-text': colorCss([source], ['Label.TextColor', 'FgColor'], 'rgba(216,222,211,1)'),
    '--gui-text-dim': colorCss([source], ['Label.DisabledFgColor2', 'DisabledFgColor2'], 'rgba(160,160,160,1)'),
    '--gui-button-bg': colorCss([source], ['Button.BgColor'], 'rgba(76,88,68,1)'),
    '--gui-button-text': colorCss([source], ['Button.TextColor'], 'rgba(216,222,211,1)'),
    '--gui-button-armed-bg': colorCss([source], ['Button.ArmedBgColor'], 'rgba(76,88,68,1)'),
    '--gui-button-armed-text': colorCss([source], ['Button.ArmedTextColor'], 'rgba(196,181,80,1)'),
    '--gui-border-bright': colorCss([source], ['Border.Bright'], 'rgba(136,145,128,1)'),
    '--gui-border-dark': colorCss([source], ['Border.Dark'], 'rgba(40,46,34,1)'),
    '--gui-selection': colorCss([source], ['ListPanel.SelectedBgColor', 'SelectionBG'], 'rgba(149,136,49,1)'),
    '--gui-field-bg': colorCss([source], ['TextEntry.BgColor'], 'rgba(62,70,55,1)'),
  };
  const fontFiles: GameUiStyle['fontFiles'] = [];
  // The schemes name their font files (CustomFontFiles) without the family each holds; the family
  // is the font the scheme's text uses whose file the channel published, matched by file name.
  const families = new Set<string>();
  for (const s of both) for (const defs of s.fonts.values()) for (const d of defs) families.add(d.name);
  for (const [path, file] of Object.entries(channel.index.fonts)) {
    const stem = path.split('/').pop()!.replace(/\.(ttf|otf)$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const family of families)
      if (family.toLowerCase().replace(/[^a-z0-9]/g, '') === stem) fontFiles.push({ family, file });
  }
  return {
    vars,
    titleFont: fontOf(both, 'ClientTitleFont'),
    menuFont: fontOf(both, 'MenuLarge'),
    fontFiles,
  };
}
