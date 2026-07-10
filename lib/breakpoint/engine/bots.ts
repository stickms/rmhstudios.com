// ============================================================
// BREAKPOINT — Bot AI
// State machine: pick objective → navigate → engage on sight.
// Uses world queries (LOS, nearest enemy) provided by the engine.
// ============================================================
import type { Actor, Vec3, BotBrain, Team } from '../types';
import { SITES } from '../map';
import { dist2D, hasLineOfSight } from './collision';
import { getWeapon } from '../weapons';

export interface BotWorld {
  now: number;
  actors: Actor[];
  spikePlanted: boolean;
  spikePos: Vec3 | null;
  localTeamAttacking: boolean; // which team attacks this round
  attackersTeam: Team;
}

function eye(a: Actor): Vec3 { return { x: a.pos.x, y: a.pos.y + 1.5, z: a.pos.z }; }

function nearestVisibleEnemy(self: Actor, world: BotWorld): Actor | null {
  let best: Actor | null = null;
  let bestD = Infinity;
  const e = eye(self);
  for (const a of world.actors) {
    if (!a.alive || a.team === self.team) continue;
    const d = dist2D(self.pos, a.pos);
    if (d > 55) continue;
    if (!hasLineOfSight(e, eye(a))) continue;
    // field of view ~150° so they don't see directly behind instantly
    const ang = Math.atan2(a.pos.x - self.pos.x, -(a.pos.z - self.pos.z));
    let diff = Math.abs(((ang - self.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (diff > 1.5 && d > 8) continue;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

function pickObjective(self: Actor, world: BotWorld): Vec3 {
  const attacking = self.team === world.attackersTeam;
  if (attacking) {
    if (world.spikePlanted && world.spikePos) return { ...world.spikePos };
    // carrier heads to a site; others support
    const site = self.id.charCodeAt(self.id.length - 1) % 2 === 0 ? SITES.A : SITES.B;
    return { x: site.x + (Math.random() - 0.5) * 6, y: 0, z: site.z + (Math.random() - 0.5) * 6 };
  } else {
    // defenders: hold a site or rotate to planted spike
    if (world.spikePlanted && world.spikePos) return { ...world.spikePos };
    const site = self.id.charCodeAt(self.id.length - 1) % 2 === 0 ? SITES.A : SITES.B;
    return { x: site.x + (Math.random() - 0.5) * 8, y: 0, z: site.z + (Math.random() - 0.5) * 8 };
  }
}

export function makeBrain(difficulty: number): BotBrain {
  const skill = Math.max(0, Math.min(1, difficulty));
  return {
    state: 'idle',
    targetId: null,
    destination: null,
    nextThink: 0,
    reactionEnd: 0,
    aimError: 0.16 * (1 - skill) + 0.02,
    pathWaypoints: [],
    strafeDir: 0,
    burstUntil: 0,
  };
}

export interface BotIntent {
  moveX: number; moveZ: number; // world-space desired move dir (-1..1)
  wantYaw: number;
  wantPitch: number;
  fire: boolean;
  wantPlant: boolean;
  wantDefuse: boolean;
  crouch: boolean;
}

const IDLE: BotIntent = { moveX: 0, moveZ: 0, wantYaw: 0, wantPitch: 0, fire: false, wantPlant: false, wantDefuse: false, crouch: false };

/** Compute this bot's intent for the current tick. */
export function botThink(self: Actor, world: BotWorld, difficulty: number): BotIntent {
  if (!self.alive || !self.brain) return IDLE;
  const brain = self.brain;
  const now = world.now;
  const skill = Math.max(0, Math.min(1, difficulty));
  const intent: BotIntent = { ...IDLE, wantYaw: self.yaw, wantPitch: self.pitch };

  // flashed → can't act usefully, just stumble
  if (self.blindUntil > now) {
    intent.moveX = Math.sin(now * 0.005) * 0.3;
    intent.wantYaw = self.yaw + 0.02;
    return intent;
  }

  const enemy = nearestVisibleEnemy(self, world);

  // ── Engage ──
  if (enemy) {
    if (brain.targetId !== enemy.id) {
      brain.targetId = enemy.id;
      // reaction time scales with skill (120ms..480ms)
      brain.reactionEnd = now + (480 - skill * 360) * (0.7 + Math.random() * 0.6);
    }
    brain.state = 'engage';
    const d = dist2D(self.pos, enemy.pos);
    // aim toward enemy with skill-based jitter
    const targetEye = { x: enemy.pos.x, y: enemy.pos.y + (skill > 0.7 ? 1.55 : 1.2), z: enemy.pos.z };
    const e = eye(self);
    const dx = targetEye.x - e.x, dy = targetEye.y - e.y, dz = targetEye.z - e.z;
    const horiz = Math.hypot(dx, dz);
    const jitter = brain.aimError * (1 - Math.min(1, (now - brain.reactionEnd) / 800)) * 2 + brain.aimError * 0.4;
    intent.wantYaw = Math.atan2(dx, -dz) + (Math.random() - 0.5) * jitter;
    intent.wantPitch = -Math.atan2(dy, horiz) + (Math.random() - 0.5) * jitter * 0.5;

    // strafe-peek
    if (now > brain.nextThink) {
      brain.strafeDir = [-1, 0, 1, 1, -1][Math.floor(Math.random() * 5)];
      brain.nextThink = now + 400 + Math.random() * 600;
    }
    const wpn = getWeapon(self.currentWeapon);
    const closeWanted = wpn.class === 'shotgun' || wpn.class === 'smg';
    const idealRange = closeWanted ? 8 : 18;
    let approach = 0;
    if (d > idealRange + 6) approach = 1;
    else if (d < idealRange - 4) approach = -0.6;
    // move in self-facing frame: forward = approach, strafe sideways
    const fx = Math.sin(self.yaw), fz = -Math.cos(self.yaw);
    const sx = Math.cos(self.yaw), sz = Math.sin(self.yaw);
    intent.moveX = fx * approach + sx * brain.strafeDir * 0.8;
    intent.moveZ = fz * approach + sz * brain.strafeDir * 0.8;

    // fire if reacted and roughly on target and have ammo
    const aimed = Math.abs(((intent.wantYaw - self.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.12;
    if (now > brain.reactionEnd && self.ammo > 0 && !self.reloading) {
      if (wpn.automatic) {
        intent.fire = true; // continuous; world handles fire rate
      } else {
        // burst pacing for semis
        if (now > brain.burstUntil) { intent.fire = true; brain.burstUntil = now + 1000 / wpn.fireRate + 30; }
      }
      // crouch for accuracy at range if skilled
      intent.crouch = skill > 0.6 && d > 14 && Math.random() < 0.4;
    }
    void aimed;
    return intent;
  }

  // ── Navigate to objective ──
  brain.targetId = null;
  if (!brain.destination || dist2D(self.pos, brain.destination) < 2.5 || now > brain.nextThink + 4000) {
    brain.destination = pickObjective(self, world);
    brain.nextThink = now + 3000 + Math.random() * 3000;
  }
  const dest = brain.destination;

  // plant / defuse logic when at spike-relevant spot
  const attacking = self.team === world.attackersTeam;
  if (attacking && !world.spikePlanted) {
    // carrier plants at site
    const onSiteA = dist2D(self.pos, SITES.A) < SITES.A.r;
    const onSiteB = dist2D(self.pos, SITES.B) < SITES.B.r;
    if ((onSiteA || onSiteB)) {
      // simulate a designated planter: lowest id char
      intent.wantPlant = true;
    }
  }
  if (!attacking && world.spikePlanted && world.spikePos) {
    if (dist2D(self.pos, world.spikePos) < 2) intent.wantDefuse = true;
  }

  const dx = dest.x - self.pos.x, dz = dest.z - self.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  intent.moveX = dx / len;
  intent.moveZ = dz / len;
  // face movement direction, scan a little
  intent.wantYaw = Math.atan2(dx, -dz) + Math.sin(now * 0.001 + self.pos.x) * 0.25;
  intent.wantPitch = 0;
  return intent;
}
