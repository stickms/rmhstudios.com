/**
 * Menus a custom HUD restyles (menus.ts), the freeze cam's run-time nesting
 * (build.ts `embeddedFileFor`) and the game's localisation for `#Token`s
 * (lib/tf2-hud/localisation.ts):
 *
 *  - fidelity: every panel of the HUD-driven scoreboard / team / class menu
 *    sits exactly where the HUD editor previews that file, for the base HUD and
 *    a customised sample, at 1920×1080 and 1280×720; the player rows stay
 *    inside their list; the buttons carry the commands TF2 gives them;
 *  - the freeze cam's killer health is laid out inside its panel, in game and
 *    in the editor alike;
 *  - localisation: UTF-16 parsing, the lookup order (the HUD's files → the
 *    game's language → English → the game's built-in stand-ins), the site
 *    language, and a missing file.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { varsFromState, type TestState } from '@/lib/tf2-hud/fixtures';
import { gateFor, progressFor } from '@/lib/tf2-hud/game-state';
import {
  hudLanguageFiles,
  languageForSite,
  layeredTokens,
  parseLanguageBytes,
  tfLanguageOf,
} from '@/lib/tf2-hud/localisation';
import { buildScene, embeddedFileFor, type SceneContext } from '@/lib/tf2-hud/scene/build';
import { resolvePage } from '@/lib/tf2-hud/pages';
import type { Scene } from '@/lib/tf2-hud/scene/types';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';
import { parseScheme } from '@/lib/tf2-hud/scheme/scheme';
import { textContent } from '@/lib/tf2-hud/project/model';
import { SCENARIOS } from '@/components/tf2-game/preview/sample-states';
import type { HudScoreRow, HudState } from '../hud-state';
import { liveVars, toTestState } from './adapter';
import { bindingsFor, inGameFiles } from './bindings';
import {
  buildMenu,
  classPortraitFor,
  customisedMenus,
  localize,
  MENU_FILES,
  menuAction,
  readMenuText,
  SPECTATOR_FILE,
  SPECTATOR_TARGET_FILE,
  teamMenuHotkeys,
  type HudMenuKind,
} from './menus';
import { applySampleEdits, sampleHud } from './sample-huds';
import { InGameScene, type SceneSource } from './scene';

const BASE = path.resolve(import.meta.dirname, '../../../../public/tf2-hud/base');
const readBase = (p: string): string | undefined => {
  const f = path.join(BASE, p);
  return existsSync(f) ? readFileSync(f, 'utf8') : undefined;
};

interface Hud {
  name: string;
  read: (p: string) => string | undefined;
}
const sample = applySampleEdits(sampleHud('menus')!, readBase);
const HUDS: Hud[] = [
  { name: 'base', read: readBase },
  { name: 'menus sample', read: (p) => sample.get(p) ?? readBase(p) },
];
const SCREENS = [
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
];

function sourceOf(hud: Hud, strings: ReadonlyMap<string, string> = new Map()): SceneSource {
  return {
    readText: readMenuText(hud.read),
    scheme: parseScheme(hud.read('resource/clientscheme.res')!, PC_ENV),
    env: PC_ENV,
    minmode: false,
    strings,
  };
}

/** The editor's preview of one file (useScene's context, minus animations). */
function editorScene(
  hud: Hud,
  test: TestState,
  files: readonly string[],
  screen: { w: number; h: number },
): Scene {
  const src = sourceOf(hud);
  const ctx: SceneContext = {
    readText: hud.read,
    scheme: src.scheme,
    env: PC_ENV,
    screen,
    minmode: false,
    showHidden: false,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: varsFromState(test),
    strings: new Map(),
    progress: test.progress / 100,
    gate: gateFor(test),
    progressFor: progressFor(test),
    player: { playerClass: test.playerClass, team: test.team },
  };
  return buildScene(ctx, files);
}

function row(over: Partial<HudScoreRow>): HudScoreRow {
  return {
    id: 1,
    name: 'P',
    team: 2,
    cls: 1,
    score: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    ping: 30,
    dead: false,
    bot: true,
    isLocal: false,
    dominated: false,
    nemesis: false,
    ...over,
  };
}

/** A full match: the local Soldier and a dozen bots on both teams, one spectator. */
function matchState(): HudState {
  const s = SCENARIOS.soldierCp();
  const rows: HudScoreRow[] = [
    row({ id: 1, name: 'Tester', team: 2, cls: 3, score: 30, isLocal: true, bot: false, kills: 5 }),
  ];
  for (let i = 2; i <= 13; i++)
    rows.push(
      row({
        id: i,
        name: `Bot ${i}`,
        team: i % 2 ? 3 : 2,
        cls: (i % 9) + 1,
        score: 20 - i,
        dead: i === 4,
        dominated: i === 5,
      }),
    );
  rows.push(row({ id: 40, name: 'Watcher', team: 1, cls: 0, bot: false }));
  return { ...s, scoreboard: rows };
}

describe('HUD-driven menus sit exactly where the editor previews their file', () => {
  const kinds: HudMenuKind[] = ['scoreboard', 'team', 'class'];
  for (const hud of HUDS) {
    for (const screen of SCREENS) {
      for (const kind of kinds) {
        it(`${hud.name} · ${screen.w}×${screen.h} · ${kind}`, () => {
          const state = matchState();
          const menu = buildMenu({ kind, state, source: sourceOf(hud), screen });
          const editor = editorScene(hud, toTestState(state), [MENU_FILES[kind]], screen);
          const ours = new Map(menu.scene.nodes.map((n) => [n.id, n]));
          expect(editor.nodes.length).toBeGreaterThan(20);
          for (const n of editor.nodes) {
            expect(ours.get(n.id)?.rect, n.id).toEqual(n.rect);
          }
          // Everything else is a player row, inside its list.
          for (const n of menu.scene.nodes) {
            if (editor.nodes.some((e) => e.id === n.id)) continue;
            expect(n.control).toBe('SectionedListPanelRow');
            const list = ours.get(n.parentId!)!;
            expect(n.rect.x).toBeGreaterThanOrEqual(list.rect.x);
            expect(n.rect.y + n.rect.h).toBeLessThanOrEqual(list.rect.y + list.rect.h + 1);
          }
        });
      }
    }
  }

  it('fills the scoreboard with the live game: scores, counts, rows best first, the local player marked', () => {
    const state = matchState();
    const { scene } = buildMenu({
      kind: 'scoreboard',
      state,
      source: sourceOf(HUDS[0]),
      screen: SCREENS[0],
    });
    const text = (id: string) => {
      const op = scene.nodes.find((n) => n.id === id)?.ops.find((o) => o.t === 'text');
      return op?.t === 'text' ? op.text : undefined;
    };
    expect(text('resource/ui/scoreboard.res#BlueTeamScore')).toBe(String(state.match.blueScore));
    expect(text('resource/ui/scoreboard.res#RedTeamPlayerCount')).toBe('7 Players');
    expect(text('resource/ui/scoreboard.res#Spectators')).toBe('1 Spectator: Watcher');
    const red = scene.nodes.filter(
      (n) => n.control === 'SectionedListPanelRow' && n.parentId?.endsWith('RedPlayerList'),
    );
    expect(red).toHaveLength(7);
    const names = red.map((n) => n.name);
    expect(names[0]).toBe('Tester');
    // The local row has the selection fill; a dead bot's text is dimmed.
    expect(red[0].ops[0].t).toBe('rect');
    const dead = scene.nodes.find((n) => n.name === 'Bot 4')!;
    const deadText = dead.ops.find((o) => o.t === 'text');
    expect(deadText?.t === 'text' && deadText.color.a).toBeLessThan(255);
    // Ping column says BOT for bots.
    expect(dead.ops.some((o) => o.t === 'text' && o.text === 'BOT')).toBe(true);
  });

  it('gives the team and class buttons their TF2 commands, hotkeys and the current choice', () => {
    const state = matchState();
    const team = buildMenu({ kind: 'team', state, source: sourceOf(HUDS[1]), screen: SCREENS[1] });
    const teams = team.targets.flatMap((t) =>
      t.action.kind === 'team' ? [[t.action.team, t.hotkey, t.current]] : [],
    );
    // The number keys are the ones the HUD's labels mark (`&3` on BLU in TF2's own file).
    expect(teams).toEqual(
      expect.arrayContaining([
        ['blue', 3, false],
        ['red', 4, true],
        ['auto', 1, false],
        ['spectator', 2, false],
      ]),
    );
    expect([...teamMenuHotkeys(sourceOf(HUDS[0]))].sort()).toEqual([
      [1, 'auto'],
      [2, 'spectator'],
      [3, 'blue'],
      [4, 'red'],
    ]);
    const cls = buildMenu({
      kind: 'class',
      state,
      source: sourceOf(HUDS[0]),
      screen: SCREENS[0],
      team: 2,
    });
    const classes = cls.targets.filter((t) => t.action.kind === 'class');
    expect(classes).toHaveLength(10);
    const soldier = classes.find((t) => t.action.kind === 'class' && t.action.cls === 'soldier')!;
    expect(soldier.hotkey).toBe(2);
    expect(soldier.current).toBe(true);
    expect(cls.targets.some((t) => t.action.kind === 'loadout')).toBe(true);
    expect(cls.targets.some((t) => t.action.kind === 'close')).toBe(true);
    // Hovering a class arms it with its team picture (CTFClassMenu), the rest stay inactive.
    const hovered = buildMenu({
      kind: 'class',
      state,
      source: sourceOf(HUDS[0]),
      screen: SCREENS[0],
      team: 3,
      hover: 'medic',
    });
    const img = (name: string) =>
      hovered.scene.nodes
        .find((n) => n.id === `resource/ui/classselection.res#${name}`)
        ?.ops.find((o) => o.t === 'image');
    expect(img('medic')?.t === 'image' && img('medic')!.path).toBe(
      'materials/vgui/class_sel_sm_medic_blu',
    );
    expect(img('pyro')?.t === 'image' && img('pyro')!.path).toBe(
      'materials/vgui/class_sel_sm_pyro_inactive',
    );
    // Counts per class, blank when nobody plays it.
    const count = (id: string) => {
      const op = cls.scene.nodes.find((n) => n.id === id)?.ops.find((o) => o.t === 'text');
      return op?.t === 'text' ? op.text : undefined;
    };
    expect(count('resource/ui/classselection.res#numSoldier')).toBe('2');
    expect(count('resource/ui/classselection.res#numScout')).toBe('');
    expect(classPortraitFor('materials/vgui/class_sel_sm_demo_red', 3)).toBe(
      'materials/hud/class_demoblue',
    );
    expect(classPortraitFor('materials/vgui/class_sel_sm_random_inactive', 3)).toBeUndefined();
  });

  it('reads commands the way the game does', () => {
    expect(menuAction('jointeam blue')).toEqual({ kind: 'team', team: 'blue' });
    expect(menuAction('engine jointeam spectate')).toEqual({ kind: 'team', team: 'spectator' });
    expect(menuAction('select 12')).toEqual({ kind: 'class', cls: 'random' });
    expect(menuAction('select 6')).toEqual({ kind: 'class', cls: 'heavy' });
    expect(menuAction('joinclass heavyweapons')).toEqual({ kind: 'class', cls: 'heavy' });
    expect(menuAction('vguicancel')).toEqual({ kind: 'close' });
    expect(menuAction('openloadout')).toEqual({ kind: 'loadout' });
    expect(menuAction('resetclass')).toBeNull();
    expect(menuAction('select 99')).toBeNull();
  });

  it('restyles only the menus whose file the HUD ships', () => {
    const overlay = new Map([
      [MENU_FILES.scoreboard, textContent('"x"{}')],
      [MENU_FILES.team, null],
      [SPECTATOR_FILE, textContent('"x"{}')],
    ]);
    const c = customisedMenus(overlay);
    expect([...c.menus]).toEqual(['scoreboard']);
    expect(c.spectator).toBe(true);
    expect(customisedMenus(new Map()).menus.size).toBe(0);
  });
});

describe('the spectator GUI of a HUD that restyles it', () => {
  const dead = (): HudState => {
    const s = SCENARIOS.soldierCp();
    return {
      ...s,
      freezecam: null,
      local: {
        ...s.local!,
        alive: false,
        respawnIn: 7.2,
        spectating: { id: 9, name: 'Watched', team: 3, cls: 5, health: 75, maxHealth: 150 },
      },
    };
  };

  it('is drawn while dead after the freeze cam, with the respawn time and the watched player', () => {
    const s = dead();
    const test = toTestState(s);
    expect(inGameFiles(s, test, { spectator: false })).not.toContain(SPECTATOR_FILE);
    const files = inGameFiles(s, test, { spectator: true });
    expect(files).toEqual(expect.arrayContaining([SPECTATOR_FILE, SPECTATOR_TARGET_FILE]));
    expect(
      inGameFiles({ ...s, freezecam: SCENARIOS.spyDead().freezecam }, test, { spectator: true }),
    ).not.toContain(SPECTATOR_FILE);
    const hud = HUDS[1];
    const strings = new Map([['game_respawntime_in_secs', 'Respawn in: %s1 seconds']]);
    const { scene } = new InGameScene(sourceOf(hud, strings)).build({
      files,
      test,
      vars: liveVars(s, test),
      bindings: bindingsFor(s, test, strings),
      screen: SCREENS[0],
    });
    const text = (id: string) => {
      const op = scene.nodes.find((n) => n.id === id && n.shown)?.ops.find((o) => o.t === 'text');
      return op?.t === 'text' ? op.text : undefined;
    };
    expect(text('resource/ui/spectator.res#ReinforcementsLabel')).toBe('Respawn in: 8 seconds');
    expect(text(`${SPECTATOR_TARGET_FILE}#TargetNameLabel`)).toBe('Watched');
    // The watched player's health, from the health panel the target ID loads at run time.
    expect(text('resource/ui/spectatorguihealth.res#PlayerStatusHealthValue')).toBe('75');
    // Placed by the HUD's CSpectatorTargetID block, not at the screen's corner.
    const bg = scene.nodes.find((n) => n.id === `${SPECTATOR_TARGET_FILE}#TargetIDBG_Spec_Blue`)!;
    expect(bg.shown).toBe(true);
    expect(bg.rect.y).toBeGreaterThan(SCREENS[0].h / 3);
  });
});

describe('the freeze cam loads the killer health panel into its health panel', () => {
  const KILLER = 'resource/ui/freezepanelkillerhealth.res';
  it('knows which panels load files at run time', () => {
    expect(embeddedFileFor('CTFFreezePanelHealth', 'x')).toBe(KILLER);
    expect(embeddedFileFor('EditablePanel', 'SpectatorGUIHealth')).toBe(
      'resource/ui/spectatorguihealth.res',
    );
    expect(embeddedFileFor('EditablePanel', 'Other')).toBeUndefined();
  });

  for (const hud of HUDS) {
    for (const screen of SCREENS) {
      it(`${hud.name} · ${screen.w}×${screen.h}: in its parent, in game as in the editor's freeze-cam page`, () => {
        const s = SCENARIOS.spyDead();
        const test = toTestState(s);
        const page = resolvePage('freeze')!;
        const editor = editorScene(hud, test, page.files, screen);
        const game = new InGameScene(sourceOf(hud)).build({
          files: inGameFiles(s, test),
          test,
          vars: liveVars(s, test),
          bindings: bindingsFor(s, test),
          screen,
        }).scene.nodes;
        const parent = editor.nodes.find(
          (n) => n.id === 'resource/ui/freezepanel_basic.res#FreezePanelHealth',
        )!;
        const killer = editor.nodes.filter((n) => n.file === KILLER);
        expect(killer.length).toBeGreaterThan(3);
        for (const n of killer) {
          // Drawn once, nested: its offsets are from the health panel, never from the screen's corner.
          expect(n.parentId).toBe(parent.id);
          expect(n.rect.x).toBeGreaterThanOrEqual(parent.rect.x);
          expect(n.rect.y).toBeGreaterThanOrEqual(parent.rect.y);
          expect(game.find((g) => g.id === n.id)?.rect, n.id).toEqual(n.rect);
        }
        const value = game.find((n) => n.id === `${KILLER}#PlayerStatusHealthValue`);
        const op = value?.ops.find((o) => o.t === 'text');
        expect(op?.t === 'text' && op.text).toBe(String(s.freezecam!.killerHealth));
      });
    }
  }
});

/* ─────────────────────────── localisation ─────────────────────────── */

/** A language file as Valve ships it: UTF-16LE with a BOM. */
function utf16(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

const langFile = (language: string, tokens: Record<string, string>) =>
  utf16(
    `"lang"\n{\n"Language" "${language}"\n"Tokens"\n{\n${Object.entries(tokens)
      .map(([k, v]) => `"${k}" "${v}"`)
      .join('\n')}\n}\n}\n`,
  );

describe('TF2 localisation for #Tokens', () => {
  it('parses UTF-16 language files (BOM, escapes, non-Latin text)', () => {
    const parsed = parseLanguageBytes(
      langFile('Russian', { TF_Ubercharge: 'ÜБЕРЗАРЯД', Two_Lines: 'a\\nb' }),
    );
    expect(parsed.language).toBe('russian');
    expect(parsed.tokens.get('tf_ubercharge')).toBe('ÜБЕРЗАРЯД');
    expect(parsed.tokens.get('two_lines')).toBe('a\nb');
  });

  it('looks a token up in the HUD’s files, then the game’s language, then English, then the stand-ins', () => {
    const game = new Map([
      [
        'resource/tf_english.txt',
        langFile('English', { A: 'game en A', B: 'game en B', C: 'game en C', D: 'game en D' }),
      ],
      [
        'resource/tf_german.txt',
        langFile('German', { B: 'game de B', C: 'game de C', D: 'game de D' }),
      ],
    ]);
    const hud = new Map([
      ['resource/myhud_english.txt', langFile('English', { C: 'hud en C', D: 'hud en D' })],
      ['resource/myhud_german.txt', langFile('German', { D: 'hud de D' })],
      ['resource/ui/notes_english.txt', langFile('English', { D: 'ignored: not in resource/' })],
    ]);
    const tokens = layeredTokens({
      language: 'german',
      readGame: (p) => game.get(p),
      readHud: (p) => hud.get(p),
      hudPaths: hud.keys(),
      fallback: new Map([
        ['a', 'fallback A'],
        ['e', 'fallback E'],
      ]),
    });
    expect(tokens.get('a')).toBe('game en A');
    expect(tokens.get('b')).toBe('game de B');
    expect(tokens.get('c')).toBe('hud en C');
    expect(tokens.get('d')).toBe('hud de D');
    expect(tokens.get('e')).toBe('fallback E');
    expect(hudLanguageFiles(hud.keys(), 'german')).toEqual([
      'resource/myhud_english.txt',
      'resource/myhud_german.txt',
    ]);
  });

  it('falls back to the built-in stand-ins when no language file is published yet', () => {
    const tokens = layeredTokens({
      language: 'english',
      readGame: () => undefined,
      fallback: new Map([['tf_ubercharge', 'ÜBERCHARGE']]),
    });
    expect(tokens.get('tf_ubercharge')).toBe('ÜBERCHARGE');
    expect(localize(tokens, 'Missing_Token', 'Map: %s1', 'cp_x')).toBe('Map: cp_x');
  });

  it('shows the site’s language when the game ships it, else English', () => {
    expect(tfLanguageOf('de')).toBe('german');
    expect(tfLanguageOf('pt-BR')).toBe('brazilian');
    expect(tfLanguageOf('pt-PT')).toBe('portuguese');
    expect(tfLanguageOf('zh-TW')).toBe('tchinese');
    expect(tfLanguageOf('zh')).toBe('schinese');
    expect(tfLanguageOf('es-419')).toBe('latam');
    expect(tfLanguageOf('ar')).toBeUndefined();
    const has = (p: string) => p === 'resource/tf_german.txt';
    expect(languageForSite('de', has)).toBe('german');
    expect(languageForSite('fr', has)).toBe('english');
    expect(languageForSite('ar', has)).toBe('english');
  });
});
