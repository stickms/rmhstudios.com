// ── Void Breaker — roguelite upgrade system ──────────────────────────────────
// On every wave clear the player picks 1 of 3 upgrade cards. Upgrades stack and
// mutate a PlayerStats block that the simulation reads (fire rate, multishot,
// pierce, crit, lifesteal, dash, detonate, …). This is the run-to-run variance
// and power curve the game was missing — the wave-gated abilities are unchanged.

export type UpgradeId =
  | 'rapid_fire'
  | 'multishot'
  | 'high_caliber'
  | 'piercing'
  | 'velocity'
  | 'swift'
  | 'vitality'
  | 'adrenaline'
  | 'bigger_bang'
  | 'siphon'
  | 'deadeye'
  | 'magnetism'
  | 'focus_flow'
  | 'thorns'
  | 'executioner'
  // ── Phase 2a transformers (build-defining) ──
  | 'ricochet'
  | 'chain_lightning'
  | 'explosive_rounds'
  | 'homing_rounds'
  | 'orbitals'
  | 'overcharge'
  // ── Phase 2a synergy fillers ──
  | 'glass_core'
  | 'napalm'
  | 'tesla_capacitor'
  | 'gyro_rounds'
  | 'bloodlust'
  | 'heavy_rounds'
  | 'tachyon';

export type UpgradeRarity = 'common' | 'rare';

/** Mutable per-run stat block read by the simulation. */
export interface PlayerStats {
  /** Multiplies the base fire interval (<1 = faster). */
  fireRateMult: number;
  /** Bullets emitted per shot. */
  projectileCount: number;
  /** Flat bonus damage added to each player bullet. */
  damageBonus: number;
  /** Number of extra enemies a bullet passes through. */
  pierce: number;
  /** Player projectile speed multiplier. */
  projSpeedMult: number;
  /** Movement speed multiplier. */
  moveSpeedMult: number;
  /** Bonus max HP granted (applied immediately on pick). */
  maxHpBonus: number;
  /** Dash cooldown multiplier (<1 = faster recharge). */
  dashCooldownMult: number;
  /** Void Burst radius multiplier. */
  detonateRadiusMult: number;
  /** Flat bonus Void Burst damage. */
  detonateDamageBonus: number;
  /** Chance (0–1) to heal 1 HP on kill. */
  lifestealChance: number;
  /** Chance (0–1) for a bullet to critically strike. */
  critChance: number;
  /** Crit damage multiplier. */
  critMult: number;
  /** Shard magnet range multiplier. */
  magnetMult: number;
  /** Focus cooldown multiplier (<1 = faster). */
  focusCooldownMult: number;
  /** Contact damage reflected back to enemies that hit the player. */
  thornsDamage: number;
  /** Transformer: ricochet hops per bullet (0 = none). */
  bounceCount: number;
  /** Transformer: chain-lightning hops added to every bullet (0 = none). */
  chainCount: number;
  /** Transformer: bullets explode on impact. */
  explodeOnHit: boolean;
  /** Explosion radius when explodeOnHit. */
  explodeRadius: number;
  /** Transformer: bullet homing turn rate (rad/s, 0 = none). */
  homingTurn: number;
  /** Transformer: number of orbiting blades around the player. */
  orbitalCount: number;
  /** Transformer: every Nth shot is empowered (0 = off). */
  overchargeEvery: number;
}

export function makePlayerStats(): PlayerStats {
  return {
    fireRateMult: 1,
    projectileCount: 1,
    damageBonus: 0,
    pierce: 0,
    projSpeedMult: 1,
    moveSpeedMult: 1,
    maxHpBonus: 0,
    dashCooldownMult: 1,
    detonateRadiusMult: 1,
    detonateDamageBonus: 0,
    lifestealChance: 0,
    critChance: 0,
    critMult: 2,
    magnetMult: 1,
    focusCooldownMult: 1,
    thornsDamage: 0,
    bounceCount: 0,
    chainCount: 0,
    explodeOnHit: false,
    explodeRadius: 0,
    homingTurn: 0,
    orbitalCount: 0,
    overchargeEvery: 0,
  };
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Short flavor + effect description for the card. */
  description: string;
  rarity: UpgradeRarity;
  /** How many times this upgrade can be taken. */
  maxStacks: number;
  /** Accent color for the card. */
  color: string;
  /** Single-glyph icon for the card. */
  icon: string;
  /** Mutates the stat block (called once per pick). */
  apply: (s: PlayerStats) => void;
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    id: 'rapid_fire', name: 'Rapid Fire', rarity: 'common', maxStacks: 5,
    color: '#00f5ff', icon: '⟫',
    description: '+18% fire rate.',
    apply: (s) => { s.fireRateMult *= 0.82; },
  },
  {
    id: 'multishot', name: 'Split Shot', rarity: 'rare', maxStacks: 3,
    color: '#ff00cc', icon: '⋔',
    description: '+1 bullet per shot.',
    apply: (s) => { s.projectileCount += 1; },
  },
  {
    id: 'high_caliber', name: 'High Caliber', rarity: 'common', maxStacks: 5,
    color: '#ffaa00', icon: '◆',
    description: '+1 bullet damage.',
    apply: (s) => { s.damageBonus += 1; },
  },
  {
    id: 'piercing', name: 'Piercing Rounds', rarity: 'rare', maxStacks: 3,
    color: '#44ddff', icon: '⇶',
    description: 'Bullets pierce +1 enemy.',
    apply: (s) => { s.pierce += 1; },
  },
  {
    id: 'velocity', name: 'Overvelocity', rarity: 'common', maxStacks: 4,
    color: '#88ddff', icon: '➤',
    description: '+25% bullet speed.',
    apply: (s) => { s.projSpeedMult *= 1.25; },
  },
  {
    id: 'swift', name: 'Swift Step', rarity: 'common', maxStacks: 4,
    color: '#00ff88', icon: '⚡',
    description: '+12% move speed.',
    apply: (s) => { s.moveSpeedMult *= 1.12; },
  },
  {
    id: 'vitality', name: 'Vitality', rarity: 'rare', maxStacks: 4,
    color: '#ff4477', icon: '♥',
    description: '+1 max HP, fully restored.',
    apply: (s) => { s.maxHpBonus += 1; },
  },
  {
    id: 'adrenaline', name: 'Adrenaline', rarity: 'common', maxStacks: 4,
    color: '#ff8844', icon: '»',
    description: '-20% dash cooldown.',
    apply: (s) => { s.dashCooldownMult *= 0.8; },
  },
  {
    id: 'bigger_bang', name: 'Bigger Bang', rarity: 'common', maxStacks: 4,
    color: '#ff6644', icon: '✸',
    description: '+25% Void Burst radius, +1 damage.',
    apply: (s) => { s.detonateRadiusMult *= 1.25; s.detonateDamageBonus += 1; },
  },
  {
    id: 'siphon', name: 'Siphon', rarity: 'rare', maxStacks: 4,
    color: '#cc66ff', icon: '✛',
    description: '+6% chance to heal on kill.',
    apply: (s) => { s.lifestealChance = Math.min(0.4, s.lifestealChance + 0.06); },
  },
  {
    id: 'deadeye', name: 'Deadeye', rarity: 'common', maxStacks: 5,
    color: '#ffe066', icon: '✶',
    description: '+12% critical hit chance (2× damage).',
    apply: (s) => { s.critChance = Math.min(0.75, s.critChance + 0.12); },
  },
  {
    id: 'magnetism', name: 'Magnetism', rarity: 'common', maxStacks: 3,
    color: '#d4af37', icon: '◎',
    description: '+40% shard magnet range.',
    apply: (s) => { s.magnetMult *= 1.4; },
  },
  {
    id: 'focus_flow', name: 'Focus Flow', rarity: 'common', maxStacks: 3,
    color: '#44ffff', icon: '◓',
    description: '-20% Focus cooldown.',
    apply: (s) => { s.focusCooldownMult *= 0.8; },
  },
  {
    id: 'thorns', name: 'Void Thorns', rarity: 'rare', maxStacks: 3,
    color: '#ff5599', icon: '✺',
    description: 'Enemies that touch you take 2 damage.',
    apply: (s) => { s.thornsDamage += 2; },
  },
  {
    id: 'executioner', name: 'Executioner', rarity: 'rare', maxStacks: 3,
    color: '#ffe066', icon: '☠',
    description: '+6% crit chance and +0.3× crit damage.',
    apply: (s) => { s.critChance = Math.min(0.75, s.critChance + 0.06); s.critMult += 0.3; },
  },

  // ── Transformers (build-defining; rare) ──────────────────────────────────────
  {
    id: 'ricochet', name: 'Ricochet', rarity: 'rare', maxStacks: 2,
    color: '#7dffea', icon: '⟲',
    description: 'Bullets bounce to a new target after a hit (+1 hop).',
    apply: (s) => { s.bounceCount += 1; },
  },
  {
    id: 'chain_lightning', name: 'Chain Lightning', rarity: 'rare', maxStacks: 2,
    color: '#b388ff', icon: '⚡',
    description: 'Hits arc to +2 nearby enemies.',
    apply: (s) => { s.chainCount += 2; },
  },
  {
    id: 'explosive_rounds', name: 'Explosive Rounds', rarity: 'rare', maxStacks: 1,
    color: '#ff7a33', icon: '✸',
    description: 'Bullets explode on impact for area damage.',
    apply: (s) => { s.explodeOnHit = true; s.explodeRadius = Math.max(s.explodeRadius, 70); },
  },
  {
    id: 'homing_rounds', name: 'Seeker Rounds', rarity: 'rare', maxStacks: 2,
    color: '#66ffb3', icon: '⌖',
    description: 'Bullets curve toward the nearest enemy.',
    apply: (s) => { s.homingTurn += 4; },
  },
  {
    id: 'orbitals', name: 'Void Orbitals', rarity: 'rare', maxStacks: 3,
    color: '#00f5ff', icon: '◓',
    description: '+1 orbiting blade that shreds enemies on contact.',
    apply: (s) => { s.orbitalCount += 1; },
  },
  {
    id: 'overcharge', name: 'Overcharge', rarity: 'rare', maxStacks: 3,
    color: '#ffe066', icon: '↯',
    description: 'Every Nth shot is empowered (cadence improves per stack).',
    apply: (s) => { s.overchargeEvery = s.overchargeEvery === 0 ? 5 : Math.max(3, s.overchargeEvery - 1); },
  },

  // ── Synergy fillers ──────────────────────────────────────────────────────────
  {
    id: 'glass_core', name: 'Glass Core', rarity: 'rare', maxStacks: 1,
    color: '#ff5577', icon: '◈',
    description: '+3 bullet damage, but -1 max HP.',
    apply: (s) => { s.damageBonus += 3; s.maxHpBonus -= 1; },
  },
  {
    id: 'napalm', name: 'Napalm', rarity: 'rare', maxStacks: 3,
    color: '#ff7a33', icon: '✺',
    description: '+25 explosion radius (needs Explosive Rounds).',
    apply: (s) => { s.explodeRadius += 25; },
  },
  {
    id: 'tesla_capacitor', name: 'Tesla Capacitor', rarity: 'rare', maxStacks: 2,
    color: '#b388ff', icon: '⌁',
    description: '+1 chain hop (needs Chain Lightning).',
    apply: (s) => { s.chainCount += 1; },
  },
  {
    id: 'gyro_rounds', name: 'Gyro Rounds', rarity: 'common', maxStacks: 3,
    color: '#66ffb3', icon: '➶',
    description: '+turn rate on homing bullets (needs Seeker Rounds).',
    apply: (s) => { s.homingTurn += 2; },
  },
  {
    id: 'bloodlust', name: 'Bloodlust', rarity: 'rare', maxStacks: 3,
    color: '#cc3366', icon: '❥',
    description: '+8% chance to heal on kill.',
    apply: (s) => { s.lifestealChance = Math.min(0.4, s.lifestealChance + 0.08); },
  },
  {
    id: 'heavy_rounds', name: 'Heavy Rounds', rarity: 'common', maxStacks: 4,
    color: '#ffaa00', icon: '◆',
    description: '+2 bullet damage.',
    apply: (s) => { s.damageBonus += 2; },
  },
  {
    id: 'tachyon', name: 'Tachyon Drive', rarity: 'common', maxStacks: 3,
    color: '#88ddff', icon: '➤',
    description: '+30% bullet speed.',
    apply: (s) => { s.projSpeedMult *= 1.3; },
  },
];

const UPGRADE_BY_ID = new Map(UPGRADE_DEFS.map((d) => [d.id, d]));

export function getUpgradeDef(id: UpgradeId): UpgradeDef | undefined {
  return UPGRADE_BY_ID.get(id);
}

/** A card offered to the player (lightweight, serializable for the HUD). */
export interface UpgradeChoice {
  id: UpgradeId;
  name: string;
  description: string;
  rarity: UpgradeRarity;
  color: string;
  icon: string;
  /** Stack count the player already owns (for "Lv 2" style hints). */
  owned: number;
}

/**
 * Roll up to `count` distinct upgrade choices, skipping any that are maxed.
 * On boss rewards we bias the roll toward rare upgrades.
 */
export function rollUpgradeChoices(
  stacks: Partial<Record<UpgradeId, number>>,
  count: number,
  bossReward: boolean,
): UpgradeChoice[] {
  const pool = UPGRADE_DEFS.filter((d) => (stacks[d.id] ?? 0) < d.maxStacks);
  // Weighted shuffle: each entry gets a random key scaled by its rarity weight.
  const weighted = pool.map((d) => {
    const rareBoost = d.rarity === 'rare' ? (bossReward ? 2.2 : 0.8) : 1;
    return { d, key: Math.random() * rareBoost };
  });
  weighted.sort((a, b) => b.key - a.key);
  return weighted.slice(0, count).map(({ d }) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    rarity: d.rarity,
    color: d.color,
    icon: d.icon,
    owned: stacks[d.id] ?? 0,
  }));
}
