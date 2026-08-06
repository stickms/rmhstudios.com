'use client';

/**
 * The liquid debt globe — the ledger plotted on the site's own sphere.
 *
 * The navigation hub is a liquid globe: a wireframe ball you turn with a finger,
 * with things pinned to its surface and a wave that travels over the glass when
 * you poke it. That is this site's idiom for "a set of things laid out on a
 * surface you explore", so the ledger goes on one too — same handedness, same
 * perspective constant, same cage of six meridians and seven parallels, same
 * Ricker-wavelet ripple out of `lib/fluid`. It is the same instrument reading
 * different data, not a second globe that happens to look similar.
 *
 * ## The map
 *
 * - **Latitude is the category.** Eight bands, in the palette's own order, so a
 *   colour always lives on the same ring and you learn where a kind of debt is.
 * - **Longitude is time.** One full turn is the whole span of the archive:
 *   newest at the prime meridian, oldest round the back. Spinning it is
 *   scrubbing through his history.
 * - **Altitude is money.** Each bucket stands off the surface in proportion to
 *   what it is worth *now*, so the globe grows spikes where the debt is — and
 *   the spikes keep growing while you watch, because the lift is computed from
 *   the basis and the clock like everything else on this page.
 *
 * ## Poke it
 *
 * A press sends a wave out across the surface from the exact spot you hit. The
 * impact is recorded in the globe's OWN coordinates (`unprojectSphere` then
 * `unrotateSphere`), so the wave is stuck to the ball: keep dragging and it
 * turns with the surface it is travelling over. The wave swells the cage and
 * lifts the pins standing on it, and it is deliberately NOT applied to the hit
 * test — a decorative wave must never move a data point out from under the
 * pointer that is reading it.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { accrualFactor, formatDebt } from '@/lib/kaikai-debt/debt';
import {
  CATEGORY_ORDER,
  buildGrid,
  formatCompactDebt,
  formatMonth,
  valueNow,
  type GridCell,
} from '@/lib/kaikai-debt/stats';
import {
  GLOBE_PERSP,
  MERIDIANS,
  PARALLELS,
  RING_COS,
  RING_SAMPLES,
  RING_SIN,
  anchorAt,
  categoryLatitude,
  clampPitch,
  globeK,
  liftFor,
  timeLongitude,
  type GlobeAnchor,
} from '@/lib/kaikai-debt/globe';
import { RIPPLE, rippleFront, rippleWave, unprojectSphere, unrotateSphere } from '@/lib/fluid';
import { cn } from '@/lib/utils';
import { ChartCard, ChartToggle, Readout, ReadoutRow, Swatch } from './chart-kit';
import { pointerOnStage, useCanvasStage, type StageFrame } from './canvas-stage';
import { categoryLabel } from './CompositionCharts';

const DEG = Math.PI / 180;

/** Degrees of rotation per pixel dragged — the navigation globe's own feel. */
const ROT_PER_PX = 0.42;
/** Idle drift in degrees per second, until the visitor first takes hold. */
const IDLE_SPIN = 6;
/** How fast a thrown globe loses its spin, per second. */
const SPIN_DECAY = 2.4;
/** Runaway-flick guard, deg/s. */
const MAX_SPIN = 720;
/** Concurrent ripples. Older ones are evicted so a mash cannot grow the work. */
const MAX_RIPPLES = 3;

/** One live ripple, in the globe's own (unrotated) coordinates. */
interface Ripple {
  bx: number;
  by: number;
  bz: number;
  /** `performance.now()` at impact. */
  t0: number;
}

/** A plotted bucket, with where it landed on screen this frame. */
interface Pin {
  cellIndex: number;
  categoryIndex: number;
  anchor: GlobeAnchor;
  lift: number;
  sx: number;
  sy: number;
  depth: number;
}

export function DebtGlobe({
  grid,
  nowMs,
  selected,
}: {
  grid: readonly GridCell[];
  nowMs: number;
  selected: ReadonlySet<string>;
}) {
  const { t } = useTranslation('c-kaikai-debt');

  const [byCount, setByCount] = useState(false);
  const [spinning, setSpinning] = useState(true);
  const [hover, setHover] = useState(-1);
  const [dragging, setDragging] = useState(false);

  const frame = useMemo(() => buildGrid(grid), [grid]);

  /**
   * Where every non-empty bucket sits on the sphere, and how far it stands off
   * it.
   *
   * Computed once per data/measure change, never per frame. The anchor's
   * direction cosines are precomputed for the same reason the navigation globe
   * precomputes its pins': the projection runs them on every frame, and
   * recomputing two trig calls per pin per frame is the difference between a
   * cheap loop and a hot one.
   */
  const pins = useMemo(() => {
    const categories = frame.categories.length;
    const months = Math.max(1, frame.months.length);
    const max = byCount
      ? Math.max(1, frame.maxCount)
      : Math.max(1, frame.maxBasisCents * accrualFactor(nowMs));

    const out: Pin[] = [];
    for (let i = 0; i < frame.cells.length; i++) {
      const cell = frame.cells[i]!;
      if (cell.count === 0) continue;
      const monthIndex = Math.floor(i / categories);
      const categoryIndex = i % categories;
      const value = byCount ? cell.count : valueNow(cell, nowMs);
      out.push({
        cellIndex: i,
        categoryIndex,
        anchor: anchorAt(
          categoryLatitude(categoryIndex, categories),
          timeLongitude(monthIndex, months),
        ),
        lift: liftFor(value, max),
        sx: 0,
        sy: 0,
        depth: 0,
      });
    }
    return out;
  }, [frame, byCount, nowMs]);

  // Frame-loop state lives in refs. A globe that re-rendered React on every
  // frame of a drag would spend its entire budget reconciling a tree nothing in
  // the rotation is rendered from.
  const rotRef = useRef({ yaw: 12, pitch: -8, vYaw: 0, vPitch: 0 });
  const touchedRef = useRef(false);
  const ripplesRef = useRef<Ripple[]>([]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const spinRef = useRef(spinning);
  spinRef.current = spinning;
  const byCountRef = useRef(byCount);
  byCountRef.current = byCount;
  /** Radius in CSS px the last frame drew at — the hit test needs the same one. */
  const radiusRef = useRef(1);

  const render = useCallback((ctx: CanvasRenderingContext2D, stage: StageFrame) => {
    const rot = rotRef.current;
    const now = stage.nowMs;

    /* --- Integrate ------------------------------------------------------- */
    if (!touchedRef.current && spinRef.current) {
      rot.yaw += IDLE_SPIN * stage.dt;
    } else if (Math.abs(rot.vYaw) > 0.5 || Math.abs(rot.vPitch) > 0.5) {
      // A thrown globe coasts and settles. Exponential decay rather than a
      // spring: there is no target to settle ON — this is a chart, not a
      // picker, so it should stop where you left it and not glide to a detent.
      rot.yaw += rot.vYaw * stage.dt;
      rot.pitch = clampPitch(rot.pitch + rot.vPitch * stage.dt);
      const damp = Math.exp(-SPIN_DECAY * stage.dt);
      rot.vYaw *= damp;
      rot.vPitch *= damp;
    } else {
      rot.vYaw = 0;
      rot.vPitch = 0;
    }

    /* --- Ripples: retire the spent ones ---------------------------------- */
    const live = ripplesRef.current;
    if (live.length > 0) {
      let kept = 0;
      for (let i = 0; i < live.length; i++) {
        if ((now - live[i]!.t0) / 1000 < RIPPLE.life) live[kept++] = live[i]!;
      }
      live.length = kept;
    }

    /**
     * How far the surface at a body-space direction is pushed out.
     *
     * Early-returns to zero whenever nothing is rippling, so the whole feature
     * costs one length check per sample on the frames a viewer is merely
     * turning the ball.
     */
    const waveAt = (bx: number, by: number, bz: number): number => {
      if (live.length === 0) return 0;
      let sum = 0;
      for (const ripple of live) {
        const age = (now - ripple.t0) / 1000;
        const dot = bx * ripple.bx + by * ripple.by + bz * ripple.bz;
        sum += rippleWave({
          age,
          distance: Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot),
        });
      }
      return sum;
    };

    const radius = Math.min(stage.width, stage.height) * 0.38;
    radiusRef.current = radius;
    const cy = Math.cos(rot.yaw * DEG);
    const sy = Math.sin(rot.yaw * DEG);
    const cp = Math.cos(rot.pitch * DEG);
    const sp = Math.sin(rot.pitch * DEG);

    /** Body space → screen, through the same projection the pins use. */
    const project = (bx: number, by: number, bz: number, scale: number) => {
      const x = bx * scale;
      const y = by * scale;
      const z = bz * scale;
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const k = globeK(z2);
      return { x: x1 * radius * k, y: y2 * radius * k, depth: z2 };
    };

    /* --- The cage --------------------------------------------------------- */
    ctx.save();
    ctx.strokeStyle = stage.paint.ink;
    ctx.lineWidth = 1;
    const ring = (
      ux: number,
      uy: number,
      uz: number,
      vx: number,
      vy: number,
      vz: number,
      oy: number,
      major: boolean,
    ) => {
      ctx.globalAlpha = major ? 0.34 : 0.15;
      ctx.beginPath();
      for (let s = 0; s <= RING_SAMPLES; s++) {
        const ct = RING_COS[s]!;
        const st = RING_SIN[s]!;
        const bx = ux * ct + vx * st;
        const by = uy * ct + vy * st + oy;
        const bz = uz * ct + vz * st;
        const p = project(bx, by, bz, 1 + waveAt(bx, by, bz));
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    };
    for (const a of MERIDIANS) {
      const ca = Math.cos(a * DEG);
      const sa = Math.sin(a * DEG);
      ring(ca, 0, -sa, 0, 1, 0, 0, a === 0);
    }
    for (const latitude of PARALLELS) {
      const cl = Math.cos(latitude * DEG);
      const yl = -Math.sin(latitude * DEG);
      ring(cl, 0, 0, 0, 0, cl, yl, latitude === 0);
    }
    ctx.restore();

    /* --- The crest -------------------------------------------------------- */
    for (const ripple of live) {
      const age = (now - ripple.t0) / 1000;
      const front = rippleFront(age);
      if (front < 0.06 || front > Math.PI - 0.06) continue;
      const fade = 1 - age / RIPPLE.life;

      // An orthonormal frame around the impact axis, seeded off whichever
      // cardinal the axis leans on least so the cross product can never
      // collapse.
      const ax = ripple.bx;
      const ay = ripple.by;
      const az = ripple.bz;
      const seed =
        Math.abs(ax) < 0.9 ? [1, 0, 0] : Math.abs(ay) < 0.9 ? [0, 1, 0] : [0, 0, 1];
      let e1x = seed[1]! * az - seed[2]! * ay;
      let e1y = seed[2]! * ax - seed[0]! * az;
      let e1z = seed[0]! * ay - seed[1]! * ax;
      const n = Math.hypot(e1x, e1y, e1z) || 1;
      e1x /= n;
      e1y /= n;
      e1z /= n;
      const e2x = ay * e1z - az * e1y;
      const e2y = az * e1x - ax * e1z;
      const e2z = ax * e1y - ay * e1x;

      const cf = Math.cos(front);
      const sf = Math.sin(front);
      const swell = 1 + rippleWave({ age, distance: front });

      ctx.save();
      ctx.strokeStyle = stage.paint.ink;
      ctx.globalAlpha = fade * fade * 0.5;
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let drawing = false;
      for (let s = 0; s <= 48; s++) {
        const theta = (s / 48) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        const p = project(
          ax * cf + (e1x * ct + e2x * st) * sf,
          ay * cf + (e1y * ct + e2y * st) * sf,
          az * cf + (e1z * ct + e2z * st) * sf,
          swell,
        );
        // Only the near face; the far half of the crest would read as a second
        // wave coming the other way.
        if (p.depth <= 0) {
          drawing = false;
          continue;
        }
        if (drawing) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        drawing = true;
      }
      ctx.stroke();
      ctx.restore();
    }

    /* --- The data --------------------------------------------------------- */
    const list = pinsRef.current;
    const filtering = selectedRef.current.size > 0;
    const gridFrame = frameRef.current;

    for (const pin of list) {
      const swell = 1 + waveAt(pin.anchor.bx, pin.anchor.by, pin.anchor.bz);
      const base = project(pin.anchor.bx, pin.anchor.by, pin.anchor.bz, swell);
      const tip = project(pin.anchor.bx, pin.anchor.by, pin.anchor.bz, swell + pin.lift);
      pin.sx = tip.x;
      pin.sy = tip.y;
      // Depth is measured at the BASE — where the bucket actually sits on the
      // sphere — so a tall spike on the far side does not sort in front of a
      // short one on the near side just because its tip leans toward the camera.
      pin.depth = base.depth;
    }
    // Painter's algorithm: far side first, so the near hemisphere occludes it.
    const order = [...list].sort((a, b) => a.depth - b.depth);

    for (const pin of order) {
      const cell = gridFrame.cells[pin.cellIndex]!;
      const dimmed = filtering && !selectedRef.current.has(cell.category);
      const front = pin.depth > 0;
      const colour = stage.paint.categories[pin.categoryIndex] ?? stage.paint.ink;
      const swell = 1 + waveAt(pin.anchor.bx, pin.anchor.by, pin.anchor.bz);
      const base = project(pin.anchor.bx, pin.anchor.by, pin.anchor.bz, swell);

      // The far hemisphere stays faintly visible — it is what tells you there
      // is more globe to turn to — but it never takes a hover.
      const alpha = (front ? 0.35 + 0.65 * Math.min(1, pin.depth * 1.4) : 0.12) * (dimmed ? 0.25 : 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(pin.sx, pin.sy);
      ctx.stroke();

      const hovered = hoverRef.current === pin.cellIndex;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(pin.sx, pin.sy, hovered ? 5.5 : front ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
      if (hovered) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = stage.paint.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // The settle condition, evaluated where the state actually lives: the idle
    // drift, a coast that has not decayed yet, or a ripple still travelling.
    // When all three are false the loop stops after this frame — nothing on the
    // React side could have known that, because all three are integrated here.
    return (
      (spinRef.current && !touchedRef.current) ||
      Math.abs(rot.vYaw) > 0.5 ||
      Math.abs(rot.vPitch) > 0.5 ||
      live.length > 0
    );
  }, []);

  const { canvasRef, invalidate } = useCanvasStage(render, false);

  /* --- Interaction -------------------------------------------------------- */

  const dragRef = useRef({ active: false, id: -1, x: 0, y: 0, moved: 0, lastAt: 0 });

  const poke = useCallback((canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const point = pointerOnStage(canvas, clientX, clientY);
    const radius = radiusRef.current;
    // The impact is unprojected onto the near face and then un-rotated into the
    // globe's own coordinates, so the wave is a mark on the BALL rather than a
    // mark on the screen.
    const hit = unprojectSphere(point.x / radius, point.y / radius, GLOBE_PERSP);
    if (!hit) return;
    const body = unrotateSphere(hit, rotRef.current.yaw, rotRef.current.pitch);
    const ripples = ripplesRef.current;
    ripples.push({ bx: body.x, by: body.y, bz: body.z, t0: performance.now() });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
    invalidate();
  }, [invalidate]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    touchedRef.current = true;
    dragRef.current = {
      active: true,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: 0,
      lastAt: performance.now(),
    };
    rotRef.current.vYaw = 0;
    rotRef.current.vPitch = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    poke(event.currentTarget, event.clientX, event.clientY);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.active && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const now = performance.now();
      const dt = Math.max(0.008, (now - drag.lastAt) / 1000);
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.lastAt = now;
      drag.moved += Math.abs(dx) + Math.abs(dy);

      const rot = rotRef.current;
      rot.yaw += dx * ROT_PER_PX;
      rot.pitch = clampPitch(rot.pitch - dy * ROT_PER_PX);
      // Carried so a release throws the globe rather than dropping it dead.
      rot.vYaw = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, (dx * ROT_PER_PX) / dt));
      rot.vPitch = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, (-dy * ROT_PER_PX) / dt));
      invalidate();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointerOnStage(canvas, event.clientX, event.clientY);
    let best = -1;
    let bestDepth = -Infinity;
    for (const pin of pinsRef.current) {
      if (pin.depth <= 0.02) continue;
      const dx = pin.sx - point.x;
      const dy = pin.sy - point.y;
      if (dx * dx + dy * dy > 144) continue;
      if (pin.depth > bestDepth) {
        bestDepth = pin.depth;
        best = pin.cellIndex;
      }
    }
    if (best !== hoverRef.current) {
      setHover(best);
      invalidate();
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.id !== event.pointerId) return;
    dragRef.current.active = false;
    setDragging(false);
    invalidate();
  };

  const hoveredCell = hover >= 0 ? frame.cells[hover] : null;
  const hoveredPin = hover >= 0 ? pins.find((pin) => pin.cellIndex === hover) : null;

  return (
    <ChartCard
      title={t('stats.globe.title', { defaultValue: 'The debt globe' })}
      hint={t('stats.globe.hint', {
        defaultValue:
          'The whole archive on one sphere: latitude is the category, longitude is time, and each spike stands off the surface by what that bucket is worth. Drag to spin it — and poke it, it ripples.',
      })}
      controls={
        <>
          <ChartToggle pressed={byCount} onPressedChange={setByCount}>
            {byCount
              ? t('stats.control.byCount', { defaultValue: 'By line count' })
              : t('stats.control.byValue', { defaultValue: 'By value' })}
          </ChartToggle>
          <ChartToggle
            pressed={spinning}
            onPressedChange={(next) => {
              setSpinning(next);
              // Turning the drift back on hands the globe back to the loop; it
              // stays off once somebody has taken hold, which is the same two
              // moods the navigation globe has.
              if (next) touchedRef.current = false;
              invalidate();
            }}
            title={t('stats.control.spin', { defaultValue: 'Auto-rotate' })}
          >
            <RotateCw className="size-3.5" aria-hidden />
            {t('stats.control.spin', { defaultValue: 'Auto-rotate' })}
          </ChartToggle>
        </>
      }
      footer={
        <p className="text-xs text-site-text-muted">
          {t('stats.globe.legend', {
            defaultValue:
              'Newest month faces you at rest; the archive runs backwards round the far side. Faint spikes are on the hemisphere you cannot see yet.',
          })}
        </p>
      }
    >
      <div className="kd-stage kd-stage--globe">
        <canvas
          ref={canvasRef}
          className={cn('kd-canvas', dragging && 'kd-canvas--dragging')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            setHover(-1);
            invalidate();
          }}
          role="img"
          aria-label={t('stats.globe.desc', {
            defaultValue:
              'A globe with the debt ledger plotted on it: categories by latitude, time by longitude, value by height. The same figures are in the table below.',
          })}
        />
        {hoveredCell && hoveredPin && (
          <Readout x={0.5} y={0.06}>
            <p className="mb-1 flex items-center gap-1.5 font-medium text-site-text">
              <Swatch seriesIndex={CATEGORY_ORDER.indexOf(hoveredCell.category)} />
              {categoryLabel(hoveredCell.category, t)} · {formatMonth(hoveredCell.startMs)}
            </p>
            <ReadoutRow
              label={t('stats.readout.worthNow', { defaultValue: 'Worth now' })}
              value={formatDebt(valueNow(hoveredCell, nowMs))}
            />
            <ReadoutRow
              label={t('stats.readout.faceValue', { defaultValue: 'Face value' })}
              value={formatCompactDebt(hoveredCell.principalCents)}
            />
            <ReadoutRow
              label={t('stats.readout.lines', { defaultValue: 'Lines' })}
              value={hoveredCell.count.toLocaleString('en-US')}
            />
          </Readout>
        )}
      </div>
    </ChartCard>
  );
}
