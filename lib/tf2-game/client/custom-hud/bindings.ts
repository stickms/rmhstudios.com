/**
 * What the game decides about a custom HUD's panels, frame by frame: which
 * panel files are on screen, which panels inside them are visible, how full
 * each bar is, and the text the game writes into labels at run time.
 *
 * The HUD editor already answers the first three for its preview
 * (`gateFor` / `progressFor` in lib/tf2-hud/game-state.ts, from a TestState);
 * the in-game HUD starts from exactly those answers and only adds what the
 * live game knows and the editor's fixtures cannot (the ammo panel's clip vs.
 * no-clip labels, the KOTH clocks' values, the win panel's top players, the
 * carried-flag icon…). `.res` values are only ever read as data.
 */

import { currentWeapon, gateFor, progressFor } from '@/lib/tf2-hud/game-state';
import { FILL_KEY } from '@/lib/tf2-hud/scene/build';
import type { TestState } from '@/lib/tf2-hud/fixtures';
import { formatClock, type HudBuilding, type HudConditions, type HudState } from '../hud-state';
import { localize, SPECTATOR_FILE, SPECTATOR_TARGET_FILE } from './menus';

const ui = (name: string) => `resource/ui/${name}.res`;

/** Files every class shows while alive and on a team. */
export const PLAYER_FILES = [
  ui('hudplayerclass'),
  ui('hudplayerhealth'),
  ui('hudammoweapons'),
] as const;
export const ENGINEER_FILES = [
  ui('hudaccountpanel'),
  ui('hud_obj_sentrygun'),
  ui('hud_obj_dispenser'),
  ui('hud_obj_tele_entrance'),
  ui('hud_obj_tele_exit'),
] as const;
export const KOTH_FILE = ui('hudobjectivekothtimepanel');
export const WIN_FILE = ui('winpanel');
/**
 * The freeze cam's card. Its `FreezePanelHealth` (`CTFFreezePanelHealth`) loads
 * `freezepanelkillerhealth.res` into itself at run time; the scene builder nests it there
 * (`embeddedFileFor` in lib/tf2-hud/scene/build.ts), in game and in the editor alike.
 */
export const FREEZE_FILES = [ui('freezepanel_basic')] as const;
/** Panel files other panels load into themselves (fetched with the HUD, never drawn on their own). */
export const EMBEDDED_INGAME_FILES = [
  ui('freezepanelkillerhealth'),
  ui('spectatorguihealth'),
] as const;
export const MEDIC_FILE = ui('hudmediccharge');
export const DISGUISE_FILE = ui('disguisestatuspanel');

/** Every file the in-game HUD can draw (the loader fetches these up front, so switching class never waits). */
export const ALL_INGAME_FILES: readonly string[] = [
  ...PLAYER_FILES,
  ...ENGINEER_FILES,
  MEDIC_FILE,
  DISGUISE_FILE,
  ui('huddemomanpipes'),
  ui('huditemeffectmeter_spy'),
  KOTH_FILE,
  WIN_FILE,
  ...FREEZE_FILES,
];

/**
 * The panel files on screen for this state, in the order they paint (the
 * editor's "Gameplay HUD" page order, then objectives, then round panels).
 */
/** Which optional groups the canvas draws (the rest stay the game's own panels). */
export interface InGameOptions {
  /**
   * The Engineer's building panels (`hud_obj_*.res`). The base pack lacks most of their textures, so
   * they are drawn from the HUD only when it customises them; otherwise the game's own status panel
   * stays (placed by the HUD's `BuildingStatus_Engineer`).
   */
  buildings?: boolean;
  /**
   * The spectator GUI (`spectator.res`, and the watched player's target ID) while dead or spectating.
   * Drawn only for a HUD that customises `spectator.res`; otherwise the game's own respawn text stays.
   */
  spectator?: boolean;
}

export function inGameFiles(
  state: HudState,
  test: TestState,
  opts: InGameOptions = { buildings: true },
): string[] {
  const out: string[] = [];
  const local = state.local;
  const m = state.match;
  const playing = !!local && local.team >= 2 && local.cls > 0;
  if (playing && local) {
    if (local.alive) {
      out.push(...PLAYER_FILES);
      if (test.playerClass === 'engineer') {
        out.push(ENGINEER_FILES[0]);
        if (opts.buildings) out.push(...ENGINEER_FILES.slice(1));
      }
      if (test.playerClass === 'medic') out.push(MEDIC_FILE);
      // The disguise panel is up while disguised (the editor shows it for any Spy).
      if (test.playerClass === 'spy' && (local.conditions.disguised || local.conditions.disguising))
        out.push(DISGUISE_FILE);
      const meter = currentWeapon(test)?.meter;
      if (meter) out.push(ui(meter));
    }
  }
  if (m.mode === 'koth' && m.koth) out.push(KOTH_FILE);
  if (playing && local && !local.alive && state.freezecam) out.push(...FREEZE_FILES);
  // CTFSpectatorGUI: while dead (after the freeze cam) or watching as a spectator.
  if (
    opts.spectator &&
    local &&
    (!local.alive || local.team < 2) &&
    !(playing && state.freezecam)
  ) {
    out.push(SPECTATOR_FILE);
    if (local.spectating) out.push(SPECTATOR_TARGET_FILE);
  }
  if (m.win) out.push(WIN_FILE);
  return [...new Set(out)];
}

const baseOf = (file: string): string =>
  file
    .slice(file.lastIndexOf('/') + 1)
    .replace(/\.res$/i, '')
    .toLowerCase();

const BUILDING_FILE: Readonly<Record<string, 'sentry' | 'dispenser' | 'entrance' | 'exit'>> = {
  hud_obj_sentrygun: 'sentry',
  hud_obj_dispenser: 'dispenser',
  hud_obj_tele_entrance: 'entrance',
  hud_obj_tele_exit: 'exit',
};

export interface Bindings {
  gate: (file: string, name: string) => boolean | undefined;
  progressFor: (file: string, name: string) => number | undefined;
  /**
   * What the game sets on a panel at run time (by its key path in its file): a label's text, the image
   * its code draws (the health cross and its fill). Undefined keeps the file's own keys.
   */
  overridesFor: (
    file: string,
    keyPath: readonly string[],
  ) => Readonly<Record<string, string>> | undefined;
}

const frac = (n: number, d: number) => (d > 0 ? Math.max(0, Math.min(1, n / d)) : 0);

function buildingOf(state: HudState, file: string): HudBuilding | undefined {
  const kind = BUILDING_FILE[baseOf(file)];
  const eng = state.local?.engineer;
  return kind && eng ? eng[kind] : undefined;
}

export function bindingsFor(
  state: HudState,
  test: TestState,
  strings: ReadonlyMap<string, string> = new Map(),
): Bindings {
  const gate = gateFor(test);
  const progress = progressFor(test);
  const local = state.local;
  const m = state.match;
  const ammoKind = local?.ammo.kind ?? 'none';
  const carrying = m.flags.some((f) => f.carriedByLocal);
  const win = m.win;

  return {
    gate(file, rawName) {
      const base = baseOf(file);
      const n = rawName.toLowerCase();
      if (
        base === 'hudplayerhealth' &&
        n.startsWith('playerstatus') &&
        !n.startsWith('playerstatushealth') &&
        n !== 'playerstatusmaxhealthvalue'
      ) {
        // The condition icons are all "visible" in the file; the game shows the ones that apply.
        const c = local?.conditions;
        const on = CONDITION_ICONS[n];
        return !!c && on !== undefined && c[on] === true;
      }
      if (base === 'hudplayerclass') {
        // The Spy's portrait is his disguise; the 3D class model (cl_hud_playerclass_use_playermodel) is not drawn here.
        if (n === 'playerstatusspyimage')
          return test.playerClass === 'spy' && !!local?.conditions.disguised;
        if (n === 'playerstatusspyoutlineimage')
          return test.playerClass === 'spy' && !!local?.conditions.disguising;
        if (n === 'classmodelpanel' || n === 'classmodelpanelbg') return false;
      }
      if (base === 'hudammoweapons') {
        // CTFHudWeaponAmmo: a clip weapon shows clip + reserve, a reserve-only weapon one number, melee nothing.
        if (ammoKind === 'none') return false;
        if (n.startsWith('ammoinclip') || n.startsWith('ammoinreserve')) return ammoKind === 'clip';
        if (n.startsWith('ammonoclip')) return ammoKind === 'reserve-only';
      }
      if (base === 'hudobjectiveflagpanel') {
        if (n === 'carriedimage' || n === 'outlineimage') return carrying;
        if (
          n === 'speccarriedimage' ||
          n === 'poisonicon' ||
          n === 'poisontimelabel' ||
          n === 'captureflag'
        )
          return false;
      }
      if (base === 'hudobjectivekothtimepanel' && n === 'activetimerbg') return !!m.koth?.active;
      if (base === 'freezepanel_basic') {
        const fc = state.freezecam;
        if (n === 'nemesissubpanel') return !!fc?.dominated;
        if (n === 'screenshotpanel' || n === 'itempanel') return false;
        // The killer's health: a player's or a building's (CTFFreezePanel::ShowSnapshotPanel), none for the world.
        if (n === 'freezepanelhealth')
          return !!fc && (fc.kind === 'player' || fc.kind === 'object');
      }
      if (base === 'freezepanelkillerhealth') {
        const building = state.freezecam?.kind === 'object';
        if (n === 'buildingstatushealthimagebg') return building;
        if (n === 'playerstatushealthimagebg') return !building;
      }
      if (base === 'spectator') {
        // Tips, the buy-back counter and the killer's item card need data this game does not have.
        if (n === 'tiplabel' || n === 'buybacklabel' || n === 'itempanel') return false;
        if (n === 'reinforcementslabel')
          return !!local && local.team >= 2 && !local.alive && local.respawnIn !== null;
      }
      if (base === 'cspectatortargetid') {
        // CSpectatorTargetID: the watched player's team background and health; no avatar, item or streak.
        const spec = local?.spectating;
        // The element itself (hudlayout.res starts it hidden; the game shows it while someone is watched).
        if (n === 'cspectatortargetid') return !!spec;
        if (n === 'targetidbg') return false;
        if (n === 'targetidbg_spec_blue') return spec?.team === 3;
        if (n === 'targetidbg_spec_red') return spec?.team === 2;
        if (n === 'spectatorguihealth') return !!spec;
        if (
          n === 'ammoicon' ||
          n === 'killstreakicon' ||
          n === 'moveablesubpanel' ||
          n === 'avatarimage'
        )
          return false;
      }
      if (base === 'winpanel' && win) {
        const row = /^(?:killstreak)?player(\d)/.exec(n);
        if (row && !n.startsWith('killstreak')) return Number(row[1]) <= win.top.length;
        if (n.startsWith('killstreak')) return false;
        if (n.startsWith('advancingteamlabel')) return false;
      }
      const b = buildingOf(state, file);
      if (b) {
        if (n === 'notbuiltpanel') return !b.exists;
        if (n === 'builtpanel') return b.exists;
      }
      return gate(file, rawName);
    },
    progressFor(file, rawName) {
      const n = rawName.toLowerCase();
      const b = buildingOf(state, file);
      if (b) {
        if (n.includes('health')) return frac(b.health, b.maxHealth);
        if (n.includes('upgrade')) return frac(b.upgradeMetal, b.upgradeMetalRequired);
        if (n.includes('build') || n.includes('construct')) return b.buildProgress;
        if (n.includes('ammo') || n.includes('shell')) return frac(b.shells, b.maxShells);
        if (n.includes('rocket')) return frac(b.rockets, b.maxRockets);
        if (n.includes('metal')) return frac(b.metal, 400);
        if (n.includes('charge') || n.includes('recharge')) return b.charge;
      }
      return progress(file, rawName);
    },
    overridesFor(file, keyPath): Readonly<Record<string, string>> | undefined {
      const base = baseOf(file);
      const n = keyPath[keyPath.length - 1]?.toLowerCase() ?? '';
      // CTFHealthPanel: the health cross the code fills from the bottom (hud/health_color), grey when dead.
      if (n === 'playerstatushealthimage') {
        const fc = state.freezecam;
        const spec = local && !local.alive ? local.spectating : null;
        const [health, max] =
          base === 'freezepanelkillerhealth' && fc
            ? [fc.killerHealth, fc.killerMaxHealth]
            : base === 'spectatorguihealth' && spec
              ? [spec.health, spec.maxHealth]
              : [local?.alive ? local.health : 0, local?.maxHealth ?? 1];
        if (health <= 0) return { image: '../hud/health_dead', scaleimage: '1' };
        return {
          image: '../hud/health_color',
          scaleimage: '1',
          [FILL_KEY]: String(frac(health, max)),
        };
      }
      const text = textFor(file, keyPath);
      return text === undefined ? undefined : { labeltext: text };
    },
  };

  function textFor(file: string, keyPath: readonly string[]): string | undefined {
    const base = baseOf(file);
    const n = keyPath[keyPath.length - 1]?.toLowerCase() ?? '';
    const parent = keyPath[keyPath.length - 2]?.toLowerCase() ?? '';
    if (base === 'spectator') {
      // CTFSpectatorGUI::UpdateReinforcements / the map name, through the game's own strings.
      if (
        n === 'reinforcementslabel' &&
        local?.respawnIn !== null &&
        local?.respawnIn !== undefined
      ) {
        const secs = Math.max(0, Math.ceil(local.respawnIn));
        return secs <= 0
          ? localize(strings, 'game_respawntime_now', 'Prepare to respawn')
          : secs === 1
            ? localize(strings, 'game_respawntime_in_sec', 'Respawn in: 1 second')
            : localize(strings, 'game_respawntime_in_secs', 'Respawn in: %s1 seconds', secs);
      }
      if (n === 'maplabel') return localize(strings, 'Spec_Map', 'Map: %s1', m.map);
    }
    if (base === 'hudobjectivekothtimepanel' && n === 'timepanelvalue' && m.koth) {
      if (parent === 'bluetimer') return formatClock(m.koth.blue);
      if (parent === 'redtimer') return formatClock(m.koth.red);
    }
    if (base === 'winpanel' && win) {
      const row = /^player(\d)(name|class|score)$/.exec(n);
      const p = row ? win.top[Number(row[1]) - 1] : undefined;
      if (row && p) {
        if (row[2] === 'name') return p.name;
        if (row[2] === 'score') return String(p.score);
        return CLASS_LABEL[p.cls] ?? '';
      }
    }
    if (n === 'playerstatushealthvalue') {
      // The health panels loaded into the freeze cam (the killer) and a target ID (who is watched).
      const fc = state.freezecam;
      if (base === 'freezepanelkillerhealth' && fc) return String(Math.max(0, fc.killerHealth));
      const spec = local?.spectating;
      if (base === 'spectatorguihealth' && spec && !local?.alive)
        return String(Math.max(0, spec.health));
    }
    const b = buildingOf(state, file);
    if (b && b.exists) {
      if (n === 'kills' || n === 'killslabel' || n === 'sentrykills') return String(b.kills);
      if (n === 'ammo' || n === 'shells') return String(b.shells);
      if (n === 'rockets') return String(b.rockets);
    }
    return undefined;
  }
}

/** hudplayerhealth.res condition icons → the condition that shows each (the rest never apply in this game). */
const CONDITION_ICONS: Readonly<Record<string, keyof HudConditions>> = {
  playerstatusbleedimage: 'bleeding',
  playerstatusmilkimage: 'milked',
  playerstatusmarkedfordeathimage: 'markedForDeath',
  playerstatusslowed: 'stunned',
};

const CLASS_LABEL: Readonly<Record<number, string>> = {
  1: 'Scout',
  2: 'Sniper',
  3: 'Soldier',
  4: 'Demoman',
  5: 'Medic',
  6: 'Heavy',
  7: 'Pyro',
  8: 'Spy',
  9: 'Engineer',
};
