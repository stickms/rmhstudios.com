// @vitest-environment node
/**
 * The cosmos (amendment 2026-10-18): where it runs, that it arrives and leaves continuously with the timeline's
 * channels and is exactly absent at the flat endpoints, that it uses the long axis of any viewport, that no body
 * is ever drawn in front of the globe until the system is fully present, and that a frame allocates nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  COSMOS_MAX_BODIES,
  buildCosmos,
  cosmosArrival,
  cosmosDeparture,
  cosmosEnabled,
  cosmosPresence,
  createCosmosFrame,
  stepCosmos,
} from '../cosmos';
import { GLOBE_RADIUS_FRACTION, LIGHT_DIRECTION } from '../constants';
import { createSnapshot } from '../snapshot';
import type { ThemeColours, TimelineSnapshot, Viewport } from '../types';

const DARK: ThemeColours = {
  bg: [0.04, 0.05, 0.08, 1],
  veil: [0.07, 0.08, 0.12, 1],
  accent: [0.38, 0.55, 1, 1],
  cageMinor: [0.7, 0.8, 1, 0.2],
  cageParallel: [0.7, 0.8, 1, 0.13],
  cageMajor: [0.8, 0.9, 1, 0.34],
  cageRipple: [0.6, 0.85, 1, 0.8],
  cageWidth: 1,
};
const LIGHT: ThemeColours = { ...DARK, veil: [0.92, 0.93, 0.95, 1], bg: [0.98, 0.98, 0.99, 1] };
const DESKTOP: Viewport = { w: 1440, h: 900, dpr: 1 };

const snap = (patch: Partial<TimelineSnapshot>): TimelineSnapshot => ({
  ...createSnapshot(),
  radius: 0.44 * 900,
  centreX: 720,
  centreY: 450,
  ...patch,
});

describe('where the cosmos runs', () => {
  it('large screens on mid and high, never low, never a phone', () => {
    expect(cosmosEnabled(DESKTOP, 'high')).toBe(true);
    expect(cosmosEnabled(DESKTOP, 'mid')).toBe(true);
    expect(cosmosEnabled(DESKTOP, 'low')).toBe(false);
    expect(cosmosEnabled({ w: 390, h: 844, dpr: 3 }, 'high')).toBe(false);
    expect(cosmosEnabled({ w: 834, h: 1194, dpr: 2 }, 'high')).toBe(true);
    expect(buildCosmos(DESKTOP, 'low', DARK)).toBeNull();
  });
});

describe('presence follows the channels', () => {
  it('is exactly 0 at both flat endpoints and 1 on the steady sphere', () => {
    expect(cosmosPresence(snap({ wrap: 0, unwrap: 1 }))).toBe(0);
    expect(cosmosPresence(snap({ wrap: 1, unwrap: 0 }))).toBe(0);
    expect(cosmosPresence(snap({ wrap: 1, unwrap: 1 }))).toBe(1);
  });

  it('is continuous and flat-ended (no step, no kink) through arrival and departure', () => {
    const N = 2000;
    let prev = cosmosArrival(snap({ wrap: 0 }));
    let maxStep = 0;
    for (let i = 1; i <= N; i++) {
      const v = cosmosArrival(snap({ wrap: i / N }));
      maxStep = Math.max(maxStep, Math.abs(v - prev));
      prev = v;
    }
    // A quintic over 45% of the channel: its steepest step at this resolution is ~1.875 / (0.45 N).
    expect(maxStep).toBeLessThan(2.1 / (0.45 * N));
    const h = 1e-4;
    // Zero slope where it starts and stops.
    expect(cosmosArrival(snap({ wrap: 0.55 + h }))).toBeLessThan(1e-9);
    expect(1 - cosmosArrival(snap({ wrap: 1 - h }))).toBeLessThan(1e-9);
    expect(cosmosDeparture(snap({ unwrap: 0.55 + h }))).toBeLessThan(1e-9);
  });
});

describe('the frame', () => {
  it('with no scene: zero presence, the original fixed light', () => {
    const out = createCosmosFrame();
    stepCosmos(null, snap({ wrap: 1 }), DESKTOP, out);
    expect(out.presence).toBe(0);
    expect(out.count).toBe(0);
    const len = Math.hypot(...LIGHT_DIRECTION);
    expect(out.lightDir[0]).toBeCloseTo(LIGHT_DIRECTION[0] / len, 6);
    expect(out.lightDir[2]).toBeCloseTo(LIGHT_DIRECTION[2] / len, 6);
    expect(out.space[3]).toBe(0);
  });

  it('at the flat endpoints the scene draws nothing in front and lights the globe as before', () => {
    const scene = buildCosmos(DESKTOP, 'high', DARK)!;
    const out = createCosmosFrame();
    for (const s of [snap({ wrap: 0 }), snap({ wrap: 1, unwrap: 0 })]) {
      stepCosmos(scene, s, DESKTOP, out);
      expect(out.presence).toBe(0);
      for (let i = 0; i < out.count; i++) expect(out.info[i * 4 + 3]).toBe(0);
      expect(out.space[3]).toBe(0);
    }
  });

  it('sorts back to front and splits at the globe plane; front bodies only at full presence', () => {
    const scene = buildCosmos(DESKTOP, 'high', DARK)!;
    const out = createCosmosFrame();
    for (let t = 0; t < 4600; t += 37) {
      for (const wrap of [0.7, 0.85, 1]) {
        stepCosmos(scene, snap({ t, wrap }), DESKTOP, out);
        expect(out.count).toBe(COSMOS_MAX_BODIES);
        for (let i = 1; i < out.count; i++) {
          expect(out.pos[i * 4 + 2]!).toBeGreaterThanOrEqual(out.pos[(i - 1) * 4 + 2]!);
        }
        for (let i = 0; i < out.count; i++) {
          const front = i >= out.behind;
          expect(out.pos[i * 4 + 2]! > 0).toBe(front);
          if (front && out.presence < 0.6) expect(out.info[i * 4 + 3]).toBe(0);
        }
      }
    }
  });

  it('uses the long axis of any viewport: orbits reach the long edge, the inner ones clear the globe', () => {
    for (const viewport of [
      DESKTOP,
      { w: 2560, h: 1080, dpr: 1 },
      { w: 834, h: 1194, dpr: 2 },
      { w: 1100, h: 1000, dpr: 1 },
    ]) {
      const scene = buildCosmos(viewport, 'high', DARK)!;
      const long = Math.max(viewport.w, viewport.h);
      const r0 = GLOBE_RADIUS_FRACTION * Math.min(viewport.w, viewport.h);
      const planets = scene.orbiters.filter((o) => o.parent < 0);
      expect(Math.min(...planets.map((o) => o.a))).toBeGreaterThan(1.38 * r0);
      expect(Math.max(...planets.map((o) => o.a))).toBeGreaterThanOrEqual(0.5 * long);
      expect(scene.portrait).toBe(viewport.h > viewport.w);
    }
  });

  it('a dark theme gets a starfield and deep space; a light one stays light', () => {
    const dark = buildCosmos(DESKTOP, 'high', DARK)!;
    const light = buildCosmos(DESKTOP, 'high', LIGHT)!;
    expect(dark.stars).toBeGreaterThan(0.6);
    expect(light.stars).toBeLessThan(0.05);
    expect(dark.spaceAmount).toBeGreaterThan(light.spaceAmount * 4);
  });

  it('the frame governor budget eases the whole system out (0 = gone, the fixed light back)', () => {
    const scene = buildCosmos(DESKTOP, 'high', DARK)!;
    const out = createCosmosFrame();
    stepCosmos(scene, snap({ wrap: 1 }), DESKTOP, out, 0.5);
    expect(out.presence).toBeCloseTo(0.5, 6);
    stepCosmos(scene, snap({ wrap: 1 }), DESKTOP, out, 0);
    expect(out.presence).toBe(0);
    for (let i = 0; i < out.count; i++) expect(out.info[i * 4 + 3]).toBe(0);
    const len = Math.hypot(...LIGHT_DIRECTION);
    expect(out.lightDir[0]).toBeCloseTo(LIGHT_DIRECTION[0] / len, 6);
  });

  it('the globe light turns toward the sun with presence and stays a unit vector', () => {
    const scene = buildCosmos(DESKTOP, 'high', DARK)!;
    const out = createCosmosFrame();
    stepCosmos(scene, snap({ wrap: 1 }), DESKTOP, out);
    expect(Math.hypot(out.lightDir[0]!, out.lightDir[1]!, out.lightDir[2]!)).toBeCloseTo(1, 5);
    // The primary sun is to the upper left: the light comes from the left, with a frontal component.
    expect(out.lightDir[0]).toBeLessThan(0);
    expect(out.lightDir[2]).toBeGreaterThan(0.3);
  });
});
