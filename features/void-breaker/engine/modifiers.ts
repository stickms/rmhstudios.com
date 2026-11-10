// ── Void Breaker — run modifiers (mutators) ──────────────────────────────────
// Optional challenge toggles picked before a run: each makes the game harder in
// a specific way and pays out a bonus to Void Cores earned. Lets players tune
// their own difficulty (the AAA-roguelite "pact/challenge" pattern) and gives
// the cores economy a risk/reward lever. Pure data + a combiner so it's testable.

export type ModifierId = 'swarm' | 'frenzy' | 'frail' | 'glasscannon' | 'tempest';

/** The run-start knobs modifiers adjust (also applied by the engine). */
export interface RunModifiers {
  enemySpeedMult: number;
  spawnBudgetMult: number;
  maxHpDelta: number;
  bossAttackMult: number;  // <1 = bosses attack faster
  damageBonus: number;
}

export function neutralModifiers(): RunModifiers {
  return { enemySpeedMult: 1, spawnBudgetMult: 1, maxHpDelta: 0, bossAttackMult: 1, damageBonus: 0 };
}

export interface ModifierDef {
  id: ModifierId;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Added to the Void Cores multiplier (0.3 = +30% cores). */
  coreBonus: number;
  effects: Partial<RunModifiers>;
}

export const MODIFIERS: ModifierDef[] = [
  {
    id: 'swarm', name: 'Swarm', description: '+50% enemies per wave.', icon: '⁂', color: '#66dd55',
    coreBonus: 0.3, effects: { spawnBudgetMult: 1.5 },
  },
  {
    id: 'frenzy', name: 'Frenzy', description: 'Enemies move 25% faster.', icon: '➶', color: '#ff8844',
    coreBonus: 0.3, effects: { enemySpeedMult: 1.25 },
  },
  {
    id: 'frail', name: 'Frail', description: '-1 max HP.', icon: '✜', color: '#ff5577',
    coreBonus: 0.4, effects: { maxHpDelta: -1 },
  },
  {
    id: 'glasscannon', name: 'Glass Cannon', description: '-2 max HP, but +2 bullet damage.', icon: '☼', color: '#ffe066',
    coreBonus: 0.5, effects: { maxHpDelta: -2, damageBonus: 2 },
  },
  {
    id: 'tempest', name: 'Tempest', description: 'Bosses attack ~40% faster.', icon: '⚡', color: '#ff3355',
    coreBonus: 0.35, effects: { bossAttackMult: 0.62 },
  },
];

const BY_ID = new Map(MODIFIERS.map(m => [m.id, m]));

export function getModifier(id: ModifierId): ModifierDef | undefined {
  return BY_ID.get(id);
}

export function isModifierId(v: unknown): v is ModifierId {
  return typeof v === 'string' && BY_ID.has(v as ModifierId);
}

/** Fold a set of active modifier ids into combined run effects + a cores multiplier. */
export function combineModifiers(ids: ModifierId[]): { effects: RunModifiers; coreMult: number } {
  const eff = neutralModifiers();
  let coreBonus = 0;
  for (const id of ids) {
    const m = BY_ID.get(id);
    if (!m) continue;
    coreBonus += m.coreBonus;
    if (m.effects.enemySpeedMult !== undefined) eff.enemySpeedMult *= m.effects.enemySpeedMult;
    if (m.effects.spawnBudgetMult !== undefined) eff.spawnBudgetMult *= m.effects.spawnBudgetMult;
    if (m.effects.maxHpDelta !== undefined) eff.maxHpDelta += m.effects.maxHpDelta;
    if (m.effects.bossAttackMult !== undefined) eff.bossAttackMult *= m.effects.bossAttackMult;
    if (m.effects.damageBonus !== undefined) eff.damageBonus += m.effects.damageBonus;
  }
  return { effects: eff, coreMult: 1 + coreBonus };
}
