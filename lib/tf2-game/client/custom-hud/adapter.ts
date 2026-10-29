/**
 * The live game as the HUD editor's test state.
 *
 * The HUD editor previews a HUD from a `TestState` (lib/tf2-hud/fixtures.ts):
 * class, team, health, ammo, meters, scores, the round clock and the transient
 * events that switch panels on. The browser game publishes a much richer
 * `HudState` (./../hud-state.ts) at 20–30 Hz. `toTestState` maps one onto the
 * other so a custom HUD is drawn in game by the editor's own scene builder,
 * from the same numbers it previews — which is what makes the in-game HUD look
 * exactly like the editor shows it.
 *
 * `liveVars` adds the `%variables%` the game sets that the editor's fixtures
 * only stand in for (the respawn time, the killer's name, the win panel's
 * labels…). Everything here is pure: unit-tested in adapter.test.ts.
 */

import {
  DEFAULT_TEST_STATE,
  varsFromState,
  type Team,
  type TestState,
  type Tf2Class,
} from '@/lib/tf2-hud/fixtures';
import {
  TF_CLASS_DEMOMAN,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
} from '../../core/constants';
import { formatClock, type HudLocalPlayer, type HudState } from '../hud-state';

/** ETFClass → the editor's class id. */
export const CLASS_ID: Readonly<Record<number, Tf2Class>> = {
  [TF_CLASS_SCOUT]: 'scout',
  [TF_CLASS_SNIPER]: 'sniper',
  [TF_CLASS_SOLDIER]: 'soldier',
  [TF_CLASS_DEMOMAN]: 'demoman',
  [TF_CLASS_MEDIC]: 'medic',
  [TF_CLASS_HEAVYWEAPONS]: 'heavy',
  [TF_CLASS_PYRO]: 'pyro',
  [TF_CLASS_SPY]: 'spy',
  [TF_CLASS_ENGINEER]: 'engineer',
};

export const teamOf = (team: number): Team => (team === TF_TEAM_BLUE ? 'blue' : 'red');

/**
 * The editor weapon (lib/tf2-hud/game-state.ts `WEAPONS`) whose HUD the local player's loadout shows.
 *
 * The browser game carries the stock loadout, so the meters it has are the stock ones: the Medi Gun's
 * Über bar, the stickybomb counter, the Spy's cloak meter. Classes whose stock weapons show no meter
 * get an id the editor has no meter for (`stock-<class>`), so no weapon meter is drawn — the editor's
 * own default for the Sniper is the Hitman's Heatmaker focus meter, which the stock rifle does not have.
 */
export function weaponFor(local: HudLocalPlayer, cls: Tf2Class): string {
  const m = local.meters;
  if (cls === 'medic') return 'medigun';
  if (cls === 'demoman' && m.stickyCount !== null) return 'stickies';
  if (cls === 'spy' && m.cloak !== null) return 'cloak';
  return `stock-${cls}`;
}

const pct = (v: number | null | undefined): number =>
  v === null || v === undefined ? 0 : Math.max(0, Math.min(100, v * 100));

/** The weapon / item meter (0–100) the editor's `meter` field drives for this loadout. */
export function meterFor(local: HudLocalPlayer, cls: Tf2Class): number {
  const m = local.meters;
  if (cls === 'spy') return pct(m.cloak);
  if (cls === 'demoman') return pct(m.stickyCharge);
  if (cls === 'sniper') return pct(m.sniperCharge);
  if (cls === 'heavy') return pct(m.minigunSpin);
  return 0;
}

/** Seconds a hit we dealt keeps the "damage" event (the damage/heal account panels) on. */
export const DAMAGE_EVENT_SECONDS = 1.5;

/** The transient events (`EVENTS`/`SITUATIONS` in game-state.ts) that are on right now. */
export function eventsFor(state: HudState): string[] {
  const out: string[] = [];
  const local = state.local;
  if (local && state.damageNumbers.some((d) => state.now - d.at <= DAMAGE_EVENT_SECONDS))
    out.push('damage');
  if (local && state.match.flags.some((f) => f.carriedByLocal)) out.push('flag');
  if (state.match.roundState === 'stalemate') out.push('stalemate');
  return out;
}

/** The round clock the editor's `roundSeconds` stands for: the main timer, or the running KOTH clock. */
export function roundSecondsOf(state: HudState): number {
  const m = state.match;
  if (m.timer) return Math.max(0, Math.ceil(m.timer.remaining));
  if (m.koth) {
    const running =
      m.koth.active === TF_TEAM_BLUE
        ? m.koth.blue
        : m.koth.active
          ? m.koth.red
          : Math.max(m.koth.red, m.koth.blue);
    return Math.max(0, Math.ceil(running));
  }
  return 0;
}

/**
 * HudState → TestState. A spectator (no team or class yet) maps to the editor's defaults with the
 * match's numbers, so menus and the scoreboard still read the real scores.
 */
export function toTestState(state: HudState): TestState {
  const m = state.match;
  const ctf = m.mode === 'ctf';
  const timer = m.timer;
  const common = {
    redScore: ctf ? m.redFlagCaps : m.redScore,
    blueScore: ctf ? m.blueFlagCaps : m.blueScore,
    roundSeconds: roundSecondsOf(state),
    // Generic progress bars (the round timer's ring): how much of the round is left.
    progress: timer && timer.length > 0 ? pct(timer.remaining / timer.length) : 0,
    events: eventsFor(state),
  };
  const local = state.local;
  const cls = local ? CLASS_ID[local.cls] : undefined;
  if (!local || !cls) {
    return {
      ...DEFAULT_TEST_STATE,
      playerName: local?.name ?? DEFAULT_TEST_STATE.playerName,
      team: local ? teamOf(local.team) : DEFAULT_TEST_STATE.team,
      ...common,
    };
  }
  const ammo = local.ammo;
  const clip =
    ammo.kind === 'clip' ? Math.max(0, ammo.clip) : ammo.kind === 'reserve-only' ? ammo.reserve : 0;
  const reserve = ammo.kind === 'none' ? 0 : ammo.reserve;
  const eng = local.engineer;
  return {
    playerClass: cls,
    team: teamOf(local.team),
    health: local.alive ? Math.max(0, local.health) : 0,
    maxHealth: local.maxHealth,
    ammoClip: clip,
    ammoReserve: reserve,
    metal: eng?.metal ?? 0,
    charge: pct(local.meters.uber),
    playerName: local.name,
    currency: 0,
    weapon: weaponFor(local, cls),
    pipes: local.meters.stickyCount ?? 0,
    meter: meterFor(local, cls),
    sentryLevel: eng?.sentry.exists ? Math.max(1, eng.sentry.level) : 0,
    ...common,
  };
}

const WIN_REASON: Readonly<Record<number, string>> = {
  1: 'captured all control points',
  2: 'captured the enemy intelligence',
  3: 'defended until time ran out',
  4: 'killed the enemy team',
};

/**
 * The editor's `%variable%` table for a test state, plus what only the live game knows. Keys are
 * lower-case, as `substituteLabel` looks them up.
 */
export function liveVars(
  state: HudState,
  test: TestState = toTestState(state),
): Map<string, string> {
  const vars = varsFromState(test);
  const local = state.local;
  const m = state.match;
  if (local?.respawnIn !== null && local?.respawnIn !== undefined)
    vars.set('respawntime', String(Math.max(0, Math.ceil(local.respawnIn))));
  if (m.timer) {
    vars.set('timer', formatClock(m.timer.remaining));
    vars.set('timeleft', formatClock(m.timer.remaining));
  }
  if (m.koth) {
    vars.set('redtimer', formatClock(m.koth.red));
    vars.set('bluetimer', formatClock(m.koth.blue));
  }
  const fc = state.freezecam;
  if (fc) {
    vars.set('killername', fc.killerName);
    vars.set('nemesisname', fc.dominated ? fc.killerName : '');
  }
  const spec = local?.spectating;
  if (spec) {
    vars.set('spectargetname', spec.name);
    vars.set('playername', spec.name);
  }
  const win = m.win;
  if (win) {
    const red = win.team === 2;
    vars.set('winningteamlabel', win.team === 0 ? 'STALEMATE' : red ? 'RED WINS!' : 'BLU WINS!');
    vars.set('advancingteamlabel', '');
    vars.set(
      'winreasonlabel',
      win.team === 0 ? '' : `${red ? 'RED' : 'BLU'} ${WIN_REASON[win.reason] ?? 'won the round'}`,
    );
    vars.set('detailslabel', '');
    vars.set('topplayerslabel', win.top.length ? 'TOP PLAYERS THIS ROUND' : '');
    vars.set('redteamscore', String(win.redScore));
    vars.set('blueteamscore', String(win.blueScore));
  }
  vars.set('redteamname', 'RED');
  vars.set('blueteamname', 'BLU');
  vars.set('red_alive', String(state.scoreboard.filter((r) => r.team === 2 && !r.dead).length));
  vars.set('blue_alive', String(state.scoreboard.filter((r) => r.team === 3 && !r.dead).length));
  return vars;
}
