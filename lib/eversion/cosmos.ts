/**
 * The cosmos: the planetary system the globe sits in on large screens
 * (amendment 2026-10-18, the owner's "solar system before it does the eversion").
 * Pure and client-safe: no DOM, no GL; the renderer calls {@link stepCosmos}
 * once per frame and uploads what it wrote.
 *
 * ## What it is
 *
 * The globe stays the subject, at the centre. Around it, laid out along the
 * viewport's LONG axis so a wide (or tall) screen's spare room is used: two suns
 * at the far corners, five planets on tilted orbits that pass in front of and
 * behind the globe, and three moons. Every body is a sphere impostor (one quad,
 * ray-traced in the fragment shader; `COSMOS_*` in `gl/shaders.ts`), lit by the
 * suns; the globe's own light turns toward the primary sun as the system
 * arrives, and the background deepens toward space on a dark theme.
 *
 * ## Seamless by construction
 *
 * Nothing here has a clock or a stage of its own. Its presence is a function of
 * the timeline's channels ({@link cosmosPresence}): it rises with the end of WRAP
 * and falls with the start of UNWRAP, both quintics of quintic channels, so it is
 * continuous in value, velocity and acceleration wherever they are, through a
 * fast-forward, a gate hold or an abort. The bodies arrive from deep behind the
 * globe and leave the same way, so none is ever drawn over the flat page: a body
 * in FRONT of the globe is shown only while the system is fully present. At the
 * flat endpoints presence is exactly 0 and the frame is the page, untouched.
 *
 * ## Where it runs
 *
 * `mid` and `high` tiers on a viewport at least {@link COSMOS_MIN_SHORT} x
 * {@link COSMOS_MIN_LONG} CSS px ({@link cosmosEnabled}); never on `low`, which
 * pays for nothing it does not need. `high` adds sun shadows (moons on their
 * planets, the rings on the giant and the giant on its rings), the second sun's
 * light, and atmospheres; `mid` has one sun and Lambert.
 */

import { GLOBE_RADIUS_FRACTION, LIGHT_DIRECTION } from './constants';
import type { Rgba, ThemeColours, Tier, TimelineSnapshot, Viewport } from './types';

/** Bodies the shader's uniform arrays hold: 2 suns, 5 planets, 3 moons. */
export const COSMOS_MAX_BODIES = 10;
/** The smallest viewport the system is drawn on (CSS px): its short side, and its long side. */
export const COSMOS_MIN_SHORT = 520;
export const COSMOS_MIN_LONG = 860;

/** Body kinds, as the shader reads them (`info.x`). */
export const BODY_KIND = { sun: 0, rocky: 1, ocean: 2, giant: 3, ice: 4, moon: 5 } as const;
type Kind = (typeof BODY_KIND)[keyof typeof BODY_KIND];

/** Whether this viewport and tier get the cosmos at all. */
export function cosmosEnabled(viewport: Viewport, tier: Tier): boolean {
  if (tier === 'low') return false;
  const short = Math.min(viewport.w, viewport.h);
  const long = Math.max(viewport.w, viewport.h);
  return short >= COSMOS_MIN_SHORT && long >= COSMOS_MIN_LONG;
}

/** The timeline's quintic smootherstep (zero velocity and acceleration at both ends). */
const q5 = (x: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Clamped: at x one ulp under 1 the polynomial overshoots 1 by a few ulps.
  return Math.min(1, x * x * x * (x * (x * 6 - 15) + 10));
};

/**
 * How present the system is, 0..1, from the snapshot alone. Arrival: the last
 * 45% of WRAP (the page's edges are lifting by then, and every body starts behind
 * the globe). Departure: the first 45% of UNWRAP, finished while the page's edges
 * are still on their way back, so the returning page never meets a body.
 */
export function cosmosArrival(s: Readonly<TimelineSnapshot>): number {
  return q5((s.wrap - 0.55) / 0.45);
}
export function cosmosDeparture(s: Readonly<TimelineSnapshot>): number {
  return q5((s.unwrap - 0.55) / 0.45);
}
export function cosmosPresence(s: Readonly<TimelineSnapshot>): number {
  return cosmosArrival(s) * cosmosDeparture(s);
}

/**
 * How much the globe is a PLANET, 0..1, from the snapshot alone: the weight of the white-planet tint on dark themes
 * (`planetTone` in gl/shaders.ts). It rises from 10% to 55% of WRAP and is gone 55% of the way into UNWRAP, while
 * the globe is still round. A weight that rode each vertex's own morph instead left the cap (the last part to
 * flatten) white until the final frames, then cut to the dark page: a pop at the one moment that must be seamless.
 */
export function planetWeight(s: Readonly<TimelineSnapshot>): number {
  return q5((s.wrap - 0.1) / 0.45) * q5((s.unwrap - 0.45) / 0.5);
}

/* ── The palette ─────────────────────────────────────────────────────────── */

/**
 * Natural planet albedos, nudged a quarter of the way toward the theme's accent
 * so the system belongs to the site it is shown on. These are surface reflectances
 * (the shader lights them), not interface colours: the interface's colours all
 * still come from `ThemeColours`.
 */
const ALBEDO: Record<Exclude<Kind, 0>, readonly [Rgba, Rgba]> = {
  [BODY_KIND.rocky]: [
    [0.62, 0.33, 0.22, 1],
    [0.36, 0.2, 0.14, 1],
  ],
  [BODY_KIND.ocean]: [
    [0.13, 0.32, 0.62, 1],
    [0.34, 0.52, 0.3, 1],
  ],
  [BODY_KIND.giant]: [
    [0.82, 0.68, 0.48, 1],
    [0.55, 0.38, 0.26, 1],
  ],
  [BODY_KIND.ice]: [
    [0.52, 0.78, 0.84, 1],
    [0.36, 0.6, 0.74, 1],
  ],
  [BODY_KIND.moon]: [
    [0.62, 0.6, 0.58, 1],
    [0.4, 0.39, 0.38, 1],
  ],
};
/** Star colours: a warm primary and a cool companion (black-body ~5200 K and ~9000 K). */
const SUN_WARM: Rgba = [1, 0.84, 0.6, 1];
const SUN_COOL: Rgba = [0.66, 0.78, 1, 1];
const ACCENT_PULL = 0.25;
/**
 * The suns are drawn behind the globe's plane (so their coronas never cover it), but a light that far back shows
 * the viewer every planet's night side: black discs. Their LIGHT is cast from the same place on screen pulled this
 * many globe radii toward the viewer, so the planets are seen gibbous and lit from the sun's side - the
 * photographer's key light, not the astronomer's.
 */
const LIGHT_FORWARD = 2.6;

function towardAccent(c: Rgba, accent: Rgba): Rgba {
  return [
    c[0] + (accent[0] - c[0]) * ACCENT_PULL,
    c[1] + (accent[1] - c[1]) * ACCENT_PULL,
    c[2] + (accent[2] - c[2]) * ACCENT_PULL,
    1,
  ];
}

const luma = (c: Rgba) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/* ── The scene ───────────────────────────────────────────────────────────── */

interface Orbiter {
  kind: Kind;
  /** -1 for a planet (orbits the globe); else the index of the planet it orbits. */
  parent: number;
  /** Semi-major axis, px (a moon: in its planet's radii). */
  a: number;
  /** Orbit inclination toward the viewer, radians. */
  incl: number;
  phase: number;
  /** Angular speed, rad/s. */
  omega: number;
  radius: number;
  seed: number;
  /** Ring tilt (radians) for a ringed body; 0 = no ring. */
  ring: number;
  albedo: Rgba;
  albedo2: Rgba;
  /** Atmosphere strength 0..1. */
  atmosphere: number;
}

interface Sun {
  /** Position relative to the viewport centre, px (y down, z toward the viewer). */
  x: number;
  y: number;
  z: number;
  radius: number;
  colour: Rgba;
  intensity: number;
}

export interface CosmosScene {
  readonly tier: Tier;
  /** The globe's resting radius for this viewport: the unit everything is laid out in. */
  readonly r0: number;
  /** `true` when the long axis is vertical (portrait): orbits run up and down the screen. */
  readonly portrait: boolean;
  readonly suns: readonly Sun[];
  readonly orbiters: readonly Orbiter[];
  /** Background "space" colour (rgb) and how far the clear goes toward it at full presence. */
  readonly space: Rgba;
  readonly spaceAmount: number;
  /** Starfield strength at full presence (0 on a light theme). */
  readonly stars: number;
}

/** Everything the renderer uploads for one frame. Allocated once per renderer. */
export interface CosmosFrame {
  presence: number;
  /** Bodies behind the globe's centre plane, drawn before it (indices `0..behind-1` of the arrays). */
  behind: number;
  /** All bodies with any alpha; `behind..count-1` are drawn after the globe. */
  count: number;
  /** Per body: centre (x, y, z) relative to the viewport centre in px, and radius px. */
  readonly pos: Float32Array;
  /** Per body: kind, seed, ring tilt, alpha. */
  readonly info: Float32Array;
  /** Per body: albedo rgb + atmosphere strength (a sun: its colour + intensity). */
  readonly albedo: Float32Array;
  readonly albedo2: Float32Array;
  /** The suns: position (xyz) + radius, and colour (rgb) + intensity, two of each. */
  readonly sunPos: Float32Array;
  readonly sunCol: Float32Array;
  /** The globe's light direction (toward the light, view space) and its colour. */
  readonly lightDir: Float32Array;
  readonly lightCol: Float32Array;
  /** `rgb` space colour, `a` = how far the clear goes toward it this frame. */
  readonly space: Float32Array;
  /** `x` presence, `y` starfield strength, `z` time (s), `w` 1 when the scene is on. */
  readonly cosmos: Float32Array;
}

export function createCosmosFrame(): CosmosFrame {
  return {
    presence: 0,
    behind: 0,
    count: 0,
    pos: new Float32Array(COSMOS_MAX_BODIES * 4),
    info: new Float32Array(COSMOS_MAX_BODIES * 4),
    albedo: new Float32Array(COSMOS_MAX_BODIES * 4),
    albedo2: new Float32Array(COSMOS_MAX_BODIES * 4),
    sunPos: new Float32Array(8),
    sunCol: new Float32Array(8),
    lightDir: new Float32Array(3),
    lightCol: new Float32Array(4),
    space: new Float32Array(4),
    cosmos: new Float32Array(4),
  };
}

/** A small deterministic PRNG, so a viewport always gets the same sky. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lay the system out for a viewport. `null` when {@link cosmosEnabled} says no.
 * `seed` varies the phases between navigations (the renderer passes a counter).
 */
export function buildCosmos(
  viewport: Viewport,
  tier: Tier,
  colours: ThemeColours,
  seed = 1,
): CosmosScene | null {
  if (!cosmosEnabled(viewport, tier)) return null;
  const short = Math.min(viewport.w, viewport.h);
  const long = Math.max(viewport.w, viewport.h);
  const portrait = viewport.h > viewport.w;
  const r0 = GLOBE_RADIUS_FRACTION * short;
  const halfLong = long / 2;
  const halfShort = short / 2;
  const rand = mulberry(0x9e3779b1 ^ (seed * 2654435761));

  // Long-axis / short-axis placement, then swapped onto x / y for a portrait screen.
  const place = (along: number, across: number, z: number) =>
    portrait ? { x: across, y: along, z } : { x: along, y: across, z };

  const warm = place(-0.8 * halfLong, -0.62 * halfShort, -1.1 * r0);
  const cool = place(0.9 * halfLong, 0.72 * halfShort, -2.2 * r0);
  const suns: Sun[] = [
    { ...warm, radius: 0.12 * short, colour: SUN_WARM, intensity: 1 },
    {
      ...cool,
      radius: 0.055 * short,
      colour: SUN_COOL,
      intensity: tier === 'high' ? 0.4 : 0,
    },
  ];

  // Planets: inner orbits just clear the everting globe's widest projected extent
  // (1.38 r0) and the outer ones run past the screen's long edge, so the band of
  // free space beside the globe is always populated whatever the aspect ratio.
  const kinds: Kind[] = [
    BODY_KIND.rocky,
    BODY_KIND.ocean,
    BODY_KIND.giant,
    BODY_KIND.ice,
    BODY_KIND.rocky,
  ];
  const sizes = [0.032, 0.046, 0.078, 0.056, 0.026];
  const inner = 1.62 * r0;
  const outer = Math.max(inner + 0.3 * r0, 1.12 * halfLong);
  const orbiters: Orbiter[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i]!;
    const a = inner + ((outer - inner) * i) / (kinds.length - 1);
    // The projected ellipse's minor axis stays inside the short side.
    const sinIncl = Math.min(0.38, (0.78 * halfShort) / a) * (0.72 + 0.28 * rand());
    const [c1, c2] = ALBEDO[kind as Exclude<Kind, 0>];
    orbiters.push({
      kind,
      parent: -1,
      a,
      incl: Math.asin(sinIncl) * (i % 2 === 0 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      // Kepler-ish: inner orbits faster. ~0.35 rad/s at the inner orbit.
      omega: 0.35 * Math.pow(inner / a, 1.5) * (i % 3 === 1 ? -1 : 1),
      radius: sizes[i]! * short,
      seed: rand() * 97,
      ring: kind === BODY_KIND.giant ? 0.42 + 0.2 * rand() : 0,
      albedo: towardAccent(c1, colours.accent),
      albedo2: towardAccent(c2, colours.accent),
      atmosphere: kind === BODY_KIND.ocean ? 1 : kind === BODY_KIND.ice ? 0.6 : 0.15,
    });
  }
  const moonAlbedo = ALBEDO[BODY_KIND.moon];
  const moon = (parent: number, a: number, size: number, omega: number) =>
    orbiters.push({
      kind: BODY_KIND.moon,
      parent,
      a,
      incl: 0.35 * (rand() - 0.5),
      phase: rand() * Math.PI * 2,
      omega,
      radius: size * short,
      seed: rand() * 97,
      ring: 0,
      albedo: moonAlbedo[0],
      albedo2: moonAlbedo[1],
      atmosphere: 0,
    });
  moon(1, 2.3, 0.011, 1.1);
  moon(2, 3.1, 0.016, 0.7);
  moon(2, 4.2, 0.01, -0.5);

  const veil = colours.veil;
  const dark = 1 - luma(veil);
  return {
    tier,
    r0,
    portrait,
    suns,
    orbiters,
    space: [veil[0] * 0.16, veil[1] * 0.16, veil[2] * 0.2, 1],
    spaceAmount: 0.08 + 0.82 * dark * dark,
    stars: dark * dark,
  };
}

/* ── Per frame ───────────────────────────────────────────────────────────── */

const LIGHT_LEN = Math.hypot(LIGHT_DIRECTION[0], LIGHT_DIRECTION[1], LIGHT_DIRECTION[2]);
const DEFAULT_LIGHT = [
  LIGHT_DIRECTION[0] / LIGHT_LEN,
  LIGHT_DIRECTION[1] / LIGHT_LEN,
  LIGHT_DIRECTION[2] / LIGHT_LEN,
] as const;

/** The light the globe gets with no cosmos (the original fixed light), white. */
export function writeDefaultLight(out: CosmosFrame): void {
  out.lightDir[0] = DEFAULT_LIGHT[0];
  out.lightDir[1] = DEFAULT_LIGHT[1];
  out.lightDir[2] = DEFAULT_LIGHT[2];
  out.lightCol[0] = 1;
  out.lightCol[1] = 1;
  out.lightCol[2] = 1;
  out.lightCol[3] = 1;
}

/** Scratch for the sort and the planet positions: module-level, so a frame allocates nothing. */
const order = new Int32Array(COSMOS_MAX_BODIES);
const zs = new Float64Array(COSMOS_MAX_BODIES);
const px = new Float64Array(COSMOS_MAX_BODIES);
const py = new Float64Array(COSMOS_MAX_BODIES);
const pz = new Float64Array(COSMOS_MAX_BODIES);

/**
 * Write this frame's bodies (sorted back to front and split at the globe's
 * plane), the suns, the globe's light and the background into `out`. With no
 * scene it writes the default light and zero presence. Allocates nothing.
 */
export function stepCosmos(
  scene: CosmosScene | null,
  s: Readonly<TimelineSnapshot>,
  viewport: Viewport,
  out: CosmosFrame,
  /** 0..1: the renderer's frame governor easing the whole system out on a device that cannot afford it. */
  budget = 1,
): void {
  out.cosmos[2] = s.t / 1000;
  if (!scene) {
    out.presence = 0;
    out.behind = 0;
    out.count = 0;
    out.cosmos[0] = 0;
    out.cosmos[1] = 0;
    out.cosmos[3] = 0;
    out.space[3] = 0;
    writeDefaultLight(out);
    return;
  }
  const arrival = cosmosArrival(s);
  const departure = cosmosDeparture(s);
  const presence = arrival * departure * budget;
  out.presence = presence;
  out.cosmos[0] = presence;
  out.cosmos[1] = scene.stars * presence;
  out.cosmos[3] = 1;
  out.space[0] = scene.space[0];
  out.space[1] = scene.space[1];
  out.space[2] = scene.space[2];
  out.space[3] = scene.spaceAmount * presence;

  const time = s.t / 1000;
  const r0 = scene.r0;
  // The globe's centre relative to the viewport centre: the orbits follow the globe.
  const gx = s.centreX - viewport.w / 2;
  const gy = s.centreY - viewport.h / 2;
  // Arriving and leaving, every body is pushed back behind the globe and its orbit drawn in.
  const away = 1 - arrival + (1 - departure) + (1 - budget);
  const pushBack = -2.6 * r0 * away;
  const spread = 0.7 + 0.3 * presence;
  // Front bodies show only once the system is fully present (never over the flat page).
  const frontAlpha = q5((presence - 0.6) / 0.4);

  let n = 0;
  // Suns (fixed in the sky; they fade with presence). Their slots are written after the sort.
  for (let i = 0; i < scene.suns.length; i++) {
    const sun = scene.suns[i]!;
    px[n] = sun.x;
    py[n] = sun.y;
    pz[n] = sun.z + pushBack * 0.5;
    out.sunPos[i * 4] = px[n]!;
    out.sunPos[i * 4 + 1] = py[n]!;
    out.sunPos[i * 4 + 2] = pz[n]! + LIGHT_FORWARD * r0;
    out.sunPos[i * 4 + 3] = sun.radius;
    out.sunCol[i * 4] = sun.colour[0];
    out.sunCol[i * 4 + 1] = sun.colour[1];
    out.sunCol[i * 4 + 2] = sun.colour[2];
    out.sunCol[i * 4 + 3] = sun.intensity * presence;
    n++;
  }
  const first = n;
  for (let i = 0; i < scene.orbiters.length; i++) {
    const o = scene.orbiters[i]!;
    const ang = o.phase + o.omega * time;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    let x: number;
    let y: number;
    let z: number;
    if (o.parent < 0) {
      const a = o.a * spread;
      // The orbit plane, tilted toward the viewer about the long axis; depth compressed
      // so the perspective never swells a passing planet past the frame.
      const along = a * c;
      const across = a * sn * Math.sin(o.incl);
      const depth = a * sn * Math.cos(o.incl) * 0.45;
      x = gx + (scene.portrait ? across : along);
      y = gy + (scene.portrait ? along : across);
      z = depth + pushBack;
    } else {
      const p = first + o.parent;
      const parent = scene.orbiters[o.parent]!;
      const a = o.a * parent.radius;
      x = px[p]! + a * c;
      y = py[p]! + a * sn * Math.sin(o.incl);
      z = pz[p]! + a * sn * Math.cos(o.incl);
    }
    px[n] = x;
    py[n] = y;
    pz[n] = z;
    n++;
  }

  // Back to front by depth (insertion sort over at most 10).
  for (let i = 0; i < n; i++) {
    order[i] = i;
    zs[i] = pz[i]!;
  }
  for (let i = 1; i < n; i++) {
    const k = order[i]!;
    let j = i - 1;
    while (j >= 0 && zs[order[j]!]! > zs[k]!) {
      order[j + 1] = order[j]!;
      j--;
    }
    order[j + 1] = k;
  }

  // Every slot, in sorted order.
  let slot = 0;
  let behind = 0;
  for (let i = 0; i < n; i++) {
    const k = order[i]!;
    const front = pz[k]! > 0;
    if (!front) behind++;
    if (k < first) {
      const sun = scene.suns[k]!;
      writeBody(
        out,
        slot,
        px[k]!,
        py[k]!,
        pz[k]!,
        sun.radius * (0.8 + 0.2 * presence),
        BODY_KIND.sun,
        k,
        0,
        presence * (front ? frontAlpha : 1),
      );
      writeColour(out.albedo, slot, sun.colour, sun.intensity);
      writeColour(out.albedo2, slot, sun.colour, 0);
    } else {
      const o = scene.orbiters[k - first]!;
      const alpha = presence * (front ? frontAlpha : 1);
      writeBody(
        out,
        slot,
        px[k]!,
        py[k]!,
        pz[k]!,
        o.radius * (0.55 + 0.45 * presence),
        o.kind,
        o.seed,
        o.ring,
        alpha,
      );
      writeColour(out.albedo, slot, o.albedo, o.atmosphere);
      writeColour(out.albedo2, slot, o.albedo2, 0);
    }
    slot++;
  }
  out.behind = behind;
  out.count = slot;

  // The globe's light turns toward the primary sun, keeping a frontal component so
  // the page on it stays readable (the sun is behind the globe's plane).
  const sun = scene.suns[0]!;
  let lx = sun.x - gx;
  let ly = sun.y - gy;
  let lz = sun.z;
  const ll = Math.hypot(lx, ly, lz) || 1;
  lx = lx / ll;
  ly = ly / ll;
  lz = lz / ll + 1.25;
  const sl = Math.hypot(lx, ly, lz) || 1;
  const mx = DEFAULT_LIGHT[0] + (lx / sl - DEFAULT_LIGHT[0]) * presence;
  const my = DEFAULT_LIGHT[1] + (ly / sl - DEFAULT_LIGHT[1]) * presence;
  const mz = DEFAULT_LIGHT[2] + (lz / sl - DEFAULT_LIGHT[2]) * presence;
  const ml = Math.hypot(mx, my, mz) || 1;
  out.lightDir[0] = mx / ml;
  out.lightDir[1] = my / ml;
  out.lightDir[2] = mz / ml;
  out.lightCol[0] = 1 + (sun.colour[0] - 1) * presence;
  out.lightCol[1] = 1 + (sun.colour[1] - 1) * presence;
  out.lightCol[2] = 1 + (sun.colour[2] - 1) * presence;
  out.lightCol[3] = 1;
}

function writeBody(
  out: CosmosFrame,
  i: number,
  x: number,
  y: number,
  z: number,
  radius: number,
  kind: number,
  seed: number,
  ring: number,
  alpha: number,
) {
  out.pos[i * 4] = x;
  out.pos[i * 4 + 1] = y;
  out.pos[i * 4 + 2] = z;
  out.pos[i * 4 + 3] = radius;
  out.info[i * 4] = kind;
  out.info[i * 4 + 1] = seed;
  out.info[i * 4 + 2] = ring;
  out.info[i * 4 + 3] = alpha;
}

function writeColour(dst: Float32Array, i: number, c: Rgba, w: number) {
  dst[i * 4] = c[0];
  dst[i * 4 + 1] = c[1];
  dst[i * 4 + 2] = c[2];
  dst[i * 4 + 3] = w;
}
