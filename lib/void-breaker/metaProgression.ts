// ── Void Breaker — meta-progression ──────────────────────────────────────────
// Persistent between-run upgrades. Each run banks "Void Cores" (from score +
// bosses), spent in the Void Forge on permanent starting bonuses. Pure logic +
// a localStorage load/save (SSR/test-guarded) so it's fully unit-testable.

import { getCharacter, type CharacterId } from './characters';

export type MetaNodeId = 'vitality' | 'arsenal' | 'swift' | 'reserves' | 'quickdraw';

export interface MetaState {
  cores: number;
  levels: Partial<Record<MetaNodeId, number>>;
  /** Characters bought with cores (Striker is always available). */
  unlocked?: CharacterId[];
}

export interface MetaNodeDef {
  id: MetaNodeId;
  name: string;
  description: string;
  icon: string;
  color: string;
  maxLevel: number;
  baseCost: number;
  costMult: number;
}

export const META_NODES: MetaNodeDef[] = [
  { id: 'vitality', name: 'Reinforced Core', description: '+1 starting max HP', icon: '♥', color: '#ff4477', maxLevel: 3, baseCost: 30, costMult: 2.2 },
  { id: 'arsenal', name: 'Calibrated Arsenal', description: '+1 starting bullet damage', icon: '◆', color: '#ffaa00', maxLevel: 3, baseCost: 40, costMult: 2.3 },
  { id: 'swift', name: 'Light Frame', description: '+6% move speed', icon: '⚡', color: '#00ff88', maxLevel: 3, baseCost: 25, costMult: 1.9 },
  { id: 'reserves', name: 'Shard Reserves', description: 'Start each run with +3 shards', icon: '◈', color: '#d4af37', maxLevel: 3, baseCost: 20, costMult: 1.7 },
  { id: 'quickdraw', name: 'Quickdraw', description: '+8% fire rate', icon: '⟫', color: '#00f5ff', maxLevel: 3, baseCost: 35, costMult: 2.1 },
];

const NODE_BY_ID = new Map(META_NODES.map(n => [n.id, n]));
const STORAGE_KEY = 'vb-meta';

export function getNodeDef(id: MetaNodeId): MetaNodeDef | undefined {
  return NODE_BY_ID.get(id);
}

export function emptyMeta(): MetaState {
  return { cores: 0, levels: {} };
}

/** Cost to buy the NEXT level of a node given its current level. */
export function nodeCost(def: MetaNodeDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costMult, currentLevel));
}

export function nodeLevel(state: MetaState, id: MetaNodeId): number {
  return state.levels[id] ?? 0;
}

export function canBuy(state: MetaState, id: MetaNodeId): boolean {
  const def = NODE_BY_ID.get(id);
  if (!def) return false;
  const lvl = nodeLevel(state, id);
  return lvl < def.maxLevel && state.cores >= nodeCost(def, lvl);
}

/** Buy the next level of a node. Returns a NEW state (no mutation). */
export function buyNode(state: MetaState, id: MetaNodeId): MetaState {
  const def = NODE_BY_ID.get(id);
  if (!def || !canBuy(state, id)) return state;
  const lvl = nodeLevel(state, id);
  return {
    cores: state.cores - nodeCost(def, lvl),
    levels: { ...state.levels, [id]: lvl + 1 },
  };
}

// ── Character unlocks ────────────────────────────────────────────────────────

export function isCharUnlocked(state: MetaState, id: CharacterId): boolean {
  return getCharacter(id).unlockCost === 0 || (state.unlocked ?? []).includes(id);
}

export function canUnlockChar(state: MetaState, id: CharacterId): boolean {
  return !isCharUnlocked(state, id) && state.cores >= getCharacter(id).unlockCost;
}

/** Spend cores to permanently unlock a character. Returns a NEW state. */
export function unlockChar(state: MetaState, id: CharacterId): MetaState {
  if (!canUnlockChar(state, id)) return state;
  return {
    ...state,
    cores: state.cores - getCharacter(id).unlockCost,
    unlocked: [...(state.unlocked ?? []), id],
  };
}

/** Cores awarded for a finished run. */
export function awardCores(score: number, bossesKilled: number, wave: number): number {
  return Math.floor(score / 800) + bossesKilled * 3 + Math.floor(wave / 2);
}

export interface MetaBonuses {
  bonusMaxHp: number;
  damageBonus: number;
  moveSpeedMult: number;
  startShards: number;
  fireRateMult: number;
}

/** Translate purchased levels into the bonuses the engine applies at run start. */
export function metaBonuses(state: MetaState): MetaBonuses {
  return {
    bonusMaxHp: nodeLevel(state, 'vitality'),
    damageBonus: nodeLevel(state, 'arsenal'),
    moveSpeedMult: Math.pow(1.06, nodeLevel(state, 'swift')),
    startShards: nodeLevel(state, 'reserves') * 3,
    fireRateMult: Math.pow(0.92, nodeLevel(state, 'quickdraw')),
  };
}

// ── Persistence (browser only) ───────────────────────────────────────────────

export function loadMeta(): MetaState {
  if (typeof window === 'undefined') return emptyMeta();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMeta();
    const parsed = JSON.parse(raw) as MetaState;
    return {
      cores: Math.max(0, Math.floor(parsed.cores ?? 0)),
      levels: parsed.levels ?? {},
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
    };
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(state: MetaState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}
