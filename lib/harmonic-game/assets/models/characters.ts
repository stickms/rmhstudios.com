/**
 * The five characters (plan H2.4): Meridian trooper and shield bearer (2030 cold-weather kit),
 * an Unstrung drifter (1971 crew overalls, drained of colour), Ines Vahl and the oldest Lind.
 * All share the rig in `rig.ts` and play the same eight clips; only looks, stance and gait differ.
 * No brand marks anywhere: surfaces are plain colour.
 */
import { Matrix4, Vector3 } from 'three';
import { mixRgb, PALETTE, shade, type Rgb } from '../palette';
import {
  assemble,
  bindPositions,
  sourceBasis,
  U,
  type MatDef,
  type ModelObject,
  type Part,
} from './parts';
import { BONES, buildCharacterClips, carry, fk, STANCES, type Gait, type StanceName } from './rig';
import { WEAPON_MATS, WEAPON_MUZZLE, WEAPON_PARTS } from './weapons';
import { modelPath, MODEL_SPECS } from './info';

const P = bindPositions(BONES);
const at = (bone: string, dx = 0, dy = 0, dz = 0): [number, number, number] => {
  const p = P.get(bone)!;
  return [p.x + dx, p.y + dy, p.z + dz];
};

type Head = 'helmet' | 'beanie' | 'hood' | 'hair' | 'bare';

interface Look {
  mats: Record<string, MatDef>;
  head: Head;
  /** Parka tail / coat skirt below the waist. */
  skirt: 'none' | 'parka' | 'coat';
  /** Extra width on the torso (a puffer parka), units. */
  bulk: number;
  /** Pale, hollow-eyed face (the Unstrung). */
  hollow?: boolean;
  extras?: (look: Look) => Part[];
}

const limb = (
  bone: string,
  x: number,
  y0: number,
  y1: number,
  r: number,
  mat: string,
  rz = r,
  z = 0,
): Part => ({
  shape: 'cap',
  c: [x, (y0 + y1) / 2, z],
  s: [r, Math.max(0, Math.abs(y1 - y0) - 2 * r), rz],
  mat,
  bone,
});

function bodyParts(l: Look): Part[] {
  const b = l.bulk;
  const out: Part[] = [];
  // Core.
  out.push({
    shape: 'box',
    c: at('pelvis'),
    s: [15 + b, 8, 9 + b / 2],
    mat: 'pants',
    bone: 'pelvis',
  });
  out.push({
    shape: 'box',
    c: at('spine', 0, 1),
    s: [16 + b, 6, 9.5 + b / 2],
    mat: 'torso',
    bone: 'spine',
  });
  out.push({
    shape: 'box',
    c: at('chest', 0, 1),
    s: [18.5 + b, 15, 10.5 + b / 2],
    mat: 'torso',
    bone: 'chest',
  });
  out.push({
    shape: 'cyl',
    c: at('neck', 0, 0.5),
    s: [2.5, 5, 2.5],
    mat: 'skin',
    bone: 'neck',
    seg: 7,
  });
  if (l.skirt === 'parka')
    out.push({
      shape: 'box',
      c: at('pelvis', 0, -1.5),
      s: [19 + b, 9, 12 + b / 2],
      mat: 'torso',
      bone: 'pelvis',
    });
  if (l.skirt === 'coat') {
    out.push({
      shape: 'box',
      c: at('pelvis', 0, -4),
      s: [18, 15, 11],
      mat: 'torso',
      bone: 'pelvis',
    });
    for (const s of [-1, 1])
      out.push({
        shape: 'box',
        c: at(s > 0 ? 'upperleg_l' : 'upperleg_r', 0, -8.5),
        s: [8, 15, 10.5],
        mat: 'torso',
        bone: s > 0 ? 'upperleg_l' : 'upperleg_r',
      });
  }
  // Arms and legs, left (+X) then right (-X).
  for (const [side, sx] of [
    ['l', 1],
    ['r', -1],
  ] as const) {
    const ua = `upperarm_${side}`;
    const la = `lowerarm_${side}`;
    const ha = `hand_${side}`;
    const ul = `upperleg_${side}`;
    const ll = `lowerleg_${side}`;
    const ft = `foot_${side}`;
    const ax = 9 * sx;
    out.push({
      shape: 'cap',
      c: at(ua, 0, 0.5),
      s: [3.5 + b / 4, 0, 3.5 + b / 4],
      mat: 'sleeve',
      bone: ua,
    });
    out.push(limb(ua, ax, 56, 45.5, 3.2 + b / 4, 'sleeve'));
    out.push(limb(la, ax, 45.5, 36, 2.9 + b / 5, 'sleeve'));
    out.push({
      shape: 'box',
      c: at(ha, 0, -1.6, 0.4),
      s: [3.8, 4.4, 4.8],
      mat: 'gloves',
      bone: ha,
    });
    const lx = 4.5 * sx;
    out.push(limb(ul, lx, 35, 18.5, 3.9 + b / 6, 'pants'));
    out.push(limb(ll, lx, 18.5, 3.5, 3.3 + b / 8, 'pants'));
    out.push({ shape: 'cyl', c: [lx, 8, 0], s: [3.7, 9, 3.7], mat: 'boots', bone: ll, seg: 7 });
    out.push({ shape: 'box', c: [lx, 2, 2.8], s: [5.6, 4, 11.5], mat: 'boots', bone: ft });
  }
  // Head.
  const h = at('head', 0, 5);
  out.push({ shape: 'cap', c: h, s: [4.2, 2.2, 4.5], mat: 'skin', bone: 'head' });
  if (l.head !== 'helmet') {
    out.push({
      shape: 'box',
      c: [h[0], h[1] - 0.8, h[2] + 4.6],
      s: [1.2, 1.8, 1.4],
      mat: 'skin',
      bone: 'head',
    });
    const eye = l.hollow ? 1.5 : 0.9;
    for (const sx of [-1, 1])
      out.push({
        shape: 'box',
        c: [h[0] + sx * 1.9, h[1] + 0.8, h[2] + 4.2],
        s: [eye + 0.2, eye, 0.6],
        mat: 'eyes',
        bone: 'head',
      });
  }
  if (l.head === 'helmet') {
    out.push({
      shape: 'cap',
      c: [h[0], h[1] + 1.4, h[2] - 0.3],
      s: [5.1, 1.8, 5.4],
      mat: 'headgear',
      bone: 'head',
    });
    out.push({
      shape: 'box',
      c: [h[0], h[1] + 0.2, h[2] + 4.9],
      s: [8.6, 4.2, 1.8],
      mat: 'visor',
      bone: 'head',
    });
    out.push({
      shape: 'box',
      c: [h[0], h[1] - 3.4, h[2] + 3],
      s: [7, 2.6, 3.6],
      mat: 'pack',
      bone: 'head',
    });
  } else if (l.head === 'beanie') {
    out.push({
      shape: 'cap',
      c: [h[0], h[1] + 2.6, h[2] - 0.3],
      s: [4.7, 0.8, 4.9],
      mat: 'headgear',
      bone: 'head',
    });
    out.push({
      shape: 'cyl',
      c: [h[0], h[1] + 1.4, h[2] - 0.1],
      s: [4.9, 1.6, 5.1],
      mat: 'trim',
      bone: 'head',
      seg: 9,
    });
  } else if (l.head === 'hood') {
    out.push({
      shape: 'cap',
      c: [h[0], h[1] + 0.8, h[2] - 1.4],
      s: [5.6, 2.2, 5.6],
      mat: 'headgear',
      bone: 'head',
    });
    out.push({
      shape: 'cyl',
      c: [h[0], h[1] - 3.4, h[2] + 0.2],
      s: [5.3, 3, 5.6],
      mat: 'headgear',
      bone: 'head',
      seg: 9,
    });
  } else if (l.head === 'hair') {
    out.push({
      shape: 'cap',
      c: [h[0], h[1] + 2.2, h[2] - 1.2],
      s: [4.5, 0.8, 4.8],
      mat: 'hair',
      bone: 'head',
    });
    out.push({
      shape: 'box',
      c: [h[0], h[1] - 0.2, h[2] - 4.4],
      s: [8.4, 5.6, 1.6],
      mat: 'hair',
      bone: 'head',
    });
  }
  if (l.extras) out.push(...l.extras(l));
  return out;
}

// ─── held items ─────────────────────────────────────────────────────────────

/** A carbine for the troopers: the coil rifle's frame without the copper. */
function carbineParts(): Part[] {
  const swap: Record<string, string> = {
    copper: 'steel_mid',
    copper_dark: 'steel_dark',
    steel_dark: 'steel_mid',
    steel_mid: 'steel',
  };
  return WEAPON_PARTS.coil_rifle.map((p) => ({ ...p, mat: swap[p.mat] ?? p.mat }));
}

interface Held {
  parts: Part[];
  bone: string;
  /** The pose the item is drawn level in. */
  ref: 'aim' | 'low';
  /** Where the item sits in that pose's world (units), or null: at the bone. */
  place: (hand: Vector3) => Matrix4;
  /** Muzzle position in the item's own space. */
  muzzle?: Vector3;
}

const atHand =
  (dx = 0, dy = 0, dz = 0) =>
  (hand: Vector3) =>
    new Matrix4().makeTranslation(hand.x + dx, hand.y + dy, hand.z + dz);

/** Everything a character builder needs to assemble itself. */
interface CharacterDef {
  name: string;
  look: Look;
  stance: StanceName;
  gait: Gait;
  held?: (s: StanceName) => Held;
  /** Parts authored in the ref pose and carried on a bone (a shield). */
  carried?: (
    aim: ReturnType<typeof fk>,
  ) => Array<{ parts: Part[]; bone: string; ref: 'aim' | 'low' }>;
}

function buildCharacter(def: CharacterDef): ModelObject {
  const stance = STANCES[def.stance];
  const parts = bodyParts(def.look);
  const attachments: Array<{ name: string; bone: string; local: number[] }> = [];
  const poseOf = (ref: 'aim' | 'low') => (ref === 'aim' ? stance.aim : stance.low);
  if (def.held) {
    const h = def.held(def.stance);
    const pose = poseOf(h.ref);
    const hand = new Vector3().setFromMatrixPosition(fk(pose).get(h.bone)!);
    const placement = h.place(hand);
    parts.push(...carry(h.parts, h.bone, pose, placement));
    if (h.muzzle) {
      // inv(A) · placement · T(muzzle) · basis, translation in metres.
      const a = fk(pose).get(h.bone)!;
      const m = a
        .clone()
        .invert()
        .multiply(placement)
        .multiply(
          sourceBasis(new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0), h.muzzle),
        );
      m.elements[12] *= U;
      m.elements[13] *= U;
      m.elements[14] *= U;
      attachments.push({ name: 'muzzle', bone: h.bone, local: m.toArray() });
    }
  }
  if (def.carried) {
    for (const c of def.carried(fk(stance.aim)))
      parts.push(...carry(c.parts, c.bone, poseOf(c.ref)));
  }
  const eyes = sourceBasis(
    new Vector3(0, 0, 1),
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 5.5 * U, 4 * U),
  );
  attachments.push({ name: 'eyes', bone: 'head', local: eyes.toArray() });
  const mats: Record<string, MatDef> = { ...WEAPON_MATS, ...def.look.mats };
  const { root, materials } = assemble(def.name, parts, mats, BONES);
  root.animations = buildCharacterClips(stance, def.gait);
  const spec = MODEL_SPECS.find((s) => s.name === def.name)!;
  root.userData = {
    skinned: true,
    source: {
      hullMin: [...spec.mins],
      hullMax: [...spec.maxs],
      clipFrame: [0, 1, 0, 0, 0, 1, 1, 0, 0],
      eyePosition: [0, 0, 66],
    },
    attachments: attachments.filter((a) => spec.attachments.includes(a.name)),
    // The loader stub fills sequences and activities from the catalog.
    path: modelPath(def.name),
    materialCount: materials.length,
  };
  return root;
}

// ─── palettes ───────────────────────────────────────────────────────────────

const rgb = (c: Rgb): MatDef => ({ rgb: c });
const dim = (c: Rgb, k: number): Rgb => shade(c, k);

/** Meridian: slate parka with pale shoulder panels, dark visor, graphite boots. */
const MERIDIAN: Record<string, MatDef> = {
  torso: rgb(mixRgb(PALETTE.steelDark, PALETTE.iceDeep, 0.16)),
  sleeve: rgb(mixRgb(PALETTE.steelDark, PALETTE.iceDeep, 0.2)),
  pants: rgb(dim(PALETTE.steelDark, 0.72)),
  boots: rgb(PALETTE.hazardBlack),
  gloves: rgb(PALETTE.steelSeam),
  skin: rgb(mixRgb(PALETTE.snowShade, [200, 150, 126], 0.55)),
  eyes: rgb(PALETTE.grateVoid),
  headgear: rgb(PALETTE.steelLight),
  visor: rgb(mixRgb(PALETTE.grateVoid, PALETTE.iceDeep, 0.25)),
  trim: rgb(PALETTE.frostWhite),
  pack: rgb(PALETTE.steelMid),
};

function troopExtras(l: Look): Part[] {
  void l;
  return [
    // Plate carrier and shoulder panels, a small pack, a belt of pouches.
    { shape: 'box', c: at('chest', 0, 0.5, 5.6), s: [14, 9, 2.2], mat: 'pack', bone: 'chest' },
    { shape: 'box', c: at('chest', 0, 1, -7.6), s: [13, 14, 5], mat: 'pack', bone: 'chest' },
    {
      shape: 'box',
      c: at('upperarm_l', 0, 1.6),
      s: [7.4, 2.4, 7.4],
      mat: 'trim',
      bone: 'upperarm_l',
    },
    {
      shape: 'box',
      c: at('upperarm_r', 0, 1.6),
      s: [7.4, 2.4, 7.4],
      mat: 'trim',
      bone: 'upperarm_r',
    },
    { shape: 'box', c: at('pelvis', 0, 0.8), s: [20.5, 2.2, 13.2], mat: 'pack', bone: 'pelvis' },
    { shape: 'box', c: at('pelvis', 5.4, 0.2, 6.6), s: [4, 4.4, 2.6], mat: 'pack', bone: 'pelvis' },
    {
      shape: 'box',
      c: at('chest', 6.2, 4.4, 5.9),
      s: [3.6, 0.9, 0.5],
      mat: 'amber',
      bone: 'chest',
    },
  ];
}

const trooperLook: Look = {
  mats: MERIDIAN,
  head: 'helmet',
  skirt: 'parka',
  bulk: 2.2,
  extras: troopExtras,
};

const rifleHeld = (): Held => ({
  parts: carbineParts(),
  bone: 'hand_r',
  ref: 'aim',
  place: atHand(0, -0.8, 6),
  muzzle: WEAPON_MUZZLE.coil_rifle,
});

const pistolHeld = (): Held => ({
  parts: WEAPON_PARTS.pulse_pistol,
  bone: 'hand_r',
  ref: 'aim',
  place: atHand(0, -0.6, 1),
  muzzle: WEAPON_MUZZLE.pulse_pistol,
});

/** The riot shield, drawn in the aim pose in front of the chest. */
function shieldParts(): Part[] {
  const plate: Part[] = [
    { shape: 'box', c: [8, 46, 19], s: [25, 36, 2.4], mat: 'shield', bone: 'hand_l' },
    { shape: 'box', c: [8, 56.2, 20.4], s: [19, 6, 0.8], mat: 'visor', bone: 'hand_l' },
    { shape: 'box', c: [8, 46, 17.4], s: [20, 31, 1.2], mat: 'steel_dark', bone: 'hand_l' },
    { shape: 'box', c: [8, 28.6, 19], s: [21, 1.6, 3.0], mat: 'trim', bone: 'hand_l' },
    { shape: 'box', c: [8, 63.4, 19], s: [21, 1.6, 3.0], mat: 'trim', bone: 'hand_l' },
    { shape: 'box', c: [-4.2, 46, 19], s: [1.6, 34, 3.0], mat: 'trim', bone: 'hand_l' },
    { shape: 'box', c: [20.2, 46, 19], s: [1.6, 34, 3.0], mat: 'trim', bone: 'hand_l' },
  ];
  return plate;
}

const trooper: CharacterDef = {
  name: 'meridian_trooper',
  look: trooperLook,
  stance: 'rifle',
  gait: { amp: 1, stoop: 0 },
  held: rifleHeld,
};

const shielded: CharacterDef = {
  name: 'meridian_shield',
  look: {
    ...trooperLook,
    mats: { ...MERIDIAN, shield: rgb(mixRgb(PALETTE.steelMid, PALETTE.iceBlue, 0.22)) },
    bulk: 3,
  },
  stance: 'shield',
  gait: { amp: 0.8, stoop: 2 },
  held: pistolHeld,
  carried: () => [{ parts: shieldParts(), bone: 'hand_l', ref: 'aim' }],
};

// The Unstrung: 1971 crew overalls, desaturated and a little too still.
const GREY: Rgb = [120, 120, 116];
const drifterMats: Record<string, MatDef> = {
  torso: rgb(mixRgb(PALETTE.enamelAged, GREY, 0.62)),
  sleeve: rgb(mixRgb(PALETTE.enamelAged, GREY, 0.7)),
  pants: rgb(mixRgb(PALETTE.enamelAged, GREY, 0.66)),
  boots: rgb(dim(PALETTE.enamelGrime, 0.7)),
  gloves: rgb(mixRgb(PALETTE.enamelGrime, GREY, 0.5)),
  skin: rgb(mixRgb(PALETTE.snowShade, GREY, 0.45)),
  eyes: rgb(PALETTE.grateVoid),
  headgear: rgb(mixRgb(PALETTE.enamelGrime, GREY, 0.45)),
  trim: rgb(mixRgb(PALETTE.enamelGrime, GREY, 0.3)),
};

const drifter: CharacterDef = {
  name: 'unstrung_drifter',
  look: {
    mats: drifterMats,
    head: 'beanie',
    skirt: 'none',
    bulk: 0,
    hollow: true,
    extras: () => [
      // Bib and braces, a chest pocket, a loose belt: workwear, not uniform.
      { shape: 'box', c: at('chest', 0, 1, 5.4), s: [13, 11, 0.8], mat: 'trim', bone: 'chest' },
      { shape: 'box', c: at('chest', 4.2, 2, 5.9), s: [4.4, 4, 0.7], mat: 'sleeve', bone: 'chest' },
      { shape: 'box', c: at('chest', 6.4, 8.5, 0), s: [2, 1, 10.8], mat: 'trim', bone: 'chest' },
      { shape: 'box', c: at('chest', -6.4, 8.5, 0), s: [2, 1, 10.8], mat: 'trim', bone: 'chest' },
      { shape: 'box', c: at('pelvis', 0, 1.4), s: [16.4, 1.6, 10], mat: 'trim', bone: 'pelvis' },
    ],
  },
  stance: 'easy',
  gait: { amp: 0.85, stoop: 5 },
};

const inesMats: Record<string, MatDef> = {
  torso: rgb(mixRgb(PALETTE.steelMid, PALETTE.iceDeep, 0.22)),
  sleeve: rgb(mixRgb(PALETTE.steelMid, PALETTE.iceDeep, 0.26)),
  pants: rgb(PALETTE.steelDark),
  boots: rgb(PALETTE.rustDark),
  gloves: rgb(PALETTE.deckDark),
  skin: rgb(mixRgb(PALETTE.snowShade, [214, 168, 140], 0.6)),
  eyes: rgb(PALETTE.steelSeam),
  headgear: rgb(PALETTE.enamelAged),
  trim: rgb(PALETTE.enamelAged),
  hair: rgb(PALETTE.deckDark),
  belt: rgb(PALETTE.deckDark),
};

const ines: CharacterDef = {
  name: 'ines',
  look: {
    mats: inesMats,
    head: 'beanie',
    skirt: 'none',
    bulk: 1.4,
    extras: () => [
      { shape: 'box', c: at('pelvis', 0, 1.2), s: [17.6, 2.6, 11.4], mat: 'belt', bone: 'pelvis' },
      {
        shape: 'box',
        c: at('pelvis', -7.6, -0.4, 2),
        s: [3.2, 5, 3.6],
        mat: 'belt',
        bone: 'pelvis',
      },
      {
        shape: 'box',
        c: at('pelvis', 7.2, -0.4, 2),
        s: [3.2, 4, 3.4],
        mat: 'steel_dark',
        bone: 'pelvis',
      },
      {
        shape: 'cyl',
        c: at('neck', 0, 0.2),
        s: [3.4, 3.6, 3.6],
        mat: 'trim',
        bone: 'neck',
        seg: 8,
      },
      { shape: 'box', c: at('head', 0, 2, -5), s: [2.4, 6.6, 2.4], mat: 'hair', bone: 'head' },
    ],
  },
  stance: 'easy',
  gait: { amp: 1, stoop: 0 },
};

const lindMats: Record<string, MatDef> = {
  torso: rgb(mixRgb(PALETTE.enamelGrime, PALETTE.steelDark, 0.5)),
  sleeve: rgb(mixRgb(PALETTE.enamelGrime, PALETTE.steelDark, 0.5)),
  pants: rgb(PALETTE.steelDark),
  boots: rgb(PALETTE.hazardBlack),
  gloves: rgb(mixRgb(PALETTE.snowShade, [190, 160, 140], 0.5)),
  skin: rgb(mixRgb(PALETTE.snowShade, [210, 170, 150], 0.4)),
  eyes: rgb(PALETTE.steelSeam),
  hair: rgb(PALETTE.snowWhite),
  headgear: rgb(PALETTE.snowWhite),
  trim: rgb(PALETTE.snowShade),
  cane: rgb(PALETTE.deckDark),
};

const lind: CharacterDef = {
  name: 'lind_old',
  look: {
    mats: lindMats,
    head: 'hair',
    skirt: 'coat',
    bulk: -1,
    extras: () => [
      { shape: 'box', c: at('head', 0, 4.4, 4.2), s: [8.6, 1, 0.7], mat: 'eyes', bone: 'head' },
      {
        shape: 'cyl',
        c: at('neck', 0, 0.6),
        s: [3.2, 3.4, 3.4],
        mat: 'trim',
        bone: 'neck',
        seg: 8,
      },
    ],
  },
  stance: 'easy',
  gait: { amp: 0.5, stoop: 13 },
  held: () => ({
    // A cane, planted: drawn upright at the hand in the low pose.
    parts: [
      { shape: 'cyl', c: [0, -18, 0], s: [0.8, 38, 0.8], mat: 'cane', rot: [0, 0, 0], seg: 6 },
      { shape: 'box', c: [0, 1.4, 1.4], s: [1.6, 1.6, 5.6], mat: 'cane' },
    ],
    bone: 'hand_r',
    ref: 'low',
    place: atHand(0, 0, 0),
  }),
};

export const CHARACTER_BUILDERS: Record<string, () => ModelObject> = {
  meridian_trooper: () => buildCharacter(trooper),
  meridian_shield: () => buildCharacter(shielded),
  unstrung_drifter: () => buildCharacter(drifter),
  ines: () => buildCharacter(ines),
  lind_old: () => buildCharacter(lind),
};
