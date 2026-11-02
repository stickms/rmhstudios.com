/**
 * Weapon part lists (plan H2.4): the pry bar, pulse pistol, coil rifle and the Tuner, authored
 * once in weapon space — origin at the grip, +Z the muzzle, +Y up, +X left, units — and reused
 * for the world models, the view models and the rifle the troopers carry.
 *
 * Designs are original: the pry bar is a hooked steel bar; the pulse pistol a blocky emitter
 * with two rings; the coil rifle a long barrel wound in copper coils; the Tuner a hand-built
 * two-tine resonance fork with a small amber core.
 */
import { Vector3 } from 'three';
import { PALETTE } from '../palette';
import type { MatDef, Part } from './parts';

export type WeaponName = 'prybar' | 'pulse_pistol' | 'coil_rifle' | 'tuner';

export const WEAPON_MATS: Record<string, MatDef> = {
  steel: { rgb: PALETTE.steelLight },
  steel_mid: { rgb: PALETTE.steelMid },
  steel_dark: { rgb: PALETTE.steelDark },
  rubber: { rgb: PALETTE.hazardBlack },
  copper: { rgb: PALETTE.rustLight },
  copper_dark: { rgb: PALETTE.rustMid },
  amber: { rgb: PALETTE.amber, glow: true },
  ice_glow: { rgb: PALETTE.iceWhite, glow: true },
  frost: { rgb: PALETTE.frostWhite },
};

const cylZ = (
  c: [number, number, number],
  r: number,
  len: number,
  mat: string,
  k?: number,
  seg = 8,
): Part => ({
  shape: 'cyl',
  c,
  s: [r, len, r],
  mat,
  rot: [90, 0, 0],
  k,
  seg,
});
const box = (
  c: [number, number, number],
  s: [number, number, number],
  mat: string,
  rot?: [number, number, number],
): Part => ({
  shape: 'box',
  c,
  s,
  mat,
  rot,
});

/** Parts per weapon. */
export const WEAPON_PARTS: Record<WeaponName, Part[]> = {
  prybar: [
    // Shaft (a flattened round bar), wrapped grip, hooked head, flat claw at the foot.
    cylZ([0, 0, 4], 0.95, 36, 'steel', undefined, 6),
    cylZ([0, 0, -3.5], 1.35, 9, 'rubber', undefined, 6),
    box([0, 0, 22.4], [1.8, 2.4, 3.2], 'steel_mid'),
    box([0, 1.6, 24.6], [1.8, 2.2, 2.6], 'steel', [-35, 0, 0]),
    box([0, 3.2, 25.6], [1.8, 1.6, 2.6], 'steel', [-70, 0, 0]),
    box([0, 0, -15.2], [3.2, 0.8, 4.6], 'steel'),
    box([0, -0.9, -18.1], [3.2, 0.8, 3.2], 'steel_mid', [28, 0, 0]),
    box([0, 0, 1.4], [1.9, 1.9, 0.8], 'amber'),
  ],
  pulse_pistol: [
    // Frame, grip, emitter housing with two rings and a lens.
    box([0, 1.4, 4], [2.6, 4.2, 12], 'steel_mid'),
    box([0, 3.7, 4], [2.2, 0.8, 11], 'steel'),
    box([0, -3.2, -0.6], [2.4, 6.4, 3.4], 'steel_dark', [-14, 0, 0]),
    box([0, -0.9, 2.2], [2.2, 1.2, 4], 'steel_mid'),
    cylZ([0, 1.8, 11], 1.5, 4.2, 'steel', undefined, 8),
    cylZ([0, 1.8, 10.2], 2.0, 0.9, 'steel_mid', undefined, 8),
    cylZ([0, 1.8, 12.4], 2.0, 0.9, 'steel_mid', undefined, 8),
    cylZ([0, 1.8, 13.4], 1.0, 0.5, 'ice_glow', undefined, 8),
    box([0, 1.4, 4], [2.8, 0.8, 5], 'steel_dark'),
  ],
  coil_rifle: [
    // Receiver, stock, grip, magazine, optic rail, long barrel wound in copper coils.
    box([0, 1.2, -1], [3.4, 5.2, 14], 'steel_mid'),
    box([0, 0.4, -12], [3, 4.6, 10], 'steel_mid'),
    box([0, -1, -17.5], [3.2, 7, 1.8], 'rubber'),
    box([0, -4.4, -0.6], [2.6, 7, 3], 'rubber', [-10, 0, 0]),
    box([0, -3.2, 4.5], [2.8, 6, 3.6], 'steel_dark'),
    box([0, 4.3, 0], [2, 1.2, 9], 'steel_mid'),
    box([0, 5.6, 0.5], [1.7, 1.8, 4.5], 'steel_dark'),
    cylZ([0, 1.8, 14], 1.2, 21, 'steel', undefined, 8),
    cylZ([0, 1.8, 9], 2.1, 1.6, 'copper', undefined, 8),
    cylZ([0, 1.8, 12.4], 2.1, 1.6, 'copper', undefined, 8),
    cylZ([0, 1.8, 15.8], 2.1, 1.6, 'copper', undefined, 8),
    cylZ([0, 1.8, 19.2], 2.1, 1.6, 'copper', undefined, 8),
    cylZ([0, 1.8, 22.6], 1.7, 1.2, 'copper_dark', undefined, 8),
    cylZ([0, 1.8, 24.9], 1.5, 0.6, 'ice_glow', undefined, 8),
    box([0, 1.8, 5.5], [3.6, 3.2, 1.2], 'steel_mid'),
  ],
  tuner: [
    // Handle, collar, a shoulder block and two parallel tines with an amber core between them.
    cylZ([0, 0, -5], 1.2, 12, 'rubber', undefined, 6),
    cylZ([0, 0, 1.4], 1.7, 1.6, 'steel_mid', undefined, 8),
    box([0, 0, 3.4], [5.4, 2.4, 2.8], 'steel'),
    box([2.0, 0, 13.4], [0.95, 1.6, 18], 'frost'),
    box([-2.0, 0, 13.4], [0.95, 1.6, 18], 'frost'),
    box([2.0, 0, 22.9], [1.2, 2.0, 1.4], 'steel'),
    box([-2.0, 0, 22.9], [1.2, 2.0, 1.4], 'steel'),
    cylZ([0, 0, 4.2], 1.35, 3.4, 'amber', undefined, 8),
    box([0, 1.6, 3.4], [1, 1.2, 4], 'steel_mid'),
  ],
};

/** The muzzle (or tine tip) of each weapon, weapon space. */
export const WEAPON_MUZZLE: Record<WeaponName, Vector3> = {
  prybar: new Vector3(0, 0, 26),
  pulse_pistol: new Vector3(0, 1.8, 14),
  coil_rifle: new Vector3(0, 1.8, 26),
  tuner: new Vector3(0, 0, 24),
};
