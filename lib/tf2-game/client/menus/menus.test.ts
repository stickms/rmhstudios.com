/**
 * The Source-style menus (lib/tf2-game/client/menus):
 *
 *  - Options ↔ cvar sync: every control of the Options dialog, for every game, reads and writes its
 *    console variable — a value set in the dialog is what the console's cvar shows, and a value typed in
 *    the console is what the dialog shows; the fixed ones are the console's fixed cvars;
 *  - the key list from kb_act.lst (titles, rows this game can bind, empty sections dropped, the
 *    fallback list) and rebinding conflicts (a key taken off the action that had it, reserved keys);
 *  - TF2's Advanced Options script (cfg/user_default.scr) and what of it is shown;
 *  - layout: the main menu (mainmenuoverride.res + gamemenu.res) and the loadout panel
 *    (classloadoutpanel.res) put every panel exactly where the HUD editor previews the file, at
 *    1920×1080 and 1280×720, and the code-placed buttons and item slots where TF2's code puts them;
 *  - localisation and fallbacks: labels from the game's files when they are there, the caller's own
 *    words when they are not, and no menu (the UI's own list) without mainmenuoverride.res.
 *
 * Game files: the base HUD in public/tf2-hud/base carries mainmenuoverride.res, gamemenu.res and
 * classloadoutpanel.res; the GameUI option pages, kb_act.lst and user_default.scr are Valve's and
 * are not in the repository, so they are exercised here with small files of the same shape (and,
 * with TF2_ROOT set, against the install's own copies).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildScene, type SceneContext } from '@/lib/tf2-hud/scene/build';
import { parseKv } from '@/lib/tf2-hud/kv/parse';
import { activeEntries, propsOf } from '@/lib/tf2-hud/kv/props';
import { scaled } from '@/lib/tf2-hud/layout/geometry';
import { gameLanguageFiles, layeredTokens, parseLocalisation } from '@/lib/tf2-hud/localisation';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';
import { parseScheme } from '@/lib/tf2-hud/scheme/scheme';
import type { Scene } from '@/lib/tf2-hud/scene/types';
import { ConsoleCore } from '../../console/core';
import { ConsoleFiles } from '../../console/files';
import { GameConsole } from '../../console/game-console';
import { readSettingsCvar, registerSettingsCvars, settingsCvarDef, settingsCvarNames } from '../../console/settings-cvars';
import type { SceneSource } from '../custom-hud/scene';
import type { HudGame } from '../hud-state';
import { createHudStore } from '../hud-store';
import { defaultKeybinds } from '../input/actions';
import { defaultSettings, mouseToDegrees, type GameSettings } from '../settings';
import { planQuality, type DeviceInfo } from '../quality';
import { applyLook, createInputState } from '../input/input-state';
import { advancedGroups, parseUserScr } from './advanced-options';
import {
  backgroundImage,
  buildGameMenu,
  ENTRY_FILE,
  GAME_MENU_FILE,
  MAIN_MENU_FILE,
  menuCommand,
  parseChapterBackgrounds,
  type MenuEntry,
} from './game-menu';
import { kbCommandAction, keyListRows, parseKbAct, rebindChecked } from './kb-act';
import { buildLoadoutPanel, CLASS_LOADOUT_FILE, slotPositions } from './loadout-layout';
import {
  ADVANCED_FALLBACK,
  advancedControl,
  controlRange,
  controlValue,
  FIXED_CVARS,
  hasOptionCvar,
  OPTION_CONTROLS,
  OPTIONS_TABS,
  resText,
  setControl,
  tabControls,
  type OptionControl,
} from './options';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const BASE = path.join(ROOT, 'public/tf2-hud/base');
const readBase = (p: string): string | undefined => {
  const f = path.join(BASE, p);
  return existsSync(f) ? readFileSync(f, 'utf8') : undefined;
};
const GAMES: HudGame[] = ['tf2', 'hl2', 'portal'];
const SCREENS = [
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
];

function sourceOf(read: (p: string) => string | undefined, strings: ReadonlyMap<string, string> = new Map()): SceneSource {
  return { readText: read, scheme: parseScheme(readBase('resource/clientscheme.res')!, PC_ENV), env: PC_ENV, minmode: false, strings };
}

/** The HUD editor's preview of files (useScene's context, no animations). */
function editorScene(read: (p: string) => string | undefined, files: string[], screen: { w: number; h: number }): Scene {
  const ctx: SceneContext = {
    readText: read,
    scheme: parseScheme(readBase('resource/clientscheme.res')!, PC_ENV),
    env: PC_ENV,
    screen,
    minmode: false,
    showHidden: false,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: new Map(),
    strings: new Map(),
    progress: 0,
  };
  return buildScene(ctx, files);
}

/* ───────────────────────── Options ↔ cvars ───────────────────────── */

/** A value for a control that differs from what it shows now (the dialog's next pick). */
function another(game: HudGame, s: GameSettings, c: OptionControl): string | number | boolean {
  const cur = controlValue(game, s, c);
  if (c.kind === 'toggle') return !cur;
  if (c.kind === 'select') {
    const options = c.choices?.map((x) => x.value) ?? [];
    return options.find((v) => v !== cur) ?? options[0];
  }
  const { min, max } = controlRange(game, c);
  const step = c.step ?? 0.01;
  const mid = min + Math.round((max - min) / 2 / step) * step;
  return Math.abs(mid - Number(cur)) > step / 2 ? mid : max;
}

function consoleFor(game: HudGame, start: GameSettings) {
  let settings = start;
  const core = new ConsoleCore({ files: new ConsoleFiles(game, null) });
  const cvars = registerSettingsCvars(core, game, { get: () => settings, set: (n) => (settings = n) });
  return {
    core,
    get: () => settings,
    panel(next: GameSettings) {
      settings = next;
      cvars.sync(next);
    },
  };
}

describe('Options dialog ↔ console variables', () => {
  it.each(GAMES)('every %s control writes its cvar, and the console writes the control', (game) => {
    const controls = [
      ...OPTIONS_TABS.flatMap((tab) => [...tabControls(game, tab), ...tabControls(game, tab, true)]),
      ...(game === 'tf2' ? ADVANCED_FALLBACK.filter((i) => i.type !== 'category' && hasOptionCvar(game, i.cvar)).map((i) => advancedControl(game, i)) : []),
    ].filter((c) => c.kind !== 'unavailable' && c.kind !== 'fixed');
    expect(controls.length).toBeGreaterThan(game === 'tf2' ? 40 : 30);
    for (const c of controls) {
      // Every control is backed by a settings cvar of this game.
      expect(settingsCvarNames(game), c.id).toContain(c.cvar);
      const con = consoleFor(game, defaultSettings(game));
      // The dialog sets it → the console shows the same value.
      const v = another(game, con.get(), c);
      const next = setControl(game, con.get(), c, v);
      expect(next, `${c.id} changes the settings`).not.toEqual(con.get());
      con.panel(next);
      expect(con.core.cvar(c.cvar)!.string, c.id).toBe(readSettingsCvar(game, next, c.cvar));
      expect(controlValue(game, next, c), c.id).toEqual(typeof v === 'number' ? expect.closeTo(v, 5) : v);
      // The console sets it back → the dialog shows the default again.
      const def = readSettingsCvar(game, defaultSettings(game), c.cvar)!;
      con.core.submit(`${c.cvar} "${def}"`);
      expect(controlValue(game, con.get(), c), `${c.id} after the console`).toEqual(controlValue(game, defaultSettings(game), c));
    }
  });

  it('the fixed controls are the console’s fixed cvars', () => {
    const con = new GameConsole(createHudStore({ game: 'tf2' }), 'tf2', { storage: null });
    for (const [name, value] of Object.entries(FIXED_CVARS)) {
      const cv = con.core.cvar(name)!;
      expect(cv.string).toBe(value);
      expect(cv.min).toBe(cv.max);
    }
    expect(OPTION_CONTROLS.filter((c) => c.kind === 'fixed').every((c) => c.cvar in FIXED_CVARS)).toBe(true);
  });

  it('Reverse mouse is m_pitch’s sign; the m_pitch slider keeps it', () => {
    const rev = OPTION_CONTROLS.find((c) => c.id === 'reverse_mouse')!;
    const pitch = OPTION_CONTROLS.find((c) => c.id === 'm_pitch')!;
    let s = setControl('tf2', defaultSettings('tf2'), rev, true);
    expect(readSettingsCvar('tf2', s, 'm_pitch')).toBe('-0.022');
    s = setControl('tf2', s, pitch, 0.05);
    expect(readSettingsCvar('tf2', s, 'm_pitch')).toBe('-0.05');
    expect(controlValue('tf2', s, rev)).toBe(true);
    expect(controlValue('tf2', s, pitch)).toBeCloseTo(0.05);
  });

  it('mouse acceleration (m_customaccel 3) and m_filter reach the look', () => {
    const accel = OPTION_CONTROLS.find((c) => c.id === 'm_customaccel')!;
    let s = setControl('tf2', defaultSettings('tf2'), accel, true);
    expect(readSettingsCvar('tf2', s, 'm_customaccel')).toBe('3');
    s = setControl('tf2', s, OPTION_CONTROLS.find((c) => c.id === 'm_customaccel_exponent')!, 1.2);
    // pow(|d|², 0.1) × sensitivity: a 10-count move turns more than with acceleration off.
    const plain = mouseToDegrees(10, 0, defaultSettings('tf2')).yaw;
    const fast = mouseToDegrees(10, 0, s).yaw;
    expect(fast).toBeCloseTo(plain * Math.pow(100, 0.1), 6);
    // m_filter averages each frame with the previous one.
    const input = createInputState();
    const angles = { x: 0, y: 0, z: 0 };
    const filtered = { ...defaultSettings('tf2'), mouseFilter: true };
    input.mouseDx = 10;
    applyLook(input, angles, filtered);
    expect(angles.y).toBeCloseTo(-5 * 3 * 0.022);
    input.mouseDx = 0;
    applyLook(input, angles, filtered);
    expect(angles.y).toBeCloseTo(-10 * 3 * 0.022);
  });

  it('the video knobs override the quality tier', () => {
    const desktop: DeviceInfo = { webgl2: true, maxTextureSize: 16384, touchFirst: false, mobileUa: false, gpu: '', dpr: 1 };
    const s = defaultSettings('tf2');
    const auto = planQuality(desktop, s.quality, s.video);
    expect(auto.maxTextureSize).toBe(1024);
    const v = { ...s.video, textureDetail: 'low' as const, modelDetail: 'medium' as const, effectsDetail: 'low' as const, antialias: 'off' as const, anisotropy: 2, resolutionScale: 0.7 };
    const p = planQuality(desktop, s.quality, v);
    expect(p.maxTextureSize).toBe(512);
    expect(p.propDrawDistance).toBe(4096);
    expect(p.particleBudget).toBe(20);
    expect(p.antialias).toBe(false);
    expect(p.anisotropy).toBe(2);
    expect(p.resolutionScale).toBe(0.7);
    expect(p.minResolutionScale).toBe(0.7);
    expect(settingsCvarDef('tf2', 'mat_picmip')?.values).toContain('auto');
  });
});

/* ───────────────────────── kb_act.lst ───────────────────────── */

// The shape of the game's file (its commands and its token names); not the game's file.
const KB_ACT = `"blank"  "=========================="
"blank"  "#Valve_Movement_Title"
"blank"  "=========================="
"+forward"  "#Valve_Move_Forward"
"+jump"     "#Valve_Jump"
"+moveup"   "#Valve_Swim_Up"
"blank"  "#Valve_Communication_Title"
"+voicerecord"  "#Valve_Use_Voice_Communication"
"blank"  "#TF_Title"
"changeclass"  "#Valve_Change_Class"
"+taunt"  "#TF_Taunt"
"+attack2"  "#TF_ClassSkill_Demoman"
"+attack2"  "#TF_ClassSkill_Heavy"
"slot10"  "#Valve_Weapon_Category_0"
"toggleconsole"  "#Valve_Console_Toggle"`;

describe('the key list (kb_act.lst)', () => {
  it('parses titles and binds, drops the rules, keeps duplicates', () => {
    const rows = parseKbAct(KB_ACT);
    expect(rows.filter((r) => r.kind === 'title').map((r) => r.label)).toEqual(['#Valve_Movement_Title', '#Valve_Communication_Title', '#TF_Title']);
    expect(rows.filter((r) => r.command === '+attack2')).toHaveLength(2);
  });

  it('shows only what the game can bind, and drops an empty section', () => {
    const rows = keyListRows('tf2', parseKbAct(KB_ACT));
    expect(rows.map((r) => (r.kind === 'title' ? r.label : r.action))).toEqual([
      '#Valve_Movement_Title',
      'forward',
      'jump',
      '#TF_Title',
      'changeclass',
      'taunt',
      'attack2',
      'attack2',
    ]);
    expect(kbCommandAction('+voicerecord', 'tf2')).toBeNull();
    expect(kbCommandAction('toggleconsole', 'tf2')).toBeNull();
    expect(kbCommandAction('changeclass', 'hl2')).toBeNull();
    expect(kbCommandAction('impulse 100', 'hl2')).toBe('flashlight');
  });

  it('falls back to the game’s own list without the file', () => {
    const rows = keyListRows('hl2', null);
    expect(rows.every((r) => r.kind === 'bind' && r.label === null)).toBe(true);
    expect(rows.map((r) => (r.kind === 'bind' ? r.action : ''))).toContain('flashlight');
    expect(keyListRows('tf2', parseKbAct('junk { } "x"'))).toEqual(keyListRows('tf2', null));
  });

  it('rebinding takes the key off the action that had it; Escape and ` are reserved', () => {
    const binds = defaultKeybinds('tf2');
    const r = rebindChecked(binds, 'jump', 'KeyR');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.displaced).toEqual(['reload']);
    expect(r.keybinds.jump?.[0]).toBe('KeyR');
    expect(r.keybinds.reload).toBeUndefined();
    const again = rebindChecked(r.keybinds, 'jump', 'KeyR');
    expect(again.ok && again.displaced).toEqual([]);
    expect(rebindChecked(binds, 'jump', 'Escape')).toEqual({ ok: false, reason: 'reserved' });
    expect(rebindChecked(binds, 'say', 'Backquote')).toEqual({ ok: false, reason: 'reserved' });
  });

  it.skipIf(!process.env.TF2_ROOT)('the install’s own files (TF2_ROOT): the key list, the advanced options, the option pages', async () => {
    const { gameFileSystem } = await import('../../formats/tf2-root.test-support');
    const fs = gameFileSystem();
    const kb = keyListRows('tf2', parseKbAct(fs.readText('scripts/kb_act.lst') ?? ''));
    expect(kb.filter((r) => r.kind === 'bind').length).toBeGreaterThan(30);
    expect(kb.some((r) => r.kind === 'bind' && r.action === 'voice_menu_1')).toBe(true);
    const adv = advancedGroups(parseUserScr(fs.readText('cfg/user_default.scr') ?? ''), (c) => hasOptionCvar('tf2', c));
    expect(adv.flatMap((g) => g.items.map((i) => i.cvar))).toEqual(
      expect.arrayContaining(['cl_autoreload', 'hud_fastswitch', 'tf_dingalingaling', 'hud_combattext', 'viewmodel_fov']),
    );
    const read = (p: string) => fs.readText(p) ?? undefined;
    for (const c of OPTION_CONTROLS.filter((x) => x.res)) {
      const r = resText(read, PC_ENV, c);
      expect(r.label ?? r.tooltip, `${c.id} in ${c.res!.file}`).toMatch(/^#/);
    }
  });
});

/* ───────────────────────── TF2 Advanced Options ───────────────────────── */

const USER_SCR = `// comment
VERSION 1.0
DESCRIPTION INFO_OPTIONS
{
  "category1" { "#TF_OptionCategory_Communication" { CATEGORY } }
  "voice_modenable" { "#TF_EnableVoiceChat" "#Tooltip_EnableVoiceChat" { BOOL } { "0" } }
  "chat_filter_settings" { "#TF_ChatFilterSettings" { BUTTON } { "open_chat_filter_settings" } }
  "category2" { "#TF_OptionCategory_Combat" { CATEGORY } }
  "cl_autoreload" { "#TF_autoreload" "#Tooltip_autoreload" { BOOL } { "0" } }
  "hud_fastswitch" { "#GameUI_FastSwitchCheck" "#Tooltip_hud_fastswitch" { BOOL } { "0" } }
  "tf_dingaling_volume" { "#TF_Dingaling_Volume" { SLIDER 0 1 } { "0.75" } }
  "tf_dingalingaling_effect" { "#tf_dingalingaling_effect" { LIST "#a" "0" "#b" "1" } { "-1" } }
  "category4" { "#TF_OptionCategory_HUD" { CATEGORY } }
  "viewmodel_fov" { "#TF_viewmodelfov_option" "#Tooltip_viewmodelfov_option" { SLIDER 54 70 } { "1" } }
  "ds_min_streak" { "#x" { NUMBER 2 1000 } { "4" } }
}`;

describe('TF2 Advanced Options (user_default.scr)', () => {
  it('parses every entry type', () => {
    const items = parseUserScr(USER_SCR);
    expect(items.map((i) => i.cvar)).toEqual([
      'category1',
      'voice_modenable',
      'chat_filter_settings',
      'category2',
      'cl_autoreload',
      'hud_fastswitch',
      'tf_dingaling_volume',
      'tf_dingalingaling_effect',
      'category4',
      'viewmodel_fov',
      'ds_min_streak',
    ]);
    const vol = items.find((i) => i.cvar === 'tf_dingaling_volume')!;
    expect([vol.type, vol.min, vol.max, vol.default]).toEqual(['slider', 0, 1, '0.75']);
    expect(items.find((i) => i.cvar === 'tf_dingalingaling_effect')!.items).toEqual([
      { label: '#a', value: '0' },
      { label: '#b', value: '1' },
    ]);
    expect(items.find((i) => i.cvar === 'cl_autoreload')!.tooltip).toBe('#Tooltip_autoreload');
  });

  it('shows only the cvars this game has, under their categories', () => {
    const groups = advancedGroups(parseUserScr(USER_SCR), (c) => hasOptionCvar('tf2', c));
    expect(groups.map((g) => [g.title, g.items.map((i) => i.cvar)])).toEqual([
      ['#TF_OptionCategory_Combat', ['cl_autoreload', 'hud_fastswitch']],
      ['#TF_OptionCategory_HUD', ['viewmodel_fov']],
    ]);
    expect(advancedControl('tf2', { cvar: 'hud_fastswitch', type: 'bool', prompt: '#x' }).kind).toBe('fixed');
    expect(advancedControl('tf2', { cvar: 'viewmodel_fov', type: 'slider', prompt: '#x', min: 54, max: 70 }).kind).toBe('slider');
    expect(parseUserScr('garbage')).toEqual([]);
  });
});

/* ───────────────────────── layout vs the editor ───────────────────────── */

const ENTRIES: MenuEntry[] = [
  { command: 'find', token: '#MMenu_FindAGame', text: 'Find a Game', image: 'glyph_multiplayer' },
  { command: 'offline', token: '#GameUI_GameMenu_OfflinePractice', text: 'Offline practice', image: 'glyph_practice' },
  { command: 'loadout', token: '#MMenu_CharacterSetup', text: 'Items' },
  { command: 'options', token: '#GameUI_GameMenu_Options', text: 'Options' },
  { command: 'advanced', token: '#MMenu_Tooltip_AdvOptions', text: 'Advanced options' },
  { command: 'hud', token: '#MMenu_Tooltip_Workshop', text: 'HUD' },
  { command: 'console', token: '#GameUI_Console', text: 'Console' },
  { command: 'quit', token: '#GameUI_GameMenu_Quit', text: 'Quit' },
];

const key = (r: { x: number; y: number; w: number; h: number }) => `${r.x},${r.y},${r.w},${r.h}`;

describe('the main menu from mainmenuoverride.res', () => {
  it.each(SCREENS)('every panel sits where the editor previews it, %o', (screen) => {
    const menu = buildGameMenu({ source: sourceOf(readBase), screen, inGame: false, entries: ENTRIES, background: backgroundImage('background_upward', screen) })!;
    expect(menu).not.toBeNull();
    const editor = editorScene(readBase, [MAIN_MENU_FILE], screen);
    const editorRect = new Map(editor.nodes.map((n) => [n.id, n.rect]));
    let compared = 0;
    for (const n of menu.scene.nodes) {
      if (n.file !== MAIN_MENU_FILE) continue;
      const want = editorRect.get(n.id);
      expect(want, n.id).toBeDefined();
      // The background takes its `if_wider` / `if_taller` size (the editor shows the file's own).
      if (n.name.toLowerCase() === 'background') continue;
      expect(key(n.rect), n.id).toBe(key(want!));
      compared++;
    }
    expect(compared).toBeGreaterThan(20);
  });

  it.each(SCREENS)('stacks this game’s entries from button_kv as PerformLayout does, %o', (screen) => {
    const menu = buildGameMenu({ source: sourceOf(readBase), screen, inGame: false, entries: ENTRIES })!;
    const doc = parseKv(readBase(MAIN_MENU_FILE)!);
    const frame = activeEntries(doc.roots.find((r) => r.children)!, PC_ENV).find((e) => e.children)!;
    const fp = propsOf(frame, { env: PC_ENV });
    const kv = propsOf(activeEntries(frame, PC_ENV).find((e) => e.key.text === 'button_kv')!, { env: PC_ENV });
    const s = screen.h / 480;
    const list = menu.targets.filter((t) => !t.placed);
    // The base's own buttons carry Items, Options, Advanced and Workshop; the list has the rest.
    expect(list.map((t) => t.command)).toEqual(['find', 'offline', 'console', 'quit']);
    expect(menu.targets.filter((t) => t.placed).map((t) => t.command).sort()).toEqual(['advanced', 'hud', 'loadout', 'options']);
    list.forEach((t, i) => {
      const y = scaled(fp.num('button_y'), s) + i * (scaled(kv.num('tall'), s) + scaled(fp.num('button_y_delta'), s));
      expect(t.rect.x).toBe(Math.trunc(screen.w / 2 + scaled(fp.num('button_x_offset'), s)));
      expect(t.rect.y).toBe(y);
      expect(t.rect.h).toBe(scaled(kv.num('tall'), s));
      expect(t.rect.w).toBe(scaled(kv.num('wide'), s));
    });
    // Without localisation every label is the caller's own.
    expect(list.map((t) => t.label)).toEqual(['Find a Game', 'Offline practice', 'Console', 'Quit']);
    // The SubButton's text is in the scene where the target is.
    const text = menu.scene.nodes.filter((n) => n.file === ENTRY_FILE).flatMap((n) => n.ops).filter((o) => o.t === 'text');
    expect(text.map((o) => (o.t === 'text' ? o.text : ''))).toEqual(['Find a Game', 'Offline practice', 'Console', 'Quit']);
  });

  it('the code-placed panels follow the engine’s position arithmetic (c-208+273, rs1-18)', () => {
    const screen = { w: 1920, h: 1080 };
    const menu = buildGameMenu({ source: sourceOf(readBase), screen, inGame: false, entries: ENTRIES })!;
    const s = screen.h / 480;
    const opts = menu.targets.find((t) => t.command === 'options')!;
    expect(opts.rect.x).toBe(960 + scaled(-208, s) + scaled(273, s));
    const items = menu.targets.find((t) => t.command === 'loadout')!;
    expect(items.rect.y).toBe(1080 - items.rect.h - scaled(18, s));
  });

  it('labels come from the game’s localisation when it has them; in game the Esc menu has no background', () => {
    const strings = new Map([
      ['mmenu_findagame', 'Find a Game!'],
      ['gameui_gamemenu_resumegame', 'RESUME GAME'],
    ]);
    const screen = { w: 1280, h: 720 };
    const main = buildGameMenu({ source: sourceOf(readBase, strings), screen, inGame: false, entries: ENTRIES, background: '../console/background_upward_widescreen' })!;
    expect(main.targets.find((t) => t.command === 'find')!.label).toBe('Find a Game!');
    const bg = main.scene.nodes.find((n) => n.name === 'Background')!;
    expect(bg.shown).toBe(true);
    expect(bg.rect.w).toBe(1280);
    expect(bg.rect.h).toBe(Math.trunc(1280 * 0.628));
    const esc = buildGameMenu({
      source: sourceOf(readBase, strings),
      screen,
      inGame: true,
      entries: [
        { command: 'resume', token: '#GameUI_GameMenu_ResumeGame', text: 'Resume' },
        { command: 'disconnect', token: '#GameUI_GameMenu_Disconnect', text: 'Disconnect' },
      ],
      background: '../console/background_upward_widescreen',
    })!;
    expect(esc.scene.nodes.find((n) => n.name === 'Background')!.shown).toBe(false);
    expect(esc.targets.map((t) => t.label)).toEqual(['RESUME GAME', 'Disconnect']);
  });

  it('a custom HUD’s gamemenu.res orders and places the entries; unknown commands are left out', () => {
    const gm = `"GameMenu"
{
  "QuitButton" { "label" "#GameUI_GameMenu_Quit" "command" "engine quit" }
  "Spacer" { }
  "ServerBrowserButton" { "label" "Servers" "command" "OpenServerBrowser" "OnlyAtMenu" "1" }
  "ReplayButton" { "label" "Replays" "command" "engine replay_reloadbrowser" }
  "ResumeButton" { "label" "Back" "command" "ResumeGame" "OnlyInGame" "1" }
}`;
    const read = (p: string) => (p === GAME_MENU_FILE ? gm : readBase(p));
    const menu = buildGameMenu({ source: sourceOf(read), screen: { w: 1280, h: 720 }, inGame: false, entries: ENTRIES })!;
    const list = menu.targets.filter((t) => !t.placed);
    expect(list.map((t) => [t.command, t.label])).toEqual([
      ['quit', 'Quit'],
      ['find', 'Servers'],
      ['offline', 'Offline practice'],
      ['console', 'Console'],
    ]);
    // The spacer is YRES(20).
    expect(list[1].rect.y - list[0].rect.y).toBe(list[0].rect.h + scaled(5, 1.5) + scaled(20, 1.5));
  });

  it('without mainmenuoverride.res there is no .res menu (the UI keeps its own list)', () => {
    expect(buildGameMenu({ source: sourceOf(() => undefined), screen: { w: 1280, h: 720 }, inGame: false, entries: ENTRIES })).toBeNull();
    expect(menuCommand('engine open_charinfo')).toBe('loadout');
    expect(menuCommand('OpenOptionsDialog')).toBe('options');
    expect(menuCommand('engine replay_reloadbrowser')).toBeNull();
    expect(parseChapterBackgrounds('"chapters" { 1 "background_2fort" 2 "background_upward" }')).toEqual(['background_2fort', 'background_upward']);
    expect(backgroundImage('background_2fort', { w: 1024, h: 768 })).toBe('../console/background_2fort');
  });
});

describe('the loadout panel from classloadoutpanel.res', () => {
  const WEAPONS = ['primary', 'secondary', 'melee', 'building', 'pda', 'pda2', 'cosmetic1', 'cosmetic2', 'cosmetic3', 'action'];
  it.each(SCREENS)('panels where the editor previews them; slots where CClassLoadoutPanel puts them, %o', (screen) => {
    const r = buildLoadoutPanel({ source: sourceOf(readBase), screen, cls: 'soldier', className: 'Soldier', slots: WEAPONS })!;
    const editor = editorScene(readBase, [CLASS_LOADOUT_FILE], screen);
    const want = new Map(editor.nodes.map((n) => [n.id, n.rect]));
    for (const n of r.scene.nodes) expect(key(n.rect), n.id).toBe(key(want.get(n.id)!));
    const s = screen.h / 480;
    const doc = parseKv(readBase(CLASS_LOADOUT_FILE)!);
    const frame = activeEntries(doc.roots.find((x) => x.children)!, PC_ENV).find((e) => e.children)!;
    const fp = propsOf(frame, { env: PC_ENV });
    expect(r.slots.map((x) => x.slot)).toEqual(['primary', 'secondary', 'melee', 'cosmetic1', 'cosmetic2', 'cosmetic3', 'action']);
    const at = (slot: string) => r.slots.find((x) => x.slot === slot)!.rect;
    expect(at('primary').x).toBe(Math.trunc(screen.w / 2) + scaled(fp.num('item_xpos_offcenter_a'), s));
    expect(at('melee').y).toBe(scaled(fp.num('item_ypos'), s) + 2 * scaled(fp.num('item_ydelta'), s));
    expect(at('cosmetic1').x).toBe(Math.trunc(screen.w / 2) + scaled(fp.num('item_xpos_offcenter_b'), s));
    expect(at('cosmetic1').y).toBe(scaled(fp.num('item_ypos'), s));
    expect(at('action').y).toBe(scaled(fp.num('item_ypos'), s) + 3 * scaled(fp.num('item_ydelta'), s));
    expect(at('primary').w).toBe(scaled(140, s));
    expect(r.model).not.toBeNull();
    // %loadoutclass% is the class being equipped.
    expect(r.scene.nodes.flatMap((n) => n.ops).some((o) => o.t === 'text' && o.text === 'Soldier')).toBe(true);
  });

  it('the Spy and the Engineer have their own slot order', () => {
    expect(slotPositions('spy')).toMatchObject({ secondary: 1, melee: 2, pda2: 3, building: 4 });
    expect(slotPositions('engineer')).toMatchObject({ pda: 4 });
    expect(buildLoadoutPanel({ source: sourceOf(() => undefined), screen: { w: 1280, h: 720 }, cls: 'spy', className: 'Spy', slots: WEAPONS })).toBeNull();
  });
});

/* ───────────────────────── localisation ───────────────────────── */

const utf16 = (text: string) => {
  const b = Buffer.from(`\ufeff${text}`, 'utf16le');
  return new Uint8Array(b);
};

describe('the menus’ localisation', () => {
  it('layers valve_, gameui_ and tf_ files, the chosen language over English; a missing file is skipped', () => {
    const files = new Map<string, Uint8Array>([
      ['resource/valve_english.txt', utf16('"lang" { "Tokens" { "Valve_Jump" "Jump" "Shared" "valve" } }')],
      ['resource/gameui_english.txt', utf16('"lang" { "Tokens" { "GameUI_Mouse" "Mouse" "Shared" "gameui" "GameUI_Subtitles" "Subtitles (dialog only)" [$WIN32] "GameUI_Subtitles" "Subtitles" [$X360] } }')],
      ['resource/tf_english.txt', utf16('"lang" { "Tokens" { "Shared" "tf" } }')],
      ['resource/gameui_german.txt', utf16('"lang" { "Tokens" { "GameUI_Mouse" "Maus" } }')],
    ]);
    const t = layeredTokens({ language: 'german', readGame: (p) => files.get(p) });
    expect(t.get('valve_jump')).toBe('Jump');
    expect(t.get('gameui_mouse')).toBe('Maus');
    expect(t.get('shared')).toBe('tf');
    expect(t.get('gameui_subtitles')).toBe('Subtitles (dialog only)');
    expect(gameLanguageFiles('english')).toEqual(['resource/valve_english.txt', 'resource/gameui_english.txt', 'resource/tf_english.txt']);
    expect(layeredTokens({ language: 'english', readGame: () => undefined }).size).toBe(0);
    expect(parseLocalisation('"lang" { "Tokens" { "A" "x" [$X360] } }').tokens.size).toBe(0);
  });

  it('an option’s label comes from the game’s dialog file when it is there, else the control keeps its own', () => {
    const mouse = `"Resource\\\\OptionsSubMouse.res" { "MouseFilter" { "ControlName" "CCvarToggleCheckButton" "labelText" "#GameUI_MouseFilter" "tooltiptext" "#GameUI_MouseFilterLabel" } "Label3" { "ControlName" "Label" "labelText" "#GameUI_MouseSensitivity" } "Slider" { "ControlName" "CCvarSlider" } }`;
    const read = (p: string) => (p === 'resource/optionssubmouse.res' ? mouse : undefined);
    const filter = OPTION_CONTROLS.find((c) => c.id === 'm_filter')!;
    const sens = OPTION_CONTROLS.find((c) => c.id === 'sensitivity')!;
    expect(resText(read, PC_ENV, filter)).toEqual({ label: '#GameUI_MouseFilter', tooltip: '#GameUI_MouseFilterLabel' });
    expect(resText(read, PC_ENV, sens)).toEqual({ label: '#GameUI_MouseSensitivity', tooltip: undefined });
    expect(resText(() => undefined, PC_ENV, filter)).toEqual({});
    expect(filter.fallback).toBe('Mouse filter');
  });
});
