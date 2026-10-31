/**
 * dev_box — the M0 test level (plan H0.4). One hall that exercises what the engine needs to
 * prove for Harmonic: several textured materials, stairs and a ramp up to a mezzanine, a
 * `func_door` opened with +use (and a `func_button` wired to it), a `trigger_hurt` pit, a
 * shallow pool, a glass window and a player start.
 *
 *   y ↑            N
 *      ┌─────────────────────────────────────┐
 *  512 │      mezzanine (z 96)               │   stairs: x 640..704, y 128 → 320 (east end)
 *  320 │ ramp ↗ ─────────────────────────────│   ramp:   x 64..192,  y 336..400
 *  240 │          ┌ pit ┐                     │   pit:    x 400..560, y 64..224 (96 deep)
 *  176 │ alcove   └─────┘      pool           │   pool:   x 224..352, y 48..176
 *      └─────────────────────────────────────┘ x → 768
 *
 * Source units (inches), Z up. Pure data: no DOM.
 */
import {
  box,
  ramp,
  room,
  stairs,
  v3,
  waterBox,
  type BrushSource,
  type EntitySource,
  type LevelSource,
} from '../compiler';

const CONCRETE = 'harmonic/concrete';
const STEEL = 'harmonic/steel_plate';
const RUST = 'harmonic/steel_rust';
const WHITE_OLD = 'harmonic/paint_white_1971';
const WEATHERED = 'harmonic/paint_white_2030';
const HAZARD = 'harmonic/hazard_stripe';
const WOOD = 'harmonic/wood_deck';
const GRATING = 'harmonic/grating';
const GLASS = 'harmonic/glass';
const NODRAW = 'harmonic/nodraw';

/** Floor level and the bottom of the pit. */
const PIT_FLOOR = -96;
const HALL_TOP = 224;

function hall(): BrushSource[] {
  const out: BrushSource[] = [];
  // Shell: the room's own floor is the pit bottom; slabs below build the walking floor.
  out.push(
    ...room({
      min: v3(0, 0, PIT_FLOOR),
      max: v3(768, 512, HALL_TOP),
      material: WHITE_OLD,
      floorMaterial: RUST,
      ceilingMaterial: WHITE_OLD,
    }),
  );
  // The walking floor at z=0 with a hole for the pit, ringed in hazard stripe.
  const slab = (x0: number, y0: number, x1: number, y1: number, material: string) =>
    box(v3(x0, y0, PIT_FLOOR), v3(x1, y1, 0), material, { faces: { top: { material } } });
  out.push(
    slab(0, 0, 384, 512, CONCRETE),
    slab(576, 0, 768, 512, CONCRETE),
    slab(384, 0, 576, 48, CONCRETE),
    slab(384, 240, 576, 512, CONCRETE),
    slab(384, 48, 576, 64, HAZARD),
    slab(384, 224, 576, 240, HAZARD),
    slab(384, 64, 400, 224, HAZARD),
    slab(560, 64, 576, 224, HAZARD),
  );
  // A dark skirting round the hall.
  out.push(
    box(v3(0, 0, 0), v3(768, 6, 14), STEEL),
    box(v3(0, 506, 0), v3(768, 512, 14), STEEL),
    box(v3(762, 6, 0), v3(768, 506, 14), STEEL),
  );
  return out;
}

function mezzanine(): BrushSource[] {
  const out: BrushSource[] = [];
  // Deck on pillars, along the north wall.
  out.push(
    box(v3(192, 320, 84), v3(768, 512, 96), STEEL, { faces: { top: { material: GRATING } } }),
  );
  for (const [x, y] of [
    [192, 320],
    [496, 320],
    [752, 320],
  ] as const)
    out.push(box(v3(x, y, 0), v3(x + 16, y + 16, 84), WHITE_OLD));
  return out;
}

/** The south-edge rail, open where the stairs arrive (x 640..704). */
function mezzanineRail(): BrushSource[] {
  return [
    box(v3(192, 316, 96), v3(640, 320, 132), WHITE_OLD),
    box(v3(704, 316, 96), v3(768, 320, 132), WHITE_OLD),
  ];
}

function access(): BrushSource[] {
  return [
    // 12 steps x 8 = 96, 16 deep: x 640..704, climbing north from y 128 to the deck at y 320.
    ...stairs({
      min: v3(640, 128, 0),
      dir: 'north',
      width: 64,
      steps: 12,
      rise: 8,
      run: 16,
      material: STEEL,
      topMaterial: GRATING,
    }),
    // A ramp climbing east into the mezzanine's west edge.
    ramp(v3(64, 336, 0), v3(192, 400, 96), 'east', CONCRETE),
  ];
}

function pool(): BrushSource[] {
  // A 14-high rim (a step the player can take) round 10 units of water.
  const [x0, y0, x1, y1] = [224, 48, 352, 176];
  return [
    box(v3(x0, y0, 0), v3(x1, y0 + 8, 14), STEEL),
    box(v3(x0, y1 - 8, 0), v3(x1, y1, 14), STEEL),
    box(v3(x0, y0 + 8, 0), v3(x0 + 8, y1 - 8, 14), STEEL),
    box(v3(x1 - 8, y0 + 8, 0), v3(x1, y1 - 8, 14), STEEL),
    waterBox(v3(x0 + 8, y0 + 8, 0), v3(x1 - 8, y1 - 8, 10), GLASS),
  ];
}

/** The alcove: a low room in the south-west corner, a door on its east wall, a window on its north. */
function alcove(): BrushSource[] {
  const wallTop = 112;
  const w = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    box(v3(x0, y0, z0), v3(x1, y1, z1), STEEL);
  return [
    // East wall, with a 64-wide doorway at y 48..112.
    w(192, 0, 0, 208, 48, wallTop),
    w(192, 112, 0, 208, 176, wallTop),
    w(192, 48, 96, 208, 112, wallTop),
    // North wall around the window (x 48..144, z 48..96).
    w(0, 160, 0, 48, 176, wallTop),
    w(144, 160, 0, 192, 176, wallTop),
    w(48, 160, 0, 144, 176, 48),
    w(48, 160, 96, 144, 176, wallTop),
    box(v3(48, 164, 48), v3(144, 172, 96), GLASS, { contents: 'window' }),
    // Roof and a crate inside.
    box(v3(0, 0, wallTop), v3(208, 176, wallTop + 16), WEATHERED),
    box(v3(24, 24, 0), v3(72, 72, 40), WOOD),
    box(v3(96, 20, 0), v3(130, 54, 28), WOOD),
  ];
}

function entities(): EntitySource[] {
  return [
    { classname: 'info_player_start', origin: v3(320, 256, 1), angles: v3(0, 20, 0) },
    {
      // Slides north into the wall; +use opens it, it closes again after 4 s.
      classname: 'func_door',
      keys: {
        targetname: 'alcove_door',
        movedir: '0 90 0',
        speed: '120',
        wait: '4',
        spawnflags: '256',
      },
      brushes: [box(v3(193, 48, 0), v3(207, 112, 96), STEEL)],
    },
    {
      // A wall button beside the door: pressing it fires the door's Open input.
      classname: 'func_button',
      keys: {
        targetname: 'alcove_button',
        movedir: '0 180 0',
        speed: '40',
        wait: '2',
        spawnflags: '1024',
      },
      brushes: [box(v3(208, 124, 40), v3(214, 140, 56), HAZARD)],
      outputs: ['OnPressed alcove_door,Open,,0,-1'],
    },
    {
      classname: 'trigger_hurt',
      keys: { damage: '120', spawnflags: '1' },
      brushes: [box(v3(400, 64, PIT_FLOOR), v3(560, 224, PIT_FLOOR + 56), NODRAW)],
    },
  ];
}

export function devBoxSource(): LevelSource {
  return {
    id: 'dev_box',
    title: 'Dev box',
    world: [...hall(), ...mezzanine(), ...mezzanineRail(), ...access(), ...pool(), ...alcove()],
    entities: entities(),
  };
}
