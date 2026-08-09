/**
 * Camera framing, zoom and damping (§5).
 *
 * Levels are wider and taller than one screen and four players are frequently
 * trying to be in different places, so the camera has exactly one job: never
 * let a player be invisible with no cue. When the party spreads past what
 * `MIN_ZOOM` can hold, the camera **stops zooming out** and hands back edge
 * indicators instead of continuing to shrink everyone to ants — a zoom floor is
 * a legibility decision, not a performance one.
 *
 * The spring is solved implicitly rather than as `pos += (target - pos) * k`.
 * The explicit form is only critically damped at one framerate, and this game
 * runs its sim at a fixed 60 Hz but is rendered on everything from a 30 fps
 * phone to a 144 Hz monitor; the implicit form is unconditionally stable and
 * genuinely does not overshoot, which is what `ζ = 1.0` is promising the player
 * who gets motion sick.
 */

import { CAMERA } from '../constants';
import type { Level, Rect, SeatIndex } from '../types';
import { P } from './tuning';

export interface CameraSeat {
  seat: SeatIndex;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** ms since this seat died; < DEAD_EXCLUDE_MS still counts for framing. */
  deadForMs: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  vx: number;
  vy: number;
  vzoom: number;
  viewW: number;
  viewH: number;
  minZoom: number;
  maxZoom: number;
  reducedMotion: boolean;
  bounds: Rect;
  /** True while the party does not fit — the renderer draws edge arrows. */
  clamped: boolean;
  targetX: number;
  targetY: number;
  targetZoom: number;
}

export interface CameraOptions {
  solo?: boolean;
  reducedMotion?: boolean;
  viewW?: number;
  viewH?: number;
}

export interface EdgeIndicator {
  seat: SeatIndex;
  /** Position on the frame edge, in world space. */
  x: number;
  y: number;
  angle: number;
  distance: number;
}

export function createCamera(level: Level, opts: CameraOptions = {}): Camera {
  const solo = opts.solo === true;
  return {
    x: level.bounds.x + level.bounds.w / 2,
    y: level.bounds.y + level.bounds.h / 2,
    zoom: solo ? CAMERA.SOLO_MAX_ZOOM : 1,
    vx: 0,
    vy: 0,
    vzoom: 0,
    viewW: opts.viewW ?? P.DESIGN_WIDTH,
    viewH: opts.viewH ?? P.DESIGN_HEIGHT,
    minZoom: solo ? CAMERA.SOLO_MIN_ZOOM : CAMERA.MIN_ZOOM,
    maxZoom: solo ? CAMERA.SOLO_MAX_ZOOM : CAMERA.MAX_ZOOM,
    reducedMotion: opts.reducedMotion === true,
    bounds: level.bounds,
    clamped: false,
    targetX: level.bounds.x + level.bounds.w / 2,
    targetY: level.bounds.y + level.bounds.h / 2,
    targetZoom: 1,
  };
}

/** Implicit critically damped step — stable at any dt, no overshoot. */
function spring(cur: number, target: number, vel: number, omega: number, dt: number): number {
  const denom = 1 + 2 * omega * dt + omega * omega * dt * dt;
  return (vel + dt * omega * omega * (target - cur)) / denom;
}

export function computeCameraTarget(cam: Camera, seats: readonly CameraSeat[]): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumVX = 0;
  let sumVY = 0;
  let n = 0;

  for (const s of seats) {
    if (!s.active) continue;
    // A player who just died stays in frame for DEAD_EXCLUDE_MS so the camera
    // does not snap away from the splat that explains what happened.
    if (s.deadForMs >= CAMERA.DEAD_EXCLUDE_MS) continue;
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
    sumVX += s.vx;
    sumVY += s.vy;
    n++;
  }

  if (n === 0) {
    cam.targetX = cam.bounds.x + cam.bounds.w / 2;
    cam.targetY = cam.bounds.y + cam.bounds.h / 2;
    cam.targetZoom = cam.maxZoom;
    cam.clamped = false;
    return;
  }

  const lookScale = cam.reducedMotion ? CAMERA.LOOKAHEAD / 2 : CAMERA.LOOKAHEAD;
  let leadX = (sumVX / n) * lookScale;
  let leadY = (sumVY / n) * lookScale;
  const leadMag = Math.hypot(leadX, leadY);
  if (leadMag > CAMERA.LOOKAHEAD_MAX) {
    const k = CAMERA.LOOKAHEAD_MAX / leadMag;
    leadX *= k;
    leadY *= k;
  }

  const w = maxX - minX + CAMERA.MARGIN * 2;
  const h = maxY - minY + CAMERA.MARGIN * 2;
  const fit = Math.min(cam.viewW / Math.max(1, w), cam.viewH / Math.max(1, h));
  cam.clamped = fit < cam.minZoom;
  cam.targetZoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, fit));

  cam.targetX = (minX + maxX) / 2 + leadX;
  cam.targetY = (minY + maxY) / 2 + leadY;
  clampToBounds(cam);
}

function clampToBounds(cam: Camera): void {
  const halfW = cam.viewW / (2 * cam.targetZoom);
  const halfH = cam.viewH / (2 * cam.targetZoom);
  const { x, y, w, h } = cam.bounds;
  // A level narrower than the frame centres rather than sticking to an edge.
  cam.targetX = w <= halfW * 2 ? x + w / 2 : Math.max(x + halfW, Math.min(x + w - halfW, cam.targetX));
  cam.targetY = h <= halfH * 2 ? y + h / 2 : Math.max(y + halfH, Math.min(y + h - halfH, cam.targetY));
}

export function updateCamera(cam: Camera, seats: readonly CameraSeat[], dtMs: number): void {
  computeCameraTarget(cam, seats);
  const dt = dtMs / 1000;
  const omega = CAMERA.SPRING_OMEGA;
  const zoomOmega = cam.reducedMotion ? omega / 2 : omega;

  cam.vx = spring(cam.x, cam.targetX, cam.vx, omega, dt);
  cam.x += cam.vx * dt;
  cam.vy = spring(cam.y, cam.targetY, cam.vy, omega, dt);
  cam.y += cam.vy * dt;
  cam.vzoom = spring(cam.zoom, cam.targetZoom, cam.vzoom, zoomOmega, dt);
  cam.zoom += cam.vzoom * dt;
}

/** Level start and host migration both need the camera to arrive, not travel. */
export function snapCamera(cam: Camera, seats: readonly CameraSeat[]): void {
  computeCameraTarget(cam, seats);
  cam.x = cam.targetX;
  cam.y = cam.targetY;
  cam.zoom = cam.targetZoom;
  cam.vx = 0;
  cam.vy = 0;
  cam.vzoom = 0;
}

export function cameraContains(cam: Camera, x: number, y: number, pad = 0): boolean {
  const halfW = cam.viewW / (2 * cam.zoom) + pad;
  const halfH = cam.viewH / (2 * cam.zoom) + pad;
  return Math.abs(x - cam.x) <= halfW && Math.abs(y - cam.y) <= halfH;
}

/**
 * One arrow per off-screen seat, pinned to the frame edge in that seat's colour
 * and mark, with the distance to it. Written into `out` (which is reused) and
 * the count returned, so the HUD can render without allocating per frame.
 */
export function computeEdgeIndicators(
  cam: Camera,
  seats: readonly CameraSeat[],
  out: EdgeIndicator[],
): number {
  let n = 0;
  const halfW = cam.viewW / (2 * cam.zoom);
  const halfH = cam.viewH / (2 * cam.zoom);
  for (const s of seats) {
    if (!s.active || s.deadForMs >= CAMERA.DEAD_EXCLUDE_MS) continue;
    const dx = s.x - cam.x;
    const dy = s.y - cam.y;
    if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) continue;
    // Scale the offset down until it lands on the frame rectangle; that is the
    // arrow's anchor and its angle is the direction to look.
    const k = Math.min(halfW / (Math.abs(dx) || 1e-6), halfH / (Math.abs(dy) || 1e-6));
    const ind = out[n] ?? { seat: s.seat, x: 0, y: 0, angle: 0, distance: 0 };
    ind.seat = s.seat;
    ind.x = cam.x + dx * k;
    ind.y = cam.y + dy * k;
    ind.angle = Math.atan2(dy, dx);
    ind.distance = Math.hypot(dx, dy);
    out[n] = ind;
    n++;
  }
  return n;
}
