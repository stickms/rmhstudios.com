import { describe, expect, it } from 'vitest';

import { MEGAPHONE_RANGE, VOICE_RANGE } from '../constants';
import { audibility, boothAt, garble, terrainOcclusion } from '../world/audio';
import { COLLIDERS, growScatter, regionAt, resolveCollisions, STRUCTURES } from '../world/regions';
import {
  PUZZLE_SITES,
  RADIO_LOCAL_RANGE,
  SITE_MAST_HEIGHT,
  siteMarker,
  TOWERS,
  TOTAL_ORBS,
  TOTAL_THRESHOLD,
} from '../world/sites';
import { clampToLand, groundY, isWater, PADS, raycastGround, SEA_LEVEL } from '../world/terrain';
import { PLAYER_RADIUS } from '../constants';

/**
 * The island, as a set of promises.
 *
 * These are not "does the maths run" tests. Each one pins a property the game
 * would be broken without and that no type can express: that every building site
 * is above water, that a booth wall is a wall, that a radio needs one at both
 * ends, and that there are more red rounds on the island than the towers ask for.
 */

describe('terrain', () => {
  it('puts every levelled building site on dry land', () => {
    for (const pad of PADS) {
      expect(isWater(pad.x, pad.z), `${pad.id} is in the sea`).toBe(false);
      expect(groundY(pad.x, pad.z), `${pad.id} is below the waterline`).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it('levels each pad to within a few centimetres of its stated height', () => {
    // The whole reason pads exist: a puzzle installation on a slope is not a
    // puzzle. A metre of drift here means pressure pads at different heights.
    for (const pad of PADS) {
      expect(Math.abs(groundY(pad.x, pad.z) - pad.y), `${pad.id} drifted`).toBeLessThan(0.05);
    }
  });

  it('is deterministic — the same point is the same height every time', () => {
    // Everything downstream assumes this: the server derives pad occupancy from
    // it, the client builds a mesh from it, and the laser traces against it.
    for (const [x, z] of [
      [0, 0],
      [123.4, -87.6],
      [-300, 210],
      [42, 42],
    ]) {
      expect(groundY(x, z)).toBe(groundY(x, z));
    }
  });

  it('walks a position in the sea back onto the beach', () => {
    const wet = { x: 0, z: 470 };
    expect(isWater(wet.x, wet.z)).toBe(true);
    const dry = clampToLand(wet.x, wet.z);
    expect(isWater(dry.x, dry.z)).toBe(false);
  });

  it('leaves a position already on land exactly where it was', () => {
    const spot = PADS[0];
    const clamped = clampToLand(spot.x, spot.z);
    expect(clamped.x).toBe(spot.x);
    expect(clamped.z).toBe(spot.z);
  });

  it('traces a downward ray onto the ground and misses when aimed at the sky', () => {
    const origin = { x: 0, y: groundY(0, 250) + 40, z: 250 };
    const down = raycastGround(origin, { x: 0, y: -1, z: 0 }, 200);
    expect(down).not.toBeNull();
    expect(Math.abs(down!.y - groundY(0, 250))).toBeLessThan(0.2);

    expect(raycastGround(origin, { x: 0, y: 1, z: 0 }, 200)).toBeNull();
  });
});

describe('collision', () => {
  it('keeps a player out of every solid', () => {
    for (const collider of COLLIDERS) {
      if (collider.kind !== 'circle') continue;
      // Start dead centre — the worst case for a push-out.
      const out = resolveCollisions(collider.x, collider.z, PLAYER_RADIUS);
      const distance = Math.hypot(out.x - collider.x, out.z - collider.z);
      expect(distance).toBeGreaterThanOrEqual(collider.r + PLAYER_RADIUS - 0.001);
    }
  });

  it('lets you through a booth doorway and not through its wall', () => {
    const ring = COLLIDERS.find((c) => c.kind === 'ring');
    expect(ring, 'the island has no booths').toBeDefined();
    if (ring?.kind !== 'ring') return;

    // In the doorway: untouched.
    const doorX = ring.x + Math.cos(ring.door) * ring.r;
    const doorZ = ring.z + Math.sin(ring.door) * ring.r;
    const throughDoor = resolveCollisions(doorX, doorZ, PLAYER_RADIUS);
    expect(Math.hypot(throughDoor.x - doorX, throughDoor.z - doorZ)).toBeLessThan(0.01);

    // Opposite the doorway, standing in the wall: pushed clear of it.
    const wallAngle = ring.door + Math.PI;
    const wallX = ring.x + Math.cos(wallAngle) * ring.r;
    const wallZ = ring.z + Math.sin(wallAngle) * ring.r;
    const pushed = resolveCollisions(wallX, wallZ, PLAYER_RADIUS);
    const offset = Math.abs(Math.hypot(pushed.x - ring.x, pushed.z - ring.z) - ring.r);
    expect(offset).toBeGreaterThan(ring.half);
  });

  it('recognises the inside of a booth as a booth', () => {
    const ring = COLLIDERS.find((c) => c.kind === 'ring');
    if (ring?.kind !== 'ring') return;
    expect(boothAt(ring.x, ring.z)).not.toBeNull();
    // Well outside it, you are in the open.
    expect(boothAt(ring.x + ring.r * 4, ring.z)).toBeNull();
  });
});

describe('who can hear whom', () => {
  const open = (x: number, z: number, extra: Partial<Parameters<typeof audibility>[0]> = {}) => ({
    x,
    z,
    y: 1.6,
    hasRadio: false,
    hasMegaphone: false,
    booth: null as string | null,
    ...extra,
  });

  // A flat, empty stretch of the Saltpan: no hills, no walls, so the tests
  // below measure the distance rule rather than the terrain.
  const A = -246;
  const B = 196;

  it('is clear up close and silent far away', () => {
    const near = audibility(open(A, B), open(A + 3, B), { repeater: false, channel: 'near' });
    expect(near.audible).toBe(true);
    expect(near.gain).toBeGreaterThan(0.9);

    const far = audibility(open(A, B), open(A + VOICE_RANGE + 15, B), {
      repeater: false,
      channel: 'near',
    });
    expect(far.audible).toBe(false);
    expect(far.blockedBy).toBe('range');
  });

  it('gets quieter with distance rather than cutting out', () => {
    const close = audibility(open(A, B), open(A + 12, B), { repeater: false, channel: 'near' });
    const further = audibility(open(A, B), open(A + 24, B), { repeater: false, channel: 'near' });
    expect(further.gain).toBeLessThan(close.gain);
    expect(further.audible).toBe(true);
  });

  it('blocks speech between inside and outside a booth', () => {
    const inside = open(A, B, { booth: 'a-booth' });
    const outside = open(A + 2, B);
    expect(audibility(inside, outside, { repeater: false, channel: 'near' }).blockedBy).toBe('booth');
    // Two people in the same booth hear each other perfectly well.
    const alsoInside = open(A + 1, B, { booth: 'a-booth' });
    expect(audibility(inside, alsoInside, { repeater: false, channel: 'near' }).audible).toBe(true);
  });

  it('needs a radio at BOTH ends', () => {
    const withRadio = open(A, B, { hasRadio: true });
    const without = open(A + 100, B);
    expect(audibility(withRadio, without, { repeater: false, channel: 'radio' }).blockedBy).toBe(
      'no-radio',
    );
    const alsoRadio = open(A + 100, B, { hasRadio: true });
    expect(audibility(withRadio, alsoRadio, { repeater: false, channel: 'radio' }).audible).toBe(true);
  });

  it('gets radios through walls, which is what they are for', () => {
    const inBooth = open(A, B, { hasRadio: true, booth: 'a-booth' });
    const outside = open(A + 40, B, { hasRadio: true });
    expect(audibility(inBooth, outside, { repeater: false, channel: 'radio' }).audible).toBe(true);
  });

  it('limits radios to the local range until the repeater is up', () => {
    const here = open(A, B, { hasRadio: true });
    const miles = open(A + RADIO_LOCAL_RANGE + 60, B, { hasRadio: true });
    expect(audibility(here, miles, { repeater: false, channel: 'radio' }).audible).toBe(false);
    expect(audibility(here, miles, { repeater: true, channel: 'radio' }).audible).toBe(true);
  });

  it('carries a megaphone much further than a voice, and no further than its range', () => {
    const shouter = open(A, B, { hasMegaphone: true });
    const listener = open(A + VOICE_RANGE * 2, B);
    expect(audibility(shouter, listener, { repeater: false, channel: 'megaphone' }).audible).toBe(true);
    const tooFar = open(A + MEGAPHONE_RANGE + 30, B);
    expect(audibility(shouter, tooFar, { repeater: false, channel: 'megaphone' }).audible).toBe(false);
  });

  it('finds the ridge between two people on opposite sides of it', () => {
    // The Granite Spine runs across the north; a pair straddling it should not
    // have clear line of sight.
    const north = { x: 0, z: -300, y: 1.6, hasRadio: false, hasMegaphone: false, booth: null };
    const south = { x: 0, z: -120, y: 1.6, hasRadio: false, hasMegaphone: false, booth: null };
    expect(terrainOcclusion(north, south)).toBeGreaterThan(0.5);
  });
});

describe('garbling', () => {
  it('leaves a clear message alone', () => {
    expect(garble('meet me at the yellow tower', 0.1, 7)).toBe('meet me at the yellow tower');
  });

  it('is deterministic, so two listeners can compare what they heard', () => {
    const a = garble('meet me at the yellow tower', 0.6, 42);
    const b = garble('meet me at the yellow tower', 0.6, 42);
    expect(a).toBe(b);
    expect(a).not.toBe('meet me at the yellow tower');
  });

  it('keeps the first letter of a word it eats', () => {
    const out = garble('yellow', 0.9, 3);
    expect(out.startsWith('y')).toBe(true);
  });
});

describe('the authored world', () => {
  it('produces more red rounds than the towers ask for', () => {
    // Slack is deliberate: a group that cannot finish a site should not find the
    // campaign mathematically unfinishable because of it.
    expect(TOTAL_ORBS).toBeGreaterThan(TOTAL_THRESHOLD);
  });

  it('gives every site a home region and a sign', () => {
    const regionIds = new Set(['tidal-landing', 'banksia-flats', 'gumtree-gully', 'granite-spine', 'saltpan', 'quiet-basin']);
    for (const site of PUZZLE_SITES) {
      expect(regionIds.has(site.region), `${site.id} has no region`).toBe(true);
      expect(site.sign.length, `${site.id} has no sign`).toBeGreaterThan(0);
      expect(site.reward, `${site.id} pays nothing`).toBeGreaterThan(0);
    }
  });

  it('never lights more elements than a site has', () => {
    for (const site of PUZZLE_SITES) {
      for (const variant of ['duo', 'trio', 'band'] as const) {
        const crew = site.crew[variant];
        expect(crew, `${site.id}/${variant} needs nobody`).toBeGreaterThanOrEqual(2);
        if (site.pads) expect(crew, `${site.id}/${variant} wants more pads than exist`).toBeLessThanOrEqual(site.pads.length);
      }
    }
  });

  it('scales with the crew rather than staying fixed', () => {
    // Adaptive variants are a headline feature; a world where every site wanted
    // the same number of people in all three would be a bug nobody would see.
    const scaling = PUZZLE_SITES.filter((site) => site.crew.band > site.crew.duo);
    expect(scaling.length).toBeGreaterThan(4);
  });

  it('puts each tower somewhere a person can stand', () => {
    for (const tower of TOWERS) {
      expect(isWater(tower.x, tower.z), `${tower.id} is offshore`).toBe(false);
    }
  });

  it('grows the same forest every time, and keeps it out of the sea', () => {
    const first = growScatter();
    const second = growScatter();
    expect(first.length).toBe(second.length);
    expect(first.length).toBeGreaterThan(500);
    expect(first[0]).toEqual(second[0]);
    for (const item of first) {
      expect(isWater(item.x, item.z)).toBe(false);
    }
  });

  it('names a region for the landing beach', () => {
    expect(regionAt(0, 292)?.id).toBe('tidal-landing');
  });

  it('gives every landmark structure a colour that is not the terrain', () => {
    const named = STRUCTURES.filter((s) => s.landmark);
    expect(named.length).toBeGreaterThan(6);
    for (const structure of named) {
      expect(structure.color.startsWith('#')).toBe(true);
    }
  });
});

describe('finding a site at all', () => {
  /**
   * Eight of the twelve installations had nothing above the 3.15m sign at their
   * edge — readable at forty metres, invisible at two hundred. The one tall
   * marker they had was the red flag, and it went up on COMPLETION, so the
   * island handed you the landmark exactly when you had finished needing it.
   *
   * These pin the mast to being unconditional. The game is a walk toward things
   * you can see (§7); a marker that only appears once you no longer need it is
   * the same as no marker.
   */

  it('marks a site you have not finished exactly as tall as one you have', () => {
    expect(siteMarker(false).height).toBe(siteMarker(true).height);
  });

  it('keeps red for done, so the existing signal still means what it did', () => {
    expect(siteMarker(true).flag).toBe('done');
    expect(siteMarker(false).flag).toBe('open');
  });

  it('stands well clear of the sign it has to be seen past', () => {
    // The sign is a 2.2m post carrying a board centred at 2.5m — about 3.15m to
    // its top. A marker worth walking toward is not a marker the size of that.
    expect(SITE_MAST_HEIGHT).toBeGreaterThan(3.15 * 2);
  });

  it('does not out-rank the towers you navigate the island by', () => {
    // The four towers are 34–52m and are the coarse compass. A site mast is a
    // local landmark, not competition for them.
    const towerHeights = STRUCTURES.filter((s) => s.landmark && s.h >= 26).map((s) => s.h);
    expect(towerHeights.length).toBeGreaterThan(3);
    expect(SITE_MAST_HEIGHT).toBeLessThan(Math.min(...towerHeights));
  });

  it('plants one at every site, on dry land, above the waterline', () => {
    for (const site of PUZZLE_SITES) {
      expect(isWater(site.x, site.z), `${site.id} mast is in the sea`).toBe(false);
      expect(groundY(site.x, site.z) + SITE_MAST_HEIGHT).toBeGreaterThan(SEA_LEVEL + 3.15 * 2);
    }
  });
});
