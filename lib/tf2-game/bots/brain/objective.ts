/**
 * What a bot's team wants from it on this map right now — the scenario half
 * of TFBot's behaviour tree (CTFBotScenarioMonitor and its children:
 * capture / defend point, payload push / block, CTF fetch / escort /
 * deliver / defend the intelligence), as one goal: a place, and what to do
 * there (stand in a capture zone, hold near, follow an entity, touch a flag).
 *
 * Reads the live objective entities (sim/entities: control points and their
 * capture triggers, flags, capture zones, train watchers) so it follows
 * multi-stage maps, locked points and setup gates as they change.
 */

import {
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_SNIPER,
  TF_CLASS_SPY,
  enemyTeam,
} from '../../core/constants';
import { NO_ENTITY } from '../../core/types';
import type { Vec3 } from '../../core/vec';
import type { Entity } from '../../sim/entity';
import type { Player } from '../../sim/player';
import type { GameWorld } from '../../sim/world';
import { objectives, teamMayCapturePoint, type TriggerAreaCapture } from '../../sim/entities';
import { CaptureFlag } from '../../sim/entities';
import type { BotManager } from './manager';

export const GOAL_NONE = 0;
/** Stand inside `zone` (capture, block a capture, push the cart, deliver the flag). */
export const GOAL_CAPTURE = 1;
/** Hold around `pos` (defend a point or the intelligence). */
export const GOAL_DEFEND = 2;
/** Stay near `entity` (the cart, a flag carrier to escort or chase). */
export const GOAL_FOLLOW = 3;
/** Walk onto `pos` (pick up a flag). */
export const GOAL_TOUCH = 4;
/** No objective (arena, waiting): seek enemies. */
export const GOAL_ROAM = 5;

export interface ObjectiveGoal {
  kind: number;
  pos: Vec3;
  /** The trigger to stand in (GOAL_CAPTURE). */
  zone: Entity | null;
  /** The entity to stay near (GOAL_FOLLOW). */
  entity: Entity | null;
  /** How close counts as there. */
  radius: number;
  /** The control point concerned (−1 none). */
  pointIndex: number;
  /** Urgent: an enemy capture is under way / our flag is being carried off. */
  urgent: boolean;
  /** Short label for diagnostics. */
  label: string;
}

export const newObjectiveGoal = (): ObjectiveGoal => ({
  kind: GOAL_NONE,
  pos: { x: 0, y: 0, z: 0 },
  zone: null,
  entity: null,
  radius: 60,
  pointIndex: -1,
  urgent: false,
  label: '',
});

/** A bot's standing role on its team (TFBot roles are per class and per scenario). */
export type BotRole = 'attack' | 'defend';

/** Stable per-bot fraction 0…1 (spreads bots over roles and spots). */
export const botHash = (id: number, salt = 0): number => {
  let x = (id * 2654435761 + salt * 40503) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};

/** The role a bot plays (when its team both attacks and defends). */
export function botRole(bot: Player, ctf = false): BotRole {
  const c = bot.playerClass;
  const h = botHash(bot.id, 7);
  if (c === TF_CLASS_ENGINEER || c === TF_CLASS_SNIPER) return 'defend';
  // CTF is won by taking the intelligence: fewer stay home.
  if (c === TF_CLASS_HEAVYWEAPONS) return h < (ctf ? 0.3 : 0.5) ? 'defend' : 'attack';
  if (c === TF_CLASS_SPY || c === TF_CLASS_MEDIC) return 'attack';
  return h < (ctf ? 0.1 : 0.25) ? 'defend' : 'attack';
}

const setPos = (g: ObjectiveGoal, p: Vec3, dz = 0): void => {
  g.pos.x = p.x;
  g.pos.y = p.y;
  g.pos.z = p.z + dz;
};

/** Where to stand inside a capture trigger: one of its nav areas, spread by bot. */
function zoneSpot(mgr: BotManager, area: TriggerAreaCapture, bot: Player, out: Vec3): void {
  const mesh = mgr.mesh;
  const list = mgr.captureAreas(area);
  if (mesh && list.length > 0) {
    const a = list[Math.floor(botHash(bot.id, area.id) * list.length) % list.length];
    out.x = mesh.cx[a];
    out.y = mesh.cy[a];
    out.z = mesh.cz[a];
    return;
  }
  area.worldSpaceCenter(out);
  out.z = area.origin.z + area.mins.z;
}

/**
 * Fills `g` with the bot's objective. Returns false when the map has none
 * (the bot roams for enemies).
 */
export function objectiveGoal(
  world: GameWorld,
  mgr: BotManager,
  bot: Player,
  g: ObjectiveGoal,
): boolean {
  g.kind = GOAL_NONE;
  g.zone = null;
  g.entity = null;
  g.radius = 60;
  g.pointIndex = -1;
  g.urgent = false;
  const o = objectives(world);
  const team = bot.team;
  const foe = enemyTeam(team);

  // ── Payload ────────────────────────────────────────────────────────────
  for (const w of o.watchers) {
    if (w.removed || w.isDisabled() || !w.train || w.train.removed) continue;
    const cart = w.train;
    const pushing = w.team === team;
    if (pushing || botRole(bot) === 'attack' || bot.playerClass !== TF_CLASS_ENGINEER) {
      g.kind = w.areaCap && pushing ? GOAL_CAPTURE : GOAL_FOLLOW;
      g.zone = pushing ? w.areaCap : null;
      g.entity = cart;
      setPos(g, cart.origin);
      g.radius = pushing ? 90 : 260;
      g.urgent = !pushing && w.numCappers > 0;
      g.label = pushing ? 'push cart' : 'block cart';
      return true;
    }
    // Engineers defending: the next point along the track.
    for (const link of w.cpLinks) {
      if (link.cp.ownerTeam === team) {
        setPos(g, link.cp.origin);
        g.kind = GOAL_DEFEND;
        g.radius = 400;
        g.pointIndex = link.cp.pointIndex;
        g.label = 'defend next point';
        return true;
      }
    }
    g.kind = GOAL_FOLLOW;
    g.entity = cart;
    setPos(g, cart.origin);
    g.radius = 300;
    g.label = 'block cart';
    return true;
  }

  // ── Capture the flag ──────────────────────────────────────────────────
  if (o.flags.length > 0) {
    let theirs: CaptureFlag | null = null;
    let ours: CaptureFlag | null = null;
    for (const f of o.flags) {
      if (f.removed || f.disabled) continue;
      if (f.team === team) ours = f;
      else if (f.team === foe || f.team === 0) theirs = f;
    }
    // Carrying: home to our capture zone.
    if (bot.carriedFlag !== NO_ENTITY) {
      for (const z of o.zones) {
        if (z.removed || z.disabled) continue;
        if (z.team !== team && z.team !== 0) continue;
        g.kind = GOAL_CAPTURE;
        g.zone = z;
        z.center(g.pos);
        g.pos.z = z.origin.z + z.mins.z;
        g.radius = 40;
        g.urgent = true;
        g.label = 'deliver intel';
        return true;
      }
    }
    // Our intelligence is being carried off: chase the carrier.
    if (ours && ours.isStolen()) {
      const carrier = world.player(ours.prevOwner);
      if (
        carrier &&
        carrier.alive &&
        (botRole(bot, true) === 'defend' || botHash(bot.id, 3) < 0.5)
      ) {
        g.kind = GOAL_FOLLOW;
        g.entity = carrier;
        setPos(g, carrier.origin);
        g.radius = 80;
        g.urgent = true;
        g.label = 'chase carrier';
        return true;
      }
    }
    if (botRole(bot, true) === 'defend' && ours) {
      g.kind = GOAL_DEFEND;
      setPos(g, ours.isHome() ? ours.origin : ours.resetPos);
      if (ours.isDropped()) setPos(g, ours.origin);
      g.radius = 350;
      g.label = 'defend intel';
      return true;
    }
    if (theirs) {
      if (theirs.isStolen()) {
        const carrier = world.player(theirs.prevOwner);
        if (carrier && carrier.alive) {
          g.kind = GOAL_FOLLOW;
          g.entity = carrier;
          setPos(g, carrier.origin);
          g.radius = 200;
          g.label = 'escort carrier';
          return true;
        }
      }
      g.kind = GOAL_TOUCH;
      setPos(g, theirs.origin);
      g.entity = theirs;
      g.radius = 24;
      g.label = 'fetch intel';
      return true;
    }
  }

  // ── Control points (5CP, A/D, KOTH, arena) ──────────────────────────────
  let attack: TriggerAreaCapture | null = null;
  let attackD = Infinity;
  let defend: TriggerAreaCapture | null = null;
  let defendScore = -Infinity;
  const bp = bot.origin;
  for (const area of o.areas) {
    if (area.removed || !area.isActive() || !area.point || area.trainWatcher) continue;
    const pt = area.point;
    if (pt.removed || !pt.inMiniRound || !pt.isActive()) continue;
    const c = area.worldSpaceCenter({ x: 0, y: 0, z: 0 });
    const d = Math.hypot(c.x - bp.x, c.y - bp.y, (c.z - bp.z) * 2);
    if (
      pt.ownerTeam !== team &&
      area.teamCanCap(team) &&
      !pt.locked &&
      teamMayCapturePoint(world, team, pt.pointIndex)
    ) {
      // Prefer the one we are already capping, then the closest.
      const score = d - (pt.cappingTeam === team ? 2000 : 0);
      if (score < attackD) {
        attackD = score;
        attack = area;
      }
    } else if (
      pt.ownerTeam === team &&
      area.teamCanCap(foe) &&
      teamMayCapturePoint(world, foe, pt.pointIndex)
    ) {
      const score = (pt.cappingTeam === foe ? 5000 : 0) - d;
      if (score > defendScore) {
        defendScore = score;
        defend = area;
      }
    }
  }
  const teamDefends = mgr.teamIsDefending(team);
  const wantDefend = !!defend && (!attack || teamDefends || botRole(bot) === 'defend');
  if (wantDefend && defend) {
    const pt = defend.point!;
    g.pointIndex = pt.pointIndex;
    g.urgent = pt.cappingTeam === foe;
    if (g.urgent || bot.playerClass === TF_CLASS_HEAVYWEAPONS || botHash(bot.id, 11) < 0.35) {
      g.kind = GOAL_CAPTURE;
      g.zone = defend;
      zoneSpot(mgr, defend, bot, g.pos);
      g.radius = 50;
      g.label = g.urgent ? 'block capture' : 'hold point';
    } else {
      g.kind = GOAL_DEFEND;
      defend.worldSpaceCenter(g.pos);
      g.pos.z = defend.origin.z + defend.mins.z;
      g.radius = 450;
      g.label = 'defend point';
    }
    return true;
  }
  if (attack) {
    const pt = attack.point!;
    g.pointIndex = pt.pointIndex;
    g.kind = GOAL_CAPTURE;
    g.zone = attack;
    zoneSpot(mgr, attack, bot, g.pos);
    g.radius = 50;
    g.label = 'capture point';
    return true;
  }
  g.kind = GOAL_ROAM;
  g.label = 'roam';
  return false;
}

/** Is the bot inside its goal's capture trigger? */
export function inZone(world: GameWorld, g: ObjectiveGoal, p: Player, scratch: Vec3): boolean {
  if (!g.zone || g.zone.removed) return false;
  scratch.x = p.origin.x;
  scratch.y = p.origin.y;
  scratch.z = p.origin.z + 16;
  return world.pointInBrushEntity(g.zone, scratch);
}
