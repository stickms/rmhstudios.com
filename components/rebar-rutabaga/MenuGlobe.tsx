'use client';

/**
 * The menu globe — Rebar & Rutabaga's nine courses as nine pearls on the site's
 * sphere.
 *
 * The kitchen's technique is spherification, so the menu is not *displayed on* a
 * globe as a borrowed idiom: the pearls on the glass are the food. Each course
 * draws at the real diameter it is served at (`pearlRadius`), in its own dye
 * (`--rebar-pearl-*`), and pressing the sphere sends a wave across it — which is
 * the one thing a set sphere does when you touch it.
 *
 * ## What this file does NOT own
 *
 * Almost all of it. The sphere is `lib/globe.ts` (axes, perspective, the cage,
 * picking, the pitch limit), shared with the navigation globe and the debt
 * ledger. The physics is `lib/fluid.ts` (the Ricker-wavelet ripple, the springs,
 * the throw projection) — design-language §0.5 is explicit that these are not to
 * be re-derived locally. The frame loop is `hooks/useCanvasStage`, which is what
 * makes this idle-at-rest: no frame is scheduled unless a ripple is travelling,
 * a throw is coasting or the magnet is still settling.
 *
 * What is local is the *reading*: which pearl is which course, and what a
 * release means.
 *
 * ## Release reads intent from the projection
 *
 * Letting go does not coast to an arbitrary stop and then snap. The throw's
 * velocity is projected to where it *would* come to rest (`projectDistance`),
 * the nearest course to that resting point wins, and one interruptible spring
 * carries the globe there — so a flick picks the course you threw toward, and
 * grabbing it again mid-flight retargets from where it is and how fast it is
 * going. That is the §0.5 "intent is read from the projection" rule.
 *
 * ## Accessibility
 *
 * The canvas is a picture: `role="img"` with a label that says what it shows and
 * where to read the same thing as text — the course list beside it is a real
 * list of real buttons and is the keyboard and screen-reader path. This matches
 * the debt globe, which is the other globe on the site that is read rather than
 * navigated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GLOBE_PERSP,
  MERIDIANS,
  PARALLELS,
  RING_COS,
  RING_SAMPLES,
  RING_SIN,
  clampPitch,
  pickNearest,
  toScreen,
  viewOf,
  type GlobeAnchor,
  type GlobeView,
} from '@/lib/globe';
import {
  DECELERATION,
  RIPPLE,
  SPRINGS,
  VelocityTracker,
  projectDistance,
  rippleWave,
  springStep,
  unprojectSphere,
  unrotateSphere,
  type SpringState,
} from '@/lib/fluid';
import { useCanvasStage, type StageFrame, type StagePaintSpec } from '@/hooks/useCanvasStage';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { COURSES, COURSE_ANCHORS, pearlRadius } from '@/lib/rebar-rutabaga/menu';
import { cn } from '@/lib/utils';

const DEG = Math.PI / 180;

/** Degrees of rotation per pixel dragged — the navigation globe's own feel. */
const ROT_PER_PX = 0.42;
/** Idle drift in degrees per second, until the visitor first takes hold. */
const IDLE_DRIFT = 3.5;
/** A press that travels less than this is a tap on a pearl, not a throw. */
const TAP_PX = 6;
/** How generously a tap may miss a pearl and still pick it, in CSS pixels. */
const TAP_SLOP = 26;
/** Below this angular speed a release is a nudge, not a throw. */
const THROW_MIN_DPS = 40;

/**
 * The palette this globe resolves from the theme.
 *
 * Nine course dyes, then the restaurant's mark. They live in one list because
 * {@link StagePaintSpec} resolves one list; the trailing slot is named below so
 * no draw site indexes past the courses by hand.
 */
const SULPHUR = COURSES.length;

const REBAR_PAINT: StagePaintSpec = {
  palette: [
    '--rebar-pearl-birch',
    '--rebar-pearl-rye',
    '--rebar-pearl-oyster',
    '--rebar-pearl-rutabaga',
    '--rebar-pearl-cod',
    '--rebar-pearl-marrow',
    '--rebar-pearl-reindeer',
    '--rebar-pearl-cloudberry',
    '--rebar-pearl-gravel',
    '--rebar-sulphur',
  ],
  paletteFallback: [
    'rgb(200 165 74)',
    'rgb(232 215 176)',
    'rgb(185 196 180)',
    'rgb(141 90 43)',
    'rgb(223 227 226)',
    'rgb(168 35 47)',
    'rgb(85 96 106)',
    'rgb(217 139 31)',
    'rgb(46 39 35)',
    'rgb(201 168 27)',
  ],
};

/** One live ripple, recorded in the globe's OWN coordinates so it sticks. */
interface Ripple {
  bx: number;
  by: number;
  bz: number;
  age: number;
}

/**
 * The yaw and pitch that bring `anchor` to the front of the sphere.
 *
 * Solved rather than searched: with the renderer's yaw-then-pitch order, putting
 * a direction at `(0, 0, 1)` has a closed form, and `nearYaw` then picks the
 * revolution closest to where the globe already is so a settle never takes the
 * long way round.
 */
function aimAt(anchor: GlobeAnchor, fromYawDeg: number): { yaw: number; pitch: number } {
  const yaw = Math.atan2(-anchor.bx, anchor.bz) / DEG;
  const planar = Math.hypot(anchor.bx, anchor.bz);
  const pitch = clampPitch(Math.atan2(anchor.by, planar) / DEG);
  const turns = Math.round((fromYawDeg - yaw) / 360);
  return { yaw: yaw + turns * 360, pitch };
}

export function MenuGlobe({
  selected,
  onSelect,
  className,
}: {
  selected: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  const { t } = useTranslation('c-rebar-rutabaga');
  const reduced = useReducedMotion();

  const [dragging, setDragging] = useState(false);

  /* Rotation is integrated in refs inside the loop, never in React state: it
     changes every frame of a drag, and a setState per frame would re-render the
     course list nine times a second for no visible gain. */
  const yaw = useRef<SpringState>({ value: 0, velocity: 0 });
  const pitch = useRef<SpringState>({ value: 0, velocity: 0 });
  const target = useRef(aimAt(COURSE_ANCHORS[0]!, 0));
  const settling = useRef(true);
  const touched = useRef(false);
  const ripples = useRef<Ripple[]>([]);

  const velYaw = useRef(new VelocityTracker());
  const velPitch = useRef(new VelocityTracker());
  const drag = useRef({ id: -1, x: 0, y: 0, moved: 0 });

  /** Where each pearl landed last frame, for tap picking. Reused, never grown. */
  const hits = useRef(COURSES.map(() => ({ sx: 0, sy: 0, depth: 0 })));
  /** Scratch view vector — `viewOf` writes into it so the loop allocates nothing. */
  const scratch = useRef<GlobeView>({ x: 0, y: 0, z: 0 });

  // A selection made anywhere — a list button, a tap, the magnet — is carried by
  // the same spring, so the globe never jumps.
  useEffect(() => {
    const anchor = COURSE_ANCHORS[selected];
    if (!anchor) return;
    target.current = aimAt(anchor, yaw.current.value);
    settling.current = true;
    touched.current = true;
    if (reduced) {
      yaw.current = { value: target.current.yaw, velocity: 0 };
      pitch.current = { value: target.current.pitch, velocity: 0 };
      settling.current = false;
    }
  }, [selected, reduced]);

  const swellAt = useCallback((bx: number, by: number, bz: number) => {
    const live = ripples.current;
    if (live.length === 0) return 1;
    let swell = 1;
    for (let i = 0; i < live.length; i++) {
      const r = live[i]!;
      const dot = bx * r.bx + by * r.by + bz * r.bz;
      const distance = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
      swell += rippleWave({ age: r.age, distance });
    }
    return swell;
  }, []);

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, frame: StageFrame) => {
      const { width, height, dt, paint } = frame;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.39;
      let busy = false;

      /* ── integrate ─────────────────────────────────────────────────────── */
      if (ripples.current.length > 0) {
        const live = ripples.current;
        for (let i = live.length - 1; i >= 0; i--) {
          live[i]!.age += dt;
          if (live[i]!.age >= RIPPLE.life) live.splice(i, 1);
        }
        busy = busy || live.length > 0;
      }

      if (!dragging) {
        if (settling.current) {
          yaw.current = springStep(yaw.current, target.current.yaw, SPRINGS.snappy, dt);
          pitch.current = springStep(pitch.current, target.current.pitch, SPRINGS.snappy, dt);
          const done =
            Math.abs(yaw.current.value - target.current.yaw) < 0.05 &&
            Math.abs(pitch.current.value - target.current.pitch) < 0.05 &&
            Math.abs(yaw.current.velocity) < 2;
          if (done) {
            yaw.current.value = target.current.yaw;
            pitch.current.value = target.current.pitch;
            yaw.current.velocity = 0;
            pitch.current.velocity = 0;
            settling.current = false;
          }
          busy = busy || settling.current;
        } else if (!touched.current && !reduced) {
          // Ambient drift, until the visitor first takes hold of it. It stops for
          // good at the first touch rather than fighting the reader afterwards.
          yaw.current.value += IDLE_DRIFT * dt;
          busy = true;
        }
      }

      const yawDeg = yaw.current.value;
      const pitchDeg = pitch.current.value;

      /* ── the cage ──────────────────────────────────────────────────────── */
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';

      const drawRing = (
        at: (s: number) => { bx: number; by: number; bz: number },
        front: boolean,
        alpha: number,
      ) => {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        let open = false;
        for (let s = 0; s <= RING_SAMPLES; s++) {
          const p = at(s);
          const swell = swellAt(p.bx, p.by, p.bz);
          const view = viewOf(p, yawDeg, pitchDeg, swell, scratch.current);
          if (view.z >= 0 !== front) {
            open = false;
            continue;
          }
          const screen = toScreen(view, radius);
          const x = cx + screen.x;
          const y = cy + screen.y;
          if (open) ctx.lineTo(x, y);
          else {
            ctx.moveTo(x, y);
            open = true;
          }
        }
        ctx.stroke();
      };

      ctx.strokeStyle = paint.ink;
      for (const front of [false, true]) {
        const alpha = front ? 0.34 : 0.12;
        for (const lon of MERIDIANS) {
          const sl = Math.sin(lon * DEG);
          const cl = Math.cos(lon * DEG);
          drawRing(
            (s) => ({ bx: sl * RING_COS[s]!, by: -RING_SIN[s]!, bz: cl * RING_COS[s]! }),
            front,
            alpha,
          );
        }
        for (const lat of PARALLELS) {
          const r = Math.cos(lat * DEG);
          const y = -Math.sin(lat * DEG);
          drawRing((s) => ({ bx: r * RING_SIN[s]!, by: y, bz: r * RING_COS[s]! }), front, alpha);
        }
        if (!front) {
          // The glass sits between the two hemispheres, so the back of the cage
          // reads as being *through* something rather than in front of it.
          ctx.globalAlpha = 0.05;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = paint.ink;
          ctx.fill();
        }
      }

      /* ── the pearls ────────────────────────────────────────────────────── */
      const order = COURSES.map((_, i) => i);
      for (let i = 0; i < COURSES.length; i++) {
        const anchor = COURSE_ANCHORS[i]!;
        const swell = swellAt(anchor.bx, anchor.by, anchor.bz);
        const view = viewOf(anchor, yawDeg, pitchDeg, swell, scratch.current);
        const screen = toScreen(view, radius);
        const hit = hits.current[i]!;
        hit.sx = cx + screen.x;
        hit.sy = cy + screen.y;
        hit.depth = view.z;
      }
      order.sort((a, b) => hits.current[a]!.depth - hits.current[b]!.depth);

      for (const i of order) {
        const course = COURSES[i]!;
        const hit = hits.current[i]!;
        const depth = hit.depth;
        const k = GLOBE_PERSP / (GLOBE_PERSP - depth * 0.5);
        const r = Math.max(2, pearlRadius(course.diameterMm) * radius * k);
        const isSelected = i === selected;

        // Back-face pearls stay visible through the glass but recede, so the
        // sphere reads as transparent rather than as a flat disc of dots.
        ctx.globalAlpha = depth >= 0 ? 0.45 + 0.55 * depth : 0.16;
        ctx.beginPath();
        ctx.arc(hit.sx, hit.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = paint.palette[i] ?? paint.ink;
        ctx.fill();

        // A set sphere has a skin and a wet highlight. One fixed scene light
        // from above-left, never the cursor (§5.1.1) — the same light the glass
        // tier paints its rim glint from.
        ctx.globalAlpha = depth >= 0 ? 0.3 + 0.4 * depth : 0.1;
        ctx.beginPath();
        ctx.arc(hit.sx - r * 0.3, hit.sy - r * 0.34, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = paint.surface;
        ctx.fill();

        if (isSelected && depth > 0) {
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(hit.sx, hit.sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = paint.palette[SULPHUR] ?? paint.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      }

      /* ── the reticle ───────────────────────────────────────────────────── */
      const lock = hits.current[selected]?.depth ?? 0;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = paint.ink;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
      ctx.stroke();
      if (lock > 0.9) {
        ctx.globalAlpha = Math.min(1, (lock - 0.9) / 0.08);
        ctx.strokeStyle = paint.palette[SULPHUR] ?? paint.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.globalAlpha = 1;

      return busy;
    },
    [dragging, reduced, selected, swellAt],
  );

  const { canvasRef, invalidate } = useCanvasStage(render, false, REBAR_PAINT);

  /** Pointer position in CSS pixels relative to the canvas box. */
  const pointAt = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
    },
    [canvasRef],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = pointAt(e);
      if (!point) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      setDragging(true);
      touched.current = true;
      settling.current = false;
      yaw.current.velocity = 0;
      pitch.current.velocity = 0;
      velYaw.current.reset();
      velPitch.current.reset();

      if (!reduced) {
        // Record the impact in the globe's OWN coordinates, so the wave is stuck
        // to the ball: keep dragging and it turns with the surface it travels
        // over, exactly as a mark on the glass would.
        const radius = Math.min(point.rect.width, point.rect.height) * 0.39;
        const nx = (point.x - point.rect.width / 2) / radius;
        const ny = (point.y - point.rect.height / 2) / radius;
        const on = unprojectSphere(nx, ny, GLOBE_PERSP);
        if (on) {
          const body = unrotateSphere(on, yaw.current.value, pitch.current.value);
          ripples.current.push({ bx: body.x, by: body.y, bz: body.z, age: 0 });
          if (ripples.current.length > 3) ripples.current.shift();
        }
      }
      invalidate();
    },
    [invalidate, pointAt, reduced],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (drag.current.id !== e.pointerId) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      yaw.current.value += dx * ROT_PER_PX;
      pitch.current.value = clampPitch(pitch.current.value + dy * ROT_PER_PX);
      velYaw.current.add(yaw.current.value, e.timeStamp);
      velPitch.current.add(pitch.current.value, e.timeStamp);
      invalidate();
    },
    [invalidate],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (drag.current.id !== e.pointerId) return;
      const wasTap = drag.current.moved < TAP_PX;
      drag.current.id = -1;
      setDragging(false);

      if (wasTap) {
        const point = pointAt(e);
        const index = point ? pickNearest(hits.current, point.x, point.y, TAP_SLOP) : -1;
        // A tap that lands on nothing still re-seats the current course rather
        // than leaving the globe wherever the finger stopped it.
        onSelect(index >= 0 ? index : selected);
        invalidate();
        return;
      }

      const speed = velYaw.current.get();
      // Where would this throw come to rest? The course nearest THAT is the one
      // the reader threw toward — not the one that happens to be facing now.
      const resting =
        Math.abs(speed) > THROW_MIN_DPS
          ? yaw.current.value + projectDistance(speed, DECELERATION.normal)
          : yaw.current.value;

      let best = selected;
      let bestGap = Infinity;
      for (let i = 0; i < COURSE_ANCHORS.length; i++) {
        const aim = aimAt(COURSE_ANCHORS[i]!, resting);
        const gap = Math.abs(aim.yaw - resting);
        if (gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      }
      yaw.current.velocity = speed;
      pitch.current.velocity = velPitch.current.get();
      onSelect(best);
      invalidate();
    },
    [invalidate, onSelect, pointAt, selected],
  );

  const label = useMemo(
    () =>
      t('globe.desc', {
        defaultValue:
          'A glass sphere with the nine courses set on it as pearls, each drawn at the size it is served. Drag to turn it, press it to send a wave across the surface. The same menu is listed as text beside it.',
      }),
    [t],
  );

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        'block aspect-square w-full max-w-full touch-none select-none',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label={label}
    />
  );
}
