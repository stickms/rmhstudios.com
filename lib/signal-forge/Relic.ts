export type RelicRarity = 'common' | 'uncommon' | 'rare';

export interface RelicData {
  id: number;
  name: string;
  description: string;
  rarity: RelicRarity;
  /** Unique key used by the game engine to apply this relic's effect */
  key?: string;
}

/**
 * Relic class — passive upgrade with a `key` that the game engine
 * uses to apply mechanical effects during combat.
 */
export class Relic implements RelicData {
  id: number;
  name: string;
  description: string;
  rarity: RelicRarity;
  key?: string;

  constructor(data: RelicData) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.rarity = data.rarity;
    if (data.key) this.key = data.key;
  }

  getRarity(): RelicRarity {
    return this.rarity;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onAcquire(_gs: Record<string, unknown>): Record<string, unknown> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCombatStart(_gs: Record<string, unknown>): Record<string, unknown> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCardPlayed(_cardId: number, _gs: Record<string, unknown>): Record<string, unknown> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onEndTurn(_gs: Record<string, unknown>): Record<string, unknown> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDamageTaken(_damage: number, _gs: Record<string, unknown>): Record<string, unknown> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCombatVictory(_gs: Record<string, unknown>): Record<string, unknown> { return {}; }

  clone(newId: number): Relic {
    return new Relic({ ...this.toData(), id: newId });
  }

  toData(): RelicData {
    const d: RelicData = {
      id: this.id,
      name: this.name,
      description: this.description,
      rarity: this.rarity,
    };
    if (this.key) d.key = this.key;
    return d;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RELIC CATALOG — all 12 relics from the design spec
// ═══════════════════════════════════════════════════════════════════════

export interface RelicTemplate {
  name: string;
  description: string;
  rarity: RelicRarity;
  key: string;
}

export const RELIC_CATALOG: RelicTemplate[] = [
  // ── COMMON ────────────────────────────────
  {
    key: 'oscillator_core',
    name: 'Oscillator Core',
    description: 'First Pulse card each turn costs 0 energy.',
    rarity: 'common',
  },
  {
    key: 'static_sink',
    name: 'Static Sink',
    description: 'Remove 1 Static at end of each turn.',
    rarity: 'common',
  },
  {
    key: 'shield_battery',
    name: 'Shield Battery',
    description: '+2 Shield at start of each turn.',
    rarity: 'common',
  },
  {
    key: 'tempo_gear',
    name: 'Tempo Gear',
    description: '+1 bonus tempo on first sequence match each turn.',
    rarity: 'common',
  },
  {
    key: 'stability_core',
    name: 'Stability Core',
    description: 'Glitch threshold raised from 4 to 6 Static.',
    rarity: 'common',
  },
  // Phase 5.1 — New common relics
  {
    key: 'burn_fuel',
    name: 'Burn Fuel',
    description: 'Draw 1 card whenever you exhaust a card.',
    rarity: 'common',
  },
  {
    key: 'momentum_core',
    name: 'Momentum Core',
    description: 'If you play 4+ cards in a turn, all cards cost 1 less next turn.',
    rarity: 'common',
  },
  {
    key: 'healing_pulse',
    name: 'Healing Pulse',
    description: 'Heal 3 HP whenever you complete a Forge Burst.',
    rarity: 'common',
  },
  {
    key: 'type_master',
    name: 'Type Master',
    description: 'Gain +1 energy if you play 3+ different waveform types in one turn.',
    rarity: 'common',
  },
  {
    key: 'damage_echo',
    name: 'Damage Echo',
    description: 'When you deal 15+ damage to one enemy, deal 5 splash damage to all others.',
    rarity: 'common',
  },
  // ── UNCOMMON ──────────────────────────────
  {
    key: 'coil_capacitor',
    name: 'Coil Capacitor',
    description: '+1 Energy at the start of combat.',
    rarity: 'uncommon',
  },
  {
    key: 'signal_mirror',
    name: 'Signal Mirror',
    description: 'First Saw card each turn deals +3 damage.',
    rarity: 'uncommon',
  },
  {
    key: 'echo_node',
    name: 'Echo Node',
    description: 'Draw 1 card after a Forge Burst (sequence match).',
    rarity: 'uncommon',
  },
  {
    key: 'fault_lens',
    name: 'Fault Lens',
    description: 'Gain +10♪ whenever a Glitch card is created.',
    rarity: 'uncommon',
  },
  {
    key: 'sine_loom',
    name: 'Sine Loom',
    description: 'Shield no longer decays at end of turn.',
    rarity: 'uncommon',
  },
  {
    key: 'energy_conduit',
    name: 'Energy Conduit',
    description: '+1 Energy at the start of each turn.',
    rarity: 'uncommon',
  },
  // Phase 5.2 — New uncommon relics
  {
    key: 'bleed_catalyst',
    name: 'Bleed Catalyst',
    description: 'All Bleed effects deal +2 extra damage per stack.',
    rarity: 'uncommon',
  },
  {
    key: 'freeze_amplifier',
    name: 'Freeze Amplifier',
    description: 'Frozen enemies skip 2 turns instead of 1.',
    rarity: 'uncommon',
  },
  {
    key: 'vulnerable_lens',
    name: 'Vulnerable Lens',
    description: 'Vulnerable increases damage taken by +75% instead of +50%.',
    rarity: 'uncommon',
  },
  {
    key: 'retention_matrix',
    name: 'Retention Matrix',
    description: 'Draw 1 extra card at start of turn for each Retain card in hand.',
    rarity: 'uncommon',
  },
  {
    key: 'piercing_edge',
    name: 'Piercing Edge',
    description: 'All cards gain Piercing (ignore armor).',
    rarity: 'uncommon',
  },
  {
    key: 'safe_landing',
    name: 'Safe Landing',
    description: 'Once per combat, survive a fatal blow with 1 HP.',
    rarity: 'uncommon',
  },
  // ── RARE ──────────────────────────────────
  {
    key: 'clean_room',
    name: 'Clean Room',
    description: 'Glitch cards are immediately exhausted when drawn.',
    rarity: 'rare',
  },
  {
    key: 'phase_shifter',
    name: 'Phase Shifter',
    description: 'One step of each sequence is treated as a wildcard.',
    rarity: 'rare',
  },
  {
    key: 'harmonic_resonator',
    name: 'Harmonic Resonator',
    description: 'Playing 2+ cards of the same type in a turn deals +4 bonus damage.',
    rarity: 'rare',
  },
  {
    key: 'expanded_buffer',
    name: 'Expanded Buffer',
    description: 'Draw 1 extra card each turn (hand size 5 → 6).',
    rarity: 'uncommon',
  },
  // Phase 5.3 — New rare relics
  {
    key: 'temporal_anchor',
    name: 'Temporal Anchor',
    description: 'Tempo doesn\'t reset at end of turn. Instead, lose 2 tempo per turn (min 0).',
    rarity: 'rare',
  },
  {
    key: 'void_harvester',
    name: 'Void Harvester',
    description: 'Each exhausted card grants +2 permanent damage to ALL cards for rest of combat.',
    rarity: 'rare',
  },
  {
    key: 'dual_wield',
    name: 'Dual Wield',
    description: 'First card you play each turn triggers twice (same energy cost).',
    rarity: 'rare',
  },
  {
    key: 'glitch_forge',
    name: 'Glitch Forge',
    description: 'Glitch cards transform into random uncommon cards when drawn.',
    rarity: 'rare',
  },
];

// ═══════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Create a relic from the catalog by key */
export function createRelicByKey(key: string, id: number): Relic {
  const def = RELIC_CATALOG.find(r => r.key === key);
  if (!def) throw new Error(`Unknown relic key: ${key}`);
  return new Relic({ id, name: def.name, description: def.description, rarity: def.rarity, key: def.key });
}

/** Create a random relic for a shop */
export function createRandomRelic(floor: number, index: number, id: number): Relic {
  const seed = floor * 2000 + index * 211;
  const idx = Math.floor(seededRandom(seed) * RELIC_CATALOG.length);
  const def = RELIC_CATALOG[idx];
  return new Relic({ id, name: def.name, description: def.description, rarity: def.rarity, key: def.key });
}

/** Create N relics for a shop floor */
export function createShopRelics(floor: number, count: number = 2): Relic[] {
  const relics: Relic[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < count; i++) {
    const id = floor * 2000 + i;
    let seed = floor * 2000 + i * 211;
    let idx = Math.floor(seededRandom(seed) * RELIC_CATALOG.length);

    // Avoid offering duplicate relics in the same shop
    let attempts = 0;
    while (usedIndices.has(idx) && attempts < 10) {
      seed += 37;
      idx = Math.floor(seededRandom(seed) * RELIC_CATALOG.length);
      attempts++;
    }
    usedIndices.add(idx);

    const def = RELIC_CATALOG[idx];
    relics.push(new Relic({ id, name: def.name, description: def.description, rarity: def.rarity, key: def.key }));
  }

  return relics;
}

export function deserializeRelic(data: RelicData): Relic {
  return new Relic(data);
}
