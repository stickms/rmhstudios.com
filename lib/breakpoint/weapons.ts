// ============================================================
// BREAKPOINT — Weapons + economy
// ============================================================
import type { WeaponDef } from './types';

export const WEAPONS: WeaponDef[] = [
  // ── Sidearms ──
  {
    id: 'classic', name: 'Classic', class: 'sidearm', cost: 0,
    damageBody: 26, damageHead: 78, damageLeg: 22, fireRate: 6.75,
    magazine: 12, reserve: 36, reloadTime: 1.75, spread: 0.012, spreadMoving: 0.05,
    range: 50, automatic: false, color: '#8e8e8e',
  },
  {
    id: 'ghost', name: 'Ghost', class: 'sidearm', cost: 500,
    damageBody: 30, damageHead: 105, damageLeg: 25, fireRate: 6.75,
    magazine: 15, reserve: 45, reloadTime: 1.5, spread: 0.008, spreadMoving: 0.04,
    range: 50, automatic: false, color: '#c9c9c9',
  },
  {
    id: 'sheriff', name: 'Sheriff', class: 'sidearm', cost: 800,
    damageBody: 55, damageHead: 159, damageLeg: 46, fireRate: 4,
    magazine: 6, reserve: 24, reloadTime: 2.25, spread: 0.01, spreadMoving: 0.07,
    range: 50, automatic: false, color: '#d8b06a',
  },
  // ── SMGs ──
  {
    id: 'stinger', name: 'Stinger', class: 'smg', cost: 1100,
    damageBody: 27, damageHead: 67, damageLeg: 22, fireRate: 16,
    magazine: 20, reserve: 60, reloadTime: 2.25, spread: 0.02, spreadMoving: 0.05,
    range: 40, automatic: true, color: '#9aa0b0',
  },
  {
    id: 'spectre', name: 'Spectre', class: 'smg', cost: 1600,
    damageBody: 26, damageHead: 78, damageLeg: 22, fireRate: 13.33,
    magazine: 30, reserve: 90, reloadTime: 2.25, spread: 0.016, spreadMoving: 0.045,
    range: 45, automatic: true, color: '#b6bccb',
  },
  // ── Shotgun ──
  {
    id: 'judge', name: 'Judge', class: 'shotgun', cost: 1850,
    damageBody: 17, damageHead: 34, damageLeg: 14, fireRate: 3.5,
    magazine: 7, reserve: 35, reloadTime: 2.2, spread: 0.06, spreadMoving: 0.09,
    range: 18, automatic: true, pellets: 12, color: '#7d6b55',
  },
  // ── Rifles ──
  {
    id: 'bulldog', name: 'Bulldog', class: 'rifle', cost: 2050,
    damageBody: 35, damageHead: 116, damageLeg: 29, fireRate: 9.15,
    magazine: 24, reserve: 72, reloadTime: 2.5, spread: 0.008, spreadMoving: 0.06,
    range: 60, automatic: true, color: '#6f7787',
  },
  {
    id: 'phantom', name: 'Phantom', class: 'rifle', cost: 2900,
    damageBody: 39, damageHead: 156, damageLeg: 33, fireRate: 11,
    magazine: 30, reserve: 90, reloadTime: 2.5, spread: 0.006, spreadMoving: 0.07,
    range: 60, automatic: true, wallPenetration: 0.5, color: '#cfd4df',
  },
  {
    id: 'vandal', name: 'Vandal', class: 'rifle', cost: 2900,
    damageBody: 40, damageHead: 160, damageLeg: 34, fireRate: 9.75,
    magazine: 25, reserve: 75, reloadTime: 2.5, spread: 0.006, spreadMoving: 0.075,
    range: 70, automatic: true, wallPenetration: 0.6, color: '#b5895a',
  },
  // ── Snipers ──
  {
    id: 'marshal', name: 'Marshal', class: 'sniper', cost: 950,
    damageBody: 101, damageHead: 202, damageLeg: 85, fireRate: 1.5,
    magazine: 5, reserve: 15, reloadTime: 2.5, spread: 0.002, spreadMoving: 0.12,
    range: 90, automatic: false, zoom: 0.45, color: '#9b9b9b',
  },
  {
    id: 'operator', name: 'Operator', class: 'sniper', cost: 4700,
    damageBody: 150, damageHead: 255, damageLeg: 120, fireRate: 0.75,
    magazine: 5, reserve: 10, reloadTime: 3.7, spread: 0.001, spreadMoving: 0.2,
    range: 100, automatic: false, zoom: 0.3, color: '#3a3f4a',
  },
  // ── Heavy ──
  {
    id: 'ares', name: 'Ares', class: 'heavy', cost: 1600,
    damageBody: 30, damageHead: 72, damageLeg: 25, fireRate: 13,
    magazine: 50, reserve: 100, reloadTime: 3.25, spread: 0.012, spreadMoving: 0.05,
    range: 70, automatic: true, color: '#5d6470',
  },
  // ── Melee (always owned) ──
  {
    id: 'knife', name: 'Knife', class: 'melee', cost: 0,
    damageBody: 50, damageHead: 50, damageLeg: 50, fireRate: 1.6,
    magazine: 1, reserve: 0, reloadTime: 0, spread: 0, spreadMoving: 0,
    range: 2.5, automatic: false, color: '#cccccc',
  },
];

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w]),
);

export function getWeapon(id: string): WeaponDef {
  return WEAPON_MAP[id] ?? WEAPON_MAP['classic'];
}

/** Buy-menu groupings (Valorant style columns). */
export const BUY_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'SIDEARMS', ids: ['classic', 'ghost', 'sheriff'] },
  { label: 'SMGS', ids: ['stinger', 'spectre'] },
  { label: 'SHOTGUNS', ids: ['judge'] },
  { label: 'RIFLES', ids: ['bulldog', 'phantom', 'vandal'] },
  { label: 'SNIPERS', ids: ['marshal', 'operator'] },
  { label: 'HEAVY', ids: ['ares'] },
];

export const ARMOR_OPTIONS = [
  { value: 25, cost: 400, label: 'LIGHT SHIELD' },
  { value: 50, cost: 1000, label: 'HEAVY SHIELD' },
];
