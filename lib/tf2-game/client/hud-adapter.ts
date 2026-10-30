/**
 * Adapters from the game's state to the HUD snapshot (`hud-state.ts`).
 *
 * TF2 has two inputs:
 *   - **Entity records** (`HudSource`): the newest snapshot as the client holds
 *     it — the local player's owner-view record and weapons, the rules, and every
 *     networked entity (control points, timers, flags, the train watcher, the
 *     objective resource, buildings, other players). `hudSourceFromSnapshot`
 *     builds one from `client/net/snapshot-client.ts`; tests build them by hand.
 *   - **Events** (`HudEventLog`): deaths, damage, chat, HUD text, round results
 *     — the parts of the HUD that are a history rather than a state (kill feed,
 *     damage numbers, freeze cam, chat lines, hit/kill sound cues, dominations).
 *
 * `buildHudState(source, log, opts)` puts the two together once per HUD frame.
 * Half-Life 2 and Portal feed `HudEventLog` their captions and fill `hl2` /
 * `portal` themselves (`adaptHl2Suit`, `adaptPortalGun`; their worlds are not
 * networked).
 *
 * Environment-agnostic: no DOM, no React.
 */

import { CLASS_NAMES, TF_CLASS_ENGINEER, TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import { CLASS_DATA, TF_AMMO, type AmmoType } from '../data/classes';
import { MINIGUN, SNIPER_RIFLE, STICKYBOMB, STOCK_WEAPONS, weaponScriptFor } from '../data/weapons';
import { TF_COND, CRIT_BOOST_CONDS, INVULN_CONDS } from '../sim/conditions';
import { LIFE_ALIVE } from '../sim/entity';
import {
  GR_STATE_GAME_OVER,
  GR_STATE_PREGAME,
  GR_STATE_PREROUND,
  GR_STATE_RND_RUNNING,
  GR_STATE_STALEMATE,
  GR_STATE_STARTGAME,
  GR_STATE_TEAM_WIN,
} from '../sim/rules';
import { isPlayerType, type NetRecord } from '../sim/net-schema';
import { adaptItemMeters } from './item-meters';
import {
  TF_DEATH_ASSISTER_DOMINATION,
  TF_DEATH_ASSISTER_REVENGE,
  TF_DEATH_DOMINATION,
  TF_DEATH_REVENGE,
  type SimEvent,
} from '../sim/events';
import type { ChatMessage } from '../net/events';
import {
  emptyAmmo,
  emptyBuilding,
  emptyConditions,
  emptyEngineer,
  emptyHudState,
  emptyMatch,
  emptyMeters,
  maxBuffedHealth,
  type HudAmmo,
  type HudBuilding,
  type HudCaption,
  type HudCenterMessage,
  type HudChatLine,
  type HudConditions,
  type HudControlPoint,
  type HudDamageNumber,
  type HudEngineer,
  type HudFreezeCam,
  type HudGame,
  type HudKillEntry,
  type HudKillParty,
  type HudLocalPlayer,
  type HudLoadoutAnswer,
  type HudMatch,
  type HudMeters,
  type HudMode,
  type HudPayload,
  type HudRoundState,
  type HudScoreRow,
  type HudState,
  type HudTimer,
  type HudWeaponSlot,
} from './hud-state';

// ─── The source ────────────────────────────────────────────────────────────

/** One networked entity as the HUD sees it: its id, net type name and fields. */
export interface HudEntity {
  id: number;
  /** NetSchema.type: 'player', 'control_point', 'round_timer', 'flag', 'train_watcher', 'sentrygun'… */
  type: string;
  record: NetRecord;
}

export interface HudScoreSource {
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  pingMs: number;
}

export interface HudSource {
  /** Server time (seconds) the records represent — tick × TICK_INTERVAL, interpolated. */
  curtime: number;
  localEntity: number;
  localPlayer: NetRecord | null;
  localWeapons: ReadonlyArray<{ slot: number; record: NetRecord }>;
  rules: NetRecord | null;
  entities: ReadonlyArray<HudEntity>;
  names: ReadonlyMap<number, { name: string; bot: boolean }>;
  scores: ReadonlyMap<number, HudScoreSource>;
  map?: string;
}

/** The parts of `SnapshotClient` this module reads (kept structural so tests need no decoder). */
export interface SnapshotLike {
  localEntity: number;
  rules(): NetRecord | null;
  localPlayer(): NetRecord | null;
  localWeapons(): Array<{ slot: number; record: NetRecord }>;
  forEachEntity(fn: (state: { key: number; schema: { type: string } }, record: NetRecord) => void): void;
  readonly roster: ReadonlyMap<number, { name: string; bot: boolean }>;
  readonly scores: ReadonlyMap<number, HudScoreSource>;
  hello?: { map: string } | null;
}

/** A `HudSource` over the snapshot client's newest frame. */
export function hudSourceFromSnapshot(client: SnapshotLike, curtime: number): HudSource {
  const entities: HudEntity[] = [];
  client.forEachEntity((state, record) => entities.push({ id: state.key, type: state.schema.type, record }));
  return {
    curtime,
    localEntity: client.localEntity,
    localPlayer: client.localPlayer(),
    localWeapons: client.localWeapons(),
    rules: client.rules(),
    entities,
    names: client.roster,
    scores: client.scores,
    map: client.hello?.map,
  };
}

// ─── Small record readers ──────────────────────────────────────────────────

const num = (r: NetRecord | null | undefined, k: string, d = 0): number => {
  const v = r?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? (v ? 1 : 0) : d;
};
const bool = (r: NetRecord | null | undefined, k: string): boolean => {
  const v = r?.[k];
  return v === true || (typeof v === 'number' && v !== 0);
};
const str = (r: NetRecord | null | undefined, k: string): string => {
  const v = r?.[k];
  return typeof v === 'string' ? v : '';
};

/** Reads TF_COND bit `cond` from a player record's cond0…cond4 words. */
export function recordHasCond(r: NetRecord, cond: number): boolean {
  const word = num(r, `cond${cond >>> 5}`) >>> 0;
  return (word & (1 << (cond & 31))) !== 0;
}

const anyCond = (r: NetRecord, conds: readonly number[]): boolean => conds.some((c) => recordHasCond(r, c));

// Mirrors of constants owned by modules the HUD does not otherwise need (checked by hud-adapter.test.ts).
/** sim/buildings/teleporter.ts TELEPORTER_STATE_READY. */
export const TELEPORTER_STATE_READY = 2;
/** sim/weapons/constants.ts AC_STATE_* (minigun). */
export const AC_STATE_IDLE = 0;
export const AC_STATE_STARTFIRING = 1;
export const AC_STATE_SPINNING = 3;
/** sim/entities/flag.ts TF_FLAGINFO_*. */
export const TF_FLAGINFO_HOME = 0;
export const TF_FLAGINFO_STOLEN = 1;
export const TF_FLAGINFO_DROPPED = 2;
/** sim/weapons/medigun.ts: aux1 bit 0 is chargeRelease. */
const MEDIGUN_RELEASE_BIT = 1;

const MINI_CRIT_CONDS: readonly number[] = [TF_COND.OFFENSEBUFF, TF_COND.ENERGY_BUFF, TF_COND.MINICRITBOOSTED_ON_KILL];

// ─── Local player ──────────────────────────────────────────────────────────

export function adaptConditions(r: NetRecord, health: number, maxHealth: number): HudConditions {
  const c = emptyConditions();
  const has = (cond: number) => recordHasCond(r, cond);
  c.burning = has(TF_COND.BURNING) || has(TF_COND.BURNING_PYRO);
  c.bleeding = has(TF_COND.BLEEDING);
  c.ubered = anyCond(r, INVULN_CONDS);
  c.critBoosted = anyCond(r, CRIT_BOOST_CONDS);
  c.miniCritBoosted = anyCond(r, MINI_CRIT_CONDS);
  c.cloaked = has(TF_COND.STEALTHED) || has(TF_COND.STEALTHED_BLINK);
  c.disguised = has(TF_COND.DISGUISED);
  c.disguising = has(TF_COND.DISGUISING);
  c.disguiseTeam = c.disguised ? num(r, 'disguiseTeam') : 0;
  c.disguiseClass = c.disguised ? num(r, 'disguiseClass') : 0;
  c.zoomed = has(TF_COND.ZOOMED);
  c.taunting = has(TF_COND.TAUNTING);
  c.jarated = has(TF_COND.URINE);
  c.milked = has(TF_COND.MAD_MILK);
  c.markedForDeath = has(TF_COND.MARKEDFORDEATH) || has(TF_COND.MARKEDFORDEATH_SILENT);
  c.overhealed = health > maxHealth || has(TF_COND.HEALTH_OVERHEALED);
  c.stunned = has(TF_COND.STUNNED);
  return c;
}

const scriptOf = (defindex: number, cls: number) => {
  const name = CLASS_NAMES[cls];
  return name ? weaponScriptFor(defindex, name) : undefined;
};

/** The weapon records by slot, with their item names. */
export function adaptWeaponSlots(
  weapons: ReadonlyArray<{ slot: number; record: NetRecord }>,
  activeSlot: number,
): HudWeaponSlot[] {
  const out: HudWeaponSlot[] = [];
  for (const w of weapons) {
    const defindex = num(w.record, 'defindex', -1);
    const slot = num(w.record, 'slot', w.slot);
    out.push({
      slot,
      defindex,
      name: STOCK_WEAPONS[defindex]?.displayName ?? '',
      active: slot === activeSlot,
    });
  }
  out.sort((a, b) => a.slot - b.slot);
  return out;
}

/** The ammo panel for the active weapon (CTFHudWeaponAmmo::OnThink). */
export function adaptAmmo(player: NetRecord, weapon: NetRecord | null, cls: number): HudAmmo {
  const a = emptyAmmo();
  if (!weapon) return a;
  const script = scriptOf(num(weapon, 'defindex', -1), cls);
  if (!script || script.meleeWeapon || !script.primaryAmmo) return a;
  const ammoType: AmmoType = script.primaryAmmo;
  a.reserve = num(player, `ammo${TF_AMMO[ammoType]}`);
  a.maxReserve = CLASS_DATA[cls]?.maxAmmo[ammoType] ?? 0;
  a.reloading = bool(weapon, 'inReload');
  if (script.clipSize > 0) {
    a.kind = 'clip';
    a.clip = Math.max(0, num(weapon, 'clip'));
    a.maxClip = script.clipSize;
  } else {
    a.kind = 'reserve-only';
  }
  return a;
}

/** Meters from the loadout's weapons and the player record (CHudMedicChargeMeter, CHudItemEffectMeter…). */
export function adaptMeters(
  player: NetRecord,
  weapons: ReadonlyArray<{ slot: number; record: NetRecord }>,
  cls: number,
  curtime: number,
  activeSlot: number,
): HudMeters {
  const m = emptyMeters();
  for (const w of weapons) {
    const rec = w.record;
    const script = scriptOf(num(rec, 'defindex', -1), cls);
    if (!script) continue;
    const active = num(rec, 'slot', w.slot) === activeSlot;
    switch (script.scriptName) {
      case 'tf_weapon_medigun':
        m.uber = clamp01(num(rec, 'aux0'));
        m.uberDeployed = (num(rec, 'aux1') & MEDIGUN_RELEASE_BIT) !== 0;
        break;
      case 'tf_weapon_sniperrifle':
        m.sniperCharge = clamp01(num(rec, 'aux0') / SNIPER_RIFLE.maxDamage);
        break;
      case 'tf_weapon_pipebomblauncher': {
        const begin = num(rec, 'aux0');
        m.stickyCount = Math.max(0, Math.round(num(rec, 'aux1')));
        m.stickyMax = STICKYBOMB.maxActive;
        m.stickyCharge = active && begin > 0 ? clamp01((curtime - begin) / STICKYBOMB.maxChargeTime) : 0;
        break;
      }
      case 'tf_weapon_minigun': {
        const state = num(rec, 'aux0');
        if (state === AC_STATE_IDLE) m.minigunSpin = 0;
        else if (state === AC_STATE_STARTFIRING) {
          const since = curtime - num(rec, 'aux2');
          m.minigunSpin = clamp01(since / MINIGUN.spinUpTime);
        } else m.minigunSpin = 1;
        break;
      }
      case 'tf_weapon_invis':
        m.cloak = clamp01(num(player, 'cloak') / 100);
        break;
      default:
        break;
    }
  }
  adaptItemMeters(player, weapons, cls, curtime, m.items);
  return m;
}

/** The engineer's building panel from the buildings he owns (CHudBuildingStatusContainer_Engineer). */
export function adaptEngineer(player: NetRecord, entities: ReadonlyArray<HudEntity>, localId: number): HudEngineer {
  const e = emptyEngineer();
  e.metal = num(player, `ammo${TF_AMMO.metal}`);
  e.maxMetal = CLASS_DATA[TF_CLASS_ENGINEER]?.maxAmmo.metal ?? 200;
  for (const ent of entities) {
    const r = ent.record;
    if (num(r, 'owner', -1) !== localId) continue;
    let b: HudBuilding | null = null;
    if (ent.type === 'sentrygun') b = e.sentry;
    else if (ent.type === 'dispenser') b = e.dispenser;
    else if (ent.type === 'teleporter') b = num(r, 'objectMode') === 1 ? e.exit : e.entrance;
    if (!b) continue;
    b.exists = true;
    b.level = num(r, 'level', 1);
    b.health = Math.max(0, Math.ceil(num(r, 'health')));
    b.maxHealth = num(r, 'maxHealth');
    b.building = bool(r, 'building');
    b.buildProgress = b.building ? clamp01(num(r, 'buildProgress')) : 1;
    b.upgradeMetal = num(r, 'upgradeMetal');
    b.upgradeMetalRequired = num(r, 'upgradeMetalRequired', 200);
    b.sapped = bool(r, 'sapped');
    b.disabled = bool(r, 'disabled');
    b.carried = bool(r, 'carried');
    b.kills = num(r, 'kills');
    if (ent.type === 'sentrygun') {
      b.shells = num(r, 'shells');
      b.maxShells = num(r, 'maxShells');
      b.rockets = num(r, 'rockets');
      b.maxRockets = num(r, 'maxRockets');
    } else if (ent.type === 'dispenser') {
      b.metal = num(r, 'metal');
    } else {
      b.charge = clamp01(num(r, 'charge'));
      b.ready = num(r, 'teleState') === TELEPORTER_STATE_READY;
      b.linked = num(r, 'matchId', -1) >= 0;
    }
  }
  return e;
}

export function adaptLocalPlayer(src: HudSource): HudLocalPlayer | null {
  const r = src.localPlayer;
  if (!r || src.localEntity < 0) return null;
  const cls = num(r, 'cls');
  const health = Math.max(0, Math.round(num(r, 'health')));
  const maxHealth = Math.max(1, num(r, 'maxHealth', CLASS_DATA[cls]?.maxHealth ?? 125));
  const alive = num(r, 'lifeState', -1) === LIFE_ALIVE;
  const activeSlot = num(r, 'activeSlot', -1);
  const slots = adaptWeaponSlots(src.localWeapons, activeSlot);
  const activeRec = src.localWeapons.find((w) => num(w.record, 'slot', w.slot) === activeSlot)?.record ?? null;
  const respawnAt = num(r, 'respawnAt');
  let spectating = null;
  const obsTarget = num(r, 'observerTarget', -1);
  if (!alive && obsTarget > 0 && obsTarget !== src.localEntity) {
    const t = src.entities.find((e) => e.id === obsTarget && isPlayerType(e.type));
    if (t) {
      spectating = {
        id: obsTarget,
        name: src.names.get(obsTarget)?.name ?? '',
        team: num(t.record, 'team'),
        cls: num(t.record, 'cls'),
        health: Math.max(0, Math.round(num(t.record, 'health'))),
        maxHealth: num(t.record, 'maxHealth', 1),
      };
    }
  }
  return {
    id: src.localEntity,
    name: src.names.get(src.localEntity)?.name ?? '',
    team: num(r, 'team'),
    cls,
    alive,
    health: alive ? health : 0,
    maxHealth,
    maxBuffedHealth: maxBuffedHealth(maxHealth),
    ammo: adaptAmmo(r, activeRec, cls),
    activeSlot,
    activeWeapon: slots.find((s) => s.active) ?? null,
    slots,
    meters: adaptMeters(r, src.localWeapons, cls, src.curtime, activeSlot),
    conditions: adaptConditions(r, health, maxHealth),
    engineer: cls === TF_CLASS_ENGINEER ? adaptEngineer(r, src.entities, src.localEntity) : null,
    respawnIn: !alive && respawnAt > 0 ? Math.max(0, respawnAt - src.curtime) : null,
    spectating,
    items: typeof r.items === 'string' ? r.items : '',
    loadoutPending: r.loadoutPending === true,
    inSpawnRoom: r.inSpawnRoom === true,
  };
}

// ─── Match ─────────────────────────────────────────────────────────────────

export function roundStateOf(state: number): HudRoundState {
  switch (state) {
    case GR_STATE_PREGAME:
    case GR_STATE_STARTGAME:
      return 'pregame';
    case GR_STATE_PREROUND:
      return 'preround';
    case GR_STATE_RND_RUNNING:
      return 'running';
    case GR_STATE_TEAM_WIN:
      return 'team_win';
    case GR_STATE_STALEMATE:
      return 'stalemate';
    case GR_STATE_GAME_OVER:
      return 'game_over';
    default:
      return 'other';
  }
}

const MODES: readonly HudMode[] = ['ctf', 'cp', 'cp_ad', 'koth', 'pl', 'arena'];
const asMode = (s: string): HudMode => {
  const m = s.toLowerCase();
  if ((MODES as readonly string[]).includes(m)) return m as HudMode;
  if (m.startsWith('payload') || m === 'escort') return 'pl';
  return '';
};

/** Seconds left on a team_round_timer record (DT_TeamRoundTimer: paused ? timeRemaining : endTime − curtime). */
export function timerRemaining(r: NetRecord, curtime: number): number {
  return Math.max(0, bool(r, 'paused') ? num(r, 'timeRemaining') : num(r, 'endTime') - curtime);
}

export function adaptMatch(src: HudSource): HudMatch {
  const m = emptyMatch();
  const rules = src.rules;
  m.map = src.map ?? '';
  m.roundState = rules ? roundStateOf(num(rules, 'state')) : 'pregame';
  m.redScore = num(rules, 'redScore');
  m.blueScore = num(rules, 'blueScore');
  const t = src.curtime;

  let objective: NetRecord | null = null;
  const timers = new Map<number, NetRecord>();
  const points: HudControlPoint[] = [];
  const watchers: NetRecord[] = [];
  const players = new Map<number, NetRecord>();
  for (const e of src.entities) {
    switch (e.type) {
      case 'objective_resource':
        objective = e.record;
        break;
      case 'round_timer':
        timers.set(e.id, e.record);
        break;
      case 'control_point': {
        const r = e.record;
        if (r.visible === false) break;
        const capping = num(r, 'cappingTeam');
        const unlock = num(r, 'unlockTime', -1);
        const track = num(r, 'trackDistance', -1);
        points.push({
          index: num(r, 'pointIndex'),
          name: str(r, 'printName'),
          owner: num(r, 'ownerTeam'),
          cappingTeam: capping,
          progress: capping ? clamp01(1 - num(r, 'capPercent', 1)) : 0,
          cappers: capping === TF_TEAM_RED ? num(r, 'numRed') : capping === TF_TEAM_BLUE ? num(r, 'numBlue') : 0,
          requiredCappers:
            capping === TF_TEAM_RED ? num(r, 'requiredRed', 1) : capping === TF_TEAM_BLUE ? num(r, 'requiredBlue', 1) : 1,
          locked: bool(r, 'locked'),
          blocked: bool(r, 'blocked'),
          unlocksIn: unlock > 0 && unlock > t ? unlock - t : null,
          trackPosition: track >= 0 ? clamp01(track) : null,
        });
        break;
      }
      case 'flag': {
        const r = e.record;
        if (bool(r, 'disabled')) break;
        const status = num(r, 'status');
        const carrier = num(r, 'carrier', -1);
        const reset = num(r, 'resetTime');
        m.flags.push({
          team: num(r, 'team'),
          status: status === TF_FLAGINFO_STOLEN ? 'stolen' : status === TF_FLAGINFO_DROPPED ? 'dropped' : 'home',
          carrierName: carrier > 0 ? (src.names.get(carrier)?.name ?? '') : '',
          carriedByLocal: status === TF_FLAGINFO_STOLEN && carrier === src.localEntity,
          returnsIn: status === TF_FLAGINFO_DROPPED && reset > t ? reset - t : null,
        });
        break;
      }
      case 'train_watcher':
        if (!bool(e.record, 'disabled')) watchers.push(e.record);
        break;
      case 'player':
        players.set(e.id, e.record);
        break;
      default:
        // Another game's player schema (CS:GO's cs_player).
        if (isPlayerType(e.type)) players.set(e.id, e.record);
        break;
    }
  }
  points.sort((a, b) => a.index - b.index);
  m.flags.sort((a, b) => a.team - b.team);

  const mode = asMode(str(objective, 'gameType') || str(rules, 'mode'));
  m.mode = mode;
  m.redFlagCaps = num(objective, 'redFlagCaps');
  m.blueFlagCaps = num(objective, 'blueFlagCaps');
  m.flagCapLimit = num(objective, 'flagCapLimit', 3) || 3;

  // The HUD's main timer: the objective resource's timerInHud, else any shown, active timer.
  const hudTimerId = num(objective, 'timerInHud', -1);
  let timer = hudTimerId >= 0 ? (timers.get(hudTimerId) ?? null) : null;
  if (!timer) {
    for (const r of timers.values()) {
      if (num(r, 'kothTeam')) continue;
      if (bool(r, 'active') || (bool(r, 'showInHud') && !bool(r, 'disabled'))) {
        timer = r;
        break;
      }
    }
  }
  if (timer && !bool(timer, 'disabled')) {
    const setup = num(timer, 'state') === 0 && num(timer, 'setupLength') > 0;
    m.timer = {
      remaining: timerRemaining(timer, t),
      setup,
      paused: bool(timer, 'paused'),
      overtime: bool(rules, 'inOvertime'),
      length: setup ? num(timer, 'setupLength') : num(timer, 'timerLength') || num(timer, 'initialLength'),
    } satisfies HudTimer;
  }

  if (mode === 'koth') {
    const red = timers.get(num(objective, 'redKothTimer', -1));
    const blue = timers.get(num(objective, 'blueKothTimer', -1));
    if (red || blue) {
      m.koth = {
        red: red ? timerRemaining(red, t) : 0,
        blue: blue ? timerRemaining(blue, t) : 0,
        active: red && !bool(red, 'paused') ? TF_TEAM_RED : blue && !bool(blue, 'paused') ? TF_TEAM_BLUE : 0,
      };
    }
  }

  const trackPoints = points.filter((p) => p.trackPosition !== null);
  m.controlPoints = mode === 'pl' ? points.filter((p) => p.trackPosition === null) : points;
  for (const w of watchers) {
    const team = num(w, 'team') || TF_TEAM_BLUE;
    const cappers = num(w, 'numCappers');
    const p: HudPayload = {
      team,
      progress: clamp01(num(w, 'progress')),
      pushers: Math.max(0, cappers),
      receding: num(w, 'recedeTime') > t && cappers <= 0,
      blocked: cappers < 0,
      checkpoints: trackPoints.map((cp) => ({ at: cp.trackPosition as number, captured: cp.owner === team })),
    };
    m.payloads.push(p);
  }

  if (m.roundState === 'team_win' || m.roundState === 'game_over') {
    const top = [...players.entries()]
      .map(([id, r]) => ({
        name: src.names.get(id)?.name ?? '',
        team: num(r, 'team'),
        cls: num(r, 'cls'),
        score: src.scores.get(id)?.score ?? 0,
      }))
      .filter((p) => p.team === TF_TEAM_RED || p.team === TF_TEAM_BLUE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const ends = num(rules, 'stateEndsAt');
    m.win = {
      team: num(rules, 'winningTeam'),
      reason: num(rules, 'winReason'),
      redScore: m.redScore,
      blueScore: m.blueScore,
      top,
      nextRoundIn: ends > t ? ends - t : null,
    };
  }
  return m;
}

// ─── Scoreboard ────────────────────────────────────────────────────────────

export function adaptScoreboard(
  src: HudSource,
  dominated: ReadonlySet<number>,
  nemeses: ReadonlySet<number>,
): HudScoreRow[] {
  const rows: HudScoreRow[] = [];
  const seen = new Set<number>();
  for (const e of src.entities) {
    if (!isPlayerType(e.type)) continue;
    seen.add(e.id);
    rows.push(scoreRow(src, e.id, e.record, dominated, nemeses));
  }
  // The local player is always on the board, even when its own record is the owner view.
  if (!seen.has(src.localEntity) && src.localPlayer) {
    rows.push(scoreRow(src, src.localEntity, src.localPlayer, dominated, nemeses));
  }
  rows.sort((a, b) => b.score - a.score || b.kills - a.kills || a.id - b.id);
  return rows;
}

function scoreRow(
  src: HudSource,
  id: number,
  r: NetRecord,
  dominated: ReadonlySet<number>,
  nemeses: ReadonlySet<number>,
): HudScoreRow {
  const s = src.scores.get(id);
  const info = src.names.get(id);
  return {
    id,
    name: info?.name ?? '',
    team: num(r, 'team'),
    cls: num(r, 'cls'),
    score: s?.score ?? 0,
    kills: s?.kills ?? 0,
    deaths: s?.deaths ?? 0,
    assists: s?.assists ?? 0,
    ping: s?.pingMs ?? 0,
    dead: num(r, 'lifeState', LIFE_ALIVE) !== LIFE_ALIVE,
    bot: info?.bot ?? false,
    isLocal: id === src.localEntity,
    dominated: dominated.has(id),
    nemesis: nemeses.has(id),
  };
}

// ─── Event history ─────────────────────────────────────────────────────────

/** How the log resolves a player id to what the HUD shows. */
export interface HudPlayerLookup {
  (id: number): { name: string; team: number; cls: number; health: number; maxHealth: number } | null;
}

export interface HudEventContext {
  /** Client clock seconds. */
  now: number;
  localEntity: number;
  lookup: HudPlayerLookup;
}

/** Display limits and lifetimes (hud_deathnotice_time 6, the chat's 10 s fade, CDamageAccountPanel's 1.5 s numbers). */
export const HUD_LIMITS = {
  killfeedMax: 5,
  killfeedTime: 6,
  /** Entries involving the local player stay longer. */
  killfeedLocalTime: 10,
  chatMax: 100,
  damageNumberTime: 1.5,
  damageNumbersMax: 24,
  /** spec_freeze_time + travel: the freeze cam text shows while the death cam holds. */
  freezecamTime: 6.4,
  centerMax: 3,
  captionsMax: 5,
} as const;

/**
 * The HUD's event-driven half. Feed it every SimEvent and chat message as
 * they arrive; `apply(state, now)` copies the live entries into a HudState.
 */
export class HudEventLog {
  readonly killfeed: HudKillEntry[] = [];
  readonly chat: HudChatLine[] = [];
  readonly damageNumbers: HudDamageNumber[] = [];
  readonly center: HudCenterMessage[] = [];
  readonly captions: HudCaption[] = [];
  /** Players the local player dominates / who dominate the local player. */
  readonly dominated = new Set<number>();
  readonly nemeses = new Set<number>();
  freezecam: HudFreezeCam | null = null;
  /** The last answer to an equip (`loadout` event). */
  loadout: HudLoadoutAnswer | null = null;
  hitSeq = 0;
  killSeq = 0;
  lastHitCrit = false;
  private nextId = 1;

  private party(id: number, ctx: HudEventContext): HudKillParty | null {
    if (id <= 0) return null;
    const p = ctx.lookup(id);
    return { id, name: p?.name ?? '', team: p?.team ?? 0 };
  }

  onEvent(ev: SimEvent, ctx: HudEventContext): void {
    const local = ctx.localEntity;
    switch (ev.type) {
      case 'death': {
        const victim = this.party(ev.victim, ctx) ?? { id: ev.victim, name: '', team: 0 };
        const attacker = ev.attacker && ev.attacker !== ev.victim ? this.party(ev.attacker, ctx) : null;
        const assister = this.party(ev.assister, ctx);
        const domination = (ev.deathFlags & (TF_DEATH_DOMINATION | TF_DEATH_ASSISTER_DOMINATION)) !== 0;
        const revenge = (ev.deathFlags & (TF_DEATH_REVENGE | TF_DEATH_ASSISTER_REVENGE)) !== 0;
        const involves = ev.victim === local || ev.attacker === local || ev.assister === local;
        this.killfeed.push({
          id: this.nextId++,
          at: ctx.now,
          attacker,
          assister,
          victim,
          icon: ev.weapon,
          weaponName: STOCK_WEAPONS[ev.weaponDefIndex]?.displayName ?? '',
          crit: ev.crit,
          customKill: ev.customKill,
          domination,
          revenge,
          involvesLocal: involves,
        });
        while (this.killfeed.length > HUD_LIMITS.killfeedMax) this.killfeed.shift();
        // Dominations (CTFPlayer::Event_Killed's TF_DEATH_* bits, from each side).
        if (ev.attacker === local && ev.victim !== local) {
          if (ev.deathFlags & TF_DEATH_DOMINATION) this.dominated.add(ev.victim);
          if (ev.deathFlags & TF_DEATH_REVENGE) this.nemeses.delete(ev.victim);
        } else if (ev.assister === local) {
          if (ev.deathFlags & TF_DEATH_ASSISTER_DOMINATION) this.dominated.add(ev.victim);
          if (ev.deathFlags & TF_DEATH_ASSISTER_REVENGE) this.nemeses.delete(ev.victim);
        }
        if (ev.victim === local) {
          if (ev.attacker > 0 && ev.deathFlags & TF_DEATH_DOMINATION) this.nemeses.add(ev.attacker);
          if (ev.attacker > 0 && ev.deathFlags & TF_DEATH_REVENGE) this.dominated.delete(ev.attacker);
          const killer = ev.attacker > 0 && ev.attacker !== local ? ctx.lookup(ev.attacker) : null;
          this.freezecam = {
            killerName: killer?.name ?? '',
            killerTeam: killer?.team ?? 0,
            killerCls: killer?.cls ?? 0,
            killerHealth: killer?.health ?? 0,
            killerMaxHealth: killer?.maxHealth ?? 0,
            kind:
              ev.attacker === local || (ev.attacker <= 0 && ev.customKill === 6)
                ? 'suicide'
                : ev.attacker <= 0
                  ? 'world'
                  : ev.weapon.startsWith('obj_')
                    ? 'object'
                    : 'player',
            dominated: (ev.deathFlags & TF_DEATH_DOMINATION) !== 0,
            revenge: (ev.deathFlags & TF_DEATH_REVENGE) !== 0,
            at: ctx.now,
          };
        }
        if (ev.attacker === local && ev.victim !== local) this.killSeq++;
        break;
      }
      case 'object':
        if (ev.kind === 'destroyed' && ev.attacker) {
          const owner = this.party(ev.owner, ctx);
          this.killfeed.push({
            id: this.nextId++,
            at: ctx.now,
            attacker: this.party(ev.attacker, ctx),
            assister: ev.assister ? this.party(ev.assister, ctx) : null,
            victim: owner ?? { id: ev.owner, name: '', team: 0 },
            icon: ev.weapon ?? '',
            weaponName: '',
            crit: 0,
            customKill: 0,
            domination: false,
            revenge: false,
            involvesLocal: ev.owner === local || ev.attacker === local,
            object: true,
          });
          while (this.killfeed.length > HUD_LIMITS.killfeedMax) this.killfeed.shift();
        }
        break;
      case 'damage':
        if (ev.attacker === local && ev.victim !== local && ev.amount > 0) {
          this.damageNumbers.push({
            id: this.nextId++,
            at: ctx.now,
            amount: Math.round(ev.amount),
            crit: ev.crit,
            screen: null,
            world: { x: ev.pos.x, y: ev.pos.y, z: ev.pos.z },
          });
          while (this.damageNumbers.length > HUD_LIMITS.damageNumbersMax) this.damageNumbers.shift();
          this.hitSeq++;
          this.lastHitCrit = ev.crit === 2;
        }
        break;
      case 'chat': {
        const p = ctx.lookup(ev.from);
        this.pushChat(
          {
            name: p?.name ?? '',
            team: p?.team ?? 0,
            text: ev.text,
            teamOnly: ev.team !== undefined,
            dead: (p?.health ?? 1) <= 0,
            system: ev.from <= 0,
          },
          ctx.now,
        );
        break;
      }
      case 'hud':
        this.pushCenter(ev.key, ev.kind, ev.holdTime ?? 5, ctx.now);
        break;
      case 'loadout':
        if (ev.player === local) this.loadout = { cls: ev.cls, status: ev.status, reason: ev.reason, at: ctx.now };
        break;
      case 'spawn':
        if (ev.player === local) this.freezecam = null;
        break;
      case 'round':
        if (ev.kind === 'start') this.freezecam = null;
        break;
      default:
        break;
    }
  }

  /** A chat message from the hub (`tf2:chat`). */
  onChat(msg: ChatMessage, now: number, dead = false): void {
    this.pushChat(
      { name: msg.name, team: msg.team, text: msg.text, teamOnly: msg.teamOnly, dead, system: msg.from <= 0 },
      now,
    );
  }

  pushChat(line: Omit<HudChatLine, 'id' | 'at'>, now: number): void {
    this.chat.push({ ...line, id: this.nextId++, at: now });
    while (this.chat.length > HUD_LIMITS.chatMax) this.chat.shift();
  }

  pushCenter(text: string, kind: HudCenterMessage['kind'], duration: number, now: number): void {
    this.center.push({ id: this.nextId++, at: now, duration, text, kind });
    while (this.center.length > HUD_LIMITS.centerMax) this.center.shift();
  }

  /** A close caption (HL2/Portal sound or scene line already resolved through the CaptionTable). */
  pushCaption(caption: Omit<HudCaption, 'id' | 'at'>, now: number): void {
    this.captions.push({ ...caption, id: this.nextId++, at: now });
    while (this.captions.length > HUD_LIMITS.captionsMax) this.captions.shift();
  }

  /** Drops expired entries. */
  prune(now: number): void {
    dropWhile(this.killfeed, (k) => now - k.at > (k.involvesLocal ? HUD_LIMITS.killfeedLocalTime : HUD_LIMITS.killfeedTime));
    dropWhile(this.damageNumbers, (d) => now - d.at > HUD_LIMITS.damageNumberTime);
    filterInPlace(this.center, (c) => now - c.at <= c.duration);
    filterInPlace(this.captions, (c) => now - c.at <= c.duration);
    if (this.freezecam && now - this.freezecam.at > HUD_LIMITS.freezecamTime) this.freezecam = null;
  }

  /** Copies the live history into `state` (arrays are copied, so React sees new references). */
  apply(state: HudState, now: number): void {
    this.prune(now);
    state.loadout = this.loadout;
    state.killfeed = this.killfeed.slice();
    state.chat = this.chat.slice();
    state.damageNumbers = this.damageNumbers.slice();
    state.center = this.center.slice();
    state.captions = this.captions.slice();
    state.freezecam = this.freezecam;
    state.cues = { hitSeq: this.hitSeq, killSeq: this.killSeq, lastHitCrit: this.lastHitCrit };
  }

  /** New match / new player. */
  reset(): void {
    this.killfeed.length = 0;
    this.chat.length = 0;
    this.damageNumbers.length = 0;
    this.center.length = 0;
    this.captions.length = 0;
    this.dominated.clear();
    this.nemeses.clear();
    this.freezecam = null;
  }
}

/** A lookup over a HudSource's player records and roster. */
export function playerLookup(src: HudSource): HudPlayerLookup {
  const records = new Map<number, NetRecord>();
  for (const e of src.entities) if (isPlayerType(e.type)) records.set(e.id, e.record);
  if (src.localPlayer) records.set(src.localEntity, src.localPlayer);
  return (id) => {
    const r = records.get(id);
    const info = src.names.get(id);
    if (!r && !info) return null;
    return {
      name: info?.name ?? '',
      team: num(r, 'team'),
      cls: num(r, 'cls'),
      health: Math.max(0, Math.round(num(r, 'health'))),
      maxHealth: num(r, 'maxHealth', 1),
    };
  };
}

export interface BuildHudOptions {
  game?: HudGame;
  /** Client clock seconds (the log's clock). */
  now: number;
  connected?: boolean;
  fps?: number;
}

/** The whole TF2 HUD state for one frame. */
export function buildHudState(src: HudSource, log: HudEventLog, opts: BuildHudOptions): HudState {
  const state = emptyHudState(opts.game ?? 'tf2');
  state.now = opts.now;
  state.connected = opts.connected ?? true;
  state.fps = opts.fps ?? 0;
  state.local = adaptLocalPlayer(src);
  state.match = adaptMatch(src);
  state.scoreboard = adaptScoreboard(src, log.dominated, log.nemeses);
  log.apply(state, opts.now);
  return state;
}

// ─── Half-Life 2 / Portal ──────────────────────────────────────────────────

/**
 * The HL2 suit panel from the single-player player's fields. TODO(sp-game):
 * the single-player world (lib/sp-game) does not expose a player record yet;
 * this takes the plain numbers so its loop can call it once it does.
 */
export function adaptHl2Suit(p: {
  hasSuit: boolean;
  health: number;
  armor: number;
  suitPower: number;
  sprinting: boolean;
  flashlightOn: boolean;
  underwater: boolean;
  weaponName: string;
  clip: number;
  reserve: number;
  altAmmo: number;
}): NonNullable<HudState['hl2']> {
  return {
    hasSuit: p.hasSuit,
    health: Math.max(0, Math.round(p.health)),
    armor: Math.max(0, Math.round(p.armor)),
    aux: clamp01(p.suitPower / 100),
    auxSprint: p.sprinting,
    auxFlashlight: p.flashlightOn,
    auxOxygen: p.underwater,
    flashlightOn: p.flashlightOn,
    weaponName: p.weaponName,
    clip: p.clip,
    reserve: p.reserve,
    altAmmo: p.altAmmo,
    pickups: [],
    damageDirections: [],
  };
}

/**
 * The portal gun's state for the crosshair. TODO(sp-game): portals are not
 * simulated yet; the loop passes the gun's upgrade level (0 none, 1 blue only
 * as in testchmb_a_00…, 2 both) and which portals exist.
 */
export function adaptPortalGun(p: {
  gunLevel: 0 | 1 | 2;
  bluePlaced: boolean;
  orangePlaced: boolean;
  lastFired: 'blue' | 'orange' | null;
  health: number;
}): NonNullable<HudState['portal']> {
  return {
    hasGun: p.gunLevel > 0,
    canFireBlue: p.gunLevel >= 1,
    canFireOrange: p.gunLevel >= 2,
    bluePlaced: p.bluePlaced,
    orangePlaced: p.orangePlaced,
    lastFired: p.lastFired,
    health: p.health,
  };
}

/** `<clr:r,g,b>` from a raw caption → CSS colour; plus whether it is an `<sfx>` caption. */
export function captionStyle(raw: string): { color: string | null; sfx: boolean } {
  const m = /<clr:(\d{1,3}),(\d{1,3}),(\d{1,3})>/i.exec(raw);
  return { color: m ? `rgb(${m[1]} ${m[2]} ${m[3]})` : null, sfx: /<sfx>/i.test(raw) };
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function dropWhile<T>(arr: T[], pred: (v: T) => boolean): void {
  let i = 0;
  while (i < arr.length && pred(arr[i])) i++;
  if (i) arr.splice(0, i);
}

function filterInPlace<T>(arr: T[], keep: (v: T) => boolean): void {
  let w = 0;
  for (let r = 0; r < arr.length; r++) if (keep(arr[r])) arr[w++] = arr[r];
  arr.length = w;
}

/** Re-exported for HUD components that need the empty pieces. */
export { emptyBuilding };
