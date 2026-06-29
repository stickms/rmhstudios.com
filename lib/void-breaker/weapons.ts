// ── Void Breaker — weapons (pick one at run start) ───────────────────────────
// Pure data + helpers, mirroring characters.ts. Each weapon has base combat
// stats plus a data-driven `fire` descriptor the engine's firePlayerProj reads.
// No engine import (keeps it unit-testable and avoids a circular dependency).

export type WeaponId = 'pulse' | 'scatter' | 'railgun' | 'grenade' | 'arc';
export type FireMode = 'single' | 'spread' | 'railgun' | 'lob' | 'arc';

export interface WeaponFire {
  mode: FireMode;
  /** Base pellets per shot (extra multishot from PlayerStats stacks on top). */
  pellets?: number;
  /** Angular gap between pellets, radians. */
  spread?: number;
  /** Base pierce baked into the weapon (PlayerStats.pierce adds on top). */
  pierce?: number;
  /** Lob fuse seconds (mode 'lob'). */
  fuse?: number;
  /** Lob blast radius (mode 'lob'). */
  blastRadius?: number;
  /** Base chain hops (mode 'arc'); Chain Lightning upgrade adds more. */
  chains?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  title: string;        // atmospheric subtitle
  description: string;
  icon: string;
  color: string;
  unlockCost: number;   // Void Cores (0 = free)
  baseFireInterval: number; // seconds between shots
  baseDamage: number;       // per projectile, before PlayerStats.damageBonus
  baseProjSpeed: number;
  baseProjRadius: number;
  baseProjLife: number;
  fire: WeaponFire;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'pulse', name: 'Pulse Blaster', title: '脉冲', icon: '⟫', color: '#00f5ff',
    description: 'Balanced rapid-fire single shot. Reliable, no surprises.',
    unlockCost: 0,
    baseFireInterval: 0.20, baseDamage: 1, baseProjSpeed: 550, baseProjRadius: 4, baseProjLife: 2.5,
    fire: { mode: 'single', pellets: 1, spread: 0.12 },
  },
  {
    id: 'scatter', name: 'Scattergun', title: '散射', icon: '⁂', color: '#ff8844',
    description: 'A short-range cone of pellets. Devastating up close, slow to cycle.',
    unlockCost: 60,
    baseFireInterval: 0.55, baseDamage: 1, baseProjSpeed: 600, baseProjRadius: 4, baseProjLife: 0.45,
    fire: { mode: 'spread', pellets: 5, spread: 0.16 },
  },
  {
    id: 'railgun', name: 'Railgun', title: '轨道炮', icon: '➳', color: '#88ddff',
    description: 'Slow, heavy slug that punches through everything in its path.',
    unlockCost: 90,
    baseFireInterval: 0.85, baseDamage: 4, baseProjSpeed: 1100, baseProjRadius: 6, baseProjLife: 1.2,
    fire: { mode: 'railgun', pellets: 1, spread: 0, pierce: 999 },
  },
  {
    id: 'grenade', name: 'Grenade Launcher', title: '榴弹', icon: '✸', color: '#ffaa00',
    description: 'Lobs fused charges that blast on a timer. Area denial.',
    unlockCost: 90,
    baseFireInterval: 0.9, baseDamage: 3, baseProjSpeed: 360, baseProjRadius: 6, baseProjLife: 5,
    fire: { mode: 'lob', pellets: 1, spread: 0, fuse: 1.1, blastRadius: 95 },
  },
  {
    id: 'arc', name: 'Arc Coil', title: '电弧', icon: '⚡', color: '#cc66ff',
    description: 'Bolts that leap to nearby enemies. Born for crowds.',
    unlockCost: 120,
    baseFireInterval: 0.35, baseDamage: 1, baseProjSpeed: 700, baseProjRadius: 4, baseProjLife: 1.6,
    fire: { mode: 'arc', pellets: 1, spread: 0, chains: 2 },
  },
];

const BY_ID = new Map(WEAPONS.map(w => [w.id, w]));
export function getWeapon(id: WeaponId): WeaponDef { return BY_ID.get(id) ?? WEAPONS[0]; }
export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && BY_ID.has(v as WeaponId);
}
