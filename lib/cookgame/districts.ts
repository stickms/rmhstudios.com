export type DistrictGate = { type: 'rank'; rank: number } | { type: 'key'; keyId: string };

export interface District {
  id: string;
  name: string;
  gate: DistrictGate | null;
  shops: string[];
  buyers: string[];
}

export const DISTRICTS: Record<string, District> = {
  suburbs: {
    id: 'suburbs',
    name: 'The Suburbs',
    gate: null,
    shops: ['supplier'],
    buyers: ['doug', 'kim', 'pablo'],
  },
  downtown: {
    id: 'downtown',
    name: 'Downtown',
    gate: { type: 'rank', rank: 2 },
    shops: ['hardware'],
    buyers: ['marcus'],
  },
  docks: {
    id: 'docks',
    name: 'The Docks',
    gate: { type: 'key', keyId: 'docks_key' },
    shops: ['afterhours'],
    buyers: ['vera'],
  },
  warehouse: {
    id: 'warehouse',
    name: 'The Warehouse',
    gate: { type: 'rank', rank: 5 },
    shops: [],
    buyers: ['silas'],
  },
};

export function isDistrictUnlocked(id: string, rank: number, keys: string[]): boolean {
  const d = DISTRICTS[id];
  if (!d) return false;
  if (!d.gate) return true;
  if (d.gate.type === 'rank') return rank >= d.gate.rank;
  return keys.includes(d.gate.keyId);
}
