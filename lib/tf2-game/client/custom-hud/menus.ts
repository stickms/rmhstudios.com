/**
 * The menus a custom HUD restyles — the scoreboard (`scoreboard.res`), team
 * select (`teammenu.res`) and class select (`classselection.res`) — and the
 * spectator GUI (`spectator.res`, plus the spectated player's target ID).
 *
 * As in TF2, a HUD that ships its own copy of one of these files gets its
 * menu drawn from it; any other HUD keeps the game's own menus. The panels
 * are built by the HUD editor's scene builder (lib/tf2-hud/scene/build.ts), so
 * positions, sizes, fonts, colours, images and labels are exactly what the
 * editor previews for that file; this module adds what TF2's code adds at run
 * time: the live numbers (`%variables%`), what each panel shows for this
 * player (`gate`), the scoreboard's player rows (`SectionedListPanel` is
 * filled by the game), the hovered button's armed look, and the buttons'
 * commands — returned as hit targets for the accessible layer the UI puts
 * over the canvas.
 *
 * Menus open rarely and briefly, so a menu is rebuilt whenever its inputs
 * change (a few ms for the scoreboard's ~150 panels) rather than cached per
 * panel like the HUD (scene.ts). Pure: tested in custom-hud.test.ts.
 */

import { buildScene, imagePath, parseCached, type SceneContext } from '@/lib/tf2-hud/scene/build';
import type { ImageOp, PanelNode, Scene, TextOp } from '@/lib/tf2-hud/scene/types';
import { activeEntries, propsFromMap, propsOf, type Props } from '@/lib/tf2-hud/kv/props';
import type { KvNode } from '@/lib/tf2-hud/kv/types';
import { screenScale, type Rect, type Screen } from '@/lib/tf2-hud/layout/geometry';
import { pickFont, resolveColor, type Rgba } from '@/lib/tf2-hud/scheme/scheme';
import { armedStyle } from '@/lib/tf2-hud/play/style';
import type { Overlay } from '@/lib/tf2-hud/project/types';
import { CLASS_NAMES, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import type { ClassChoice, TeamChoice } from '../../net/events';
import { formatClock, type HudScoreRow, type HudState } from '../hud-state';
import { CLASS_ID, teamOf } from './adapter';
import type { SceneSource } from './scene';

const ui = (name: string) => `resource/ui/${name}.res`;

export type HudMenuKind = 'scoreboard' | 'team' | 'class';

/** The file each menu is drawn from. */
export const MENU_FILES: Readonly<Record<HudMenuKind, string>> = {
  scoreboard: ui('scoreboard'),
  team: ui('teammenu'),
  class: ui('classselection'),
};

export const SPECTATOR_FILE = ui('spectator');
const TARGET_ID_FILE = ui('targetid');
/**
 * The spectated player's target ID: TF2's `CSpectatorTargetID` loads `TargetID.res` and is placed by its
 * own `hudlayout.res` block. The scene builder places a file by the layout block named like the file, so
 * the target ID is read under that block's name (`readMenuText`).
 */
export const SPECTATOR_TARGET_FILE = ui('cspectatortargetid');

/** Every file the menus read (loaded with the HUD, so a menu opens without a fetch). */
export const MENU_SOURCE_FILES: readonly string[] = [
  ...Object.values(MENU_FILES),
  SPECTATOR_FILE,
  TARGET_ID_FILE,
];

/** `readText` with the virtual files the menus use. */
export function readMenuText(readText: (path: string) => string | undefined) {
  return (path: string): string | undefined =>
    path === SPECTATOR_TARGET_FILE ? readText(TARGET_ID_FILE) : readText(path);
}

/** Which menus (and whether the spectator GUI) a HUD restyles: those whose file it ships. */
export function customisedMenus(overlay: Overlay): {
  menus: ReadonlySet<HudMenuKind>;
  spectator: boolean;
} {
  const menus = new Set<HudMenuKind>();
  for (const [kind, file] of Object.entries(MENU_FILES) as [HudMenuKind, string][]) {
    if (overlay.get(file)) menus.add(kind);
  }
  return { menus, spectator: !!overlay.get(SPECTATOR_FILE) };
}

/* ───────────────────────── strings ───────────────────────── */

/** A `#Token` with `%s1`… filled in, or `fallback` when no localisation defines it. */
export function localize(
  strings: ReadonlyMap<string, string>,
  token: string,
  fallback: string,
  ...args: (string | number)[]
): string {
  let text = strings.get(token.toLowerCase()) ?? fallback;
  args.forEach((a, i) => {
    text = text.split(`%s${i + 1}`).join(String(a));
  });
  return text;
}

/* ───────────────────────── commands ───────────────────────── */

export type MenuAction =
  | { kind: 'team'; team: TeamChoice }
  | { kind: 'class'; cls: ClassChoice }
  | { kind: 'close' }
  | { kind: 'loadout' };

const CLOSE = new Set(['close', 'cancel', 'vguicancel', 'cancelmenu', 'back']);

/** What a menu button's `command` does in this game; null for commands it has no meaning for. */
export function menuAction(raw: string | undefined): MenuAction | null {
  const [cmd = '', arg = ''] = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^engine\s+/, '')
    .split(/\s+/);
  if (CLOSE.has(cmd)) return { kind: 'close' };
  if (cmd === 'jointeam') {
    if (arg === 'blue' || arg === 'red' || arg === 'auto') return { kind: 'team', team: arg };
    if (arg === 'spectate' || arg === 'spectator') return { kind: 'team', team: 'spectator' };
    return null;
  }
  // `select N` (the class menu: ETFClass numbers, 12 = random) and `joinclass <name>`.
  if (cmd === 'select') {
    const n = Number(arg);
    if (n === 12) return { kind: 'class', cls: 'random' };
    const name = CLASS_NAMES[n];
    return name ? { kind: 'class', cls: name } : null;
  }
  if (cmd === 'joinclass' || cmd === 'join_class') {
    const name = arg === 'heavyweapons' ? 'heavy' : arg;
    if (name === 'random' || (CLASS_NAMES as readonly string[]).includes(name))
      return { kind: 'class', cls: name as ClassChoice };
    return null;
  }
  if (cmd === 'openloadout' || cmd === 'open_charinfo') return { kind: 'loadout' };
  return null;
}

/* ───────────────────────── building ───────────────────────── */

export interface MenuTarget {
  /** The button's panel id in the scene. */
  id: string;
  /** Its block name in the file. */
  name: string;
  rect: Rect;
  action: MenuAction;
  /** The number key that picks it (the menus' 1–9 / 1–4), if any. */
  hotkey?: number;
  /** The team or class the player is on now. */
  current: boolean;
  /** Its image (to tell when it is missing: the UI then labels the button). */
  image?: string;
}

export interface MenuInput {
  kind: HudMenuKind;
  state: HudState;
  source: SceneSource;
  screen: Screen;
  /** The block name of the button under the pointer / with focus. */
  hover?: string | null;
  /** The class menu's team (the player's, or RED before they have one). */
  team?: number;
}

export interface MenuResult {
  scene: Scene;
  targets: MenuTarget[];
}

const TEAM_HOTKEY: Readonly<Record<TeamChoice, number>> = {
  blue: 1,
  red: 2,
  auto: 3,
  spectator: 4,
};
/** Class menu keys 1–9 in menu order (scout, soldier, pyro, demoman, heavy, engineer, medic, sniper, spy). */
const CLASS_HOTKEY: Readonly<Record<string, number>> = {
  scout: 1,
  soldier: 2,
  pyro: 3,
  demoman: 4,
  heavy: 5,
  engineer: 6,
  medic: 7,
  sniper: 8,
  spy: 9,
  random: 0,
};
/** `class_sel_sm_<name>_*` texture names. */
const CLASS_SEL: Readonly<Record<string, string>> = {
  scout: 'scout',
  soldier: 'soldier',
  pyro: 'pyro',
  demoman: 'demo',
  heavy: 'heavy',
  engineer: 'engineer',
  medic: 'medic',
  sniper: 'sniper',
  spy: 'spy',
  random: 'random',
};
const CLASS_PORTRAIT: Readonly<Record<string, string>> = { demoman: 'demo', engineer: 'engi' };

const count = (rows: readonly HudScoreRow[], team: number) =>
  rows.filter((r) => r.team === team).length;

function baseContext(input: MenuInput, vars: Map<string, string>): SceneContext {
  const s = input.source;
  const local = input.state.local;
  const cls = local ? CLASS_ID[local.cls] : undefined;
  const team = input.team ?? local?.team ?? TF_TEAM_RED;
  return {
    readText: readMenuText(s.readText),
    scheme: s.scheme,
    env: s.env,
    screen: input.screen,
    minmode: s.minmode,
    showHidden: false,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars,
    strings: s.strings,
    progress: 0,
    player: { playerClass: cls ?? 'scout', team: teamOf(team) },
    styleFor: armedStyle(input.hover ? { file: MENU_FILES[input.kind], name: input.hover } : null),
  };
}

/** The props of a block by its name below the file's top block (first match, any depth). */
function blockProps(text: string, source: SceneSource, name: string): Props | undefined {
  const top = parseCached(text).roots.find((n) => n.children);
  const want = name.toLowerCase();
  const find = (entries: readonly KvNode[]): KvNode | undefined => {
    for (const e of entries) {
      if (!e.children) continue;
      if (e.key.text.toLowerCase() === want) return e;
      const hit = find(activeEntries(e, source.env));
      if (hit) return hit;
    }
    return undefined;
  };
  const block = top?.children ? find(activeEntries(top, source.env)) : undefined;
  return block ? propsOf(block, { env: source.env, minmode: source.minmode }) : undefined;
}

/** The buttons of a built menu that do something here. */
function targetsOf(
  scene: Scene,
  file: string,
  text: string,
  source: SceneSource,
  current: (a: MenuAction) => boolean,
): MenuTarget[] {
  const out: MenuTarget[] = [];
  for (const n of scene.nodes) {
    if (!n.shown || n.file !== file || n.isFrame || n.rect.w <= 0 || n.rect.h <= 0) continue;
    if (!/button/i.test(n.control)) continue;
    const key = n.keyPath[n.keyPath.length - 1] ?? n.name;
    const props = blockProps(text, source, key);
    const action = menuAction(props?.get('command'));
    if (!action) continue;
    const image = n.ops.find((o): o is ImageOp => o.t === 'image')?.path;
    out.push({
      id: n.id,
      name: key,
      rect: n.rect,
      action,
      hotkey:
        hotkeyOf(props?.get('labeltext')) ??
        (action.kind === 'team'
          ? TEAM_HOTKEY[action.team]
          : action.kind === 'class'
            ? CLASS_HOTKEY[action.cls]
            : undefined),
      current: current(action),
      image,
    });
  }
  return out;
}

/** A VGUI hotkey marker in a label (`&3`): the number key that presses the button. */
function hotkeyOf(label: string | undefined): number | undefined {
  const m = /&(\d)/.exec(label ?? '');
  return m ? Number(m[1]) : undefined;
}

/**
 * The team menu's number keys as the HUD marks them: VGUI presses the button whose label carries `&N`
 * (TF2's own file puts 1 on Auto-assign, 3 on BLU). Empty when the file marks none (the game's 1–4 stay).
 */
export function teamMenuHotkeys(source: SceneSource): Map<number, TeamChoice> {
  const out = new Map<number, TeamChoice>();
  const text = readMenuText(source.readText)(MENU_FILES.team);
  const top = text === undefined ? undefined : parseCached(text).roots.find((n) => n.children);
  if (!text || !top?.children) return out;
  for (const e of activeEntries(top, source.env)) {
    if (!e.children) continue;
    const props = propsOf(e, { env: source.env, minmode: source.minmode });
    if (!props.bool('visible', true)) continue;
    const action = menuAction(props.get('command'));
    const key = hotkeyOf(props.get('labeltext'));
    if (action?.kind === 'team' && key !== undefined && !out.has(key)) out.set(key, action.team);
  }
  return out;
}

export function buildMenu(input: MenuInput): MenuResult {
  switch (input.kind) {
    case 'scoreboard':
      return buildScoreboard(input);
    case 'team':
      return buildTeamMenu(input);
    case 'class':
      return buildClassMenu(input);
  }
}

/* ── team menu (CTFTeamMenu) ── */

/** The 3D doors are not drawn (no model panels in game); a flat door in each team's colour stands in. */
const DOOR: Readonly<Record<TeamChoice, Rgba>> = {
  blue: { r: 91, g: 122, b: 140, a: 255 },
  red: { r: 189, g: 59, b: 59, a: 255 },
  auto: { r: 118, g: 107, b: 94, a: 255 },
  spectator: { r: 72, g: 70, b: 66, a: 255 },
};

function buildTeamMenu(input: MenuInput): MenuResult {
  const file = MENU_FILES.team;
  const rows = input.state.scoreboard;
  const vars = new Map([
    ['bluecount', String(count(rows, TF_TEAM_BLUE))],
    ['redcount', String(count(rows, TF_TEAM_RED))],
  ]);
  const ctx = baseContext(input, vars);
  // Highlander / teams-full notices are switched on by the server's rules, which this game never sets.
  ctx.gate = (f, name) => {
    if (f !== file) return undefined;
    const n = name.toLowerCase();
    if (n.startsWith('highlander') || n.startsWith('teamsfull')) return false;
    return undefined;
  };
  const scene = buildScene(ctx, [file]);
  const text = ctx.readText(file) ?? '';
  const now = input.state.local?.team ?? 0;
  const targets = targetsOf(scene, file, text, input.source, (a) =>
    a.kind === 'team'
      ? (a.team === 'blue' && now === TF_TEAM_BLUE) ||
        (a.team === 'red' && now === TF_TEAM_RED) ||
        (a.team === 'spectator' && now === 1)
      : false,
  );
  for (const t of targets) {
    if (t.action.kind !== 'team') continue;
    const node = scene.nodes.find((n) => n.id === t.id);
    if (!node) continue;
    const c = DOOR[t.action.team];
    const lit = input.hover === t.name;
    node.ops = [
      { t: 'rect', rect: node.rect, fill: { ...c, a: lit ? 170 : 95 }, radius: 0 },
      ...node.ops,
    ];
  }
  return { scene, targets };
}

/* ── class menu (CTFClassMenu) ── */

function buildClassMenu(input: MenuInput): MenuResult {
  const file = MENU_FILES.class;
  const rows = input.state.scoreboard;
  const local = input.state.local;
  const team = input.team ?? (local && local.team >= 2 ? local.team : TF_TEAM_RED);
  const teamName = team === TF_TEAM_BLUE ? 'blu' : 'red';
  const vars = new Map<string, string>([['hint', '']]);
  for (const [cls, name] of CLASS_NAMES.entries()) {
    if (!name) continue;
    const n = rows.filter((r) => r.team === team && r.cls === cls).length;
    // numScout … numSpy: blank when nobody plays it (CTFClassMenu::UpdateNumClassLabels).
    vars.set(`num${name}`, n ? String(n) : '');
  }
  const ctx = baseContext(input, vars);
  ctx.player = { playerClass: CLASS_ID[local?.cls ?? 0] ?? 'scout', team: teamOf(team) };
  ctx.gate = (f, name) => {
    if (f !== file) return undefined;
    const n = name.toLowerCase();
    // MvM upgrades, the first-run explanation, the team line-up portraits and the 3D model are not this game's.
    if (n.startsWith('mvmupgradeimage') || n === 'startexplanation' || n.startsWith('countimage'))
      return false;
    if (n === 'localplayerimage' || n === 'localplayerbg' || n === 'tfplayermodel') return false;
    if (n === 'classtipspanel' || n === 'classhighlightpanel') return false;
    return undefined;
  };
  // The hovered (and current) class shows its team-coloured picture, as CTFClassMenu arms its buttons.
  const lit = (name: string) => {
    const n = name.toLowerCase();
    if (input.hover?.toLowerCase() === n) return true;
    return !input.hover && CLASS_NAMES[local?.cls ?? 0] === n;
  };
  ctx.overridesFor = (f, keyPath) => {
    if (f !== file) return undefined;
    const own = keyPath[keyPath.length - 1]?.toLowerCase() ?? '';
    const button = (
      own === 'subimage' ? keyPath[keyPath.length - 2] : keyPath[keyPath.length - 1]
    )?.toLowerCase();
    const sel = button ? CLASS_SEL[button] : undefined;
    if (!sel || !lit(button)) return undefined;
    const image = `class_sel_sm_${sel}_${teamName}`;
    const out: Record<string, string> =
      own === 'subimage' ? { image } : { image_default: image, image };
    return out;
  };
  const scene = buildScene(ctx, [file]);
  const text = ctx.readText(file) ?? '';
  const mine = CLASS_NAMES[local?.cls ?? 0];
  const targets = targetsOf(
    scene,
    file,
    text,
    input.source,
    (a) => a.kind === 'class' && a.cls === mine,
  );
  return { scene, targets };
}

/**
 * Where a class button's own picture (`vgui/class_sel_sm_*`) is missing, the HUD's class portrait
 * (`hud/class_<name><team>`) stands in, so the menu still shows who is who before the textures are
 * published.
 */
export function classPortraitFor(path: string, team: number): string | undefined {
  const m = /class_sel_sm_([a-z]+)_(?:inactive|red|blu)$/.exec(path);
  if (!m || m[1] === 'random') return undefined;
  const name = Object.entries(CLASS_SEL).find(([, v]) => v === m[1])?.[0];
  if (!name) return undefined;
  return imagePath(
    `../hud/class_${CLASS_PORTRAIT[name] ?? name}${team === TF_TEAM_BLUE ? 'blue' : 'red'}`,
  );
}

/* ── scoreboard (CTFClientScoreBoardDialog) ── */

const LIST_CONTROL = /^sectionedlistpanel$/i;
/** Team colours of the player rows (the game's team colours, lightened for text on the dark board). */
const ROW_TEXT: Readonly<Record<number, Rgba>> = {
  [TF_TEAM_BLUE]: { r: 153, g: 204, b: 255, a: 255 },
  [TF_TEAM_RED]: { r: 255, g: 140, b: 140, a: 255 },
};
const CLASS_LEADERBOARD: Readonly<Record<string, string>> = { demoman: 'demo' };

/** The scoreboard's numbers as TF2 sets them (`UpdateTeamInfo`, `UpdatePlayerDetails`, `UpdateSpectatorList`). */
export function scoreboardVars(
  state: HudState,
  strings: ReadonlyMap<string, string>,
): Map<string, string> {
  const rows = state.scoreboard;
  const m = state.match;
  const me = rows.find((r) => r.isLocal);
  const ctf = m.mode === 'ctf';
  const players = (n: number) =>
    n === 1
      ? localize(strings, 'TF_ScoreBoard_Player', '%s1 Player', n)
      : localize(strings, 'TF_ScoreBoard_Players', '%s1 Players', n);
  const spectators = rows.filter((r) => r.team < 2);
  const vars = new Map<string, string>([
    ['blueteamname', localize(strings, 'TF_BlueTeam_Name', 'BLU')],
    ['redteamname', localize(strings, 'TF_RedTeam_Name', 'RED')],
    ['blueteamscore', String(ctf ? m.blueFlagCaps : m.blueScore)],
    ['redteamscore', String(ctf ? m.redFlagCaps : m.redScore)],
    ['blueteamplayercount', players(count(rows, TF_TEAM_BLUE))],
    ['redteamplayercount', players(count(rows, TF_TEAM_RED))],
    ['server', ''],
    ['mapname', m.map],
    ['servertime', m.timer ? formatClock(m.timer.remaining) : ''],
    ['servertimeleft', m.timer ? formatClock(m.timer.remaining) : ''],
    ['gametype', ''],
    ['waitingtoplay', ''],
    [
      'spectators',
      spectators.length
        ? spectators.length === 1
          ? localize(strings, 'ScoreBoard_Spectator', '%s1 Spectator: %s2', 1, spectators[0].name)
          : localize(
              strings,
              'ScoreBoard_Spectators',
              '%s1 Spectators: %s2',
              spectators.length,
              spectators.map((s) => s.name).join(', '),
            )
        : '',
    ],
    ['playername', me?.name ?? state.local?.name ?? ''],
    ['playerscore', me ? localize(strings, 'TF_ScoreBoard_Points', '%s1 points', me.score) : ''],
    ['kills', String(me?.kills ?? 0)],
    ['deaths', String(me?.deaths ?? 0)],
    ['assists', String(me?.assists ?? 0)],
  ]);
  for (const k of [
    'destruction',
    'captures',
    'defenses',
    'dominations',
    'revenge',
    'healing',
    'invulns',
    'teleports',
    'headshots',
    'backstabs',
    'bonus',
    'support',
    'damage',
  ])
    vars.set(k, '0');
  vars.set('dominations', String(rows.filter((r) => r.dominated).length));
  return vars;
}

/** Players in a team's list, best first (the game sorts by score, then by name). */
const sortRows = (rows: readonly HudScoreRow[]) =>
  [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

function rowText(
  base: Omit<TextOp, 'rect' | 'text' | 'align'>,
  rect: Rect,
  text: string,
  align: TextOp['align'],
): TextOp {
  return { ...base, rect, text, align };
}

/**
 * The rows the game puts in a `SectionedListPanel`: per player, the avatar column (left empty: no Steam
 * avatars here), name, domination mark, class icon, score and ping, in the widths the dialog's own keys
 * give (`avatar_width`, `spacer`, `nemesis_width`, `class_width`, `score_width`, `ping_width`; the name
 * takes what is left), one row per `linespacing`.
 */
function listRows(
  list: PanelNode,
  team: number,
  rows: readonly HudScoreRow[],
  dialog: Props,
  listProps: Props | undefined,
  input: MenuInput,
  images: Set<string>,
): PanelNode[] {
  const s = input.source;
  const scale = screenScale(input.screen);
  const px = (key: string, d: number) => Math.trunc(dialog.num(key, d) * scale);
  const avatar = px('avatar_width', 28);
  const spacer = px('spacer', 5);
  const nemesis = px('nemesis_width', 15);
  const classW = px('class_width', 15);
  const scoreW = px('score_width', 25);
  const pingW = px('ping_width', 15);
  const lineH = Math.max(1, Math.trunc((listProps?.num('linespacing', 18) ?? 18) * scale));
  const nameW = Math.max(
    0,
    list.rect.w - avatar - spacer - nemesis - classW - scoreW - pingW - spacer,
  );
  const font = pickFont(s.scheme, 'ScoreboardSmall', input.screen.h);
  const fg = resolveColor(s.scheme, listProps?.get('fgcolor')) ??
    ROW_TEXT[team] ?? { r: 235, g: 226, b: 202, a: 255 };
  const selected = resolveColor(s.scheme, 'TanDarker') ?? { r: 46, g: 43, b: 42, a: 255 };
  const text: Omit<TextOp, 'rect' | 'text' | 'align'> = {
    t: 'text',
    color: fg,
    fontName: font?.def.name ?? 'Verdana',
    px: font?.px ?? 12 * scale,
    weight: font?.def.weight ?? 400,
    italic: false,
    underline: false,
    outline: font?.def.outline ?? false,
    dropshadow: font?.def.dropshadow ?? false,
    valign: 'middle',
    wrap: false,
    insetX: 0,
    insetY: 0,
  };
  const localTeam = input.state.local?.team ?? 0;
  const showClass = localTeam === team || localTeam < 2;
  const clip = list.clip ? intersectRect(list.clip, list.rect) : list.rect;
  const out: PanelNode[] = [];
  sortRows(rows).forEach((r, i) => {
    const y = list.rect.y + i * lineH;
    if (y + lineH > list.rect.y + list.rect.h + 1) return;
    let x = list.rect.x + avatar + spacer;
    const cell = (w: number): Rect => {
      const c = { x, y, w, h: lineH };
      x += w;
      return c;
    };
    const color = r.dead ? { ...fg, a: Math.round(fg.a * 0.45) } : fg;
    const t = { ...text, color };
    const ops: PanelNode['ops'] = [];
    if (r.isLocal)
      ops.push({
        t: 'rect',
        rect: { x: list.rect.x, y, w: list.rect.w, h: lineH },
        fill: { ...selected, a: 200 },
        radius: 0,
      });
    ops.push(rowText(t, cell(nameW), r.name, 'left'));
    const mark = cell(nemesis);
    if (r.nemesis || r.dominated) {
      const path = imagePath(
        r.nemesis ? '../hud/leaderboard_nemesis' : '../hud/leaderboard_dominated',
      );
      images.add(path);
      ops.push({ t: 'image', rect: square(mark), path });
    }
    const clsCell = cell(classW);
    const clsName = CLASS_NAMES[r.cls];
    if (clsName && (showClass || r.isLocal)) {
      const path = imagePath(
        `../hud/leaderboard_class_${CLASS_LEADERBOARD[clsName] ?? clsName}${r.dead ? '_d' : ''}`,
      );
      images.add(path);
      ops.push({ t: 'image', rect: square(clsCell), path });
    }
    ops.push(rowText(t, cell(scoreW), String(r.score), 'right'));
    cell(spacer);
    ops.push(
      rowText(
        t,
        cell(pingW),
        r.bot ? localize(s.strings, 'TF_Scoreboard_Bot', 'BOT') : String(r.ping),
        'right',
      ),
    );
    out.push({
      id: `${list.id}/row${r.id}`,
      file: list.file,
      keyPath: [...list.keyPath, `row${r.id}`],
      name: r.name,
      control: 'SectionedListPanelRow',
      rect: { x: list.rect.x, y, w: list.rect.w, h: lineH },
      z: list.z,
      visible: true,
      shown: true,
      isFrame: false,
      parentId: list.id,
      clip,
      source: list.source,
      ops,
    });
  });
  return out;
}

const square = (r: Rect): Rect => {
  const s = Math.min(r.w, r.h);
  return { x: r.x + (r.w - s) / 2, y: r.y + (r.h - s) / 2, w: s, h: s };
};

function intersectRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  };
}

function buildScoreboard(input: MenuInput): MenuResult {
  const file = MENU_FILES.scoreboard;
  const state = input.state;
  const s = input.source;
  const vars = scoreboardVars(state, s.strings);
  const ctx = baseContext(input, vars);
  const local = state.local;
  ctx.gate = (f, name) => {
    if (f !== file) return undefined;
    const n = name.toLowerCase();
    // Competitive duels, the console's button legend and MvM are not this game's.
    if (
      n === 'localplayerduelstatspanel' ||
      n.startsWith('buttonlegend') ||
      n.includes('mannvsmachine')
    )
      return false;
    if (n === 'mvmscoreboard') return false;
    if (n === 'classimage') return !!local && local.cls > 0 && local.team >= 2;
    return undefined;
  };
  // The player's own class portrait (CTFClientScoreBoardDialog::UpdatePlayerDetails → SetClass).
  ctx.overridesFor = (f, keyPath) => {
    if (f !== file || !local || local.cls <= 0) return undefined;
    if (keyPath[keyPath.length - 1]?.toLowerCase() !== 'classimage') return undefined;
    const name = CLASS_NAMES[local.cls];
    return {
      image: `../hud/class_${CLASS_PORTRAIT[name] ?? name}${local.team === TF_TEAM_BLUE ? 'blue' : 'red'}`,
    };
  };
  const scene = buildScene(ctx, [file]);
  const text = ctx.readText(file) ?? '';
  const top = parseCached(text).roots.find((n) => n.children);
  const first = top?.children ? activeEntries(top, s.env).find((e) => e.children) : undefined;
  const dialog = first ? propsOf(first, { env: s.env, minmode: s.minmode }) : propsFromMap({});
  const images = new Set(scene.images);
  const nodes: PanelNode[] = [];
  for (const n of scene.nodes) {
    nodes.push(n);
    if (!n.shown || n.file !== file || !LIST_CONTROL.test(n.control)) continue;
    const key = (n.keyPath[n.keyPath.length - 1] ?? '').toLowerCase();
    const team = key.startsWith('blue') ? TF_TEAM_BLUE : key.startsWith('red') ? TF_TEAM_RED : 0;
    if (!team) continue;
    nodes.push(
      ...listRows(
        n,
        team,
        state.scoreboard.filter((r) => r.team === team),
        dialog,
        blockProps(text, s, n.keyPath[n.keyPath.length - 1] ?? ''),
        input,
        images,
      ),
    );
  }
  return { scene: { ...scene, nodes, images: [...images] }, targets: [] };
}
