'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type Ref,
  type RefObject,
} from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { vibrate } from '@/lib/shared/platform';
import {
  DECELERATION,
  VelocityTracker,
  gestureConfidence,
  projectDistance,
  rubberBandClamp,
  smoothstep,
  spring,
  springStep,
} from '@/lib/fluid';
import type { NavLeaf } from '@/lib/sidebar-nav';

/**
 * The **liquid globe** navigator — the site's navigation as a glass sphere you
 * turn to find where you want to go.
 *
 * Every destination is a pin on a unit sphere. Drag (pointer or finger) anywhere
 * on the stage to spin it; release and it coasts. Bring a pin into the **reticle**
 * at the front of the globe and it locks on; hold — keep the pointer down — and
 * the reticle's ring **fills**. Let go once it is full and you land on that page.
 * Let go early, or drag the pin back out, and the ring drains and nothing happens,
 * so the gesture is always cancellable right up to the release.
 *
 * ## Why it is built this way
 *
 * - **One rAF loop, bounded by mount.** The hub only renders this component while
 *   the menu is up (`RadialHub` gates it on the phase), so the loop cannot outlive
 *   the overlay; it is cancelled on unmount. Per frame it does ~12 pins of trig and
 *   writes `transform`/`opacity`/one custom property per pin — compositor-only
 *   properties, no layout reads, and the writes are skipped entirely on a frame
 *   where nothing changed.
 * - **Nothing above a `backdrop-filter`.** This is the thing that moves, and it
 *   moves continuously, so the overlay under it must not be a viewport-sized
 *   backdrop-filter (Chromium re-blurs such a layer *in full* whenever anything
 *   above it moves — measured at ~10fps in this exact stack; see
 *   `components/radial/README.md`). `.radial-hub__veil` is a plain painted veil
 *   for exactly this reason. Do not "restore the frost".
 * - **The pins are real links.** They carry their own href, so click, middle-click,
 *   Enter and screen-reader navigation all work without the gesture. Focusing one
 *   with the keyboard *glides* the globe until that pin faces front, which keeps
 *   the visual and the focus ring telling the same story.
 */

const DEG = Math.PI / 180;

/** Degrees of rotation per pixel dragged. A full turn is ~800px of travel. */
const ROT_PER_PX = 0.45;
/** How far the globe may be tilted, so the poles never come to the reticle. */
const PITCH_LIMIT = 62;
/**
 * Rubber-band scale for tilt past `PITCH_LIMIT`, in degrees. Pulling past the
 * limit keeps moving the globe, asymptotically — it resists instead of hitting a
 * wall, which is what tells you there is nothing further up there without the
 * surface going dead under your finger (`lib/fluid` §rubberBand).
 */
const PITCH_RUBBER = 24;
/**
 * The spring that carries every settle: the release throw, the magnet, and the
 * keyboard glide. Duration + bounce rather than stiffness, so it reads the same
 * whether it is closing a 3° gap or a 300° flick (`lib/fluid` §spring).
 */
const SETTLE_SPRING = spring(0.62, 0.1);
/** Idle drift (deg/s) — only until the visitor first takes hold. */
const IDLE_SPIN = 5.5;
/* ── Dwell: how long you have to hold ───────────────────────────────────────
   Not a constant. The gesture that chose a destination is itself evidence about
   how sure you were, and the site already measures it — so somebody who flicks
   straight to a place confirms quickly, and somebody creeping around the sphere
   still gets the full, unhurried hold. (`lib/fluid` §gestureConfidence; the same
   "accelerate decisions" idea as the sheet's flick-to-dismiss.)

   The floor is a floor, not zero: a confirmation you cannot abandon is not a
   confirmation. At 260ms the ring is still visibly filling and letting go early
   still cancels — you just aren't made to wait out a deliberation you have
   already finished. */
/** Hold required after an exploratory, low-speed approach. */
const DWELL_MS = 620;
/** Hold required after a decisive flick. Never goes below this. */
const DWELL_MIN_MS = 260;
/** Angular speed (deg/s) at or under which an approach reads as browsing. */
const BROWSING_SPEED = 150;
/** Angular speed (deg/s) at or over which it reads as certainty. */
const DECISIVE_SPEED = 620;
/** The ring drains faster than it fills, so a mis-lock costs nothing. */
const DRAIN_SCALE = 0.42;
/** Total pointer travel (px) past which a release is a drag, not a click. */
const DRAG_SLOP = 8;
/** Runaway flick guard, in deg/s. */
const MAX_SPIN = 900;

/**
 * Perspective, as a multiple of the stage's width. The projection below and the
 * CSS `perspective` on the stage read the SAME number (the component hands it to
 * CSS inline), because the wireframe sphere is drawn by CSS 3D while the pins are
 * projected here — if the two disagreed, the pins would slide off the surface
 * they are supposed to be stuck to.
 */
const PERSP = 3.1;
/** Foreshortening at depth `z` on the unit sphere (z = 1 front, −1 back). */
const kAt = (z: number) => PERSP / (PERSP - z * 0.5);

/**
 * Reticle radius, as a planar distance on the unit sphere. Every pin sits ON the
 * sphere, so a planar distance of `d` from the centre means the pin is `asin(d)`
 * off the viewing axis — 0.26 is a ~15° cone. The Fibonacci placement below keeps
 * neighbours ~50° apart at the counts this nav runs at, so at most one pin can be
 * inside the reticle at a time and the lock is never ambiguous.
 */
const RETICLE = 0.26;
/**
 * Magnetism: a pin this close is eased to dead centre once the spin settles.
 * 0.55 is a ~33° capture cone, which at this nav's size leaves very few
 * orientations with nothing in reach — so a release almost always parks on
 * something you can hold, instead of on empty ocean.
 */
const SNAP_R = 0.55;
/** The reticle's on-screen diameter, in % of the stage — derived, never re-typed. */
const RETICLE_PCT = RETICLE * kAt(1) * 100;

/**
 * Latitude band the pins are distributed over, as `sin(lat)`. Capping it at 0.72
 * (±46°) keeps every destination clear of the poles: a pin at a pole can only be
 * centred by tilting the globe past `PITCH_LIMIT`, i.e. it could never be chosen.
 */
const LAT_SPAN = 0.72;
/** Golden angle — the classic even-ish spherical distribution. */
const GOLDEN_DEG = 180 * (3 - Math.sqrt(5));

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);
/** The nearest angle equivalent to `to`, measured from `from` — no long way round. */
const shortestAngle = (from: number, to: number) =>
  from + ((((to - from) % 360) + 540) % 360) - 180;

interface GlobeNode extends NavLeaf {
  /** Where the pin is fixed on the sphere. */
  lat: number;
  lon: number;
  /** Direction cosines, precomputed — the projection runs these every frame. */
  bx: number;
  by: number;
  bz: number;
}

/**
 * Fibonacci-sphere placement, squeezed into the usable latitude band. Deterministic
 * from the destination list, so the same account always finds the same face of the
 * globe in the same place — this is navigation, and muscle memory is the point.
 */
function place(items: NavLeaf[]): GlobeNode[] {
  const n = items.length;
  return items.map((item, i) => {
    const sinLat = n <= 1 ? 0 : (1 - (2 * (i + 0.5)) / n) * LAT_SPAN;
    const lat = Math.asin(sinLat) / DEG;
    const lon = ((i * GOLDEN_DEG) % 360) - 180;
    const cl = Math.cos(lat * DEG);
    return {
      ...item,
      lat,
      lon,
      // Screen-handed: x right, y DOWN, z toward the viewer — the same axes CSS
      // 3D uses, so the projection and the wireframe's transform agree.
      bx: cl * Math.sin(lon * DEG),
      by: -Math.sin(lat * DEG),
      bz: cl * Math.cos(lon * DEG),
    };
  });
}

/** Meridians and parallels of the drawn wireframe (degrees). */
const MERIDIANS = [0, 30, 60, 90, 120, 150];
const PARALLELS = [-60, -40, -20, 0, 20, 40, 60];

interface LiquidGlobeProps {
  /** Destinations, already filtered for auth/admin by the hub. */
  items: NavLeaf[];
  /** Current route, so the globe can open oriented near where you already are. */
  pathname: string;
  /** Dismiss the hub (called before every navigation this component performs). */
  onDismiss: () => void;
  /** −1 while the hub is closing, so nothing here is tabbable behind the fade. */
  tabIndex: number;
  /**
   * The hub moves focus here once the globe has bloomed. It lands on the ROOT
   * (`tabIndex={-1}`), not on the first pin: focusing a pin glides the globe to
   * face it, which would throw away the "you are here" orientation the moment the
   * menu opened.
   */
  rootRef?: Ref<HTMLDivElement>;
  /**
   * The element whose whole area turns the globe — in practice the hub's
   * overlay, i.e. the entire screen the menu covers. Everything on it that is
   * not a control is a drag surface; see the listener that consumes this.
   */
  surfaceRef?: RefObject<HTMLElement | null>;
}

export function LiquidGlobe({
  items,
  pathname,
  onDismiss,
  tabIndex,
  rootRef,
  surfaceRef,
}: LiquidGlobeProps) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const nodes = useMemo(() => place(items), [items]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const sphereRef = useRef<HTMLDivElement | null>(null);
  const reticleRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef<Array<HTMLLIElement | null>>([]);

  // Everything the frame loop touches lives in refs: a 60Hz React render for a
  // rotation nobody reads in JSX would be the whole cost of this component.
  const rot = useRef({ yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 });
  const drag = useRef({ active: false, id: -1, x: 0, y: 0, moved: 0, held: false });
  const lastMoveAt = useRef(0);
  /**
   * Where the globe is springing to, or null while it is under the finger / idle.
   * One mechanism serves the release throw, the magnet and the keyboard glide, so
   * all three are interruptible by the next touch in exactly the same way.
   */
  const settle = useRef<{ yaw: number; pitch: number } | null>(null);
  /**
   * Un-rubber-banded tilt. The globe DRAWS a damped version of this past the
   * limit, but the gesture has to keep accumulating the real value or dragging
   * back from an over-tilt would feel dead until it caught up.
   */
  const rawPitch = useRef(0);
  /**
   * Windowed velocity, not last-frame delta. A finger that pauses for 80ms before
   * lifting has a last-frame velocity of zero, and every deliberate re-aim would
   * otherwise land as a dead release (`lib/fluid` §VelocityTracker).
   */
  const yawV = useRef(new VelocityTracker());
  const pitchV = useRef(new VelocityTracker());
  /**
   * Fastest the globe has been moving since the last lock was established — the
   * evidence the dwell length is read from. Peak rather than instantaneous,
   * because the speed *at* the moment a pin enters the reticle is arbitrary (the
   * settle spring is decelerating into its target by then); what characterises
   * the approach is how hard it was thrown.
   *
   * Resetting it at each lock is what keeps it honest over a messy gesture: a
   * flick that overshoots past several pins establishes and clears a lock at each
   * one, so by the time you creep back to the one you wanted, the peak only
   * describes that last careful correction — and you get the full dwell, which is
   * the right answer for a correction.
   */
  const peakSpeed = useRef(0);
  /** Dwell for the CURRENT lock, frozen when it was established. */
  const dwellRef = useRef(DWELL_MS);
  const fill = useRef(0);
  const lockRef = useRef(-1);
  const readyRef = useRef(false);
  const sizeRef = useRef(320);
  const dirty = useRef(true);
  /**
   * Whether the visitor has taken hold of the globe yet (a press, or a keyboard
   * focus). It switches the loop between its two moods, and they are mutually
   * exclusive on purpose: UNTOUCHED it drifts and never snaps, so an idle globe
   * keeps turning and reads as alive; TOUCHED it snaps and never drifts, so once
   * you are aiming, nothing moves the target out from under you. Letting both run
   * gave the worst of each — the globe drifted until the magnetism caught the
   * first pin it passed, then parked there for good.
   */
  const touched = useRef(false);
  /** Set when a release has already been spent (on a drag, or on a dwell jump). */
  const swallowClick = useRef(false);

  // Only these three reach the render: the caption, the ring's state classes.
  const [lock, setLock] = useState(-1);
  const [ready, setReady] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  /**
   * Open oriented on the page you are already on, held clear of the reticle: the
   * offset is wide enough that the current page is outside the SNAP cone
   * (`asin(SNAP_R)` ≈ 27°), so "you are here" is legible without the magnetism
   * immediately dragging it in — which would arm a hold to re-open the page the
   * visitor is already looking at.
   */
  useEffect(() => {
    const here = nodes.findIndex((n) =>
      n.href === '/' ? pathname === '/' : pathname === n.href || pathname.startsWith(`${n.href}/`),
    );
    const n = here >= 0 ? nodes[here] : null;
    rot.current.yaw = n ? -n.lon + 42 : 12;
    rot.current.pitch = n ? clamp(-n.lat + 9, -PITCH_LIMIT, PITCH_LIMIT) : -8;
    rot.current.vYaw = 0;
    rot.current.vPitch = 0;
    dirty.current = true;
    // Orientation is chosen once per mount (the hub mounts this on open), not on
    // every route change behind an open menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The stage is square and sized by a clamp, so its px size changes with the
  // viewport. Measured once and on resize — never read inside the frame loop.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // `offsetWidth`, not `getBoundingClientRect()`: the globe scales during its
    // opening bloom, and a rect would report the mid-animation scaled width and
    // wedge every pin at whatever radius that frame happened to have.
    const read = () => {
      sizeRef.current = el.offsetWidth || 320;
      dirty.current = true;
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = useCallback(
    (node: GlobeNode) => {
      vibrate(18);
      swallowClick.current = true;
      if (node.external) {
        window.location.href = node.href;
        return;
      }
      onDismiss();
      void navigate({ to: node.href } as never);
    },
    [navigate, onDismiss],
  );

  /* ── The frame loop ───────────────────────────────────────────────────────
     integrate → project → magnetism → paint → dwell. It runs for as long as the
     menu is open and stops dead on unmount; a frame where nothing moved and
     nothing is filling writes nothing to the DOM.

     Projection and painting are deliberately SEPARATE passes. The magnetism in
     step 3 needs to know which pin is nearest the reticle, and it moves the globe
     in response — so the projection has to run before it and the paint after it,
     or the pins are drawn a frame behind the rotation they were computed from
     (which, with the paint gated on `dirty`, showed up as pins that froze
     mid-snap while the wireframe kept turning under them). Projecting twice on a
     snapping frame is a dozen sin/cos; painting stale is a visible bug. */
  useEffect(() => {
    const count = nodes.length;
    // Scratch, allocated once per node-set: the loop must not allocate.
    const px = new Float64Array(count);
    const py = new Float64Array(count);
    const pz = new Float64Array(count);
    let lockIdx = -1;
    let snapIdx = -1;

    /** Screen-space position + depth of every pin, and what the reticle holds. */
    const project = () => {
      const r = rot.current;
      // Yaw about Y, then pitch about X — the same order as the sphere's
      // `rotateX(pitch) rotateY(yaw)`, which is what keeps the projected pins
      // glued to the drawn wireframe.
      const cy = Math.cos(r.yaw * DEG);
      const sy = Math.sin(r.yaw * DEG);
      const cp = Math.cos(r.pitch * DEG);
      const sp = Math.sin(r.pitch * DEG);
      let lockD = Infinity;
      let snapD = Infinity;
      lockIdx = -1;
      snapIdx = -1;
      for (let i = 0; i < count; i++) {
        const n = nodes[i];
        const x1 = n.bx * cy + n.bz * sy;
        const z1 = -n.bx * sy + n.bz * cy;
        px[i] = x1;
        py[i] = n.by * cp - z1 * sp;
        pz[i] = n.by * sp + z1 * cp;
        if (pz[i] <= 0) continue;
        const d = Math.hypot(x1, py[i]);
        if (d < RETICLE && d < lockD) {
          lockD = d;
          lockIdx = i;
        }
        if (d < SNAP_R && d < snapD) {
          snapD = d;
          snapIdx = i;
        }
      }
    };

    const paint = () => {
      const R = sizeRef.current / 2;
      for (let i = 0; i < count; i++) {
        const el = pinRefs.current[i];
        if (!el) continue;
        const z = pz[i];
        const k = kAt(z);
        el.style.transform =
          `translate3d(${(px[i] * R * k).toFixed(2)}px, ${(py[i] * R * k).toFixed(2)}px, 0)` +
          ` scale(${k.toFixed(3)})`;
        // The far hemisphere stays faintly visible — it is what tells you there is
        // more globe to turn to — but it never takes a click.
        el.style.opacity = (0.12 + 0.88 * smoothstep(-0.5, 0.45, z)).toFixed(3);
        el.style.zIndex = String(200 + Math.round(z * 180));
        el.style.pointerEvents = z > 0.02 ? 'auto' : 'none';
        // Labels resolve only for the handful of pins actually facing you, so a
        // dozen names never pile up in the middle of the sphere.
        el.style.setProperty('--near', smoothstep(0.34, 0.78, z).toFixed(3));
      }
      const r = rot.current;
      if (sphereRef.current) {
        sphereRef.current.style.transform = `rotateX(${r.pitch.toFixed(2)}deg) rotateY(${r.yaw.toFixed(2)}deg)`;
      }
    };

    let raf = 0;
    let last = 0;

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      const r = rot.current;
      const stationary = now - lastMoveAt.current > 110;

      // 1. Motion. Dragging writes the rotation directly (in the pointer handler);
      //    everything here is what happens when you are NOT dragging.
      //
      //    A SPRING carrying the release velocity, not a decay curve: the throw,
      //    the magnet and the keyboard glide all run through it, so any of them
      //    can be grabbed mid-flight and retargeted from wherever the globe is
      //    and however fast it is going. That is the whole of "interruptible and
      //    redirectable" (`lib/fluid` §springStep).
      if (!drag.current.active && settle.current) {
        if (reduced) {
          r.yaw = settle.current.yaw;
          r.pitch = settle.current.pitch;
          r.vYaw = 0;
          r.vPitch = 0;
          settle.current = null;
        } else {
          const y = springStep(
            { value: r.yaw, velocity: r.vYaw },
            settle.current.yaw,
            SETTLE_SPRING,
            dt,
          );
          const p = springStep(
            { value: r.pitch, velocity: r.vPitch },
            settle.current.pitch,
            SETTLE_SPRING,
            dt,
          );
          r.yaw = y.value;
          r.vYaw = y.velocity;
          r.pitch = p.value;
          r.vPitch = p.velocity;
          // Arrived when BOTH axes have: a spring passing through its target at
          // speed is at zero displacement but is not finished.
          if (
            Math.abs(y.value - settle.current.yaw) < 0.05 &&
            Math.abs(p.value - settle.current.pitch) < 0.05 &&
            Math.abs(y.velocity) < 2 &&
            Math.abs(p.velocity) < 2
          ) {
            r.yaw = settle.current.yaw;
            r.pitch = settle.current.pitch;
            r.vYaw = 0;
            r.vPitch = 0;
            settle.current = null;
          }
        }
        rawPitch.current = r.pitch;
        dirty.current = true;
      }

      // 2. Where everything is now, and what the reticle is holding.
      project();

      // 3. Magnetism. Once the coast is over, a pin inside the snap cone is eased
      //    to dead centre — including while you hold still with the pointer down,
      //    which is what makes "hold to fill" land reliably on a phone.
      let moved = false;
      if (touched.current && !settle.current && stationary && drag.current.held && snapIdx >= 0) {
        // Magnetism, but only while the finger is DOWN and still: it is what makes
        // "press, hold, let go" land on a phone. Once the finger is up the release
        // throw has already chosen a target, and pulling on the globe afterwards
        // would be the interface moving without being asked.
        const n = nodes[snapIdx];
        const ty = shortestAngle(r.yaw, -n.lon);
        const tp = clamp(-n.lat, -PITCH_LIMIT, PITCH_LIMIT);
        if (Math.abs(ty - r.yaw) > 0.05 || Math.abs(tp - r.pitch) > 0.05) {
          const k = reduced ? 1 : 1 - Math.exp(-9 * dt);
          r.yaw += (ty - r.yaw) * k;
          r.pitch += (tp - r.pitch) * k;
          rawPitch.current = r.pitch;
          moved = true;
        }
      } else if (!touched.current && !reduced) {
        // Untouched: drift, so a globe left alone still reads as a globe rather
        // than a picture of one. It stops for good the moment anyone takes hold.
        r.yaw += IDLE_SPIN * dt;
        moved = true;
      }
      if (moved) {
        dirty.current = true;
        project();
      }

      // 4. One paint, from the rotation the lock below was actually computed from.
      if (dirty.current) {
        paint();
        dirty.current = false;
      }

      // 5. The dwell ring. It only fills while the pointer is DOWN on a locked-on
      //    pin, so nothing can ever navigate without a deliberate hold-and-release
      //    — drag away, or let go early, and it drains.
      // Peak speed over the approach. The settle spring carries the throw's
      // velocity, so sampling here covers a released flick; the pointer handler
      // covers the finger still being down.
      const speed = Math.hypot(r.vYaw, r.vPitch);
      if (speed > peakSpeed.current) peakSpeed.current = speed;

      if (lockIdx !== lockRef.current) {
        lockRef.current = lockIdx;
        fill.current = 0;
        if (lockIdx >= 0) {
          // Freeze the dwell for this lock from the approach that produced it.
          // The evidence is NOT spent here: a hard flick sweeps several pins
          // through the reticle on its way, and consuming the peak at the first
          // of them would leave the destination it actually lands on judged on
          // the tail of the deceleration — a fast approach that reads as a slow
          // one. It is cleared when a fresh aim starts instead (see onPointerDown).
          const confidence = gestureConfidence(peakSpeed.current, BROWSING_SPEED, DECISIVE_SPEED);
          dwellRef.current = DWELL_MS + (DWELL_MIN_MS - DWELL_MS) * confidence;
        }
        setLock(lockIdx);
        if (readyRef.current) {
          readyRef.current = false;
          setReady(false);
        }
        if (lockIdx >= 0) vibrate(6);
      }
      // Both rates ride the frozen dwell, so a confident lock also drains
      // proportionally fast — the ring keeps one consistent sense of "how much
      // of this decision is left".
      const holding = drag.current.held && lockIdx >= 0;
      const next = holding
        ? fill.current + (dt * 1000) / dwellRef.current
        : fill.current - (dt * 1000) / (dwellRef.current * DRAIN_SCALE);
      const clamped = clamp01(next);
      if (clamped !== fill.current) {
        fill.current = clamped;
        reticleRef.current?.style.setProperty('--fill', clamped.toFixed(3));
      }
      if (clamped >= 1 && !readyRef.current) {
        readyRef.current = true;
        setReady(true);
        vibrate([10, 30, 16]);
      } else if (clamped < 1 && readyRef.current) {
        readyRef.current = false;
        setReady(false);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [nodes, reduced]);

  /* ── Pointer ──────────────────────────────────────────────────────────────
     `pointerdown` is taken on the stage (so a press that lands on a pin still
     grabs the globe) and on the overlay around it (see the surface listener
     below); move/up ride WINDOW listeners rather than pointer capture, which
     would retarget the release away from the pin the press started on and break
     plain clicking. */
  /** Take hold of the globe. Shared by every surface that can start a drag. */
  const beginDrag = useCallback((e: PointerEvent | ReactPointerEvent<HTMLElement>) => {
    if (e.button > 0) return;
    drag.current = {
      active: true,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: 0,
      held: true,
    };
    // Taking hold of a globe that is still springing is not a special case — it
    // is the point. Cancel the settle and keep whatever rotation it had reached.
    // A press that lands on a globe already at rest starts a FRESH aim, so the
    // previous gesture's speed stops counting. A press that interrupts a settle
    // is a continuation of the throw already in flight, and keeps it.
    if (!settle.current) peakSpeed.current = 0;
    rot.current.vYaw = 0;
    rot.current.vPitch = 0;
    settle.current = null;
    rawPitch.current = rot.current.pitch;
    touched.current = true;
    swallowClick.current = false;
    const now = performance.now();
    lastMoveAt.current = now;
    yawV.current.reset();
    pitchV.current.reset();
    yawV.current.add(rot.current.yaw, now);
    pitchV.current.add(rot.current.pitch, now);
    setGrabbing(true);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => beginDrag(e),
    [beginDrag],
  );

  /* ── The whole overlay is the control surface ──────────────────────────────
     The sphere is one disc in the middle of a screen the menu owns entirely,
     and the band around it — the title card, the empty space beside the globe,
     the foot capsule a thumb naturally rests on — was dead to the gesture the
     whole menu is built around. On a phone that is most of the reachable half
     of the screen.

     So the overlay takes the press too, and turns the globe from anywhere that
     is not a CONTROL: the foot's identity link, settings, sign-out, sign-in and
     close all keep their own press, as does anything added there later. The
     dismiss catcher is the exception to that rule — it is a `<button>` only so
     an outside TAP closes the menu, and it is also every empty pixel around the
     globe, which is where most of this gesture happens, so it opts back in with
     `data-globe-surface`. A drag that started on it is swallowed on the way up,
     so turning the globe never also closes the menu; a plain tap still passes
     through and dismisses.

     Presses inside the stage are left to its own React handler. This listener
     sees them (they bubble), and returns early, so exactly one of the two ever
     takes a given gesture. */
  useEffect(() => {
    const surface = surfaceRef?.current;
    if (!surface) return;

    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || target.closest('.radial-globe__stage')) return;
      const control = target.closest('a, button, input, select, textarea, [role="button"]');
      if (control && !control.hasAttribute('data-globe-surface')) return;
      beginDrag(e);
    };
    // Capture, so a spent release is stopped before it reaches the catcher's
    // dismiss or a pin's link — the same job the stage's `onClickCapture` does
    // for the sphere itself.
    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };

    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('click', onClickCapture, true);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('click', onClickCapture, true);
    };
  }, [beginDrag, surfaceRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.moved > DRAG_SLOP) swallowClick.current = true;

      const now = performance.now();
      lastMoveAt.current = now;

      const r = rot.current;
      r.yaw += dx * ROT_PER_PX;
      // Tilt tracks the finger 1:1 inside the limit and resists asymptotically
      // past it, so the globe never goes rigid under a drag that has run out of
      // room — it just stops keeping up.
      rawPitch.current -= dy * ROT_PER_PX;
      r.pitch = rubberBandClamp(rawPitch.current, -PITCH_LIMIT, PITCH_LIMIT, PITCH_RUBBER);
      yawV.current.add(r.yaw, now);
      pitchV.current.add(r.pitch, now);
      // Peak speed while the finger is still down — this is the half of the
      // approach the frame loop cannot see, and it is the one that matters for a
      // single-gesture "flick, hold, release".
      const speed = Math.hypot(yawV.current.get(), pitchV.current.get());
      if (speed > peakSpeed.current) peakSpeed.current = speed;
      dirty.current = true;
    };

    const finish = (e: PointerEvent, commit: boolean) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      d.active = false;
      d.held = false;
      setGrabbing(false);
      // The whole gesture, in one line: a full ring at the moment you let go is
      // the navigation. Anything else just leaves the globe where you put it.
      if (commit && readyRef.current && lockRef.current >= 0) {
        go(nodes[lockRef.current]);
        return;
      }
      // A CANCELLED pointer (a system gesture taking over, a context menu) never
      // produces the click a released one does, so a swallow the drag armed
      // would sit there and eat the next real tap instead of its own.
      if (!commit) swallowClick.current = false;

      // Momentum, and then intent. The velocity the finger left with is projected
      // through the platform's own deceleration model to ask "where would this
      // throw come to rest?", and the destination nearest THAT is what the globe
      // springs to — carrying the release velocity into the spring, so the throw
      // and the settle are one continuous motion rather than a coast followed by
      // a snap. A gentle release projects nowhere and lands on what is already in
      // front of you; a hard flick spins visibly around the sphere and arrives
      // somewhere new. (`lib/fluid` §projectDistance, §resolveDetent.)
      const r = rot.current;
      r.vYaw = clamp(yawV.current.get(), -MAX_SPIN, MAX_SPIN);
      r.vPitch = clamp(pitchV.current.get(), -MAX_SPIN, MAX_SPIN);
      const projectedYaw = r.yaw + projectDistance(r.vYaw, DECELERATION.normal);
      const projectedPitch = clamp(
        r.pitch + projectDistance(r.vPitch, DECELERATION.normal),
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );

      let best: { yaw: number; pitch: number } | null = null;
      let bestDistance = Infinity;
      for (const n of nodes) {
        const targetYaw = shortestAngle(projectedYaw, -n.lon);
        const targetPitch = clamp(-n.lat, -PITCH_LIMIT, PITCH_LIMIT);
        const distance = Math.hypot(targetYaw - projectedYaw, targetPitch - projectedPitch);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { yaw: targetYaw, pitch: targetPitch };
        }
      }
      settle.current = best;
      dirty.current = true;
    };

    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [go, nodes]);

  /**
   * A release that has already been spent — on a drag, or on a completed dwell —
   * must not ALSO fire the link it happens to have started on. Captured on the
   * way down so it beats the anchor's own handler.
   */
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * Keyboard: focusing a pin turns the globe until that pin faces you. It counts
   * as taking hold — otherwise the idle drift would immediately carry the pin the
   * focus ring is sitting on back off the front of the sphere.
   */
  const faceNode = useCallback((n: GlobeNode) => {
    settle.current = {
      yaw: shortestAngle(rot.current.yaw, -n.lon),
      pitch: clamp(-n.lat, -PITCH_LIMIT, PITCH_LIMIT),
    };
    rot.current.vYaw = 0;
    rot.current.vPitch = 0;
    touched.current = true;
    dirty.current = true;
  }, []);

  const locked = lock >= 0 ? nodes[lock] : null;
  const lockedLabel = locked ? t(locked.tKey, { defaultValue: locked.label }) : null;

  return (
    <div
      ref={rootRef}
      className="radial-globe"
      tabIndex={-1}
      aria-label={t('globe-label', {
        defaultValue: 'Navigation globe — drag to spin, hold on a destination, let go to open',
      })}
      data-locked={locked ? 'true' : undefined}
      data-ready={ready ? 'true' : undefined}
      style={
        { '--globe-persp': PERSP, '--reticle-d': `${RETICLE_PCT.toFixed(2)}%` } as CSSProperties
      }
    >
      <div
        ref={stageRef}
        className="radial-globe__stage"
        data-grabbing={grabbing ? 'true' : undefined}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        {/* WIREFRAME — a real CSS 3D sphere: meridians are circles turned about Y,
            parallels are circles laid flat and lifted along it. One transform on
            the parent turns the whole cage, so the cage costs one style write a
            frame no matter how many rings it has. */}
        <div ref={sphereRef} className="radial-globe__sphere" aria-hidden>
          {MERIDIANS.map((a) => (
            <span
              key={`m${a}`}
              className={
                'radial-globe__ring radial-globe__ring--meridian' +
                (a === 0 ? ' radial-globe__ring--major' : '')
              }
              style={{ '--a': `${a}deg` } as CSSProperties}
            />
          ))}
          {PARALLELS.map((latitude) => (
            <span
              key={`p${latitude}`}
              className={
                'radial-globe__ring radial-globe__ring--parallel' +
                (latitude === 0 ? ' radial-globe__ring--major' : '')
              }
              style={
                {
                  '--ty': `${(-Math.sin(latitude * DEG) * 50).toFixed(3)}%`,
                  '--s': Math.cos(latitude * DEG).toFixed(4),
                } as CSSProperties
              }
            />
          ))}
        </div>

        {/* The glass body itself: a flat disc of shading over the cage, so the
            wireframe reads as structure suspended INSIDE a liquid ball rather
            than as a drawing on top of one. */}
        <span className="radial-globe__glass" aria-hidden />

        {/* PINS — projected here rather than placed in the 3D cage, so their type
            stays flat, crisp and billboarded instead of skewing with the sphere. */}
        <ul
          className="radial-globe__pins"
          role="menu"
          aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
        >
          {nodes.map((n, i) => {
            const Icon = n.icon as LucideIcon;
            const label = t(n.tKey, { defaultValue: n.label });
            const isLocked = lock === i;
            const cls = 'radial-globe__pin' + (isLocked ? ' is-locked' : '');
            const shared = {
              className: cls,
              role: 'menuitem' as const,
              tabIndex,
              draggable: false,
              // A pin is an object on a surface, so it rises to meet the finger
              // rather than sinking. The press layer releases itself as soon as
              // the pointer travels past its slop, which is exactly right here:
              // start turning the globe and the pin you happened to touch lets go
              // instead of staying stuck in a pressed state for the whole drag.
              'data-fluid-press': 'lift',
              'aria-label': label,
              onFocus: () => faceNode(n),
              onClick: onDismiss,
            };
            return (
              <li
                key={n.id}
                role="none"
                className="radial-globe__pin-wrap"
                style={{ '--i': i } as CSSProperties}
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
              >
                {n.external ? (
                  <a href={n.href} {...shared}>
                    <span className="radial-globe__pin-dot">
                      <Icon aria-hidden />
                    </span>
                    <span className="radial-globe__pin-name">{label}</span>
                  </a>
                ) : (
                  <Link to={n.href} {...shared}>
                    <span className="radial-globe__pin-dot">
                      <Icon aria-hidden />
                    </span>
                    <span className="radial-globe__pin-name">{label}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {/* RETICLE — the target, and the dwell ring that fills inside it. */}
        <div ref={reticleRef} className="radial-globe__reticle" aria-hidden>
          <span className="radial-globe__reticle-ring" />
        </div>
      </div>

      {/* TITLE — a fixed billing card, not a running commentary. The destination
          under the reticle names itself AT the pin (radial.css keeps the locked
          pin's label even at the widths where the rest are hidden), which is
          where the eye already is, so this space is free to be the marquee. */}
      <div className="radial-globe__title">
        <p className="radial-globe__presents">
          {t('globe-presents', { defaultValue: 'RMH Presents' })}
        </p>
        <p className="radial-globe__wordmark">
          {t('globe-wordmark', { defaultValue: 'The Liquid Globe' })}
        </p>
      </div>

      {/* The lock, for screen readers only. It used to be announced by the
          visible readout; that is now the title card, so the live region has to
          exist in its own right or a non-sighted visitor loses the one signal
          that says which destination the gesture is currently pointed at. */}
      <span className="sr-only" aria-live="polite">
        {lockedLabel ?? ''}
      </span>
    </div>
  );
}
