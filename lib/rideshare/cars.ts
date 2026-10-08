/**
 * The **RMH family of cars** — one hull, seven bodies.
 *
 * Every vehicle RMH Rideshare dispatches is described here as a *silhouette*
 * rather than a model file: a handful of cross-sections down the centreline,
 * the wheels that carry them, and (for the one that flies) a rotor. The renderer
 * lofts a surface through those sections and hangs the wireframe cage on it, so
 * the whole fleet is drawn by one builder from one grammar — the same way the
 * site's glass tiers are one material at different elevations.
 *
 * That is the point of putting it here rather than in the component: a car is
 * DATA. Nothing in this file imports three.js, or React, or the DOM, so the
 * silhouettes can be unit-tested (`lib/__tests__/rideshare-cars.test.ts`), and
 * adding a body to the fleet is an entry in a list rather than a new mesh.
 *
 * ## Coordinates
 *
 * Model space is right-handed and vehicle-shaped:
 *
 *   +x  toward the nose        (length, so a section's `t` runs nose → tail)
 *   +y  up                     (0 is the ground the wheels stand on)
 *   +z  toward the near side   (width, mirrored — a section is symmetric in z)
 *
 * Units are **metres**, because the fleet is a real fleet and a 4.6 m saloon
 * next to a 5.3 m van should read as exactly that much longer. The renderer
 * normalises the largest body into its stage; it never rescales one vehicle
 * against another, so the family keeps its proportions.
 */

import type { RideClassId } from './classes';

/**
 * One cross-section of a hull, taken at `t` along the length.
 *
 * The section is an **asymmetric superellipse**: `halfWidth` out to each side,
 * `top` above the ground and `floor` below the crown, with `round` bending the
 * corners. That single shape covers everything the fleet needs — `round: 2` is a
 * plain ellipse (a bike's tank, a rotor pod), `round: 4` is the soft-cornered
 * box a car body actually is, and `round: 6` is the near-rectangular section of
 * a van — without a second kind of geometry anywhere.
 */
export interface HullSection {
  /** Position along the length: 0 at the nose, 1 at the tail. Ascending. */
  t: number;
  /** Half-width at this station, in metres. 0 closes the surface to a point. */
  halfWidth: number;
  /** Height of the crown above the ground, in metres. */
  top: number;
  /** Height of the underside above the ground, in metres. Below `top`. */
  floor: number;
  /**
   * Superellipse exponent. 2 = ellipse; larger squares the section off. The
   * loft interpolates it between stations like every other field, so a body can
   * soften from a boxy cabin into a rounded nose without a seam.
   */
  round: number;
  /**
   * **Tumblehome** — how much narrower the section is at its crown than at its
   * waist, as a fraction of `halfWidth`. 0 is slab-sided; 0.3 pulls the roof in
   * by nearly a third.
   *
   * This is the one field that does nothing to the side elevation and almost
   * everything to the body. Without it a lofted section is as wide at the roof
   * as it is at the sill, and every vehicle in the fleet renders as a lozenge:
   * the greenhouse is what makes a car read as a car from three-quarters on,
   * and a greenhouse is a narrowing, not a height.
   */
  crown: number;
}

/** One axle: where it sits, and how wide apart its wheels are. */
export interface AxleSpec {
  /** Position along the length, in the same 0…1 as a section's `t`. */
  t: number;
  /**
   * Half-track — the lateral offset of each wheel from the centreline, in
   * metres. **0 means a single wheel on the centreline**, which is how the bike
   * gets two wheels from the same axle list every car uses.
   */
  halfTrack: number;
  /** Rolling radius, in metres. */
  radius: number;
}

/** The rotor on the one member of the family that does not touch the road. */
export interface RotorSpec {
  /** Hub height above the ground, in metres. */
  y: number;
  /** Position along the length, in the same 0…1 as a section's `t`. */
  t: number;
  /** Disc radius, in metres. */
  radius: number;
  /** Blades in the disc. */
  blades: number;
}

export interface CarBodySpec {
  /** The ride class this body belongs to. One body per class, no orphans. */
  id: RideClassId;
  /** Overall length, in metres. Sections are placed along it by their `t`. */
  length: number;
  /** Sections down the centreline, nose to tail. At least four. */
  sections: HullSection[];
  axles: AxleSpec[];
  rotor?: RotorSpec;
  /**
   * How strongly this body takes the accent, 0…1.
   *
   * The fleet is drawn in the site's ink like everything else, and the accent is
   * a *tint* on top — heaviest on the premium bodies (Black, Heli), lightest on
   * the everyday one, so the family has a visible hierarchy in every theme
   * without any body naming a colour of its own.
   */
  accent: number;
}

/*
 * No prose lives on a spec, deliberately. Everything a visitor reads about a
 * vehicle — what it is, what drives it, its tagline — is written where
 * `i18next-parser` can see a literal `defaultValue` and put the key in
 * `locales/en/`: `components/rideshare/cars/CarFamily.tsx`. A string held here
 * and passed through as a variable extracts as an EMPTY default, which serves
 * every locale (English included) an empty string. This file is geometry.
 */

/* ── The fleet ───────────────────────────────────────────────────────────────
   Read a `sections` list as a side elevation: `t` walks the car from its nose to
   its tail, `floor`/`top` are the underside and the crown at that point, and
   `halfWidth` is how far it bulges. The nose and tail stations close the surface
   (halfWidth 0), which is what makes the loft a solid rather than a tube. */

export const CAR_BODIES: CarBodySpec[] = [
  {
    id: 'RMH_X',
    length: 4.5,
    accent: 0.18,
    sections: [
      { t: 0.0, halfWidth: 0.0, top: 0.61, floor: 0.55, round: 3.2, crown: 0.05 },
      { t: 0.09, halfWidth: 0.62, top: 0.86, floor: 0.28, round: 3.6, crown: 0.08 },
      { t: 0.24, halfWidth: 0.86, top: 1.02, floor: 0.24, round: 4.0, crown: 0.14 },
      { t: 0.38, halfWidth: 0.9, top: 1.42, floor: 0.24, round: 3.4, crown: 0.3 },
      { t: 0.55, halfWidth: 0.9, top: 1.5, floor: 0.24, round: 3.2, crown: 0.32 },
      { t: 0.72, halfWidth: 0.88, top: 1.38, floor: 0.24, round: 3.6, crown: 0.28 },
      { t: 0.88, halfWidth: 0.78, top: 1.06, floor: 0.28, round: 4.0, crown: 0.16 },
      { t: 0.97, halfWidth: 0.5, top: 0.92, floor: 0.44, round: 3.4, crown: 0.08 },
      { t: 1.0, halfWidth: 0.0, top: 0.7, floor: 0.64, round: 3.0, crown: 0.05 },
    ],
    axles: [
      { t: 0.19, halfTrack: 0.78, radius: 0.32 },
      { t: 0.82, halfTrack: 0.78, radius: 0.32 },
    ],
  },
  {
    id: 'RMH_BIKE',
    length: 1.9,
    accent: 0.34,
    // Read the sections as the frame itself rather than as a body panel: the
    // hull starts at the bar ends, drops down the stem, runs low along the deck
    // between the wheels, and climbs again into the saddle. A lofted surface is
    // one closed tube, so it cannot draw the open triangle of a real frame —
    // this is the shape that IS one tube and still reads as something you ride.
    sections: [
      { t: 0.0, halfWidth: 0.0, top: 1.05, floor: 0.99, round: 2.0, crown: 0.0 },
      { t: 0.07, halfWidth: 0.15, top: 1.08, floor: 0.74, round: 2.2, crown: 0.0 },
      { t: 0.16, halfWidth: 0.1, top: 0.94, floor: 0.56, round: 2.4, crown: 0.0 },
      { t: 0.34, halfWidth: 0.11, top: 0.56, floor: 0.32, round: 2.6, crown: 0.0 },
      { t: 0.52, halfWidth: 0.13, top: 0.54, floor: 0.3, round: 2.6, crown: 0.0 },
      { t: 0.68, halfWidth: 0.14, top: 0.74, floor: 0.34, round: 2.4, crown: 0.0 },
      { t: 0.8, halfWidth: 0.17, top: 0.96, floor: 0.46, round: 2.2, crown: 0.0 },
      { t: 0.92, halfWidth: 0.14, top: 0.94, floor: 0.7, round: 2.2, crown: 0.0 },
      { t: 1.0, halfWidth: 0.0, top: 0.9, floor: 0.84, round: 2.0, crown: 0.0 },
    ],
    axles: [
      { t: 0.03, halfTrack: 0, radius: 0.34 },
      { t: 0.97, halfTrack: 0, radius: 0.34 },
    ],
  },
  {
    id: 'RMH_XL',
    length: 5.3,
    accent: 0.2,
    sections: [
      { t: 0.0, halfWidth: 0.0, top: 0.74, floor: 0.68, round: 4.0, crown: 0.05 },
      { t: 0.07, halfWidth: 0.72, top: 1.06, floor: 0.34, round: 4.4, crown: 0.08 },
      { t: 0.18, halfWidth: 0.98, top: 1.28, floor: 0.3, round: 5.0, crown: 0.1 },
      { t: 0.3, halfWidth: 1.02, top: 1.86, floor: 0.3, round: 4.6, crown: 0.14 },
      { t: 0.5, halfWidth: 1.04, top: 1.94, floor: 0.3, round: 5.2, crown: 0.12 },
      { t: 0.72, halfWidth: 1.04, top: 1.92, floor: 0.3, round: 5.4, crown: 0.12 },
      { t: 0.9, halfWidth: 1.0, top: 1.86, floor: 0.32, round: 5.6, crown: 0.12 },
      { t: 0.98, halfWidth: 0.74, top: 1.7, floor: 0.42, round: 4.8, crown: 0.08 },
      { t: 1.0, halfWidth: 0.0, top: 1.03, floor: 0.97, round: 4.0, crown: 0.05 },
    ],
    axles: [
      { t: 0.16, halfTrack: 0.88, radius: 0.38 },
      { t: 0.85, halfTrack: 0.88, radius: 0.38 },
    ],
  },
  {
    id: 'RMH_COMFORT',
    length: 4.9,
    accent: 0.24,
    sections: [
      { t: 0.0, halfWidth: 0.0, top: 0.58, floor: 0.52, round: 3.4, crown: 0.05 },
      { t: 0.08, halfWidth: 0.66, top: 0.82, floor: 0.26, round: 3.8, crown: 0.08 },
      { t: 0.22, halfWidth: 0.92, top: 0.96, floor: 0.22, round: 4.2, crown: 0.14 },
      { t: 0.36, halfWidth: 0.94, top: 1.36, floor: 0.22, round: 3.6, crown: 0.32 },
      { t: 0.54, halfWidth: 0.94, top: 1.44, floor: 0.22, round: 3.4, crown: 0.34 },
      { t: 0.7, halfWidth: 0.92, top: 1.34, floor: 0.22, round: 3.8, crown: 0.3 },
      { t: 0.84, halfWidth: 0.88, top: 1.0, floor: 0.26, round: 4.4, crown: 0.16 },
      { t: 0.97, halfWidth: 0.62, top: 0.94, floor: 0.42, round: 3.8, crown: 0.08 },
      { t: 1.0, halfWidth: 0.0, top: 0.7, floor: 0.64, round: 3.2, crown: 0.05 },
    ],
    axles: [
      { t: 0.18, halfTrack: 0.8, radius: 0.34 },
      { t: 0.84, halfTrack: 0.8, radius: 0.34 },
    ],
  },
  {
    id: 'RMH_GREEN',
    length: 4.6,
    accent: 0.3,
    sections: [
      { t: 0.0, halfWidth: 0.0, top: 0.67, floor: 0.61, round: 3.0, crown: 0.06 },
      { t: 0.06, halfWidth: 0.7, top: 1.06, floor: 0.26, round: 3.4, crown: 0.1 },
      { t: 0.16, halfWidth: 0.9, top: 1.32, floor: 0.22, round: 3.2, crown: 0.18 },
      { t: 0.32, halfWidth: 0.94, top: 1.52, floor: 0.22, round: 3.0, crown: 0.26 },
      { t: 0.52, halfWidth: 0.94, top: 1.56, floor: 0.22, round: 3.0, crown: 0.26 },
      { t: 0.72, halfWidth: 0.92, top: 1.48, floor: 0.22, round: 3.2, crown: 0.24 },
      { t: 0.9, halfWidth: 0.84, top: 1.22, floor: 0.26, round: 3.6, crown: 0.16 },
      { t: 0.98, halfWidth: 0.56, top: 1.02, floor: 0.42, round: 3.2, crown: 0.08 },
      { t: 1.0, halfWidth: 0.0, top: 0.73, floor: 0.67, round: 2.8, crown: 0.05 },
    ],
    axles: [
      { t: 0.14, halfTrack: 0.8, radius: 0.34 },
      { t: 0.87, halfTrack: 0.8, radius: 0.34 },
    ],
  },
  {
    id: 'RMH_BLACK',
    length: 5.2,
    accent: 0.42,
    sections: [
      { t: 0.0, halfWidth: 0.0, top: 0.53, floor: 0.47, round: 3.6, crown: 0.05 },
      { t: 0.07, halfWidth: 0.7, top: 0.76, floor: 0.22, round: 4.2, crown: 0.08 },
      { t: 0.24, halfWidth: 0.96, top: 0.9, floor: 0.18, round: 4.8, crown: 0.14 },
      { t: 0.4, halfWidth: 0.98, top: 1.3, floor: 0.18, round: 3.8, crown: 0.34 },
      { t: 0.56, halfWidth: 0.98, top: 1.38, floor: 0.18, round: 3.6, crown: 0.36 },
      { t: 0.72, halfWidth: 0.96, top: 1.26, floor: 0.18, round: 4.2, crown: 0.32 },
      { t: 0.88, halfWidth: 0.9, top: 0.94, floor: 0.22, round: 4.8, crown: 0.16 },
      { t: 0.98, halfWidth: 0.6, top: 0.88, floor: 0.4, round: 4.0, crown: 0.08 },
      { t: 1.0, halfWidth: 0.0, top: 0.66, floor: 0.6, round: 3.4, crown: 0.05 },
    ],
    axles: [
      { t: 0.2, halfTrack: 0.82, radius: 0.36 },
      { t: 0.83, halfTrack: 0.82, radius: 0.36 },
    ],
  },
  {
    id: 'RMH_HELI',
    length: 6.4,
    accent: 0.5,
    // A pod and a boom, which is why the halfWidth collapses so hard after the
    // cabin: everything from t = 0.5 back is a 45 cm tube with a fin on the end.
    sections: [
      { t: 0.0, halfWidth: 0.0, top: 1.15, floor: 1.09, round: 2.0, crown: 0.05 },
      { t: 0.05, halfWidth: 0.52, top: 1.5, floor: 0.6, round: 2.2, crown: 0.1 },
      { t: 0.16, halfWidth: 0.86, top: 1.94, floor: 0.5, round: 2.4, crown: 0.18 },
      { t: 0.3, halfWidth: 0.9, top: 2.08, floor: 0.52, round: 2.6, crown: 0.2 },
      { t: 0.44, halfWidth: 0.72, top: 2.0, floor: 0.86, round: 2.6, crown: 0.18 },
      { t: 0.56, halfWidth: 0.3, top: 1.86, floor: 1.42, round: 2.4, crown: 0.1 },
      { t: 0.72, halfWidth: 0.22, top: 1.78, floor: 1.48, round: 2.2, crown: 0.06 },
      { t: 0.88, halfWidth: 0.2, top: 1.76, floor: 1.5, round: 2.2, crown: 0.06 },
      { t: 0.95, halfWidth: 0.16, top: 2.12, floor: 1.54, round: 2.2, crown: 0.05 },
      // The loft closes at the TOP of the fin, so the boom's underside sweeps up
      // to meet it — a tail that ends in a blade rather than a stump.
      { t: 1.0, halfWidth: 0.0, top: 2.15, floor: 2.09, round: 2.0, crown: 0.05 },
    ],
    // Skids, not wheels: a pair of narrow rollers under the pod that read as
    // skid feet, since an "axle" of zero radius would draw nothing at all.
    axles: [
      { t: 0.18, halfTrack: 0.8, radius: 0.19 },
      { t: 0.42, halfTrack: 0.8, radius: 0.19 },
    ],
    rotor: { y: 2.62, t: 0.35, radius: 2.45, blades: 5 },
  },
];

const BODY_BY_ID = new Map<RideClassId, CarBodySpec>(CAR_BODIES.map((b) => [b.id, b]));

/** The body for a ride class, or `undefined` if that class has none. */
export function getCarBody(id: string): CarBodySpec | undefined {
  return BODY_BY_ID.get(id as RideClassId);
}

/**
 * The longest body in the fleet, in metres.
 *
 * Used for the stage's ground ring, which is the footprint the family stands on.
 */
export const FLEET_LENGTH = CAR_BODIES.reduce((m, b) => Math.max(m, b.length), 0);

/**
 * The furthest any body reaches from the turntable's axis, in metres — the
 * helicopter's rotor tip, not the longest car.
 *
 * The stage frames on this rather than on each vehicle's own size, which is what
 * keeps the family to scale: pick RMH-Bike after RMH-Heli and the bike is
 * genuinely tiny on screen, because it is.
 */
export const FLEET_RADIUS = CAR_BODIES.reduce(
  (m, b) =>
    Math.max(
      m,
      b.length / 2,
      b.rotor ? Math.abs(b.length * (0.5 - b.rotor.t)) + b.rotor.radius : 0,
    ),
  0,
);

/** The tallest point in the fleet above the ground, in metres — the rotor mast. */
export const FLEET_HEIGHT = CAR_BODIES.reduce(
  (m, b) =>
    Math.max(
      m,
      b.rotor ? b.rotor.y : 0,
      b.sections.reduce((h, s) => Math.max(h, s.top), 0),
    ),
  0,
);
