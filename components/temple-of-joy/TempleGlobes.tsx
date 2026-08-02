/**
 * The globe field — what used to be the temple.
 *
 * One to eight **liquid globes**, drawn as wireframe spheres suspended in glass,
 * with everything you own orbiting them as pins. Strike one and it ripples and
 * rocks; drag it and it spins and coasts; leave it alone and it drifts, because
 * a globe that stands perfectly still reads as a picture of a globe.
 *
 * It is the same material as the site's navigation globe
 * (`components/radial/LiquidGlobe.tsx`) and shares that component's physics
 * through `lib/fluid` — the ripple's Ricker wavelet, the wobble's under-damped
 * spring, the sphere unprojection — so a press here and a press there behave
 * identically. What is *not* shared is the gesture: this globe is a thing you
 * hit, not a menu you aim, so there is no reticle, no dwell and no magnetism.
 *
 * ## How it is built, and why
 *
 * - **One canvas for every globe.** Thirteen `border-radius: 50%` elements in a
 *   `preserve-3d` parent is the slow path for an antialiased ellipse under a 3D
 *   transform — measured at exactly half the frame rate on a throttled phone
 *   profile (see the note above `MERIDIANS` in `LiquidGlobe.tsx`). Eight of them
 *   would be eight times that. A canvas is one element and one raster.
 * - **Detail scales with size.** A satellite is a third of the hub's radius and
 *   gets a third of its rings at half the samples: at that size the difference
 *   is invisible and the cost is not.
 * - **The frame loop touches refs only.** Rotation, ripples and wobble never
 *   reach React. The one thing that does is the count of globes, which changes
 *   about seven times a run.
 * - **Nothing here writes to `<html>` and nothing tracks the cursor**
 *   (`docs/design-language.md` §5.1.1). A press is a discrete event; what moves
 *   afterwards moves on its own.
 */
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useDeviceAttitude } from '@/hooks/useDeviceAttitude';
import {
  RIPPLE,
  rippleFront,
  rippleWave,
  spring,
  springStep,
  unprojectSphere,
  unrotateSphere,
} from '@/lib/fluid';
import { fmtCount } from '@/lib/temple-of-joy/numbers';
import { SOURCE_MAP } from '@/lib/temple-of-joy/data/sources';
import { MAX_GLOBES } from '@/lib/temple-of-joy/data/globes';
import {
  MAX_PINS,
  MERIDIANS,
  PARALLELS,
  PERSP,
  hubRadius,
  kAt,
  layoutGlobes,
  placePins,
  tiltAngles,
} from '@/lib/temple-of-joy/orbit';
import type { SourceId } from '@/lib/temple-of-joy/types';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { Glyph } from './ui';

const DEG = Math.PI / 180;

/** Degrees of spin per pixel dragged. */
const ROT_PER_PX = 0.42;
/** How far a globe may be tilted, so the poles never come to the front. */
const PITCH_LIMIT = 58;
/** Total pointer travel (px) past which a release is a drag, not an offering. */
const DRAG_SLOP = 10;
/** How forgiving a press near a globe's edge is, as a multiple of its radius. */
const HIT_FORGIVENESS = 1.12;

/** Idle drift, deg/s. The hub is slowest; the satellites are livelier. */
const HUB_DRIFT = 5;
const SATELLITE_DRIFT = 13;
/** How fast the satellite ring itself turns, deg/s. */
const RING_DRIFT = 2.4;
/** What a drag's leftover spin decays by, per second, as an exponential rate. */
const SPIN_DECAY = 1.9;
/** Runaway flick guard, deg/s. */
const MAX_SPIN = 900;

/**
 * How fast the field turns while the globes are away at the lane.
 *
 * Not decoration: it is the only thing on screen that says *why* the sanctum
 * has stopped answering taps. A globe rolling down a lane is turning a great
 * deal faster than one hanging in a room, so it does.
 */
const BOWLING_SPIN = 210;

/** Concurrent ripples per globe. Older ones are evicted, so a mash is bounded. */
const MAX_RIPPLES = 3;
/** How brightly a wave's crest is drawn, before its own fade. */
const CREST_ALPHA = 0.5;
/** The crest's hairline, as a multiple of the cage's. */
const CREST_WIDTH = 1.7;
const CREST_SAMPLES = 48;
/** How faint the crest goes where it is travelling over the far side. */
const CREST_BACK = 0.28;

/** The rock a strike leaves behind. Loose and bouncy — a ball on a tether. */
const WOBBLE_SPRING = spring(0.78, 0.62);
/** Peak rock in degrees, for a strike at the very edge of a globe. */
const WOBBLE_DEG = 6;
/** Below this the rock is finished, in degrees and degrees/second. */
const WOBBLE_REST = 0.02;
/**
 * The kick that makes {@link WOBBLE_SPRING} peak at one degree — its damped
 * natural frequency. Derived from the spring rather than tuned by hand, so
 * re-tuning the bounce cannot silently change how hard a strike hits.
 */
const WOBBLE_KICK = (() => {
  const omega = Math.sqrt(WOBBLE_SPRING.stiffness / WOBBLE_SPRING.mass);
  const zeta =
    WOBBLE_SPRING.damping / (2 * Math.sqrt(WOBBLE_SPRING.stiffness * WOBBLE_SPRING.mass));
  return omega * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));
})();

/** How quickly the hub eases to its new size when the field gains a globe. */
const RESIZE_RATE = 6;

/* ── Tilt ──────────────────────────────────────────────────────────────────
   On a phone the globes also answer the phone itself: turn it and the field
   turns with you, as though the spheres were hanging in the room rather than
   printed on the screen. It is composed ON TOP of the drag and the drift
   rather than replacing them — a phone can only be turned so far before its
   screen is out of sight, so the tilt is a lean, and a thumb is still how you
   get all the way round.

   `useDeviceAttitude` owns the sensor, the consent (the site-wide "Tilt
   effects" switch) and the iOS permission gate; this only has to decide how
   much of it to apply. */

/** How far the field leans per degree of device rotation. */
const TILT_GAIN = 0.85;
/** Ceiling on the lean, in degrees, so the far side is never tilt-only. */
const TILT_YAW_LIMIT = 52;
const TILT_PITCH_LIMIT = 34;

/* ── The cage ──────────────────────────────────────────────────────────────
   Two levels of detail over ONE definition: the hub gets the full thirteen
   rings every liquid globe on this site is drawn from (`orbit.ts` §The cage —
   shared with the ball on the lane, which is this same object in three
   dimensions), and a satellite — a third the radius, where the extra rings
   resolve to a grey smudge — gets a third of them at half the samples. Same
   geometry, same projection, a fifth of the work. */
const MERIDIANS_FULL = MERIDIANS;
const PARALLELS_FULL = PARALLELS;
const MERIDIANS_LITE = [0, 60, 120];
const PARALLELS_LITE = [-35, 0, 35];
const SAMPLES_FULL = 72;
const SAMPLES_LITE = 36;

/**
 * cos/sin of every ring sample angle, built once at module load, at the finer
 * of the two resolutions. The coarse pass reads every other entry — all rings
 * are cut at the same angles, so one table serves both.
 */
const RING_COS = new Float64Array(SAMPLES_FULL + 1);
const RING_SIN = new Float64Array(SAMPLES_FULL + 1);
for (let s = 0; s <= SAMPLES_FULL; s++) {
  const theta = (s / SAMPLES_FULL) * Math.PI * 2;
  RING_COS[s] = Math.cos(theta);
  RING_SIN[s] = Math.sin(theta);
}

/**
 * Device-pixel ceiling for the canvas, matching the site's convention for
 * full-screen canvases (`docs/design-language.md` §12.1 rule 4): fill rate
 * scales with the SQUARE of the ratio, and a hairline wireframe gains nothing
 * visible from a 3× buffer that costs 2.25× the pixels of a 2× one.
 */
const MAX_DPR = 2;

/** One live ripple, in its globe's own (unrotated) coordinates. */
interface Ripple {
  bx: number;
  by: number;
  bz: number;
  /** `performance.now()` at the moment of impact. */
  t0: number;
}

/** Everything the frame loop knows about one globe. Persists across re-renders. */
interface GlobeMotion {
  yaw: number;
  pitch: number;
  /** Leftover spin from a drag, decaying. */
  vYaw: number;
  vPitch: number;
  wobble: { yaw: number; vYaw: number; pitch: number; vPitch: number } | null;
  ripples: Ripple[];
}

function createMotion(index: number): GlobeMotion {
  return {
    // Seeded per index so the field does not open with eight globes in
    // lockstep, which reads as one object drawn eight times.
    yaw: index * 47,
    pitch: -8 + index * 5,
    vYaw: 0,
    vPitch: 0,
    wobble: null,
    ripples: [],
  };
}

export interface TempleGlobesProps {
  /**
   * Handed the tilt control so the room can put the switch somewhere with space
   * for it. It used to live in the corner of the field, which on a 375px phone
   * is directly on top of the hub.
   */
  onTilt?: (attitude: ReturnType<typeof useDeviceAttitude>) => void;
  /**
   * A globe was struck at this point on the page. The sanctum turns it into joy
   * and a "+N" — this component only knows about spheres.
   */
  onStrike: (clientX: number, clientY: number) => void;
  /**
   * Things that ring the field rather than the room — the Sinners.
   *
   * They live in here rather than beside it because the stage is the only
   * SQUARE box in the sanctum, and a ring is laid out in percentages: placed on
   * the sanctum instead, the same percentage means a different distance
   * horizontally and vertically, and on a wide screen the ring becomes a very
   * flat ellipse around the wrong centre.
   */
  children?: React.ReactNode;
}

export function TempleGlobes({ onStrike, onTilt, children }: TempleGlobesProps) {
  const { t } = useTranslation('c-temple-of-joy');
  const reduced = useReducedMotion();

  const globeCount = useTempleValue((s) => Math.max(1, Math.min(MAX_GLOBES, s.globes)));
  const flourishOff = useTempleValue((s) => s.reducedFlourish);
  /** The globes are down at the lane, so there is nothing here to strike. */
  const away = useTempleValue((s) => s.bowl.remaining > 0);
  /**
   * The alley is open over the top of everything.
   *
   * The field stops drawing entirely while it is: this canvas is covered by a
   * full-screen modal, so every frame it strokes is invisible — and on the far
   * side of that modal is a rigid-body simulation and a WebGL scene competing
   * for the same budget. On a software renderer the contention was enough to
   * lose the lane's GL context outright.
   */
  const alleyOpen = useTempleValue((s) => s.showBowl);
  /** No ripple, no rock, no drift — but the globes still answer a press. */
  const calm = reduced || flourishOff;

  /**
   * Which sources are orbiting, as a packed string so the snapshot only
   * re-renders when the *set* changes — not when a count ticks up, which for
   * an Acolyte is several times a second.
   */
  const ownedKey = useTempleSnapshot((s) => {
    let key = '';
    for (const id of Object.keys(s.sources) as SourceId[]) {
      const n = s.sources[id] ?? 0;
      if (n > 0) key += `${id}:${n <= 9 ? n : Math.round(Math.log10(n) * 4)},`;
    }
    return key;
  }, 900);

  /** Live counts for the pin labels. Coarse — a label is not a readout. */
  const counts = useTempleSnapshot((s) => {
    let packed = '';
    for (const id of Object.keys(s.sources) as SourceId[]) {
      const n = s.sources[id] ?? 0;
      if (n > 0) packed += `${id}=${n},`;
    }
    return packed;
  }, 1500);

  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of counts.split(',')) {
      if (!entry) continue;
      const [id, n] = entry.split('=');
      if (id && n) map.set(id, Number(n));
    }
    return map;
  }, [counts]);

  /**
   * How big the field is, as one of four coarse bands.
   *
   * State rather than a ref because it decides how many pins the field carries,
   * which is a render. Banded rather than the raw pixel count because crossing
   * a band is the only thing that changes anything, and this is written from a
   * ResizeObserver — a rotation or a keyboard opening should not re-place the
   * whole congregation on every intermediate width.
   */
  const [fieldStep, setFieldStep] = useState(3);

  const pins = useMemo(() => {
    const owned: Partial<Record<SourceId, number>> = {};
    for (const entry of ownedKey.split(',')) {
      if (!entry) continue;
      const [id] = entry.split(':');
      if (id) owned[id as SourceId] = 1;
    }
    // A small field carries fewer: at 170px across, sixteen icons cover the
    // sphere entirely and none of them can be read.
    const cap = [5, 8, 12, MAX_PINS][fieldStep] ?? MAX_PINS;
    return placePins(owned, globeCount, cap);
  }, [ownedKey, globeCount, fieldStep]);

  /* ── Elements the frame loop owns ─────────────────────────────────────── */

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const glassRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const pinRefs = useRef<Array<HTMLLIElement | null>>([]);
  const labelRefs = useRef<Array<HTMLElement | null>>([]);
  const keyTargetRef = useRef<HTMLButtonElement | null>(null);

  /** The cage's ink, resolved once per resize — reading it is a style flush. */
  const paint = useRef({ minor: '', parallel: '', major: '', crest: '', width: 1 });
  /** Stage size in CSS px. Measured on resize, never inside the frame loop. */
  const sizeRef = useRef(320);

  /**
   * Per-globe motion, allocated once for the whole set rather than per render.
   * Buying a globe must not reset the spin of the seven already turning.
   */
  const motion = useRef<GlobeMotion[]>(
    Array.from({ length: MAX_GLOBES }, (_, i) => createMotion(i)),
  );
  /** Where the satellite ring has turned to, in degrees. */
  const ringPhase = useRef(0);
  /** The hub's drawn radius, easing toward `hubRadius(count)`. */
  const drawnHub = useRef(hubRadius(globeCount));
  /** Layout for this frame, reused rather than rebuilt — the loop must not allocate. */
  const places = useRef(layoutGlobes(globeCount, 0));

  const drag = useRef({ active: false, id: -1, globe: -1, x: 0, y: 0, moved: 0 });
  /** Set when a release has already been spent on a drag. */
  const spent = useRef(false);
  /**
   * The lean the phone is currently held at, in degrees. Written by the sensor
   * (off the React path entirely — it arrives at sensor rate) and added to the
   * hub's own rotation when it is drawn.
   */
  const tilt = useRef({ yaw: 0, pitch: 0 });

  const attitude = useDeviceAttitude({
    gain: TILT_GAIN,
    onRotate: (q) => {
      const { yaw, pitch } = tiltAngles(q);
      tilt.current.yaw = clamp(yaw, -TILT_YAW_LIMIT, TILT_YAW_LIMIT);
      tilt.current.pitch = clamp(pitch, -TILT_PITCH_LIMIT, TILT_PITCH_LIMIT);
    },
    // The sensor going away must not leave the field frozen mid-lean.
    onRest: () => {
      tilt.current.yaw = 0;
      tilt.current.pitch = 0;
    },
  });

  // Published upward so the room can render the switch. An effect rather than a
  // render-time call: `attitude` is a memo that only changes when the sensor's
  // state does, which is what a parent wants to re-render on.
  const onTiltRef = useRef(onTilt);
  onTiltRef.current = onTilt;
  useEffect(() => {
    onTiltRef.current?.(attitude);
  }, [attitude]);

  /** Read by the frame loop; mirrored into refs so it never re-runs the effect. */
  const countRef = useRef(globeCount);
  countRef.current = globeCount;
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const awayRef = useRef(away);
  awayRef.current = away;

  /* ── Measure ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const read = () => {
      // `offsetWidth`, not a rect: the stage scales during its entrance, and a
      // rect would report the mid-animation width and wedge every globe at
      // whatever radius that frame happened to have.
      const size = el.offsetWidth || 320;
      sizeRef.current = size;
      // Four coarse bands rather than the raw pixel count: crossing one is the
      // only thing that changes what the field carries, and this runs from a
      // ResizeObserver.
      setFieldStep(size < 190 ? 0 : size < 260 ? 1 : size < 340 ? 2 : 3);

      const canvas = canvasRef.current;
      if (!canvas) return;
      // Assigning `width` reallocates and clears the backing store, so it
      // happens HERE — on mount and on a real resize — and never in the loop.
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const px = Math.round(size * dpr);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;
      if (ctx) {
        // One transform for everything: device pixels out, origin at the middle
        // of the stage, which is what every place in `orbit.ts` is measured from.
        ctx.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
        ctx.lineJoin = 'round';
      }

      // Resolved once per size change rather than per frame: reading a computed
      // style is a style flush. These only change with the temple's theme, and
      // the theme change re-runs this through the observer below.
      const cs = getComputedStyle(canvas);
      const ink = cs.color || 'rgb(0 0 0)';
      const token = (name: string, alpha: number) => {
        const value = cs.getPropertyValue(name).trim();
        // The `--toj-cage-*` properties are registered `<color>`, so their
        // COMPUTED value is a real colour a canvas can take. On an engine that
        // does not implement `@property` it is the literal `color-mix(…)` text
        // instead, and assigning that to `strokeStyle` is a silent no-op — which
        // would leave the whole cage drawn in the default BLACK. So each is
        // checked, and the fallback is mixed here from the element's own ink.
        if (/^(rgb|rgba|#|color\()/i.test(value)) return value;
        return `color-mix(in srgb, ${ink} ${alpha * 100}%, transparent)`;
      };
      paint.current = {
        minor: token('--toj-cage-minor', 0.22),
        parallel: token('--toj-cage-parallel', 0.14),
        major: token('--toj-cage-major', 0.4),
        crest: token('--toj-cage-crest', CREST_ALPHA),
        width: parseFloat(cs.getPropertyValue('--toj-cage-width')) || 1,
      };
    };

    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    // The temple's palette flips with `data-theme` on an ancestor, and the cage
    // is painted from CSS custom properties that a flip changes. Without this
    // the wireframe keeps dawn's ink after dusk falls.
    const root = el.closest('.toj');
    const mo = root ? new MutationObserver(read) : null;
    mo?.observe(root!, { attributes: true, attributeFilter: ['data-theme', 'data-flourish'] });
    return () => {
      ro.disconnect();
      mo?.disconnect();
    };
  }, []);

  /* ── The frame loop ───────────────────────────────────────────────────── */

  useEffect(() => {
    // Nothing to draw behind a full-screen modal — see `alleyOpen`. Returning
    // before the loop is started (rather than skipping work inside it) is what
    // makes this a real stop: no frame is scheduled at all until the alley
    // closes and the effect re-runs.
    if (alleyOpen) return;

    /** Per-frame ripple state for the globe being drawn. Preallocated. */
    const waveWin = Array.from({ length: MAX_RIPPLES }, () => ({
      bx: 0,
      by: 0,
      bz: 0,
      /** Dot-product window in which this ripple can contribute anything. */
      dotLo: 1,
      dotHi: -1,
    }));
    /** Reused `RippleSource`; `rippleWave` destructures it and keeps no reference. */
    const waveSrc = { age: 0, distance: 0 };
    const waveAge = new Float64Array(MAX_RIPPLES);
    let waveCount = 0;

    /**
     * Snapshot one globe's live ripples for this frame: their axis, their age,
     * and the dot-product window their wavelet is non-zero over.
     *
     * The window is the reason a ripple is affordable. The wavelet is exactly
     * zero more than four packet widths from the crest, and a crest is a ~19°
     * band on a 180° surface, so the overwhelming majority of samples are
     * outside it — and `acos` is monotonically decreasing on [−1, 1], so
     * comparing the raw dot product against the window's ends is an EXACT test
     * for the same condition, taken before paying for the arc-cosine.
     */
    const primeWaves = (live: Ripple[], now: number) => {
      waveCount = 0;
      for (let i = 0; i < live.length && waveCount < MAX_RIPPLES; i++) {
        const r = live[i]!;
        const age = (now - r.t0) / 1000;
        if (!(age >= 0) || age >= RIPPLE.life) continue;
        const front = RIPPLE.speed * age;
        const lo = front - 4 * RIPPLE.width;
        const hi = front + 4 * RIPPLE.width;
        const w = waveWin[waveCount]!;
        w.bx = r.bx;
        w.by = r.by;
        w.bz = r.bz;
        // acos is DECREASING, so the near end of the band is the HIGH dot.
        w.dotHi = lo <= 0 ? 1 : Math.cos(lo);
        w.dotLo = hi >= Math.PI ? -1 : Math.cos(hi);
        waveAge[waveCount] = age;
        waveCount++;
      }
    };

    /**
     * How far the surface at body-space direction `(bx, by, bz)` is pushed out,
     * as a fraction of the radius. Zero — via an early return — whenever nothing
     * is rippling, so the feature costs one counter check per sample on every
     * frame nobody is touching anything.
     */
    const waveAt = (bx: number, by: number, bz: number) => {
      if (waveCount === 0) return 0;
      let sum = 0;
      for (let i = 0; i < waveCount; i++) {
        const w = waveWin[i]!;
        // Both vectors are unit, so the dot IS the cosine of the arc between
        // them — which is why the band test can be made before the arc-cosine.
        const dot = bx * w.bx + by * w.by + bz * w.bz;
        if (dot < w.dotLo || dot > w.dotHi) continue;
        waveSrc.age = waveAge[i]!;
        // Clamped: float error can push a dot a hair past ±1, and `acos` of
        // that is NaN, which would blank the whole canvas.
        waveSrc.distance = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
        sum += rippleWave(waveSrc);
      }
      return sum;
    };

    /**
     * Stroke one ring of one globe.
     *
     * Every ring here is a circle, so every one is `u·cosθ + v·sinθ` about a
     * centre offset `oy` along the polar axis — a meridian and a parallel differ
     * only in which plane `u` and `v` span. Taking the basis rather than a
     * `theta → point` callback keeps the sample loop free of both a closure call
     * and the three-element array such a callback has to return, which at these
     * counts is the per-frame allocation this loop is not allowed to do.
     *
     * Each sample is pushed out along its own normal by the ripple before it is
     * projected, which on a unit sphere is just scaling the direction. That is
     * what makes a wave look like it is IN the glass rather than drawn on it.
     */
    const ring = (
      ctx: CanvasRenderingContext2D,
      stroke: string,
      width: number,
      step: number,
      R: number,
      cx: number,
      cy: number,
      cyaw: number,
      syaw: number,
      cpit: number,
      spit: number,
      ux: number,
      uy: number,
      uz: number,
      vx: number,
      vy: number,
      vz: number,
      oy: number,
    ) => {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let s = 0; s <= SAMPLES_FULL; s += step) {
        const ct = RING_COS[s]!;
        const st = RING_SIN[s]!;
        const bx = ux * ct + vx * st;
        const by = uy * ct + vy * st + oy;
        const bz = uz * ct + vz * st;
        const swell = 1 + waveAt(bx, by, bz);
        const x1 = (bx * cyaw + bz * syaw) * swell;
        const z1 = (-bx * syaw + bz * cyaw) * swell;
        const by2 = by * swell;
        const y2 = by2 * cpit - z1 * spit;
        const z2 = by2 * spit + z1 * cpit;
        const k = kAt(z2);
        if (s === 0) ctx.moveTo(cx + x1 * R * k, cy + y2 * R * k);
        else ctx.lineTo(cx + x1 * R * k, cy + y2 * R * k);
      }
      ctx.stroke();
    };

    /** One globe: its cage, then the crest of anything travelling over it. */
    const drawGlobe = (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      R: number,
      yaw: number,
      pitch: number,
      detailed: boolean,
      live: Ripple[],
      now: number,
    ) => {
      const cyaw = Math.cos(yaw * DEG);
      const syaw = Math.sin(yaw * DEG);
      const cpit = Math.cos(pitch * DEG);
      const spit = Math.sin(pitch * DEG);
      const ink = paint.current;
      const meridians = detailed ? MERIDIANS_FULL : MERIDIANS_LITE;
      const parallels = detailed ? PARALLELS_FULL : PARALLELS_LITE;
      const step = detailed ? 1 : SAMPLES_FULL / SAMPLES_LITE;

      /**
       * How wide this ring's hairline is on screen.
       *
       * A CSS border is 1px in its ELEMENT's coordinates, so a ring turned away
       * from the viewer had its stroke foreshortened along with everything else
       * — a real depth cue that a constant screen-space hairline throws away.
       * `nz` is the ring plane's normal after rotation, so |nz| is 1 face-on and
       * 0 edge-on. The floor keeps an edge-on ring from thinning into nothing.
       */
      const widthFor = (nx: number, ny: number, nz: number) => {
        const z1 = -nx * syaw + nz * cyaw;
        const face = Math.abs(ny * spit + z1 * cpit);
        return ink.width * Math.max(0.42, (1 + face) / 2);
      };

      for (const a of meridians) {
        const ca = Math.cos(a * DEG);
        const sa = Math.sin(a * DEG);
        // A meridian spans (cos a, 0, −sin a) and (0, 1, 0); the plane normal is
        // the cross product of the two.
        ring(
          ctx,
          a === 0 ? ink.major : ink.minor,
          widthFor(sa, 0, ca),
          step,
          R,
          cx,
          cy,
          cyaw,
          syaw,
          cpit,
          spit,
          ca,
          0,
          -sa,
          0,
          1,
          0,
          0,
        );
      }
      // Every parallel lies flat, so they share the polar axis and therefore the
      // same stroke width — hoisted out of the loop.
      const parallelWidth = widthFor(0, 1, 0);
      for (const latitude of parallels) {
        const cl = Math.cos(latitude * DEG);
        const yl = -Math.sin(latitude * DEG);
        ring(
          ctx,
          latitude === 0 ? ink.major : ink.parallel,
          parallelWidth,
          step,
          R,
          cx,
          cy,
          cyaw,
          syaw,
          cpit,
          spit,
          cl,
          0,
          0,
          0,
          0,
          cl,
          yl,
        );
      }

      /* ── The crest ──────────────────────────────────────────────────────
         The swollen cage says something is passing through the glass; this is
         the light on it. The set of points a fixed arc distance from an impact
         is a circle ON the sphere, so it is generated the same way the rings
         are and goes through the same projection — which is why it stays glued
         to the bulge it is riding instead of sliding over it as an ellipse
         drawn in screen space. Front and back faces are separate paths, because
         a canvas path takes one alpha. */
      for (let i = 0; i < live.length; i++) {
        const rip = live[i]!;
        const age = (now - rip.t0) / 1000;
        const front = rippleFront(age);
        if (age < 0 || age >= RIPPLE.life || front < 0.06 || front > Math.PI - 0.06) continue;
        const fade = 1 - age / RIPPLE.life;

        // An orthonormal frame around the impact axis. The seed is whichever
        // cardinal the axis leans on LEAST, so the cross product can never be
        // taken against something near-parallel (which would collapse the frame
        // and send the circle through the middle of the globe).
        const ax = rip.bx;
        const ay = rip.by;
        const az = rip.bz;
        const seed = Math.abs(ax) < 0.9 ? [1, 0, 0] : Math.abs(ay) < 0.9 ? [0, 1, 0] : [0, 0, 1];
        let e1x = seed[1]! * az - seed[2]! * ay;
        let e1y = seed[2]! * ax - seed[0]! * az;
        let e1z = seed[0]! * ay - seed[1]! * ax;
        const e1n = Math.hypot(e1x, e1y, e1z) || 1;
        e1x /= e1n;
        e1y /= e1n;
        e1z /= e1n;
        const e2x = ay * e1z - az * e1y;
        const e2y = az * e1x - ax * e1z;
        const e2z = ax * e1y - ay * e1x;

        const cf = Math.cos(front);
        const sf = Math.sin(front);
        // The crest rides its own peak, so the light sits on the raised surface.
        const swell = 1 + rippleWave({ age, distance: front });

        for (const face of [0, 1] as const) {
          ctx.strokeStyle = ink.crest;
          ctx.globalAlpha = fade * fade * (face === 0 ? CREST_BACK : 1);
          ctx.lineWidth = ink.width * CREST_WIDTH;
          // Round caps, so where the crest crosses the limb and hands over to
          // the faint far-side pass it tapers out instead of being chopped off
          // square in the middle of the sphere.
          ctx.lineCap = 'round';
          ctx.beginPath();
          let drawing = false;
          for (let s = 0; s <= CREST_SAMPLES; s++) {
            const theta = (s / CREST_SAMPLES) * Math.PI * 2;
            const ct = Math.cos(theta);
            const st = Math.sin(theta);
            const bx = (ax * cf + (e1x * ct + e2x * st) * sf) * swell;
            const by = (ay * cf + (e1y * ct + e2y * st) * sf) * swell;
            const bz = (az * cf + (e1z * ct + e2z * st) * sf) * swell;
            const x1 = bx * cyaw + bz * syaw;
            const z1 = -bx * syaw + bz * cyaw;
            const y2 = by * cpit - z1 * spit;
            const z2 = by * spit + z1 * cpit;
            // Each pass draws only its own face, lifting the pen across the
            // stretches that belong to the other one.
            if (face === 0 ? z2 > 0 : z2 <= 0) {
              drawing = false;
              continue;
            }
            const k = kAt(z2);
            if (drawing) ctx.lineTo(cx + x1 * R * k, cy + y2 * R * k);
            else ctx.moveTo(cx + x1 * R * k, cy + y2 * R * k);
            drawing = true;
          }
          ctx.stroke();
        }
        // Hand the context back exactly as the cage expects to find it next
        // frame — canvas state is sticky, and the cage sets neither of these.
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
      }
    };

    let raf = 0;
    let last = 0;

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      const size = sizeRef.current;
      const count = countRef.current;
      const quiet = calmRef.current;
      const rolling = awayRef.current;
      // How big everything standing ON the field is drawn, relative to the
      // 320px the pin's rem sizes were chosen at. Floored so a tiny field's
      // icons stay legible and capped so a large one's do not bloat.
      const fieldScale = clamp(size / 320, 0.62, 1.12);

      /* 1. The field. The hub eases to its new size when a globe is bought, so
            the purchase reads as the sanctum making room rather than as a
            jump-cut. The ring turns on its own; that is the "orbiting". */
      const target = hubRadius(count);
      drawnHub.current +=
        (target - drawnHub.current) * (quiet ? 1 : 1 - Math.exp(-RESIZE_RATE * dt));
      if (!quiet) ringPhase.current = (ringPhase.current + RING_DRIFT * dt) % 360;
      places.current = layoutGlobes(count, ringPhase.current);
      const hub = places.current[0];
      if (hub) hub.r = drawnHub.current;

      /* 2. Each globe's own motion. */
      for (let i = 0; i < count; i++) {
        const m = motion.current[i]!;

        // Ripples that have run their course, retired in place — `.filter`
        // would allocate on every frame of every wave.
        if (m.ripples.length > 0) {
          let kept = 0;
          for (let r = 0; r < m.ripples.length; r++) {
            const rip = m.ripples[r]!;
            if ((now - rip.t0) / 1000 < RIPPLE.life) m.ripples[kept++] = rip;
          }
          m.ripples.length = kept;
        }

        // The rock a strike left behind: an under-damped spring returning to
        // zero. It retires itself, so a globe at rest is back to drifting.
        const wob = m.wobble;
        if (wob) {
          const y = springStep({ value: wob.yaw, velocity: wob.vYaw }, 0, WOBBLE_SPRING, dt);
          const p = springStep({ value: wob.pitch, velocity: wob.vPitch }, 0, WOBBLE_SPRING, dt);
          wob.yaw = y.value;
          wob.vYaw = y.velocity;
          wob.pitch = p.value;
          wob.vPitch = p.velocity;
          if (
            Math.abs(y.value) < WOBBLE_REST &&
            Math.abs(p.value) < WOBBLE_REST &&
            Math.abs(y.velocity) < WOBBLE_REST &&
            Math.abs(p.velocity) < WOBBLE_REST
          ) {
            m.wobble = null;
          }
        }

        const held = drag.current.active && drag.current.globe === i;
        if (!held) {
          // A released drag coasts and dies away; underneath it, the idle drift
          // never stops, so a globe nobody has touched still reads as alive.
          const decay = Math.exp(-SPIN_DECAY * dt);
          m.vYaw *= decay;
          m.vPitch *= decay;
          if (Math.abs(m.vYaw) < 0.5) m.vYaw = 0;
          if (Math.abs(m.vPitch) < 0.5) m.vPitch = 0;
          const drift = rolling ? BOWLING_SPIN : quiet ? 0 : i === 0 ? HUB_DRIFT : SATELLITE_DRIFT;
          m.yaw += (m.vYaw + drift) * dt;
          m.pitch += m.vPitch * dt;
          // Tilt settles back toward level on its own. Without it a few upward
          // flicks leave a globe permanently looking at its own north pole.
          m.pitch += (0 - m.pitch) * (1 - Math.exp(-0.9 * dt));
        }
        if (m.pitch > PITCH_LIMIT) m.pitch = PITCH_LIMIT;
        if (m.pitch < -PITCH_LIMIT) m.pitch = -PITCH_LIMIT;
      }

      /* 3. Draw. One clear, then every globe back-to-front — which for a field
            laid out on a flat ring is simply the order they are listed in. */
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.clearRect(-size / 2, -size / 2, size, size);
        for (let i = 0; i < count; i++) {
          const place = places.current[i];
          const m = motion.current[i];
          if (!place || !m) continue;
          primeWaves(m.ripples, now);
          const wob = m.wobble;
          // The lean applies to the hub in full and to the satellites at a
          // fraction, so tilting the phone reads as parallax through a field
          // rather than as one flat sheet being rotated.
          const lean = i === 0 ? 1 : 0.55;
          drawGlobe(
            ctx,
            place.cx * size,
            place.cy * size,
            place.r * size,
            m.yaw + (wob ? wob.yaw : 0) + tilt.current.yaw * lean,
            m.pitch + (wob ? wob.pitch : 0) + tilt.current.pitch * lean,
            place.detailed,
            m.ripples,
            now,
          );
        }
      }

      /* 4. The glass discs, which are DOM. Transform only — they composite, and
            a `width`/`height` write per frame would be a layout per frame. */
      for (let i = 0; i < MAX_GLOBES; i++) {
        const el = glassRefs.current[i];
        if (!el) continue;
        const place = i < count ? places.current[i] : undefined;
        if (!place) {
          if (el.style.display !== 'none') el.style.display = 'none';
          continue;
        }
        if (el.style.display === 'none') el.style.display = '';
        el.style.transform =
          `translate3d(${(place.cx * size).toFixed(2)}px, ${(place.cy * size).toFixed(2)}px, 0)` +
          ` scale(${(place.r * 2).toFixed(4)})`;
      }

      /* 5. The pins. A pin is an object standing ON a surface, so a wave passing
            under it lifts it — sampled at the pin's OWN direction, so it bobs
            when the wave reaches the pin rather than when the wave reaches the
            screen position the pin is projected to. */
      for (let i = 0; i < pins.length; i++) {
        const el = pinRefs.current[i];
        const pin = pins[i];
        if (!el || !pin) continue;
        const place = places.current[pin.globe];
        const m = motion.current[pin.globe];
        if (!place || !m) continue;

        primeWaves(m.ripples, now);
        const wob = m.wobble;
        // The same lean the cage was drawn with — a pin is standing ON that
        // surface, and the two must not be projected from different rotations.
        const lean = pin.globe === 0 ? 1 : 0.55;
        const yaw = m.yaw + (wob ? wob.yaw : 0) + tilt.current.yaw * lean;
        const pitch = m.pitch + (wob ? wob.pitch : 0) + tilt.current.pitch * lean;
        const cyaw = Math.cos(yaw * DEG);
        const syaw = Math.sin(yaw * DEG);
        const cpit = Math.cos(pitch * DEG);
        const spit = Math.sin(pitch * DEG);

        const swell = 1 + waveAt(pin.bx, pin.by, pin.bz);
        const x1 = pin.bx * cyaw + pin.bz * syaw;
        const z1 = -pin.bx * syaw + pin.bz * cyaw;
        const y2 = pin.by * cpit - z1 * spit;
        const z2 = pin.by * spit + z1 * cpit;
        const k = kAt(z2);
        const R = place.r * size;

        const x = place.cx * size + x1 * R * k * swell;
        const y = place.cy * size + y2 * R * k * swell;
        // Scaled by how big its globe is, by depth, AND by how big the field
        // itself is: a pin drawn at its desktop size on a phone-sized sphere is
        // a third of that sphere's width, and a dozen of them hide it entirely.
        const scale = k * (0.55 + 1.1 * place.r) * fieldScale;
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
        // The far hemisphere stays faintly visible — it is what says there is
        // more globe to turn to — but it never takes a pointer (nothing here
        // does) and it never carries a label.
        el.style.opacity = (0.1 + 0.9 * clamp01((z2 + 0.5) / 0.95)).toFixed(3);
        el.style.zIndex = String(200 + Math.round(z2 * 100));
        // Labels resolve only for the pins actually facing you, so sixteen names
        // never pile up in the middle of the field. Written on the LABEL rather
        // than the wrapper: custom properties inherit, so setting one on the
        // wrapper would invalidate the computed style of its whole subtree.
        labelRefs.current[i]?.style.setProperty(
          '--near',
          place.detailed ? clamp01((z2 - 0.34) / 0.44).toFixed(2) : '0',
        );
      }

      /* 6. The keyboard target tracks the hub, so the focus ring lands on the
            thing Enter actually strikes. Only touched when the size changed. */
      const key = keyTargetRef.current;
      const hubPlace = places.current[0];
      if (key && hubPlace) {
        const d = `${(hubPlace.r * 2 * size).toFixed(1)}px`;
        if (key.style.width !== d) {
          key.style.width = d;
          key.style.height = d;
        }
      }
    };

    raf = requestAnimationFrame(step);
    // Bounded by MOUNT: the temple renders this only while the game is open and
    // this cancels on unmount, so a page at rest has no loop at all. It is also
    // bounded by the alley, which stops it without unmounting anything.
    return () => cancelAnimationFrame(raf);
  }, [pins, alleyOpen]);

  /* ── Gesture ──────────────────────────────────────────────────────────── */

  /**
   * Which globe is under a page point, and where on it.
   *
   * Returns the globe's index and the point on its UNIT sphere, or `null` for a
   * press that landed in the gaps between spheres. Tested nearest-first so a
   * press in the sliver where a satellite overlaps the hub goes to whichever
   * one it is actually closer to the middle of.
   */
  const hitTest = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const size = rect.width;
    if (size <= 0) return null;
    const x = clientX - rect.left - size / 2;
    const y = clientY - rect.top - size / 2;

    let best: { globe: number; sx: number; sy: number; d: number } | null = null;
    for (let i = 0; i < countRef.current; i++) {
      const place = places.current[i];
      if (!place) continue;
      const R = place.r * size;
      if (R <= 0) continue;
      const dx = x - place.cx * size;
      const dy = y - place.cy * size;
      const d = Math.hypot(dx, dy) / R;
      if (d > HIT_FORGIVENESS) continue;
      if (!best || d < best.d) best = { globe: i, sx: dx / R, sy: dy / R, d };
    }
    return best;
  }, []);

  /**
   * Strike the glass: a wave out from the point, and a rock away from it.
   *
   * Runs on pointer-DOWN, not on click — this is the impact, and an impact that
   * waited for the release would arrive after the thing it is a response to.
   *
   * The shove is the standard off-centre-strike model. A poke is a force
   * straight into the screen, so the torque is `r × F` with F = (0, 0, −1):
   * −hy about x and +hx about y, and exactly zero about z. So a strike at dead
   * centre pushes through the middle and rocks nothing, one at the limb is all
   * leverage, and there is no roll — which is just as well, since a globe drawn
   * this way has no roll axis. The lever arm is read off the point on the UNIT
   * SPHERE rather than the screen position, which differ by the perspective
   * foreshortening: using the screen point would have a strike near the middle
   * hit almost a fifth harder than the geometry says.
   */
  const strike = useCallback((globe: number, sx: number, sy: number) => {
    const m = motion.current[globe];
    if (!m || calmRef.current) return;
    const hit = unprojectSphere(sx, sy, PERSP);
    if (!hit) return;

    // Added to whatever rock is already running rather than replacing it, so
    // a second strike mid-wobble builds on the first — or cancels it, if it
    // lands opposite — instead of restarting the spring from a standstill.
    const w = (m.wobble ??= { yaw: 0, vYaw: 0, pitch: 0, vPitch: 0 });
    w.vYaw -= hit.x * WOBBLE_DEG * WOBBLE_KICK;
    w.vPitch += hit.y * WOBBLE_DEG * WOBBLE_KICK;

    // Un-rotate the impact into the globe's own frame — the exact inverse of
    // the yaw-then-pitch the renderer applies. This is what makes the ripple a
    // mark on the BALL: every sample the renderer takes lives in this space,
    // so the wave turns with the surface instead of hanging in front of it.
    const body = unrotateSphere(hit, m.yaw, m.pitch);
    const live = m.ripples;
    if (live.length >= MAX_RIPPLES) live.splice(0, live.length - MAX_RIPPLES + 1);
    live.push({ bx: body.x, by: body.y, bz: body.z, t0: performance.now() });
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Only primary presses: a right-click or a stylus barrel button is not an
      // offering, and it should not grab the globe either.
      if (event.button > 0 || awayRef.current) return;
      const hit = hitTest(event.clientX, event.clientY);
      if (!hit) return;
      strike(hit.globe, hit.sx, hit.sy);
      drag.current = {
        active: true,
        id: event.pointerId,
        globe: hit.globe,
        x: event.clientX,
        y: event.clientY,
        moved: 0,
      };
      spent.current = false;
      const m = motion.current[hit.globe];
      if (m) {
        m.vYaw = 0;
        m.vPitch = 0;
      }
    },
    [hitTest, strike],
  );

  useEffect(() => {
    /**
     * Move/up ride WINDOW listeners rather than pointer capture: capture would
     * retarget the release away from the element the press started on, and the
     * release is what decides between "you spun it" and "you struck it".
     */
    const onMove = (event: PointerEvent) => {
      const d = drag.current;
      if (!d.active || event.pointerId !== d.id) return;
      const dx = event.clientX - d.x;
      const dy = event.clientY - d.y;
      d.x = event.clientX;
      d.y = event.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.moved > DRAG_SLOP) spent.current = true;

      const m = motion.current[d.globe];
      if (!m) return;
      m.yaw += dx * ROT_PER_PX;
      m.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, m.pitch - dy * ROT_PER_PX));
      // The leftover spin a release coasts on. Read from the frame's own delta
      // rather than a velocity tracker: this globe is decoration, and the
      // difference between a windowed velocity and the last delta is not
      // visible on something that has no target to land on.
      m.vYaw = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, dx * ROT_PER_PX * 60));
      m.vPitch = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, -dy * ROT_PER_PX * 60));
    };

    const finish = (event: PointerEvent, commit: boolean) => {
      const d = drag.current;
      if (!d.active || event.pointerId !== d.id) return;
      d.active = false;
      // A release that has not travelled is an offering. Anything that has is a
      // spin, and it leaves the globe where you put it and nothing more.
      if (commit && !spent.current && !awayRef.current) {
        onStrike(event.clientX, event.clientY);
      }
      spent.current = false;
    };

    const onUp = (event: PointerEvent) => finish(event, true);
    const onCancel = (event: PointerEvent) => finish(event, false);
    /**
     * A press has to be able to end without its own release: a pointer pressed
     * here and released over another window, an OS gesture or an alt-tab all
     * leave the button up in the world and DOWN in `drag.current`, which would
     * leave the next press unable to start a fresh gesture.
     */
    const onBlur = () => {
      drag.current.active = false;
      spent.current = false;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    };
  }, [onStrike]);

  /**
   * The keyboard path: Enter and Space strike the hub, the arrow keys turn it.
   *
   * Turning it does nothing for the score, and that is the point — the sighted
   * player gets to shove the globe around because it is satisfying, and this is
   * the same affordance rather than a description of one.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (awayRef.current) return;
      const m = motion.current[0];
      if (!m) return;
      const nudge = event.shiftKey ? 24 : 8;
      switch (event.key) {
        case 'ArrowLeft':
          m.vYaw = -260;
          break;
        case 'ArrowRight':
          m.vYaw = 260;
          break;
        case 'ArrowUp':
          m.pitch = Math.max(-PITCH_LIMIT, m.pitch - nudge);
          break;
        case 'ArrowDown':
          m.pitch = Math.min(PITCH_LIMIT, m.pitch + nudge);
          break;
        case 'Enter':
        case ' ': {
          event.preventDefault();
          const stage = stageRef.current;
          if (!stage) return;
          const rect = stage.getBoundingClientRect();
          // Struck a third of the way up from the middle, so a keyboard strike
          // rocks the globe as a pointer one does instead of pushing straight
          // through its centre and producing no motion at all.
          strike(0, 0, -0.35);
          onStrike(rect.left + rect.width / 2, rect.top + rect.height * 0.42);
          return;
        }
        default:
          return;
      }
      event.preventDefault();
    },
    [onStrike, strike],
  );

  const label = away
    ? t('globes-away', {
        defaultValue: 'The globes are at the lane. There is nothing to strike until the hour ends.',
      })
    : t('globes-strike', {
        defaultValue: 'Strike a globe to offer joy. Drag to spin it; arrow keys turn it.',
      });

  return (
    <div
      ref={stageRef}
      className="toj-globes"
      data-away={away ? 'true' : undefined}
      data-globes={globeCount}
      onPointerDown={onPointerDown}
      style={{ '--toj-persp': PERSP } as CSSProperties}
    >
      <canvas ref={canvasRef} className="toj-globes-cage" aria-hidden />

      {/* The glass bodies. One per globe, flat discs of shading over the cage,
          so a wireframe reads as structure suspended INSIDE a liquid ball
          rather than as a drawing on top of one. Positioned by the frame loop;
          the ones past the current count are simply hidden, so buying a globe
          never has to mint a DOM node mid-gesture. */}
      {Array.from({ length: MAX_GLOBES }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            glassRefs.current[i] = el;
          }}
          className="toj-globe-glass"
          data-hub={i === 0 ? 'true' : undefined}
          aria-hidden
        />
      ))}

      {/* The congregation. Decorative here on purpose: every one of these is a
          row in the Sources panel with a name, a price and a button, so a
          screen reader that walked the field too would be reading the shop
          twice. The summary below carries what the field itself says. */}
      <ul className="toj-orbit" aria-hidden>
        {pins.map((pin, i) => {
          const def = SOURCE_MAP[pin.id];
          const owned = countMap.get(pin.id) ?? 0;
          return (
            <li
              key={pin.id}
              className="toj-pin-wrap"
              ref={(el) => {
                pinRefs.current[i] = el;
              }}
            >
              <span className="toj-pin">
                <span className="toj-pin-dot">
                  <Glyph>{def?.icon ?? '✨'}</Glyph>
                </span>
                <span
                  className="toj-pin-name"
                  ref={(el) => {
                    labelRefs.current[i] = el;
                  }}
                >
                  {def?.name} <b>{fmtCount(owned)}</b>
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/*
        The hub, as a control.

        `pointer-events: none` in the stylesheet, so every pointer gesture goes
        to the stage's own handler above and exactly one thing owns the press —
        while this stays tabbable and Enter-activatable, which is what a
        keyboard player needs. Sized to the hub by the frame loop so the focus
        ring lands on the sphere rather than around the whole field.
      */}
      <button
        ref={keyTargetRef}
        type="button"
        className="toj-globe-key"
        disabled={away}
        aria-label={label}
        onKeyDown={onKeyDown}
      />

      {children}

      <p className="toj-sr" aria-live="polite">
        {away
          ? label
          : t('globes-summary', {
              globes: globeCount,
              sources: pins.length,
              defaultValue: '{{sources}} sources orbiting {{globes}} of 8 globes.',
            })}
      </p>
    </div>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
