/**
 * h1_whiteout — Chapter 1, "Whiteout" (plan H4.1; story.md). The Calder Trust survey plane has gone
 * down near the coordinates. Ines wakes in the wreck, pries the bent hatch open and walks east
 * through a blizzard to the edge of Meridian Recovery's post. No enemies: the cold is the pressure.
 *
 *   x →  0       640        3200       4400-4900     6000      6500──8000──8950     9200        9760
 *        wreck   marker     survey     pressure      supply    long climb  descent  perimeter   the ship
 *        (hatch) poles,wind hut+heater ridge         cache     to the summit        fence+gate  (flickers)
 *
 * Beats: 1 wreck (dark, floor tilted; pry bar; the hatch) · 2 the blizzard (cold drains, first hint)
 * · 3 poles to the survey hut (heater, Odile) · 4 open ice, the ridge, the supply cache · 5 the
 * summit: the Saint Ilse flickers over the ice, timed to the radio · 6 the perimeter fence. The
 * chapter ends at the gate (`chapter_end`, fired when the last radio scene finishes).
 *
 * The ship is a `func_brush` (never solid, `StartDisabled`) the radio scene enables and disables in
 * a flicker; it is seen through the same fog as the ground, so it is a pale, thin shape.
 *
 * Source units (inches), Z up. Pure data: no DOM. Every number is a named constant.
 */
import type { Vec3 } from '../../tf2-game/core/vec';
import {
  box,
  prism,
  ramp,
  room,
  v3,
  wedge,
  type BrushSource,
  type EntitySource,
  type LevelSource,
  type PlaneSource,
} from '../compiler';
import { modelPath } from '../assets/models/info';

const SNOW = 'harmonic/snow';
const ICE = 'harmonic/ice';
const ROCK = 'harmonic/concrete';
const STEEL = 'harmonic/steel_plate';
const RUST = 'harmonic/steel_rust';
const OLD = 'harmonic/paint_white_1971';
const NEW = 'harmonic/paint_white_2030';
const WOOD = 'harmonic/wood_deck';
const GRATING = 'harmonic/grating';
const HAZARD = 'harmonic/hazard_stripe';
const NODRAW = 'harmonic/nodraw';

/** The world's extent. */
const WORLD = { min: v3(-200, -1800, 0), max: v3(11000, 1800, 4200) };

/** Waypoints and boxes the test and the level share. */
export const H1 = {
  start: v3(60, 0, 4),
  /** The wreck interior: x 0..560, floor tilted up to `WRECK_TILT` at the east end. */
  wreck: { min: v3(0, -80, 0), max: v3(560, 80, 120) },
  prybar: v3(220, -40, 8),
  hatch: { min: v3(560, -32, 0), max: v3(576, 32, 110) },
  hut: { min: v3(3200, -130, 0), max: v3(3520, 130, 120) },
  heater: v3(3440, 60, 0),
  ridge: { from: 4400, crest: [4620, 4700] as const, to: 4920, height: 110 },
  cache: { min: v3(6000, -110, 0), max: v3(6300, 110, 120) },
  ammo: v3(6180, 60, 0),
  summit: { from: 8000, to: 8350, height: 150 },
  fenceX: 9200,
  gate: { halfWidth: 60 },
  /** The ship: hull axis along Y, seen broadside from the lane. */
  ship: { x: 9900, y0: -1000, y1: 600 },
  /** The critical path, in order. */
  path: [
    v3(60, 0, 4),
    v3(520, 0, 27),
    v3(700, 0, 0),
    v3(1500, 0, 0),
    v3(3150, 0, 0),
    v3(3350, 0, 0),
    v3(3600, 0, 0),
    v3(4300, 0, 0),
    v3(4660, 0, 110),
    v3(5000, 0, 0),
    v3(5950, 0, 0),
    v3(6150, 0, 0),
    v3(6400, 0, 0),
    v3(8100, 0, 150),
    v3(8800, 0, 40),
    v3(9120, 0, 0),
  ],
};

const WRECK_TILT = 28;
/** Fog: a blizzard close in, thin enough to read the ship at the fence's far side. */
const FOG = { color: [214, 224, 236] as [number, number, number], start: 100, end: 3200, max: 0.94 };

// ─── helpers ─────────────────────────────────────────────────────────────────────────────────

const model = (
  name: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  keys: Record<string, string> = {},
): EntitySource => ({
  classname: 'prop_dynamic',
  origin: v3(x, y, z),
  angles: v3(0, yaw, 0),
  keys: { model: modelPath(name), ...keys },
});

/** A prop plus an invisible solid footprint, so the player cannot walk through it. */
function solidProp(
  name: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  half: [number, number],
  height: number,
): { entity: EntitySource; collide: BrushSource } {
  return {
    entity: model(name, x, y, z, yaw),
    collide: box(v3(x - half[0], y - half[1], z), v3(x + half[0], y + half[1], z + height), NODRAW),
  };
}

function volume(name: string, min: Vec3, max: Vec3, outputs: string[], once = true): EntitySource {
  return {
    classname: once ? 'trigger_once' : 'trigger_multiple',
    keys: { targetname: name, spawnflags: '1', ...(once ? {} : { wait: '0.1' }) },
    brushes: [box(min, max, NODRAW)],
    outputs,
  };
}

function exposure(
  name: string,
  mode: string,
  min: Vec3,
  max: Vec3,
  extra: Record<string, string> = {},
): EntitySource {
  return {
    classname: 'trigger_harmonic_exposure',
    keys: { targetname: name, mode, ...extra },
    brushes: [box(min, max, NODRAW)],
  };
}

const dialogue = (name: string, script: string, outputs: string[] = []): EntitySource => ({
  classname: 'harmonic_dialogue',
  keys: { targetname: name, script },
  outputs,
});

const hint = (name: string, key: string, text: string, duration = 0): EntitySource => ({
  classname: 'harmonic_hint',
  keys: { targetname: name, hintkey: key, hinttext: text, duration: String(duration) },
});

// ─── terrain ─────────────────────────────────────────────────────────────────────────────────

/** Deterministic scatter (a small LCG): same level every build. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Snow drifts off the lane (|y| >= LANE_CLEAR), none on the slopes or in front of the ship. */
const LANE_CLEAR = 190;
function drifts(): BrushSource[] {
  const r = rng(1971);
  const out: BrushSource[] = [];
  const dirs = ['north', 'south', 'east', 'west'] as const;
  for (let i = 0; i < 90; i++) {
    const x = 700 + r() * 8300;
    const y = (r() < 0.5 ? -1 : 1) * (LANE_CLEAR + r() * 1500);
    const w = 110 + r() * 260;
    const h = 22 + r() * 48;
    const kind = r();
    const onRidge = x > H1.ridge.from - w && x < H1.ridge.to + w;
    const onSlope = x > 6400 - w && x < H1.summit.to + 700 + w;
    const hutOrCache = (x > 3050 && x < 3700) || (x > 5850 && x < 6450);
    if (onRidge || onSlope || hutOrCache || x > H1.fenceX - w) continue;
    if (kind < 0.5) {
      const dir = dirs[Math.floor(r() * 4)];
      out.push(wedge(v3(x, y, 0), v3(x + w, y + w * 0.8, h), dir, SNOW));
    } else {
      out.push(prism(v3(x, y, 0), w * 0.5, h, 5 + Math.floor(r() * 3), SNOW, r() * 72));
    }
  }
  return out;
}

function terrain(): BrushSource[] {
  const { min, max } = WORLD;
  const { ridge, summit } = H1;
  const out: BrushSource[] = [
    ...room({
      min,
      max,
      wall: 16,
      material: SNOW,
      floorMaterial: SNOW,
      // A snow-white ceiling far above the fog's end: it fogs to the sky colour, so there is no
      // hard-edged sky slab overhead (the `sky` material is not fogged).
      ceilingMaterial: SNOW,
    }),
    // Sea ice, scoured clear, between the hut and the ridge and on the long approach to the fence.
    box(v3(3560, -420, 0), v3(4380, 420, 1), ICE),
    box(v3(8950, -500, 0), v3(9180, 500, 1), ICE),
  ];
  // The pressure ridge: ice shoved up into a wall. A ramp up, a crest, a ramp down — plus buckled
  // slabs on the crest, off the lane.
  const full = { y0: min.y, y1: max.y };
  out.push(
    ramp(v3(ridge.from, full.y0, 0), v3(ridge.crest[0], full.y1, ridge.height), 'east', ICE),
    box(v3(ridge.crest[0], full.y0, 0), v3(ridge.crest[1], full.y1, ridge.height), ICE),
    ramp(v3(ridge.crest[1], full.y0, 0), v3(ridge.to, full.y1, ridge.height), 'west', ICE),
  );
  const r = rng(59);
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const y = side * (150 + r() * 1300);
    const x = ridge.crest[0] - 30 + r() * 130;
    out.push(prism(v3(x, y, ridge.height - 2), 50 + r() * 60, 40 + r() * 110, 5, ICE, r() * 72));
  }
  // The long climb to the summit, the summit, and the way down.
  out.push(
    ramp(v3(6500, full.y0, 0), v3(summit.from, full.y1, summit.height), 'east', SNOW),
    box(v3(summit.from, full.y0, 0), v3(summit.to, full.y1, summit.height), SNOW),
    ramp(v3(summit.to, full.y0, 0), v3(8950, full.y1, summit.height), 'west', SNOW),
  );
  // A cairn of rock on the summit, and rock either side of the wind funnel.
  out.push(
    prism(v3(8180, 130, summit.height), 46, 56, 6, ROCK),
    box(v3(1480, 200, 0), v3(1780, 260, 150), ROCK),
    box(v3(1480, -260, 0), v3(1780, -200, 150), ROCK),
    box(v3(1560, 150, 150), v3(1700, 260, 190), ROCK),
  );
  return [...out, ...drifts()];
}

// ─── the wreck ───────────────────────────────────────────────────────────────────────────────

function wreck(): { brushes: BrushSource[]; entities: EntitySource[] } {
  const { wreck: w } = H1;
  const brushes: BrushSource[] = [
    ...room({
      min: w.min,
      max: w.max,
      wall: 16,
      material: STEEL,
      floorMaterial: STEEL,
      ceilingMaterial: STEEL,
      doors: [{ wall: 'east', at: 0, width: 64, height: 110 }],
    }),
    // The cabin lies on its side: the floor rises toward the nose.
    wedge(v3(w.min.x, w.min.y, 0), v3(w.max.x, w.max.y, WRECK_TILT), 'east', STEEL),
    // Seats torn loose along both walls, a bulkhead stub, the torn wing outside.
    box(v3(100, -80, 0), v3(160, -56, 30), RUST),
    box(v3(100, 56, 0), v3(160, 80, 30), RUST),
    box(v3(300, -80, 0), v3(360, -56, 38), RUST),
    box(v3(300, 56, 0), v3(360, 80, 38), RUST),
    box(v3(440, 52, 0), v3(456, 80, 90), STEEL),
    box(v3(200, 96, 40), v3(380, 440, 52), STEEL),
    box(v3(230, 400, 36), v3(340, 520, 48), STEEL),
    // The tail section, broken off behind the cabin and pushed into the drift.
    box(v3(-196, -60, 0), v3(-16, 60, 90), OLD),
    box(v3(-196, -12, 90), v3(-110, 12, 200), OLD),
    // Snow banked against the hull, and a step down from the hatch.
    wedge(v3(580, -90, 0), v3(700, 90, 22), 'west', SNOW),
    wedge(v3(0, 96, 0), v3(480, 220, 60), 'south', SNOW),
  ];
  const entities: EntitySource[] = [
    { classname: 'info_player_start', origin: H1.start, angles: v3(0, 0, 0) },
    { classname: 'harmonic_weapon_prybar', origin: H1.prybar },
    {
      // The hatch: bent in its frame, opened by the pry bar (two swings).
      classname: 'func_breakable',
      keys: { targetname: 'hatch', health: '60', material: '1' },
      brushes: [box(H1.hatch.min, H1.hatch.max, RUST)],
      outputs: ['OnBreak hint_prybar,HideHint,,0,1'],
    },
    exposure('cold_wreck', 'shelter', w.min, w.max, {
      area: 'camp_interior',
      hint: 'Out of the wind. Take what you need.',
      hintkey: 'harmonic:hint_ch1_wreck',
    }),
    hint('hint_prybar', 'ch1.hint.prybar', 'Equip the pry bar and strike the hatch.'),
    dialogue('wreck_dialogue', 'ch1.wreck'),
    { classname: 'logic_auto', outputs: ['OnMapSpawn wreck_dialogue,Start,,2,1'] },
    dialogue('hatch_dialogue', 'ch1.hatch'),
    volume(
      'hatch_zone',
      v3(380, -76, 0),
      v3(556, 76, 120),
      [
        'OnStartTouch hatch_dialogue,Start,,0.5,-1',
        'OnStartTouch hint_prybar,ShowHint,,1,-1',
        'OnEndTouch hint_prybar,HideHint,,0,-1',
      ],
      false,
    ),
    model('crate', 120, 0, 0, 20),
  ];
  // The crate on the floor is cosmetic (z follows the tilt).
  entities[entities.length - 1].origin = v3(70, -52, 3);
  return { brushes, entities };
}

// ─── the blizzard: marker poles and wind ─────────────────────────────────────────────────────

function poles(): EntitySource[] {
  const out: EntitySource[] = [];
  const keyAt = new Set([860]);
  for (let x = 860, i = 0; x < 3100; x += 280, i++) {
    const side = i % 2 ? 1 : -1;
    out.push(model('lamp_post', x, side * 110, 0, side > 0 ? 270 : 90));
    keyAt.add(x);
  }
  // Poles also mark the way over the open ice and up to the cache.
  for (let x = 3700, i = 0; x < 4300; x += 300, i++)
    out.push(model('lamp_post', x, (i % 2 ? 1 : -1) * 110, 0, 90));
  for (let x = 5200, i = 0; x < 5900; x += 300, i++)
    out.push(model('lamp_post', x, (i % 2 ? 1 : -1) * 110, 0, 90));
  out.push(model('oil_drum', 1280, 150, 0, 0), model('oil_drum', 1320, 168, 0, 40));
  return out;
}

// ─── the survey hut ──────────────────────────────────────────────────────────────────────────

function hut(): { brushes: BrushSource[]; entities: EntitySource[] } {
  const { hut: h } = H1;
  const brushes = room({
    min: h.min,
    max: h.max,
    wall: 16,
    material: WOOD,
    floorMaterial: WOOD,
    ceilingMaterial: WOOD,
    doors: [
      { wall: 'west', at: 0, width: 96, height: 96 },
      { wall: 'east', at: 0, width: 96, height: 96 },
    ],
  });
  const bench = box(v3(3260, 96, 0), v3(3420, 126, 22), WOOD);
  const locker = solidProp('locker', 3500, -100, 0, 180, [14, 14], 73);
  const heaterBody = box(v3(H1.heater.x - 12, H1.heater.y - 16, 0), v3(H1.heater.x + 12, H1.heater.y + 16, 43), NODRAW);
  return {
    brushes: [...brushes, bench, locker.collide, heaterBody],
    entities: [
      exposure('cold_hut', 'shelter', h.min, h.max, {
        area: 'camp_interior',
        hint: 'Warm. Rest until the cold meter is full.',
        hintkey: 'harmonic:hint_ch1_hut',
      }),
      { classname: 'harmonic_heater', origin: H1.heater, angles: v3(0, 180, 0), keys: { targetname: 'hut_heater', radius: '200' } },
      locker.entity,
      model('crate', 3300, -96, 0, 15),
      dialogue('hut_dialogue', 'ch1.hut'),
      volume('hut_zone', v3(3240, -100, 0), v3(3330, 100, 110), ['OnStartTouch hut_dialogue,Start,,0.3,1']),
    ],
  };
}

// ─── the supply cache ────────────────────────────────────────────────────────────────────────

function cache(): { brushes: BrushSource[]; entities: EntitySource[] } {
  const { cache: c } = H1;
  const brushes = room({
    min: c.min,
    max: c.max,
    wall: 16,
    material: STEEL,
    floorMaterial: STEEL,
    ceilingMaterial: STEEL,
    doors: [
      { wall: 'west', at: 0, width: 96, height: 96 },
      { wall: 'east', at: 0, width: 96, height: 96 },
    ],
  });
  const crates = [
    solidProp('crate', 6040, -80, 0, 10, [18, 18], 32),
    solidProp('crate', 6040, -42, 0, 80, [18, 18], 32),
    solidProp('crate', 6040, -80, 32, 40, [18, 18], 32),
    solidProp('crate', 6130, 85, 0, 0, [18, 18], 32),
    solidProp('oil_drum', 6260, -80, 0, 0, [12, 12], 36),
    solidProp('locker', 6270, 72, 0, 180, [12, 13], 73),
    solidProp('locker', 6270, 96, 0, 180, [12, 13], 73),
  ];
  return {
    brushes: [
      ...brushes,
      ...crates.map((s) => s.collide),
      // A hazard-striped lintel over each door, and a Meridian stencil board on the north wall.
      box(v3(c.min.x, c.max.y - 8, 70), v3(c.max.x, c.max.y, 96), HAZARD),
    ],
    entities: [
      ...crates.map((s) => s.entity),
      exposure('cold_cache', 'shelter', c.min, c.max, {
        area: 'camp_interior',
        hint: 'Meridian stores. Warm enough to rest.',
        hintkey: 'harmonic:hint_ch1_cache',
      }),
      { classname: 'harmonic_ammo_pulse', origin: H1.ammo, keys: { targetname: 'cache_ammo', amount: '12' } },
      { classname: 'harmonic_ammo_pulse', origin: v3(6200, 70, 0), keys: { amount: '12' } },
      dialogue('cache_dialogue', 'ch1.cache'),
      volume('cache_zone', v3(6030, -100, 0), v3(6100, 100, 110), ['OnStartTouch cache_dialogue,Start,,0.3,1']),
    ],
  };
}

// ─── the ship ────────────────────────────────────────────────────────────────────────────────

/** A convex block with a pointed end: plan view is a rectangle capped by a triangle (x width, +y bow). */
function bow(cx: number, y0: number, halfWidth: number, length: number, z0: number, z1: number, material: string): BrushSource {
  const tipY = y0 + length;
  const n = Math.hypot(length, halfWidth);
  const planes: PlaneSource[] = [
    { normal: v3(0, 0, 1), dist: z1 },
    { normal: v3(0, 0, -1), dist: -z0 },
    { normal: v3(0, -1, 0), dist: -y0 },
    // Right flank: from (cx+hw, y0) to the tip.
    { normal: v3(length / n, halfWidth / n, 0), dist: (length * (cx + halfWidth) + halfWidth * y0) / n },
    { normal: v3(-length / n, halfWidth / n, 0), dist: (-length * (cx - halfWidth) + halfWidth * y0) / n },
  ];
  void tipY;
  return { planes, material };
}

/**
 * The Saint Ilse: enormous (1,600 long, seven decks of superstructure) and wrong — afloat a hand's
 * breadth above the ice, in two tones. Hull axis along Y, bow toward +Y.
 */
function ship(): BrushSource[] {
  const { x, y0, y1 } = H1.ship;
  const hw = 150;
  const z0 = 40;
  const deck = 330;
  const bowLen = 320;
  const hullEnd = y1 - bowLen;
  return [
    box(v3(x - hw, y0, z0), v3(x + hw, hullEnd, deck), RUST),
    bow(x, hullEnd, hw, bowLen, z0, deck, RUST),
    // A white band along the sheer, the cargo house, the bridge, the funnel, two masts.
    box(v3(x - hw - 6, y0, deck - 40), v3(x + hw + 6, hullEnd, deck), OLD),
    box(v3(x - 100, y0 + 80, deck), v3(x + 100, y0 + 520, deck + 150), OLD),
    box(v3(x - 80, y0 + 140, deck + 150), v3(x + 80, y0 + 420, deck + 270), OLD),
    box(v3(x - 60, y0 + 190, deck + 270), v3(x + 60, y0 + 330, deck + 350), STEEL),
    prism(v3(x, y0 + 440, deck + 150), 46, 210, 8, RUST),
    box(v3(x - 4, hullEnd - 200, deck), v3(x + 4, hullEnd - 190, deck + 520), STEEL),
    box(v3(x - 4, y0 + 240, deck + 350), v3(x + 4, y0 + 250, deck + 760), STEEL),
    box(v3(x - 80, y0 + 244, deck + 700), v3(x + 80, y0 + 248, deck + 706), STEEL),
  ];
}

/** Flicker timeline (seconds after OnLine3 of `ch1.ridge`): on/off pairs, ending dark. */
const SHIP_FLICKER_S = [0, 0.7, 1.1, 1.3, 1.7, 1.85, 2.4, 6.4, 6.7, 6.9] as const;

function shipEntities(): EntitySource[] {
  const outputs = SHIP_FLICKER_S.map(
    (t, i) => `OnTrigger ship_hull,${i % 2 === 0 ? 'Enable' : 'Disable'},,${t},1`,
  );
  outputs.push('OnTrigger ship_groan,PlaySound,,0.3,1');
  return [
    {
      classname: 'func_brush',
      keys: { targetname: 'ship_hull', solidity: '1', StartDisabled: '1' },
      brushes: ship(),
    },
    { classname: 'logic_relay', keys: { targetname: 'ship_flicker' }, outputs },
    {
      classname: 'ambient_generic',
      keys: { targetname: 'ship_groan', message: 'ship.groan', spawnflags: '49', health: '10' },
    },
  ];
}

// ─── the summit and the fence ────────────────────────────────────────────────────────────────

function fence(): { brushes: BrushSource[]; entities: EntitySource[] } {
  const fx = H1.fenceX;
  const g = H1.gate.halfWidth;
  const { min, max } = WORLD;
  const brushes: BrushSource[] = [
    // Chain-link panels either side of the gate, and the gate itself (closed, locked).
    box(v3(fx, min.y, 0), v3(fx + 4, -g - 10, 130), GRATING),
    box(v3(fx, g + 10, 0), v3(fx + 4, max.y, 130), GRATING),
    box(v3(fx, -g, 0), v3(fx + 4, g, 120), GRATING),
    // Top rail, gate posts and a hazard-striped crossbar.
    box(v3(fx - 2, min.y, 128), v3(fx + 6, max.y, 134), STEEL),
    box(v3(fx - 6, -g - 14, 0), v3(fx + 10, -g - 2, 150), HAZARD),
    box(v3(fx - 6, g + 2, 0), v3(fx + 10, g + 14, 150), HAZARD),
    box(v3(fx - 1, -g, 56), v3(fx + 5, g, 62), HAZARD),
    // Beyond the fence: the post. Containers, a long shed, the guard box.
    box(v3(9330, -420, 0), v3(9480, -330, 80), STEEL),
    box(v3(9330, -300, 0), v3(9480, -210, 80), RUST),
    box(v3(9330, 250, 0), v3(9600, 340, 90), NEW),
    box(v3(9290, 90, 0), v3(9340, 150, 70), NEW),
    box(v3(9290, -150, 0), v3(9340, -90, 70), NEW),
  ];
  const lamps: EntitySource[] = [];
  for (let i = 0; i < 9; i++) {
    const y = -960 + i * 240 + (i >= 4 ? 0 : 0);
    if (Math.abs(y) < 90) continue;
    lamps.push(model('lamp_post', fx - 30, y, 0, 0));
  }
  lamps.push(model('lamp_post', fx - 30, -100, 0, 0), model('lamp_post', fx - 30, 100, 0, 0));
  const masts = [
    model('antenna_mast', 9420, -140, 0, 0),
    model('antenna_mast', 9420, 40, 0, 0),
    model('antenna_mast', 9560, 180, 0, 0),
    model('antenna_mast', 9560, -260, 0, 0),
  ];
  return {
    brushes,
    entities: [
      ...lamps,
      ...masts,
      dialogue('fence_dialogue', 'ch1.fence', ['OnFinished chapter_end,End,,3,1']),
      volume('fence_zone', v3(fx - 120, -140, 0), v3(fx - 40, 140, 150), ['OnStartTouch fence_dialogue,Start,,0.3,1']),
      // The chapter transition (H3.2 registers the class; until then the output has no taker).
      { classname: 'harmonic_chapter_end', origin: v3(fx - 80, 0, 40), keys: { targetname: 'chapter_end' } },
    ],
  };
}

// ─── assembly ────────────────────────────────────────────────────────────────────────────────

function ambience(): EntitySource[] {
  return [
    {
      classname: 'ambient_generic',
      keys: { targetname: 'gust', message: 'wind.gust', spawnflags: '49', health: '8' },
    },
    {
      classname: 'logic_timer',
      keys: { UseRandomTime: '1', LowerRandomBound: '9', UpperRandomBound: '19' },
      outputs: ['OnTimer gust,PlaySound,,0,-1'],
    },
  ];
}

export function h1WhiteoutSource(): LevelSource {
  const wr = wreck();
  const hu = hut();
  const ca = cache();
  const fe = fence();
  const { min: wmin, max: wmax } = WORLD;
  void wmin;
  void wmax;
  return {
    id: 'h1_whiteout',
    title: 'Whiteout',
    exposure: 'outdoor',
    exposureArea: 'ice_open',
    fog: { color: FOG.color, start: FOG.start, end: FOG.end, maxDensity: FOG.max },
    world: [...terrain(), ...wr.brushes, ...hu.brushes, ...ca.brushes, ...fe.brushes],
    entities: [
      ...wr.entities,
      ...poles(),
      // The blizzard proper: a gap between two rock walls where the wind is worst.
      exposure('cold_wind', 'wind', v3(1500, -200, 0), v3(1760, 200, 220)),
      dialogue('outside_dialogue', 'ch1.outside'),
      hint('hint_poles', 'ch1.hint.poles', 'Follow the marker poles.', 7),
      volume('outside_zone', v3(640, -90, 0), v3(700, 90, 120), [
        'OnStartTouch outside_dialogue,Start,,0.5,1',
        'OnStartTouch hint_poles,ShowHint,,5,1',
      ]),
      ...hu.entities,
      hint('hint_ridge', 'ch1.hint.ridge', 'Climb the ridge where the ice has buckled.', 6),
      volume('ridge_zone', v3(4220, -140, 0), v3(4300, 140, 120), ['OnStartTouch hint_ridge,ShowHint,,0,1']),
      ...ca.entities,
      ...shipEntities(),
      dialogue('ridge_dialogue', 'ch1.ridge', [
        'OnLine3 ship_flicker,Trigger,,0,1',
        'OnLine6 ship_hull,Disable,,0,-1',
      ]),
      volume(
        'summit_zone',
        v3(H1.summit.from + 40, -160, H1.summit.height),
        v3(H1.summit.from + 120, 160, H1.summit.height + 120),
        ['OnStartTouch ridge_dialogue,Start,,0.4,1'],
      ),
      ...fe.entities,
      ...ambience(),
    ],
  };
}
