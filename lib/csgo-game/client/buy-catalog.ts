/**
 * The buy menu's catalogue, from the published weapon data: what a team can buy, grouped (pistols,
 * heavy, SMGs, rifles, gear, grenades), with prices — and whether we can afford each now. The host
 * checks every `buy` again (economy.ts); this only lays the menu out. Pure.
 */

import { CS_TEAM_CT, CS_TEAM_T } from '../constants';
import { csWeaponTable, hasCsWeaponData, type CsWeaponInfo } from '../data/weapon-data';

export type BuyGroupId = 'pistols' | 'heavy' | 'smgs' | 'rifles' | 'gear' | 'grenades';
export const BUY_GROUPS: readonly BuyGroupId[] = ['pistols', 'heavy', 'smgs', 'rifles', 'gear', 'grenades'];

export interface BuyEntry {
  /** What `buy` takes (`ak47`, `vest`, `vesthelm`, `defuser`, `hegrenade` …). */
  command: string;
  /** The weapon's short name (`ak47`), or the gear's command: the label and the localisation key. */
  label: string;
  price: number;
  affordable: boolean;
}

const GROUP_OF: Partial<Record<CsWeaponInfo['category'], BuyGroupId>> = {
  pistol: 'pistols',
  shotgun: 'heavy',
  machinegun: 'heavy',
  smg: 'smgs',
  rifle: 'rifles',
  sniper: 'rifles',
  grenade: 'grenades',
};

/** Gear every team buys (the defuse kit: CTs only), by its `buy` name and published item. */
const GEAR: ReadonlyArray<{ command: string; item: string; fallback: number; team: number }> = [
  { command: 'vest', item: 'item_kevlar', fallback: 650, team: 0 },
  { command: 'vesthelm', item: 'item_assaultsuit', fallback: 1000, team: 0 },
  { command: 'defuser', item: 'item_defuser', fallback: 400, team: CS_TEAM_CT },
];

/** The menu for a team with this much money (empty until the weapon data has loaded). */
export function buyCatalog(team: number, money: number): Record<BuyGroupId, BuyEntry[]> {
  const out: Record<BuyGroupId, BuyEntry[]> = { pistols: [], heavy: [], smgs: [], rifles: [], gear: [], grenades: [] };
  if (!hasCsWeaponData() || (team !== CS_TEAM_T && team !== CS_TEAM_CT)) return out;
  const table = csWeaponTable();
  for (const w of table.weapons.values()) {
    const group = GROUP_OF[w.category];
    if (!group || w.price <= 0 || (w.team !== 0 && w.team !== team)) continue;
    out[group].push({ command: w.short, label: w.short, price: w.price, affordable: w.price <= money });
  }
  for (const g of GEAR) {
    if (g.team !== 0 && g.team !== team) continue;
    const price = table.gear.get(g.item as 'item_kevlar')?.price ?? g.fallback;
    out.gear.push({ command: g.command, label: g.command, price, affordable: price <= money });
  }
  for (const id of BUY_GROUPS) if (id !== 'gear') out[id].sort((a, b) => a.price - b.price || a.label.localeCompare(b.label));
  return out;
}
