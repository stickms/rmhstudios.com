/**
 * The police: City-17 Metrocops, and Combine soldiers when the heat is high. They come in through a gate on the
 * shore, hunt the wanted player along the same movement rules as everyone else (nav/), shoot when they can see you,
 * arrest you if you are not fighting back, and lose interest when the heat is gone and you are far away.
 *
 * Deterministic like the rest of the tick: integer tick counters, the world's own generator, stable iteration order,
 * and a bounded number of route searches per tick (so a crowd of officers cannot stall the sim).
 */

import { OFFICERS, WEAPONS, type OfficerKind } from '../content';
import { newMover, startPath, stepMover, stopMover, type Mover } from '../nav';
import { resolveShot, sightLine, drawRandom, type ShotTarget } from './ballistics';
import {
  WANTED_HEAT,
  arrest,
  damagePlayer,
  fightingBack,
  isDowned,
  tickPlayersCombat,
} from './crime';
import type { Officer } from './crime-types';
import { tileBlocked } from '../avatar/collision';
import type { PlayerState, World, WorldEvent } from './types';

/** Never more than this many officers on the island. */
export const MAX_OFFICERS = 4;
/** Heat where a new officer is called for: 40 → 1, 60 → 2, 80 → 3, 95 → 4. */
const WANTED_STEPS = [WANTED_HEAT, 60, 80, 95] as const;
/** From this heat the response is Combine soldiers, not Metrocops. */
export const COMBINE_HEAT = 75;
/** Below this heat — and far enough away — an officer gives up. */
export const CALM_HEAT = 15;
export const LOSE_DISTANCE = 12;
/** How many ticks between looks at whether a gate needs an officer. */
const SPAWN_CHECK_TICKS = 60;
/** A gate is a shore tile at least this far (tiles) from the hunted player; a small map scales it down. */
const GATE_MIN_DISTANCE = 10;
const GATE_ATTEMPTS = 5;
/** Route searches: at most this many per tick across all officers, each limited to this many tiles expanded. */
const PLANS_PER_TICK = 2;
const PLAN_EXPANSIONS = 3500;
/** An officer re-plans at most this often, and only when the target has moved this far from the route's end. */
const REPLAN_TICKS = 10;
const REPLAN_DISTANCE = 2;
/** Mover sub-steps per tick: 2 makes officers walk at 2 tiles/s, between the player's walk and run. */
const PACE = 2;
/** Cuffing takes this long, and reaches this far (tiles). */
export const ARREST_TICKS = 15;
export const ARREST_REACH = 1.5;
/** An officer gives up on someone they cannot reach after this many failed searches. */
const MAX_PLAN_FAILS = 12;
/** A leaving officer vanishes after this long even if the gate cannot be reached (1 minute). */
const LEAVE_TIMEOUT_TICKS = 1200;
/** They open fire at this fraction of their weapon's range, and stand off at this fraction. */
const FIRE_RANGE = 0.95;
const STAND_OFF = 0.55;

/** How many officers a player's heat calls for. */
export function wantedOfficers(heat: number): number {
  let n = 0;
  for (const step of WANTED_STEPS) if (heat >= step) n++;
  return n;
}

const dist2 = (ax: number, az: number, bx: number, bz: number) =>
  (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** Shore tiles — walkable, beside water — far from the target: where the police come ashore. */
function gateCandidates(w: World, tx: number, tz: number): number[] {
  const n = w.size;
  const minD = Math.min(GATE_MIN_DISTANCE, Math.floor(n / 3));
  const out: number[] = [];
  const edge = (x: number, z: number) => x === 0 || z === 0 || x === n - 1 || z === n - 1;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      if (Math.max(Math.abs(x - tx), Math.abs(z - tz)) < minD || tileBlocked(w, x, z)) continue;
      let shore = edge(x, z);
      for (let dz = -1; dz <= 1 && !shore; dz++) {
        for (let dx = -1; dx <= 1 && !shore; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx >= 0 && nz >= 0 && nx < n && nz < n && w.terrain[nz * n + nx] === 'water')
            shore = true;
        }
      }
      if (shore) out.push(z * n + x);
    }
  }
  return out;
}

/**
 * Put an officer ashore at a gate, but only if they can walk from there to the target: the route search that proves
 * it also gives them their first route. Returns null (and spawns no one) when there is none.
 */
export function placeOfficer(
  w: World,
  kind: OfficerKind,
  gx: number,
  gz: number,
  target: PlayerState,
  ev: WorldEvent[],
): Officer | null {
  const mover = newMover(gx, gz);
  if (
    !startPath(
      w,
      mover,
      { x: target.x, z: target.z },
      { stopWithin: 1, maxExpansions: PLAN_EXPANSIONS },
    )
  )
    return null;
  const def = OFFICERS[kind];
  const officer: Officer = {
    id: w.nextId++,
    kind,
    hp: def.hp,
    weapon: def.weapon,
    mover,
    target: target.id,
    mode: 'hunt',
    gateX: gx,
    gateZ: gz,
    mag: WEAPONS[def.weapon].magazine,
    readyAt: w.tick + 10,
    reloadDoneAt: 0,
    nextPlanTick: w.tick + REPLAN_TICKS,
    planFails: 0,
    arrestAt: 0,
    leaveSince: 0,
    firedTick: -1,
    aim: mover.yaw,
  };
  w.officers.push(officer);
  ev.push({ type: 'officerSpawned', officer });
  return officer;
}

function spawnOfficer(w: World, target: PlayerState, ev: WorldEvent[]): boolean {
  const cands = gateCandidates(w, Math.round(target.x), Math.round(target.z));
  if (cands.length === 0) return false;
  const kind = target.heat >= COMBINE_HEAT ? 'combine-soldier' : 'metrocop';
  for (let attempt = 0; attempt < GATE_ATTEMPTS; attempt++) {
    const idx = cands[Math.floor(drawRandom(w) * cands.length)];
    const gx = idx % w.size;
    const gz = (idx - gx) / w.size;
    if (w.officers.some((o) => Math.round(o.mover.x) === gx && Math.round(o.mover.z) === gz))
      continue;
    if (placeOfficer(w, kind, gx, gz, target, ev)) return true;
  }
  return false;
}

function trySpawn(w: World, ev: WorldEvent[]): void {
  if (w.officers.length >= MAX_OFFICERS) return;
  for (const id of Object.keys(w.players).sort()) {
    const p = w.players[id];
    if (isDowned(w, p)) continue;
    const have = w.officers.filter((o) => o.mode === 'hunt' && o.target === id).length;
    if (have < wantedOfficers(p.heat)) {
      spawnOfficer(w, p, ev);
      return;
    }
  }
}

function pickTarget(w: World, from: Mover): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestD = Infinity;
  for (const id of Object.keys(w.players).sort()) {
    const p = w.players[id];
    if (isDowned(w, p) || p.heat < CALM_HEAT) continue;
    const d = dist2(from.x, from.z, p.x, p.z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Finish the step in progress, then stand still (cutting a step short would teleport them). */
function settle(m: Mover): void {
  if (m.path.length === 0) return;
  if (m.leg === 0) stopMover(m);
  else m.path.length = 1;
}

interface Budget {
  plans: number;
}

/** Walk toward a goal, re-planning the route now and then (budgeted), only ever between tiles. */
function travel(
  w: World,
  o: Officer,
  goal: { x: number; z: number },
  stopWithin: number,
  budget: Budget,
  blocked: (x: number, z: number) => boolean,
): void {
  const m = o.mover;
  const gx = Math.round(goal.x);
  const gz = Math.round(goal.z);
  const stale =
    m.goalX === null ||
    m.goalZ === null ||
    Math.max(Math.abs(m.goalX - gx), Math.abs(m.goalZ - gz)) >= REPLAN_DISTANCE;
  if (
    m.leg === 0 &&
    (m.path.length === 0 || stale) &&
    w.tick >= o.nextPlanTick &&
    budget.plans < PLANS_PER_TICK
  ) {
    budget.plans++;
    o.nextPlanTick = w.tick + REPLAN_TICKS;
    o.planFails = startPath(w, m, goal, { stopWithin, maxExpansions: PLAN_EXPANSIONS, blocked })
      ? 0
      : o.planFails + 1;
  }
  for (let i = 0; i < PACE; i++) stepMover(w, m, blocked);
}

function removeOfficer(w: World, o: Officer, ev: WorldEvent[]): void {
  w.officers = w.officers.filter((q) => q.id !== o.id);
  ev.push({ type: 'officerLeft', officerId: o.id });
}

function beginLeaving(w: World, o: Officer): void {
  o.mode = 'leave';
  o.leaveSince = w.tick;
  o.arrestAt = 0;
}

function stepOfficer(w: World, o: Officer, budget: Budget, ev: WorldEvent[]): void {
  const def = OFFICERS[o.kind];
  const gun = WEAPONS[o.weapon];
  const m = o.mover;
  const blocked = (x: number, z: number) =>
    w.officers.some((q) => q !== o && Math.round(q.mover.x) === x && Math.round(q.mover.z) === z);

  // The magazine: back to full after a reload, and an empty one starts a reload.
  if (o.reloadDoneAt > 0 && w.tick >= o.reloadDoneAt) {
    o.mag = gun.magazine;
    o.reloadDoneAt = 0;
  }
  if (o.reloadDoneAt === 0 && o.mag <= 0) o.reloadDoneAt = w.tick + gun.reloadTicks;

  if (o.mode === 'leave') {
    if (w.tick - o.leaveSince >= LEAVE_TIMEOUT_TICKS) return removeOfficer(w, o, ev);
    if (Math.max(Math.abs(Math.round(m.x) - o.gateX), Math.abs(Math.round(m.z) - o.gateZ)) <= 1)
      return removeOfficer(w, o, ev);
    travel(w, o, { x: o.gateX, z: o.gateZ }, 1, budget, blocked);
    return;
  }

  // Who are they after? Their target, if still up; else the nearest wanted player; else no one — go home.
  let target = o.target ? w.players[o.target] : undefined;
  if (target && isDowned(w, target)) target = undefined;
  if (!target) {
    target = pickTarget(w, m);
    o.target = target?.id ?? null;
  }
  if (!target) return beginLeaving(w, o);
  const d2 = dist2(m.x, m.z, target.x, target.z);
  // Lost interest: the heat is gone and the player is far away; or they cannot be reached at all.
  if (
    (target.heat < CALM_HEAT && d2 > LOSE_DISTANCE * LOSE_DISTANCE) ||
    o.planFails >= MAX_PLAN_FAILS
  )
    return beginLeaving(w, o);

  const d = Math.sqrt(d2);
  const fighting = fightingBack(w, target);
  const los = sightLine(w, m.x, m.z, target.x, target.z).clear;
  const pref = Math.max(2.5, gun.range * STAND_OFF);
  let firedNow = false;

  if (fighting) {
    // A firefight: hold at a stand-off distance with the target in sight, else close in until they are seen.
    o.arrestAt = 0;
    const hold = los && d <= pref;
    if (hold) settle(m);
    else travel(w, o, target, los ? Math.max(1, Math.floor(pref)) : 1, budget, blocked);
    if (
      los &&
      d <= gun.range * FIRE_RANGE &&
      w.tick >= o.readyAt &&
      o.reloadDoneAt === 0 &&
      o.mag > 0
    ) {
      firedNow = true;
      o.mag -= 1;
      o.readyAt = w.tick + gun.fireTicks * def.fireMul;
      o.firedTick = w.tick;
      const targets: ShotTarget[] = [];
      for (const id of Object.keys(w.players).sort()) {
        const q = w.players[id];
        if (!isDowned(w, q)) targets.push({ id, x: q.x, z: q.z });
      }
      const r = resolveShot(
        w,
        m,
        target,
        gun,
        { damageMul: def.damageMul, spreadMul: def.spreadMul },
        targets,
      );
      ev.push({
        type: 'shot',
        by: { kind: 'officer', id: o.id },
        fx: m.x,
        fz: m.z,
        tx: r.endX,
        tz: r.endZ,
        hit: r.hits.length > 0,
      });
      for (const h of r.hits) damagePlayer(w, w.players[h.id], h.damage, o.id, ev);
    }
    o.aim = hold || firedNow ? Math.atan2(target.x - m.x, target.z - m.z) : m.yaw;
    return;
  }

  // Not fighting back: close in and cuff them.
  const near = d <= ARREST_REACH;
  if (near) settle(m);
  else travel(w, o, target, 1, budget, blocked);
  if (!near) o.arrestAt = 0;
  else if (o.arrestAt === 0) o.arrestAt = w.tick + ARREST_TICKS;
  else if (w.tick >= o.arrestAt) {
    arrest(w, target, o.id, ev);
    return;
  }
  o.aim = near ? Math.atan2(target.x - m.x, target.z - m.z) : m.yaw;
}

/** Everything the law does in one tick, after the players' own upkeep. */
export function tickCrime(w: World, ev: WorldEvent[]): void {
  tickPlayersCombat(w, ev);
  if (w.tick % SPAWN_CHECK_TICKS === 0) trySpawn(w, ev);
  const budget: Budget = { plans: 0 };
  for (const o of [...w.officers]) {
    if (w.officers.includes(o)) stepOfficer(w, o, budget, ev);
  }
}
