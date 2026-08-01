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
  RIPPLE,
  VelocityTracker,
  gestureConfidence,
  projectDistance,
  rippleFront,
  rippleWave,
  rubberBandClamp,
  smoothstep,
  spring,
  springStep,
  unprojectSphere,
  unrotateSphere,
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
 * **Poke it and it ripples.** Press anywhere on the sphere and a wave spreads out
 * across its surface from the exact spot you touched, swelling the wireframe as
 * it passes and carrying a bright crest with it, until it converges on the far
 * side and dies. The impact is recorded in the globe's OWN coordinates, so the
 * ripple is stuck to the ball: keep dragging and the wave turns with the surface
 * it is travelling over, exactly as a mark on the glass would. See the ripple
 * section below.
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

/* ── The wireframe cage ──────────────────────────────────────────────────────
   Meridians and parallels, in degrees — the same six great circles and seven
   latitude rings the cage has always been drawn from.

   They are STROKED ONTO A CANVAS rather than rendered as thirteen
   `border-radius: 50%` elements inside a `preserve-3d` parent, and that is the
   single biggest thing standing between this gesture and a smooth one. Measured
   on a 6x-throttled phone profile, interleaved A/B, four repetitions, perfectly
   consistent: with the element cage present a drag ran at a 33.3ms median
   frame; with it hidden, 16.7ms — exactly double the frame rate, and nothing
   else in the scene came close to mattering (the glass disc, the pins, the
   translucent `color-mix` borders and layer-promoting the rings each made no
   measurable difference at all).

   The reason is that a rotated 3D transform is the slow path for an antialiased
   elliptical border: the browser cannot reuse a rasterisation across frames,
   because every frame projects each ring differently — so it re-rasterises
   thirteen of them, individually, in a 3D sorting context, at device pixel
   ratio. A canvas is one element and one raster, and thirteen polylines is
   nothing to draw.

   The geometry is not an approximation of the old cage, it is the same cage:
   each ring is sampled around its circle, each sample goes through the exact
   projection the PINS already use (same rotation order, same `PERSP`), and the
   result is stroked. Same circles, same perspective, same colours (read from
   the CSS tokens below), same 1px hairlines. */
const MERIDIANS = [0, 30, 60, 90, 120, 150];
const PARALLELS = [-60, -40, -20, 0, 20, 40, 60];
/**
 * Samples per ring. A projected circle is a conic section, so a polyline
 * approximates it — at 72 segments the largest chord error on a 480px globe is
 * a fraction of the 1px stroke, i.e. invisible, and the whole cage is still
 * under a thousand line segments a frame.
 */
const RING_SAMPLES = 72;
/**
 * cos/sin of every ring sample angle, built once at module load.
 *
 * All thirteen rings are sampled at the SAME angles — a ring differs from its
 * neighbours only in the plane it lies in, never in where it is cut — so the
 * angles are constant for the lifetime of the page. Computing them inside the
 * sample loop cost 2 × 73 × 13 ≈ 1900 trig calls on every frame of every drag,
 * to arrive at the same 73 pairs of numbers each time.
 */
const RING_COS = new Float64Array(RING_SAMPLES + 1);
const RING_SIN = new Float64Array(RING_SAMPLES + 1);
for (let s = 0; s <= RING_SAMPLES; s++) {
  const theta = (s / RING_SAMPLES) * Math.PI * 2;
  RING_COS[s] = Math.cos(theta);
  RING_SIN[s] = Math.sin(theta);
}
/**
 * Device-pixel ceiling for the cage, matching the site's convention for
 * full-screen canvases (`gameSurfaceDpr`, design-language §12.1 rule 4): fill
 * rate scales with the SQUARE of the ratio, and a hairline wireframe gains
 * nothing visible from a 3x buffer that costs 2.25x the pixels of a 2x one.
 */
const CAGE_MAX_DPR = 2;
/**
 * How far the cage canvas is grown BEYOND the stage box, on every side, as a
 * fraction of the stage.
 *
 * At rest the sphere's limb projects to exactly the stage radius, so a canvas
 * that matched the stage was flush against the widest thing it had to draw. The
 * moment a ripple swells the surface — up to `RIPPLE.amplitude` of the radius,
 * plus the crest's own hairline and its round cap — the wave crossed the limb
 * and was **clipped square by the edge of the backing store**, so a poke near
 * the rim looked like it had been cut off by a window rather than travelling
 * over a ball.
 *
 * The bleed is the fix: the canvas is bigger than the globe and hangs outside
 * it, so there is somewhere for the swell to go. It is not free — fill rate
 * scales with the square of it — so it is only just larger than the worst case
 * (~5.5% swell + a ~2px capped stroke on a ~320px stage), not a round 25%.
 */
const CAGE_BLEED = 0.09;

/* ── The ripple ──────────────────────────────────────────────────────────────
   A press on the sphere sends a wave out across it. The shape of the wave — a
   Ricker wavelet that rises, dips below rest and settles, on a quadratic decay —
   is `lib/fluid` §rippleWave, shared rather than local for the same reason the
   spring and the rubber band are: the globe should not own a second, subtly
   different idea of how this site's surfaces behave.

   What the globe adds is the geometry. The impact is unprojected onto the near
   face of the sphere and then UN-ROTATED into body space, so a ripple is a mark
   on the ball rather than a mark on the screen: it turns with the surface, and
   two pokes while the globe spins leave their waves where they were made. Every
   sample the renderer already computes — the cage's ring points, each pin's
   direction — is a unit vector in that same space, so the displacement is one
   dot product and one `rippleWave` call away, and it rides the existing frame
   loop rather than starting anything of its own.

   The hit test is deliberately NOT displaced. The wave moves what you see; the
   lock still measures where the pin actually is, so a ripple can never shake a
   destination in or out of the reticle under your finger. */

/** Concurrent ripples. Older ones are evicted, so a mash cannot grow the work. */
const MAX_RIPPLES = 3;
/**
 * How brightly the crest is drawn. The wave is a specular travelling over glass,
 * so it has to read as brighter than the structure it passes over — the cage's
 * firmest line, the equator, is 34% ink — but not much brighter. At 90% it
 * stopped being light on a wave and became a circle somebody had drawn on the
 * globe: a hard black ring, three times the weight of anything else on the
 * sphere, pulling the eye clean off the reticle you are supposed to be aiming
 * with. Half ink is enough to be unmistakably the brightest thing there while
 * the swollen wireframe carries the actual shape of the wave.
 */
const CREST_ALPHA = 0.5;
/** The crest's hairline, as a multiple of the cage's. */
const CREST_WIDTH = 1.7;
/** Samples around the crest circle. Fewer than a cage ring — it is one circle. */
const CREST_SAMPLES = 56;
/**
 * How faint the crest goes where it is travelling over the FAR side of the ball.
 * The cage draws both faces, so a wave that vanished at the limb would look like
 * it had fallen off the world; one drawn at full strength back there reads as a
 * second wave coming the other way.
 */
const CREST_BACK = 0.28;

/** One live ripple, in the globe's own (unrotated) coordinates. */
interface Ripple {
  /** Unit vector to the point that was struck. */
  bx: number;
  by: number;
  bz: number;
  /** `performance.now()` at the moment of impact. */
  t0: number;
}

/* ── The wobble ──────────────────────────────────────────────────────────────
   A ripple is what happens to the surface; this is what happens to the BALL.
   Poke a heavy sphere hung in space and it does not only ring — it rocks away
   from your finger and settles back, a couple of times, quickly. Without that,
   a poke reads as a wave painted onto something bolted down.

   It is an under-damped spring returning to zero (`lib/fluid` §springStep), not
   a keyframed shake, for the reasons everything else here is: it composes with
   whatever the globe is already doing, a second poke mid-rock adds to the first
   instead of restarting it, and grabbing the globe cancels it in the same way
   grabbing it cancels a settle.

   It moves the DRAWN rotation only. The lock, the magnetism and the dwell all
   keep reading the real one — the same rule the ripple follows, and for the same
   reason: a decorative motion must never be able to shake a destination into or
   out of the reticle while somebody is holding on it. */

/** The rock's return. Loose and bouncy: this is a ball on a tether, not a control. */
const WOBBLE_SPRING = spring(0.78, 0.62);
/**
 * Peak rock, in degrees, for a poke at the very edge of the sphere. A poke at
 * dead centre is straight down the viewing axis and rocks nothing at all, so the
 * impulse scales with how far off-axis the hit was — which is what makes a
 * glancing blow to the rim shove the globe and a square one just ring it.
 *
 * Small on purpose: at 9° the horizon visibly tips and rights itself, and the
 * pins stay where you were aiming. Anything larger and a poke costs you your aim.
 */
const WOBBLE_DEG = 5.5;
/** Below this the rock is finished, in degrees and degrees/second. */
const WOBBLE_REST = 0.02;
/**
 * The initial velocity that makes {@link WOBBLE_SPRING} peak at one degree —
 * i.e. its damped natural frequency, since a spring released from rest at zero
 * with velocity `v` swings out to about `v / ωd` before it turns around.
 *
 * Derived from the spring rather than tuned by hand, so re-tuning the spring
 * cannot silently change how hard a poke hits: `WOBBLE_DEG` stays the peak in
 * degrees whatever the bounce is set to.
 */
const WOBBLE_KICK = (() => {
  const omega = Math.sqrt(WOBBLE_SPRING.stiffness / WOBBLE_SPRING.mass);
  const zeta =
    WOBBLE_SPRING.damping / (2 * Math.sqrt(WOBBLE_SPRING.stiffness * WOBBLE_SPRING.mass));
  return omega * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));
})();

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
  const cageRef = useRef<HTMLCanvasElement | null>(null);
  const cageCtx = useRef<CanvasRenderingContext2D | null>(null);
  /**
   * The cage's stroke colours, resolved once. They are authored in CSS (so every
   * theme keeps its own ink) and registered with `@property syntax: '<color>'`,
   * which is what makes the computed value a real colour string a canvas can use
   * rather than the unresolved `color-mix(…)` token stream.
   */
  const cagePaint = useRef({ minor: '', parallel: '', major: '', ripple: '', width: 1 });
  const reticleRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef<Array<HTMLLIElement | null>>([]);
  /**
   * The label inside each pin. `--near` is written HERE rather than on the pin
   * wrapper, and that is a performance decision, not a tidiness one: custom
   * properties inherit, so setting one on the wrapper invalidates the computed
   * style of the wrapper AND its whole subtree — the link, the dot, the icon,
   * the label — twelve times a frame. Written on the leaf that actually reads
   * it, the invalidation is the leaf. The cascade is unchanged: the `is-locked`
   * and `:focus-visible` rules set `opacity` directly and still outrank the
   * `opacity: var(--near)` declaration this feeds.
   */
  const labelRefs = useRef<Array<HTMLElement | null>>([]);
  /**
   * Last value written per pin, per property. An inline style assignment
   * invalidates style whether or not the value differs, so the loop compares
   * first: `pointer-events` and `z-index` then change a few times a gesture
   * instead of twelve times a frame.
   */
  const painted = useRef<
    Array<{ transform: string; opacity: string; near: string; z: number; hit: boolean }>
  >([]);

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
  /** CSS px across the cage canvas — the stage plus its bleed on both sides. */
  const cageSpan = useRef(320 * (1 + 2 * CAGE_BLEED));
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
  /**
   * Live ripples, newest last. A ref, not state: they are read by the frame loop
   * and by nothing in JSX, and a React render per poke would be a render in the
   * middle of the one gesture this component spends its whole budget on.
   */
  const ripples = useRef<Ripple[]>([]);
  /**
   * The rock a poke leaves behind, in degrees off the real rotation, with its
   * velocity — the spring state the frame loop steps back to zero. Null when the
   * globe is standing still, which is the state the loop checks to skip the whole
   * feature.
   */
  const wobble = useRef<{ yaw: number; vYaw: number; pitch: number; vPitch: number } | null>(null);

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
      const size = el.offsetWidth || 320;
      sizeRef.current = size;

      // Size the cage's backing store to match. Done HERE and nowhere else:
      // assigning `canvas.width` reallocates the backing store and clears it, so
      // a frame loop must never do it (design-language §12.1 rule 4) — this runs
      // on mount and on a real resize, which is exactly when the size changed.
      //
      // The canvas is DELIBERATELY bigger than the stage (see CAGE_BLEED): the
      // sphere's limb already reaches the stage edge at rest, so a ripple's swell
      // has to have somewhere to go or it is clipped square by the backing store.
      // The CSS grows the element by the same fraction (`.radial-globe__cage`
      // uses a negative inset), so the two boxes stay concentric and the globe's
      // own radius — `sizeRef`, which every projection is scaled by — is
      // unchanged. Only the paper is bigger; the drawing is not.
      const span = size * (1 + 2 * CAGE_BLEED);
      cageSpan.current = span;
      const canvas = cageRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, CAGE_MAX_DPR);
        const px = Math.round(span * dpr);
        if (canvas.width !== px) {
          canvas.width = px;
          canvas.height = px;
        }
        const ctx = canvas.getContext('2d');
        cageCtx.current = ctx;
        if (ctx) {
          // One transform for the whole cage: device pixels out, and the origin
          // at the middle of the globe, which is where the projection puts 0,0 —
          // the centre of the BLED box, which is the same point.
          ctx.setTransform(dpr, 0, 0, dpr, (span * dpr) / 2, (span * dpr) / 2);
          ctx.lineJoin = 'round';
        }
        // Resolved once per size change rather than per frame: reading a computed
        // style is a style flush, and these only change with the theme (and the
        // globe is mounted afresh every time the menu opens).
        const cs = getComputedStyle(canvas);
        // The `--cage-*` tokens are registered `<color>` (radial.css), so their
        // COMPUTED value is a real colour a canvas can take. On an engine that
        // does not implement `@property` the computed value is the literal
        // `color-mix(…)` text instead, and assigning that to `strokeStyle` is a
        // no-op — which would leave the cage drawn in the default BLACK. So each
        // one is checked, and the fallback is mixed here from the same ink at the
        // same alphas, off the element's own resolved `color`.
        const ink = cs.color || 'rgb(0 0 0)';
        const token = (name: string, alpha: number) => {
          const value = cs.getPropertyValue(name).trim();
          if (/^(rgb|rgba|#|color\()/i.test(value)) return value;
          return `color-mix(in srgb, ${ink} ${alpha * 100}%, transparent)`;
        };
        cagePaint.current = {
          minor: token('--cage-minor', 0.2),
          parallel: token('--cage-parallel', 0.13),
          major: token('--cage-major', 0.34),
          // The ripple crest. Read the same way and at the same time as the cage
          // ink — it is the same canvas and the same per-theme decision about
          // what this globe is drawn in.
          ripple: token('--cage-ripple', CREST_ALPHA),
          width: parseFloat(cs.getPropertyValue('--cage-width')) || 1,
        };
      }
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
    /** Pin indices, re-sorted by depth each paint to derive the z-index rank. */
    const order = new Array<number>(count);
    let lockIdx = -1;
    let snapIdx = -1;

    // What the last paint wrote, per pin. Seeded with values no first frame can
    // produce, so every property is written once on open and then only on change.
    painted.current = Array.from({ length: count }, () => ({
      transform: '',
      opacity: '',
      near: '',
      z: -1,
      hit: true,
    }));

    /* ── Sampling the ripples ─────────────────────────────────────────────
       `waveAt` is the innermost thing in this component: it runs for all ~950
       cage samples and every pin, once per live ripple, on every frame of a
       ripple's life. Two things it must not do per sample, and does not:

         • **Allocate.** `rippleWave` takes its source as an object, so calling
           it inline minted ~950 short-lived objects per ripple per frame. It
           destructures its argument on entry and never retains it, so ONE
           scratch object is reused for every call instead.
         • **Take an `acos` it is going to throw away.** The wavelet is exactly
           zero more than four packet widths from the crest (`lib/fluid`
           §rippleWave), and the overwhelming majority of a sphere is that far
           away at any instant — a crest is a ~19° band on a 180° surface. So
           each ripple's live band is converted ONCE per frame into the window of
           dot products that can fall inside it, and a sample outside that window
           skips the arc-cosine entirely. `acos` is monotonically decreasing on
           [-1, 1], so the window is exact: this is a cheaper test for the same
           condition, not an approximation of it. */

    /** Per-frame ripple state, preallocated — the loop must not allocate. */
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
    /** Ages of the primed ripples, parallel to `waveWin`. */
    const waveAge = new Float64Array(MAX_RIPPLES);
    let waveCount = 0;

    /**
     * Snapshot the live ripples for this frame: their axis, their age, and the
     * dot-product window their wavelet is non-zero over.
     *
     * Called once per paint, so every sample in a frame is measured against ONE
     * clock — otherwise the crest is drawn at a slightly different radius on each
     * ring it crosses.
     */
    const primeWaves = (now: number) => {
      const live = ripples.current;
      waveCount = 0;
      for (let i = 0; i < live.length && waveCount < MAX_RIPPLES; i++) {
        const r = live[i];
        const age = (now - r.t0) / 1000;
        if (!(age >= 0) || age >= RIPPLE.life) continue;
        const front = RIPPLE.speed * age;
        // The wavelet is zero outside ±4 packet widths of the crest, so only arc
        // distances in [front - 4w, front + 4w] matter. cos() of the two ends,
        // clamped to the sphere, is the window in dot-product space.
        const lo = front - 4 * RIPPLE.width;
        const hi = front + 4 * RIPPLE.width;
        const w = waveWin[waveCount];
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
     * as a fraction of the radius. Zero — via an early return on the common case
     * — whenever nothing is rippling, so the whole feature costs one counter
     * check per sample on every frame a visitor is merely turning the globe.
     */
    const waveAt = (bx: number, by: number, bz: number) => {
      if (waveCount === 0) return 0;
      let sum = 0;
      for (let i = 0; i < waveCount; i++) {
        const w = waveWin[i];
        // Both vectors are unit, so the dot IS the cosine of the arc between
        // them — which is why the band test can be made here, before paying for
        // the arc-cosine that turns it into a distance.
        const dot = bx * w.bx + by * w.by + bz * w.bz;
        if (dot < w.dotLo || dot > w.dotHi) continue;
        // Clamped because float error can push a dot a hair past ±1, and `acos`
        // of that is NaN.
        waveSrc.age = waveAge[i];
        waveSrc.distance = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
        sum += rippleWave(waveSrc);
      }
      return sum;
    };

    /**
     * The rotation everything is DRAWN at: the real one plus the wobble.
     *
     * Kept separate from `rot.current` — which is the globe's actual orientation
     * and the only thing the lock, the magnetism and the release throw ever read
     * — so the rock cannot move a destination in or out of the reticle. Written
     * once per frame by `step`, and read by the display projection and the cage.
     */
    const draw = { yaw: 0, pitch: 0 };

    /**
     * Screen-space position + depth of every pin, and what the reticle holds.
     *
     * `yaw`/`pitch` are passed in rather than read from `rot.current` because
     * this runs twice on a wobbling frame: once at the true rotation, which is
     * what `lockIdx`/`snapIdx` are measured from, and once at the drawn rotation,
     * which is what the paint uses. On every other frame the two are identical
     * and it runs once, exactly as before.
     */
    const project = (yaw: number, pitch: number) => {
      // Yaw about Y, then pitch about X — the same order as the sphere's
      // `rotateX(pitch) rotateY(yaw)`, which is what keeps the projected pins
      // glued to the drawn wireframe.
      const cy = Math.cos(yaw * DEG);
      const sy = Math.sin(yaw * DEG);
      const cp = Math.cos(pitch * DEG);
      const sp = Math.sin(pitch * DEG);
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

    /* ── The cage ─────────────────────────────────────────────────────────
       Thirteen rings, stroked as polylines through the SAME projection the pins
       go through, so the wireframe and the pins standing on it can never drift
       apart (they used to be two independent implementations of one sphere —
       CSS 3D for the cage, JS for the pins — held in agreement only by both
       reading `PERSP`).

       Points are generated on the unit sphere exactly as the CSS transforms
       placed them:
         • a meridian was a circle in the element's XY plane turned by
           `rotateY(a)` → (cosθ·cos a, sinθ, −cosθ·sin a)
         • a parallel was that circle scaled by cos(lat), laid flat by
           `rotateX(90deg)` and lifted by −sin(lat) → (cos(lat)·cosθ, −sin(lat),
           cos(lat)·sinθ), which is just the latitude circle
       then rotated by the globe's yaw and pitch and divided by the same
       perspective. Both faces of every ring are drawn, as before — the
       see-through cage IS the globe. */
    const drawCage = (now: number) => {
      const ctx = cageCtx.current;
      const canvas = cageRef.current;
      if (!ctx || !canvas) return;
      const R = sizeRef.current / 2;
      const cy = Math.cos(draw.yaw * DEG);
      const sy = Math.sin(draw.yaw * DEG);
      const cp = Math.cos(draw.pitch * DEG);
      const sp = Math.sin(draw.pitch * DEG);
      const paint = cagePaint.current;

      // Clear the whole BLED canvas, not the globe's box: a ripple's swell (and
      // the crest's capped stroke) is drawn out there, so anything short of this
      // leaves the previous frame's wave stranded around the rim.
      const span = cageSpan.current;
      ctx.clearRect(-span / 2, -span / 2, span, span);

      /**
       * How wide this ring's hairline is on screen.
       *
       * A CSS border is 1px in its ELEMENT's coordinates, so a ring turned away
       * from the viewer had its stroke foreshortened along with everything else
       * — which is a real depth cue, and a constant screen-space hairline reads
       * heavier and flatter than the cage used to. `nz` is the ring plane's
       * normal after the globe's rotation, so |nz| is 1 face-on and 0 edge-on;
       * a circle seen at that tilt has its radial (i.e. stroke-width) direction
       * compressed between |nz| and 1 around its circumference, averaging the
       * midpoint of the two. The floor keeps an edge-on ring from thinning into
       * nothing, exactly as the browser kept drawing one.
       */
      const widthFor = (nx: number, ny: number, nz: number) => {
        // Only the depth component of the rotated normal is needed, so the two
        // screen components are never computed.
        const z1 = -nx * sy + nz * cy;
        const face = Math.abs(ny * sp + z1 * cp);
        return paint.width * Math.max(0.42, (1 + face) / 2);
      };

      /**
       * Stroke one ring.
       *
       * Every ring in this cage is a circle, so every one of them is
       * `u·cosθ + v·sinθ` about a centre offset `oy` along the polar axis — a
       * meridian and a parallel differ only in which plane `u` and `v` span:
       *
       *   • meridian at `a` — u = (cos a, 0, −sin a), v = (0, 1, 0), oy = 0
       *   • parallel at `lat` — u = (cos lat, 0, 0), v = (0, 0, cos lat),
       *     oy = −sin lat  (the latitude circle, lifted to its latitude)
       *
       * Taking the basis rather than a `theta → point` callback is what keeps the
       * sample loop free of both a closure call and the three-element array that
       * callback had to return — ~950 short-lived arrays a frame, which is
       * precisely the per-frame allocation this loop is not allowed to do.
       *
       * Each sample is pushed out along its own normal by the ripple before it is
       * projected — which, on a unit sphere, is just scaling the direction. That
       * is what makes the wave look like it is IN the glass rather than drawn on
       * it: the wireframe is the structure suspended in the ball, so a wave that
       * bulges the structure bulges the ball.
       */
      const ring = (
        stroke: string,
        width: number,
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
        for (let s = 0; s <= RING_SAMPLES; s++) {
          const ct = RING_COS[s];
          const st = RING_SIN[s];
          const bx = ux * ct + vx * st;
          const by = uy * ct + vy * st + oy;
          const bz = uz * ct + vz * st;
          const swell = 1 + waveAt(bx, by, bz);
          const x1 = (bx * cy + bz * sy) * swell;
          const z1 = (-bx * sy + bz * cy) * swell;
          const by2 = by * swell;
          const y2 = by2 * cp - z1 * sp;
          const z2 = by2 * sp + z1 * cp;
          const k = kAt(z2);
          if (s === 0) ctx.moveTo(x1 * R * k, y2 * R * k);
          else ctx.lineTo(x1 * R * k, y2 * R * k);
        }
        ctx.stroke();
      };

      for (const a of MERIDIANS) {
        const ca = Math.cos(a * DEG);
        const sa = Math.sin(a * DEG);
        // A meridian spans (cos a, 0, −sin a) and (0, 1, 0); its plane normal is
        // the cross product of the two.
        ring(a === 0 ? paint.major : paint.minor, widthFor(sa, 0, ca), ca, 0, -sa, 0, 1, 0, 0);
      }
      // Every parallel lies flat, so they all share the globe's polar axis — and
      // therefore all take the same stroke width, hoisted out of the loop.
      const parallelWidth = widthFor(0, 1, 0);
      for (const latitude of PARALLELS) {
        const cl = Math.cos(latitude * DEG);
        const yl = -Math.sin(latitude * DEG);
        ring(latitude === 0 ? paint.major : paint.parallel, parallelWidth, cl, 0, 0, 0, 0, cl, yl);
      }

      /* ── The crest ──────────────────────────────────────────────────────
         The swollen cage says something is passing through the glass; this is
         the light on it. The set of points a fixed arc distance from the impact
         is a circle ON the sphere, so it is generated the same way the cage's
         rings are (an orthonormal frame around the impact axis) and goes through
         the same projection — which is why it stays glued to the bulge it is
         riding instead of sliding over it as an ellipse drawn in screen space.

         Front and back faces are stroked as SEPARATE paths, because a canvas
         path takes one alpha: the far half of the crest is drawn faint, the near
         half bright, and the two meet at the limb. */
      for (let i = 0; i < ripples.current.length; i++) {
        const rip = ripples.current[i];
        const age = (now - rip.t0) / 1000;
        const front = rippleFront(age);
        // Nothing to draw before the wave has left the impact point, or once it
        // has converged on the antipode, or after its life is spent.
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
        let e1x = seed[1] * az - seed[2] * ay;
        let e1y = seed[2] * ax - seed[0] * az;
        let e1z = seed[0] * ay - seed[1] * ax;
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
          ctx.strokeStyle = paint.ripple;
          ctx.globalAlpha = fade * fade * (face === 0 ? CREST_BACK : 1);
          ctx.lineWidth = paint.width * CREST_WIDTH;
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
            const x1 = bx * cy + bz * sy;
            const z1 = -bx * sy + bz * cy;
            const y2 = by * cp - z1 * sp;
            const z2 = by * sp + z1 * cp;
            // Each pass draws only its own face, lifting the pen across the
            // stretches that belong to the other one.
            if (face === 0 ? z2 > 0 : z2 <= 0) {
              drawing = false;
              continue;
            }
            const k = kAt(z2);
            if (drawing) ctx.lineTo(x1 * R * k, y2 * R * k);
            else ctx.moveTo(x1 * R * k, y2 * R * k);
            drawing = true;
          }
          ctx.stroke();
        }
        // Hand the context back exactly as the cage expects to find it next
        // frame — canvas state is sticky, and the cage never sets either of
        // these itself.
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
      }
    };

    /* ── The paint ────────────────────────────────────────────────────────
       Compositor-only properties and nothing else, and — just as important —
       as few STYLE INVALIDATIONS as the frame actually needs.

       Turning the globe measured ~14ms a frame of `UpdateLayoutTree` (style
       recalculation) on a 6x-throttled phone profile, against well under 1ms of
       JavaScript and a trivial paint: the gesture was not drawing too much, it
       was invalidating too much. Three causes, all in this loop:

         • `--near` was set on the pin WRAPPER. Custom properties inherit, so
           each write invalidated that pin's whole subtree. It is written on the
           label that reads it now (see `labelRefs`).
         • `z-index` was `200 + round(z * 180)` — a value that changes for every
           pin on every frame of a turn, which re-sorts paint order 12 times a
           frame to express an ordering that only changes when two pins actually
           cross in depth. It is the depth RANK now, so it survives most frames
           untouched.
         • `pointer-events` and the rest were assigned unconditionally, and an
           inline assignment invalidates whether or not the value differs.
           Everything here is compared against what was last written.

       Only `transform` genuinely changes every frame, which is the one write
       that is free — it never leaves the compositor. */
    const paint = (now: number) => {
      const R = sizeRef.current / 2;
      // Depth rank, so `z-index` expresses the ORDER rather than the depth.
      for (let i = 0; i < count; i++) order[i] = i;
      order.sort((a, b) => pz[a] - pz[b]);
      // ONE snapshot of the ripples for the whole frame — the pins below and the
      // cage after them must sample the same instant, or the wave that lifts a
      // pin is not the wave drawn under it.
      primeWaves(now);

      for (let rank = 0; rank < count; rank++) {
        const i = order[rank];
        const el = pinRefs.current[i];
        if (!el) continue;
        const last = painted.current[i];
        const z = pz[i];
        const k = kAt(z);
        // A pin is an object standing ON the surface, so a wave passing under it
        // lifts it. Applied HERE, in the paint, and not in `project()`: the
        // projection is what the lock and the magnetism are measured from, and a
        // decorative wave must not be able to nudge a destination into or out of
        // the reticle while somebody is holding on it. The pin's OWN body-space
        // direction is what the wave is sampled at (`nodes[i]`), so it bobs when
        // the wave reaches the pin — not when the wave reaches the screen
        // position the pin happens to be projected to.
        const n = nodes[i];
        const swell = 1 + waveAt(n.bx, n.by, n.bz);

        const transform =
          `translate3d(${(px[i] * R * k * swell).toFixed(2)}px, ${(py[i] * R * k * swell).toFixed(2)}px, 0)` +
          ` scale(${k.toFixed(3)})`;
        if (transform !== last.transform) {
          last.transform = transform;
          el.style.transform = transform;
        }

        // The far hemisphere stays faintly visible — it is what tells you there is
        // more globe to turn to — but it never takes a click.
        const opacity = (0.12 + 0.88 * smoothstep(-0.5, 0.45, z)).toFixed(3);
        if (opacity !== last.opacity) {
          last.opacity = opacity;
          el.style.opacity = opacity;
        }

        if (rank !== last.z) {
          last.z = rank;
          el.style.zIndex = String(200 + rank);
        }

        const hit = z > 0.02;
        if (hit !== last.hit) {
          last.hit = hit;
          el.style.pointerEvents = hit ? 'auto' : 'none';
        }

        // Labels resolve only for the handful of pins actually facing you, so a
        // dozen names never pile up in the middle of the sphere. Quantised to
        // two places: the extra precision was invisible and it made the value
        // differ — and therefore get written — on nearly every frame.
        const near = smoothstep(0.34, 0.78, z).toFixed(2);
        if (near !== last.near) {
          last.near = near;
          labelRefs.current[i]?.style.setProperty('--near', near);
        }
      }

      drawCage(now);
    };

    let raf = 0;
    let last = 0;

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      const r = rot.current;
      const stationary = now - lastMoveAt.current > 110;

      // 0. Ripples. Retiring a spent wave is what lets the paint below settle
      //    back to "nothing changed" — while any are live the globe is redrawn
      //    every frame even when it is not turning, because the surface itself
      //    is moving. Filtering in place (not `.filter`) keeps the loop free of
      //    per-frame allocation, and the list is at most MAX_RIPPLES long.
      if (ripples.current.length > 0) {
        let kept = 0;
        for (let i = 0; i < ripples.current.length; i++) {
          const rip = ripples.current[i];
          if ((now - rip.t0) / 1000 < RIPPLE.life) ripples.current[kept++] = rip;
        }
        ripples.current.length = kept;
        // One extra dirty frame after the last one retires, so the surface is
        // repainted at rest instead of freezing on the final wave's displacement.
        dirty.current = true;
      }

      // 0b. The rock a poke left behind — an under-damped spring returning to
      //     zero. It moves what is DRAWN and nothing else (see the wobble note
      //     above WOBBLE_SPRING), and it retires itself, so a globe at rest is
      //     back to writing nothing.
      const wob = wobble.current;
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
          wobble.current = null;
        }
        dirty.current = true;
      }

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

      // 2. Where everything is now, and what the reticle is holding. Always at
      //    the TRUE rotation — this is the pass the lock and the magnetism read.
      project(r.yaw, r.pitch);

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
        project(r.yaw, r.pitch);
      }

      // 4. One paint. `lockIdx`/`snapIdx` are settled by now, so the display pass
      //    is free to run at the wobbled rotation without touching either — the
      //    globe rocks, the aim does not.
      if (dirty.current) {
        draw.yaw = r.yaw + (wob ? wob.yaw : 0);
        draw.pitch = r.pitch + (wob ? wob.pitch : 0);
        if (wob) project(draw.yaw, draw.pitch);
        paint(now);
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
        // The highlight is a class on the pin the loop already owns, not a React
        // prop — see the `.is-locked` note in radial.css. This is the frame the
        // lock changes on, which is exactly when it should be written.
        if (lockRef.current >= 0) {
          pinRefs.current[lockRef.current]?.classList.remove('is-locked');
        }
        if (lockIdx >= 0) pinRefs.current[lockIdx]?.classList.add('is-locked');
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
  /**
   * Strike the glass at a viewport point, if that point is on the sphere.
   *
   * Runs on pointer-DOWN, not on click: this is the impact, and an impact that
   * waited for the release would arrive after the thing it is a response to.
   * (It is also why a drag ripples — you did touch the glass — and why the wave
   * then travels with the surface you are turning.)
   *
   * The rect is read here, on a discrete event, and never inside the frame loop:
   * a `getBoundingClientRect()` there is a forced synchronous layout of the whole
   * document, every frame (see `hooks/useGlassLight` for the measurements). It is
   * the LIVE rect rather than `sizeRef`, so a press during the opening bloom —
   * when the stage is mid-scale — still lands where the visitor aimed, because
   * the position and the radius are read from the same scaled box.
   */
  const strike = useCallback(
    (clientX: number, clientY: number) => {
      // Reduced motion means no travelling wave. A ripple is pure ornament, and
      // an unrequested full-surface animation is exactly what the preference is
      // asking not to be shown; the press still turns the globe as it always did.
      if (reduced) return;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const R = rect.width / 2;
      if (R <= 0) return;
      // Stage coordinates in radii, y DOWN — the same handedness as everything
      // else here, so no sign flip is needed on the way into body space.
      const sx = (clientX - rect.left - R) / R;
      const sy = (clientY - rect.top - R) / R;
      const hit = unprojectSphere(sx, sy, PERSP);
      if (!hit) return; // pressed the empty corner of the stage, or off it

      /* ── The shove ────────────────────────────────────────────────────────
         A poke is a force pushing INTO the screen at the point you touched, so
         the rock it produces is a torque, and a torque is `r × F` — the standard
         off-centre-strike model, the same one that says where a cue ball goes.

         With the force straight down the viewing axis, F = (0, 0, −1), and the
         contact at r = (hx, hy, hz) on the near face, that cross product comes
         out as a torque of −hy about the x axis and +hx about the y axis, and
         exactly zero about z. So:

           • the lever arm is the contact's distance from the VIEWING AXIS. Dead
             centre is a shove straight through the middle and rocks nothing;
             out at the limb it is all leverage and rocks the most.
           • pushing the right side away brings the left side forward, so the
             near face travels LEFT — yaw decreases. Pushing below centre brings
             the top forward and the near face travels UP — pitch increases.
             (`rawPitch -= dy` in the drag handler is the same convention seen
             from the other end: drag down, surface down, pitch down.)
           • no roll, because a force parallel to the viewing axis can generate
             none — which is just as well, since the globe has no roll axis.

         The lever arm is read off `hit`, the point on the UNIT SPHERE, not off
         the (sx, sy) the pointer landed on. Those differ by the perspective
         foreshortening `k`, which is up to 1.19x near the middle of the disc —
         so using the screen position would have a poke near the centre hit
         nearly a fifth harder than the geometry says it should.

         Added to whatever rock is already running rather than replacing it, so a
         second poke mid-wobble builds on the first — or cancels it, if it lands
         on the opposite side — instead of restarting the spring from a
         standstill. That is the physical answer as well as the nicer one. */
      const w = (wobble.current ??= { yaw: 0, vYaw: 0, pitch: 0, vPitch: 0 });
      w.vYaw -= hit.x * WOBBLE_DEG * WOBBLE_KICK;
      w.vPitch += hit.y * WOBBLE_DEG * WOBBLE_KICK;

      // Un-rotate the impact into the globe's own frame — the exact inverse of
      // the yaw-then-pitch `project()` applies. This is what makes the ripple a
      // mark on the BALL: everything the renderer samples (cage points, pin
      // directions) lives in this space, so the wave turns with the surface
      // instead of hanging in front of the screen.
      const body = unrotateSphere(hit, rot.current.yaw, rot.current.pitch);
      const impact: Ripple = { bx: body.x, by: body.y, bz: body.z, t0: performance.now() };

      // Newest wins: a mash drops the oldest wave rather than accumulating work.
      const live = ripples.current;
      if (live.length >= MAX_RIPPLES) live.splice(0, live.length - MAX_RIPPLES + 1);
      live.push(impact);
      dirty.current = true;
    },
    [reduced],
  );

  /** Take hold of the globe. Shared by every surface that can start a drag. */
  const beginDrag = useCallback(
    (e: PointerEvent | ReactPointerEvent<HTMLElement>) => {
      if (e.button > 0) return;
      strike(e.clientX, e.clientY);
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
    },
    [strike],
  );

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

  // Stable per-index ref callbacks. An inline arrow is a NEW function on every
  // render, which React answers by detaching and re-attaching that ref (null,
  // then the node) — and this component re-renders on every lock change, i.e.
  // repeatedly during a gesture. Cached per index, they are attached once.
  const refSetters = useRef<{
    pin: Array<(el: HTMLLIElement | null) => void>;
    label: Array<(el: HTMLElement | null) => void>;
  }>({ pin: [], label: [] });
  const setPinRef = useCallback((i: number) => {
    refSetters.current.pin[i] ??= (el: HTMLLIElement | null) => {
      pinRefs.current[i] = el;
    };
    return refSetters.current.pin[i];
  }, []);
  const setLabelRef = useCallback((i: number) => {
    refSetters.current.label[i] ??= (el: HTMLElement | null) => {
      labelRefs.current[i] = el;
    };
    return refSetters.current.label[i];
  }, []);

  /**
   * The pins, built once per destination list.
   *
   * Memoised because this component re-renders during a GESTURE: the lock, the
   * ready flag and the grab state are all React state, and the lock in
   * particular changes several times per turn. Without this, each of those
   * re-rendered a dozen `<Link>`s — every one of them re-resolving its router
   * props — in the middle of the frame budget the drag is trying to hold. None
   * of what changes is visible in this markup any more (the highlight is a
   * class the frame loop toggles), so nothing here needs to be rebuilt for it.
   */
  const pins = useMemo(
    () => (
      <ul
        className="radial-globe__pins"
        role="menu"
        aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
      >
        {nodes.map((n, i) => {
          const Icon = n.icon as LucideIcon;
          const label = t(n.tKey, { defaultValue: n.label });
          const shared = {
            className: 'radial-globe__pin',
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
              ref={setPinRef(i)}
            >
              {n.external ? (
                <a href={n.href} {...shared}>
                  <span className="radial-globe__pin-dot">
                    <Icon aria-hidden />
                  </span>
                  <span className="radial-globe__pin-name" ref={setLabelRef(i)}>
                    {label}
                  </span>
                </a>
              ) : (
                <Link to={n.href} {...shared}>
                  <span className="radial-globe__pin-dot">
                    <Icon aria-hidden />
                  </span>
                  <span className="radial-globe__pin-name" ref={setLabelRef(i)}>
                    {label}
                  </span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    ),
    [nodes, t, tabIndex, faceNode, onDismiss, setPinRef, setLabelRef],
  );

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
        {/* WIREFRAME — the meridians and parallels, stroked onto one canvas.
            It used to be thirteen `border-radius: 50%` elements inside a
            `preserve-3d` parent; see the note above MERIDIANS for the measured
            reason it is not any more. The geometry is unchanged. */}
        <canvas ref={cageRef} className="radial-globe__cage" aria-hidden />

        {/* The glass body itself: a flat disc of shading over the cage, so the
            wireframe reads as structure suspended INSIDE a liquid ball rather
            than as a drawing on top of one. */}
        <span className="radial-globe__glass" aria-hidden />

        {/* PINS — projected here rather than placed in the 3D cage, so their type
            stays flat, crisp and billboarded instead of skewing with the sphere. */}
        {pins}

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
