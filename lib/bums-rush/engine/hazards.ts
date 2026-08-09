/**
 * Every `Hazard` kind (§6.3).
 *
 * Lethality is evaluated against the head and the two hands rather than through
 * matter's collision pairs. Two reasons: an arm segment brushing a saw should
 * not kill (arms do not collide with hazards at all — `MASK.ARM`), and a
 * `laser` is a line with no body, so a uniform "is this seat touching a lethal
 * thing" sweep is the only formulation that covers all eight kinds without
 * special cases at the call site.
 *
 * `heat` is the one hazard with a grace period, and it is authored (`graceMs`)
 * rather than global: a hot pan you can panic on is funny, a hot pan that kills
 * on touch is a wall.
 */

import Matter from 'matter-js';
import { NET } from '../constants';
import type { Hazard, HazardKind, SeatIndex, Vec2 } from '../types';
import type { Character } from './character';
import { pathPoint } from './props';
import { P } from './tuning';
import {
  defaultMeta,
  FILTERS,
  moveCarrying,
  shapeCentre,
  shapeContains,
  shapeToBody,
  type PhysWorld,
} from './world';

const { Body } = Matter;

export interface HazardRuntime {
  hazard: Hazard;
  kind: HazardKind;
  body: Matter.Body | null;
  active: boolean;
  progress: number;
  t: number;
  dir: 1 | -1;
  /** Continuous overlap per seat, for `heat`. */
  grace: Float64Array;
  /** `crumble` has given way and the region is now a hole. */
  gone: boolean;
  armedMs: number;
  home: Vec2;
}

export interface HazardContext {
  world: PhysWorld;
  characters: (Character | null)[];
  nowMs: number;
}

const posScratch: Vec2 = { x: 0, y: 0 };
const forceScratch: Vec2 = { x: 0, y: 0 };

export function createHazards(world: PhysWorld, hazards: Hazard[]): HazardRuntime[] {
  const out: HazardRuntime[] = [];
  for (const hazard of hazards) {
    const rt: HazardRuntime = {
      hazard,
      kind: hazard.kind,
      body: null,
      active: true,
      progress: 0,
      t: 0,
      dir: 1,
      grace: new Float64Array(NET.MAX_SEATS),
      gone: false,
      armedMs: -1,
      home: { x: 0, y: 0 },
    };

    switch (hazard.kind) {
      case 'spikes':
      case 'heat':
      case 'void':
      case 'wind':
        // Volumes, not colliders — a `void` with a body would push a falling
        // player back out of the hole it is meant to be.
        shapeCentre(hazard.shape, rt.home);
        break;
      case 'crumble': {
        const body = shapeToBody(hazard.shape, { isStatic: true, material: 'crumbly' });
        body.sleepThreshold = Infinity;
        rt.body = world.add(
          body,
          defaultMeta({ role: 'geometry', grabbable: true, material: 'crumbly', refId: hazard.id }),
        );
        shapeCentre(hazard.shape, rt.home);
        break;
      }
      case 'crusher': {
        const body = shapeToBody(hazard.shape, { isStatic: true, filter: FILTERS.prop });
        body.sleepThreshold = Infinity;
        rt.body = world.add(body, defaultMeta({ role: 'hazard', refId: hazard.id, lethal: true }));
        rt.home.x = body.position.x;
        rt.home.y = body.position.y;
        break;
      }
      case 'saw': {
        rt.home.x = hazard.at.x;
        rt.home.y = hazard.at.y;
        break;
      }
      case 'laser': {
        rt.home.x = (hazard.from.x + hazard.to.x) / 2;
        rt.home.y = (hazard.from.y + hazard.to.y) / 2;
        break;
      }
    }
    out.push(rt);
  }
  return out;
}

export function updateHazards(ctx: HazardContext, hazards: HazardRuntime[], dtMs: number): void {
  const dt = dtMs / 1000;
  for (const rt of hazards) {
    const h = rt.hazard;
    switch (h.kind) {
      case 'laser': {
        const period = h.onMs + h.offMs;
        const phase = (ctx.nowMs + (h.phaseMs ?? 0)) % period;
        rt.active = phase < h.onMs;
        rt.progress = phase / period;
        break;
      }
      case 'saw': {
        if (h.path && h.path.length > 1) {
          const spans = h.path.length - 1;
          rt.t += ((h.speed ?? 120) * dt * spans) / (spanLength(h.path) || 1) * rt.dir;
          if (rt.t > spans) {
            rt.t = spans;
            rt.dir = -1;
          } else if (rt.t < 0) {
            rt.t = 0;
            rt.dir = 1;
          }
          pathPoint(h.path, rt.t, posScratch);
          rt.home.x = posScratch.x;
          rt.home.y = posScratch.y;
        }
        rt.progress = (rt.progress + dt * 4) % 1;
        break;
      }
      case 'crusher': {
        if (!rt.body || h.path.length < 2) break;
        const spans = h.path.length - 1;
        rt.t += (h.speed * dt * spans) / (spanLength(h.path) || 1) * rt.dir;
        if (rt.t > spans) {
          rt.t = spans;
          rt.dir = -1;
        } else if (rt.t < 0) {
          rt.t = 0;
          rt.dir = 1;
        }
        pathPoint(h.path, rt.t, posScratch);
        moveCarrying(rt.body, posScratch.x, posScratch.y);
        rt.progress = rt.t / spans;
        break;
      }
      case 'wind': {
        const on = !h.periodMs || (ctx.nowMs % h.periodMs) / h.periodMs > 0.5;
        rt.active = on;
        rt.progress = h.periodMs ? (ctx.nowMs % h.periodMs) / h.periodMs : 0;
        if (!on) break;
        for (const body of ctx.world.tracked) {
          if (body.isStatic) continue;
          if (!shapeContains(h.shape, body.position.x, body.position.y)) continue;
          forceScratch.x = h.dir.x * h.force * body.mass;
          forceScratch.y = h.dir.y * h.force * body.mass;
          Body.applyForce(body, body.position, forceScratch);
        }
        break;
      }
      case 'crumble': {
        if (rt.gone || rt.armedMs < 0) break;
        rt.armedMs += dtMs;
        rt.progress = Math.min(1, rt.armedMs / h.delayMs);
        if (rt.armedMs >= h.delayMs) {
          rt.gone = true;
          rt.active = true;
          if (rt.body) {
            ctx.world.remove(rt.body);
            rt.body = null;
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

function spanLength(path: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  return total;
}

/** A gripped `crumble` starts its countdown; that is the only way it fires. */
export function armCrumble(hazards: HazardRuntime[], refId: string): void {
  for (const rt of hazards) {
    if (rt.kind === 'crumble' && rt.hazard.id === refId && rt.armedMs < 0) rt.armedMs = 0;
  }
}

function pointHits(rt: HazardRuntime, x: number, y: number): boolean {
  const h = rt.hazard;
  switch (h.kind) {
    case 'spikes':
    case 'void':
      return shapeContains(h.shape, x, y);
    case 'heat':
      return shapeContains(h.shape, x, y);
    case 'crumble':
      return rt.gone && shapeContains(h.shape, x, y);
    case 'saw': {
      const dx = x - rt.home.x;
      const dy = y - rt.home.y;
      return dx * dx + dy * dy <= h.r * h.r;
    }
    case 'laser': {
      if (!rt.active) return false;
      const vx = h.to.x - h.from.x;
      const vy = h.to.y - h.from.y;
      const len2 = vx * vx + vy * vy || 1;
      let t = ((x - h.from.x) * vx + (y - h.from.y) * vy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = h.from.x + vx * t;
      const py = h.from.y + vy * t;
      return Math.hypot(x - px, y - py) <= 8;
    }
    case 'crusher': {
      if (!rt.body) return false;
      const b = rt.body.bounds;
      return x >= b.min.x && x <= b.max.x && y >= b.min.y && y <= b.max.y;
    }
    default:
      return false;
  }
}

/**
 * Does any hazard kill this seat this step? `heat` accumulates its grace here
 * so that leaving the volume for one frame genuinely resets the timer — a hot
 * pan you can hop across is the design, and a latched timer would silently
 * remove that.
 */
export function hazardKills(hazards: HazardRuntime[], ch: Character, dtMs: number): boolean {
  const hx = ch.head.position.x;
  const hy = ch.head.position.y;
  for (const rt of hazards) {
    const h = rt.hazard;
    if (h.kind === 'wind') continue;
    let touching = pointHits(rt, hx, hy);
    if (!touching) {
      for (let i = 0; i < 2 && !touching; i++) {
        const hand = ch.arms[i].hand.position;
        touching = pointHits(rt, hand.x, hand.y);
      }
    }
    if (h.kind === 'heat') {
      const seat = ch.seat as SeatIndex;
      rt.grace[seat] = touching ? rt.grace[seat] + dtMs : 0;
      if (rt.grace[seat] >= h.graceMs) return true;
      continue;
    }
    if (touching) return true;
  }
  return false;
}

/** Out of `bounds` is death too (§3.5), and it is the most common one. */
export function outOfBounds(world: PhysWorld, ch: Character): boolean {
  const p = ch.head.position;
  return (
    p.x < world.bounds.minX - P.HEAD_RADIUS ||
    p.x > world.bounds.maxX + P.HEAD_RADIUS ||
    p.y < world.bounds.minY - P.DESIGN_HEIGHT ||
    p.y > world.bounds.maxY + P.HEAD_RADIUS
  );
}

export function resetHazardGrace(hazards: HazardRuntime[], seat: SeatIndex): void {
  for (const rt of hazards) rt.grace[seat] = 0;
}
