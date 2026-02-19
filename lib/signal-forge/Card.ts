export type WaveformType = 'Pulse' | 'Sine' | 'Saw' | 'Noise';
export type CardRarity = 'common' | 'uncommon' | 'rare';

export interface CardData {
  id: number;
  name: string;
  cost: number;
  type: WaveformType;
  damage: number;
  shield: number;
  effect: string;
  rarity: CardRarity;
  // Optional ability fields
  draw?: number;           // draw N extra cards when played
  keywords?: string[];     // display tags: 'Echo','AOE','Exhaust','Sustain','Wildcard','Stabilize','Leech','Glitch'
  aoe?: boolean;           // damage hits ALL enemies
  selfDamage?: number;     // deal N damage to self on play
  stabilize?: number;      // remove N Glitch cards from discard
  staticGain?: number;     // gain N extra Static on play
  staticReduce?: number;   // reduce Static by N on play
  tempoGain?: number;      // bonus tempo beyond the default +1
  glitchGen?: number;      // insert N Glitch cards into discard
  isGlitch?: boolean;      // this card is a Glitch card
  exhaust?: boolean;       // removed from deck after being played
  sustain?: boolean;       // stays in hand instead of discarding
  echo?: boolean;          // repeat damage/shield at 50%
  wildcard?: boolean;      // counts as ANY waveform for sequences
  leech?: number;          // heal for N% of damage dealt
  // New keywords (Phase 2.2)
  piercing?: boolean;      // Ignores enemy Armored reduction
  chain?: boolean;         // Next card of same waveform type costs -1 energy
  growing?: number;        // +N damage/shield each time played this combat
  retain?: boolean;        // Stays in hand between turns
  multihit?: number;       // Hits target N times
  bleed?: number;          // Applies N stacks of Bleed to target
  freeze?: boolean;        // Applies Freeze to target
  vulnerable?: number;     // Applies N turns of Vulnerable to target
  weak?: number;           // Applies N turns of Weak to target
  innate?: boolean;        // Always in opening hand at start of combat
  ethereal?: boolean;      // If not played this turn, exhaust at end of turn
  siphon?: number;         // Steal N shield from target enemy and add to player
}

/**
 * Card class — supports keywords, special abilities, and extensible hooks.
 */
export class Card implements CardData {
  id: number;
  name: string;
  cost: number;
  type: WaveformType;
  damage: number;
  shield: number;
  effect: string;
  rarity: CardRarity;
  draw?: number;
  keywords?: string[];
  aoe?: boolean;
  selfDamage?: number;
  stabilize?: number;
  staticGain?: number;
  staticReduce?: number;
  tempoGain?: number;
  glitchGen?: number;
  isGlitch?: boolean;
  exhaust?: boolean;
  sustain?: boolean;
  echo?: boolean;
  wildcard?: boolean;
  leech?: number;
  // New keywords
  piercing?: boolean;
  chain?: boolean;
  growing?: number;
  retain?: boolean;
  multihit?: number;
  bleed?: number;
  freeze?: boolean;
  vulnerable?: number;
  weak?: number;
  innate?: boolean;
  ethereal?: boolean;
  siphon?: number;
  // Growing counter (tracks plays this combat)
  growthCounter: number = 0;

  constructor(data: CardData) {
    this.id = data.id;
    this.name = data.name;
    this.cost = data.cost;
    this.type = data.type;
    this.damage = data.damage;
    this.shield = data.shield;
    this.effect = data.effect;
    this.rarity = data.rarity;
    if (data.draw !== undefined) this.draw = data.draw;
    if (data.keywords) this.keywords = [...data.keywords];
    if (data.aoe) this.aoe = data.aoe;
    if (data.selfDamage !== undefined) this.selfDamage = data.selfDamage;
    if (data.stabilize !== undefined) this.stabilize = data.stabilize;
    if (data.staticGain !== undefined) this.staticGain = data.staticGain;
    if (data.staticReduce !== undefined) this.staticReduce = data.staticReduce;
    if (data.tempoGain !== undefined) this.tempoGain = data.tempoGain;
    if (data.glitchGen !== undefined) this.glitchGen = data.glitchGen;
    if (data.isGlitch) this.isGlitch = data.isGlitch;
    if (data.exhaust) this.exhaust = data.exhaust;
    if (data.sustain) this.sustain = data.sustain;
    if (data.echo) this.echo = data.echo;
    if (data.wildcard) this.wildcard = data.wildcard;
    if (data.leech !== undefined) this.leech = data.leech;
    // New keywords
    if (data.piercing) this.piercing = data.piercing;
    if (data.chain) this.chain = data.chain;
    if (data.growing !== undefined) this.growing = data.growing;
    if (data.retain) this.retain = data.retain;
    if (data.multihit !== undefined) this.multihit = data.multihit;
    if (data.bleed !== undefined) this.bleed = data.bleed;
    if (data.freeze) this.freeze = data.freeze;
    if (data.vulnerable !== undefined) this.vulnerable = data.vulnerable;
    if (data.weak !== undefined) this.weak = data.weak;
    if (data.innate) this.innate = data.innate;
    if (data.ethereal) this.ethereal = data.ethereal;
    if (data.siphon !== undefined) this.siphon = data.siphon;
  }

  getDamage(): number {
    return this.damage;
  }

  getShield(): number {
    return this.shield;
  }

  getCost(): number {
    return this.cost;
  }

  /** Total damage including Echo (50% repeat) and Growing */
  getEffectiveDamage(): number {
    let dmg = this.damage;
    if (this.growing) dmg += this.growthCounter * this.growing;
    if (this.echo) dmg = Math.floor(dmg * 1.5);
    return dmg;
  }

  /** Total shield including Echo (50% repeat) and Growing */
  getEffectiveShield(): number {
    let shd = this.shield;
    if (this.growing) shd += this.growthCounter * this.growing;
    if (this.echo) shd = Math.floor(shd * 1.5);
    return shd;
  }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPlay(_gs: Record<string, unknown>): Record<string, unknown> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onEndTurn(_gs: Record<string, unknown>): Record<string, unknown> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDraw(_gs: Record<string, unknown>): Record<string, unknown> { return {}; }

  clone(newId: number): Card {
    return new Card({ ...this.toData(), id: newId });
  }

  toData(): CardData {
    const d: CardData = {
      id: this.id, name: this.name, cost: this.cost, type: this.type,
      damage: this.damage, shield: this.shield, effect: this.effect, rarity: this.rarity,
    };
    if (this.draw !== undefined) d.draw = this.draw;
    if (this.keywords) d.keywords = [...this.keywords];
    if (this.aoe) d.aoe = true;
    if (this.selfDamage !== undefined) d.selfDamage = this.selfDamage;
    if (this.stabilize !== undefined) d.stabilize = this.stabilize;
    if (this.staticGain !== undefined) d.staticGain = this.staticGain;
    if (this.staticReduce !== undefined) d.staticReduce = this.staticReduce;
    if (this.tempoGain !== undefined) d.tempoGain = this.tempoGain;
    if (this.glitchGen !== undefined) d.glitchGen = this.glitchGen;
    if (this.isGlitch) d.isGlitch = true;
    if (this.exhaust) d.exhaust = true;
    if (this.sustain) d.sustain = true;
    if (this.echo) d.echo = true;
    if (this.wildcard) d.wildcard = true;
    if (this.leech !== undefined) d.leech = this.leech;
    return d;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NAMED CARD CATALOG — all cards from the design spec
// ═══════════════════════════════════════════════════════════════════════

type CardTemplate = Omit<CardData, 'id'>;

// ── COMMON: core sequence builders ──────────────────────────────────

export const COMMON_CARDS: Record<string, CardTemplate> = {
  pulse_strike: {
    name: 'Pulse Strike', cost: 1, type: 'Pulse', damage: 6, shield: 0,
    effect: 'Deal 6 damage', rarity: 'common',
  },
  pulse_tap: {
    name: 'Pulse Tap', cost: 0, type: 'Pulse', damage: 3, shield: 0,
    effect: 'Deal 3 damage', rarity: 'common',
  },
  sine_guard: {
    name: 'Sine Guard', cost: 1, type: 'Sine', damage: 0, shield: 7,
    effect: 'Gain 7 shield', rarity: 'common',
  },
  sine_bridge: {
    name: 'Sine Bridge', cost: 1, type: 'Sine', damage: 0, shield: 4,
    effect: 'Gain 4 shield, draw 1', rarity: 'common',
    draw: 1, keywords: ['Draw'],
  },
  saw_rush: {
    name: 'Saw Rush', cost: 1, type: 'Saw', damage: 5, shield: 0,
    effect: 'Deal 5, draw 1', rarity: 'common',
    draw: 1, keywords: ['Draw'],
  },
  saw_latch: {
    name: 'Saw Latch', cost: 1, type: 'Saw', damage: 4, shield: 0,
    effect: 'Deal 4, +2 tempo', rarity: 'common',
    tempoGain: 2,
  },
  noise_spike: {
    name: 'Noise Spike', cost: 2, type: 'Noise', damage: 9, shield: 0,
    effect: 'Deal 9, +1 Static', rarity: 'common',
    staticGain: 1,
  },
  noise_shard: {
    name: 'Noise Shard', cost: 1, type: 'Noise', damage: 5, shield: 0,
    effect: 'Deal 5, add Glitch', rarity: 'common',
    glitchGen: 1,
  },
  // Phase 3.1 — New common cards
  pulse_echo: {
    name: 'Pulse Echo', cost: 1, type: 'Pulse', damage: 5, shield: 0,
    effect: 'Deal 5 damage. Echo.', rarity: 'common',
    echo: true, keywords: ['Echo'],
  },
  sine_pulse: {
    name: 'Sine Pulse', cost: 0, type: 'Sine', damage: 0, shield: 4,
    effect: 'Gain 4 shield. +1 Tempo.', rarity: 'common',
    tempoGain: 1,
  },
  saw_blitz: {
    name: 'Saw Blitz', cost: 1, type: 'Saw', damage: 4, shield: 0,
    effect: 'Deal 4 damage. Draw 1. Chain.', rarity: 'common',
    draw: 1, chain: true, keywords: ['Draw', 'Chain'],
  },
  noise_tap: {
    name: 'Noise Tap', cost: 0, type: 'Noise', damage: 3, shield: 0,
    effect: 'Deal 3 damage. +1 Static. +2 Tempo.', rarity: 'common',
    staticGain: 1, tempoGain: 2,
  },
  pulse_guard: {
    name: 'Pulse Guard', cost: 1, type: 'Pulse', damage: 3, shield: 5,
    effect: 'Deal 3 damage. Gain 5 shield.', rarity: 'common',
  },
  sine_weave: {
    name: 'Sine Weave', cost: 1, type: 'Sine', damage: 0, shield: 6,
    effect: 'Gain 6 shield. Stabilize 1.', rarity: 'common',
    stabilize: 1, keywords: ['Stabilize'],
  },
  saw_edge: {
    name: 'Saw Edge', cost: 1, type: 'Saw', damage: 7, shield: 0,
    effect: 'Deal 7 damage.', rarity: 'common',
  },
  noise_burst: {
    name: 'Noise Burst', cost: 1, type: 'Noise', damage: 6, shield: 0,
    effect: 'Deal 6 damage. +2 Static.', rarity: 'common',
    staticGain: 2,
  },
};

// ── UNCOMMON: synergy enablers and utility ──────────────────────────

export const UNCOMMON_CARDS: Record<string, CardTemplate> = {
  overdrive_coil: {
    name: 'Overdrive Coil', cost: 0, type: 'Pulse', damage: 2, shield: 0,
    effect: 'Deal 2. Echo: repeat at 50%', rarity: 'uncommon',
    echo: true, keywords: ['Echo'],
  },
  pulse_repeater: {
    name: 'Pulse Repeater', cost: 1, type: 'Pulse', damage: 4, shield: 0,
    effect: 'Deal 4, +3 tempo', rarity: 'uncommon',
    tempoGain: 3,
  },
  sine_barrier: {
    name: 'Sine Barrier', cost: 2, type: 'Sine', damage: 0, shield: 14,
    effect: 'Gain 14 shield', rarity: 'uncommon',
  },
  sine_reset: {
    name: 'Sine Reset', cost: 1, type: 'Sine', damage: 0, shield: 3,
    effect: 'Purge 1 Glitch, draw 1, 3 shield', rarity: 'uncommon',
    stabilize: 1, draw: 1, keywords: ['Stabilize', 'Draw'],
  },
  saw_flurry: {
    name: 'Saw Flurry', cost: 2, type: 'Saw', damage: 5, shield: 0,
    effect: 'Deal 5 to ALL enemies', rarity: 'uncommon',
    aoe: true, keywords: ['AOE'],
  },
  saw_anchor: {
    name: 'Saw Anchor', cost: 2, type: 'Saw', damage: 8, shield: 4,
    effect: 'Deal 8, gain 4 shield', rarity: 'uncommon',
  },
  noise_bloom: {
    name: 'Noise Bloom', cost: 2, type: 'Noise', damage: 7, shield: 0,
    effect: 'Deal 7, +2 tempo', rarity: 'uncommon',
    tempoGain: 2,
  },
  noise_cancel: {
    name: 'Noise Cancel', cost: 1, type: 'Noise', damage: 0, shield: 0,
    effect: 'Remove 2 Static, purge 1 Glitch', rarity: 'uncommon',
    staticReduce: 2, stabilize: 1, keywords: ['Stabilize'],
  },
  resonance_pulse: {
    name: 'Resonance Pulse', cost: 1, type: 'Pulse', damage: 5, shield: 0,
    effect: 'Deal 5. Echo: repeat at 50%', rarity: 'uncommon',
    echo: true, keywords: ['Echo'],
  },
  sustain_wave: {
    name: 'Sustain Wave', cost: 1, type: 'Sine', damage: 0, shield: 5,
    effect: 'Gain 5 shield. Stays in hand.', rarity: 'uncommon',
    sustain: true, keywords: ['Sustain'],
  },
  razor_edge: {
    name: 'Razor Edge', cost: 1, type: 'Saw', damage: 8, shield: 0,
    effect: 'Deal 8. Exhaust after use.', rarity: 'uncommon',
    exhaust: true, keywords: ['Exhaust'],
  },
  signal_leech: {
    name: 'Signal Leech', cost: 2, type: 'Noise', damage: 6, shield: 0,
    effect: 'Deal 6, heal 50%', rarity: 'uncommon',
    leech: 50, keywords: ['Leech'],
  },
  // Phase 3.2 — New uncommon cards
  resonant_strike: {
    name: 'Resonant Strike', cost: 2, type: 'Pulse', damage: 10, shield: 0,
    effect: 'Deal 10 damage. Growing (+2 per play).', rarity: 'uncommon',
    growing: 2, keywords: ['Growing'],
  },
  frequency_lock: {
    name: 'Frequency Lock', cost: 1, type: 'Sine', damage: 0, shield: 8,
    effect: 'Gain 8 shield. Retain.', rarity: 'uncommon',
    retain: true, keywords: ['Retain'],
  },
  phase_strike: {
    name: 'Phase Strike', cost: 1, type: 'Pulse', damage: 7, shield: 0,
    effect: 'Deal 7 damage. Piercing.', rarity: 'uncommon',
    piercing: true, keywords: ['Piercing'],
  },
  buzzsaw: {
    name: 'Buzzsaw', cost: 2, type: 'Saw', damage: 5, shield: 0,
    effect: 'Deal 5 damage ×2 hits.', rarity: 'uncommon',
    multihit: 2, keywords: ['Multihit'],
  },
  serrated_edge: {
    name: 'Serrated Edge', cost: 1, type: 'Saw', damage: 6, shield: 0,
    effect: 'Deal 6 damage. Apply 3 Bleed.', rarity: 'uncommon',
    bleed: 3, keywords: ['Bleed'],
  },
  echo_cascade: {
    name: 'Echo Cascade', cost: 2, type: 'Pulse', damage: 8, shield: 0,
    effect: 'Deal 8 damage. Echo. +2 Tempo.', rarity: 'uncommon',
    echo: true, tempoGain: 2, keywords: ['Echo'],
  },
  static_primer: {
    name: 'Static Primer', cost: 1, type: 'Noise', damage: 4, shield: 0,
    effect: 'Deal 4 damage. +3 Static. Draw 1.', rarity: 'uncommon',
    staticGain: 3, draw: 1, keywords: ['Draw'],
  },
  shield_siphon: {
    name: 'Shield Siphon', cost: 1, type: 'Sine', damage: 0, shield: 0,
    effect: 'Steal up to 8 shield from target enemy.', rarity: 'uncommon',
    siphon: 8, keywords: ['Siphon'],
  },
};

// ── RARE: game-changing finishers ───────────────────────────────────

export const RARE_CARDS: Record<string, CardTemplate> = {
  forge_nova: {
    name: 'Forge Nova', cost: 3, type: 'Pulse', damage: 18, shield: 0,
    effect: 'Deal 18 to ALL enemies', rarity: 'rare',
    aoe: true, keywords: ['AOE'],
  },
  phase_cascade: {
    name: 'Phase Cascade', cost: 2, type: 'Sine', damage: 0, shield: 10,
    effect: 'Gain 10 shield, draw 2', rarity: 'rare',
    draw: 2, keywords: ['Draw'],
  },
  razor_choir: {
    name: 'Razor Choir', cost: 2, type: 'Saw', damage: 14, shield: 0,
    effect: 'Deal 14, +3 tempo', rarity: 'rare',
    tempoGain: 3,
  },
  blackout: {
    name: 'Blackout', cost: 1, type: 'Noise', damage: 0, shield: 0,
    effect: 'Purge ALL Glitch, draw 2', rarity: 'rare',
    stabilize: 99, draw: 2, keywords: ['Stabilize', 'Draw'],
  },
  wildcard: {
    name: 'Wildcard', cost: 1, type: 'Noise', damage: 3, shield: 0,
    effect: 'Counts as ANY waveform', rarity: 'rare',
    wildcard: true, keywords: ['Wildcard'],
  },
  overclock: {
    name: 'Overclock', cost: 0, type: 'Pulse', damage: 5, shield: 0,
    effect: 'Deal 5, Echo. Exhaust.', rarity: 'rare',
    echo: true, exhaust: true, keywords: ['Echo', 'Exhaust'],
  },
  fortify: {
    name: 'Fortify', cost: 2, type: 'Sine', damage: 0, shield: 12,
    effect: 'Gain 12 shield. Sustain.', rarity: 'rare',
    sustain: true, keywords: ['Sustain'],
  },
  saw_tempest: {
    name: 'Saw Tempest', cost: 3, type: 'Saw', damage: 8, shield: 0,
    effect: 'Deal 8 AOE, draw 2', rarity: 'rare',
    aoe: true, draw: 2, keywords: ['AOE', 'Draw'],
  },
  signal_drain: {
    name: 'Signal Drain', cost: 2, type: 'Noise', damage: 10, shield: 0,
    effect: 'Deal 10, heal 50%. Exhaust.', rarity: 'rare',
    leech: 50, exhaust: true, keywords: ['Leech', 'Exhaust'],
  },
  // Phase 3.3 — New rare cards
  omega_pulse: {
    name: 'Omega Pulse', cost: 3, type: 'Pulse', damage: 25, shield: 0,
    effect: 'Deal 25 damage. Echo. Exhaust.', rarity: 'rare',
    echo: true, exhaust: true, keywords: ['Echo', 'Exhaust'],
  },
  absolute_zero: {
    name: 'Absolute Zero', cost: 3, type: 'Sine', damage: 0, shield: 30,
    effect: 'Gain 30 shield. Freeze ALL enemies.', rarity: 'rare',
    freeze: true, aoe: true, keywords: ['Freeze', 'AOE'],
  },
  perpetual_engine: {
    name: 'Perpetual Engine', cost: 1, type: 'Pulse', damage: 4, shield: 0,
    effect: 'Deal 4 damage. Draw 1. Sustain.', rarity: 'rare',
    sustain: true, draw: 1, keywords: ['Sustain', 'Draw'],
  },
};

// ── GLITCH CARDS — inserted by Static mechanic ─────────────────────

export const GLITCH_CARDS: Record<string, CardTemplate> = {
  static_burst: {
    name: '⚠ Static', cost: 99, type: 'Noise', damage: 0, shield: 0,
    effect: 'Unplayable dead draw', rarity: 'common',
    isGlitch: true, exhaust: true, keywords: ['Glitch'],
  },
  feedback_loop: {
    name: '⚠ Feedback', cost: 1, type: 'Noise', damage: 0, shield: 0,
    effect: 'Deal 3 to self, draw 1. Exhaust.', rarity: 'common',
    selfDamage: 3, draw: 1, isGlitch: true, exhaust: true, keywords: ['Glitch', 'Exhaust'],
  },
};

// ═══════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Create a card from the named catalog */
export function createNamedCard(key: string, id: number): Card {
  const allCards: Record<string, CardTemplate> = {
    ...COMMON_CARDS, ...UNCOMMON_CARDS, ...RARE_CARDS, ...GLITCH_CARDS,
  };
  const template = allCards[key];
  if (!template) throw new Error(`Unknown card key: ${key}`);
  return new Card({ ...template, id });
}

/** Create a Glitch card */
export function createGlitchCard(id: number): Card {
  const key = Math.random() < 0.7 ? 'static_burst' : 'feedback_loop';
  return createNamedCard(key, id);
}

/** Create the curated 20-card starter deck */
export function createStarterDeck(): Card[] {
  const recipe: Array<{ key: string; count: number }> = [
    { key: 'pulse_strike', count: 3 },
    { key: 'pulse_tap', count: 2 },
    { key: 'sine_guard', count: 2 },
    { key: 'sine_bridge', count: 2 },
    { key: 'saw_rush', count: 2 },
    { key: 'saw_latch', count: 1 },
    { key: 'noise_spike', count: 2 },
    { key: 'noise_shard', count: 1 },
  ];
  const cards: Card[] = [];
  let nextId = 1;
  for (const entry of recipe) {
    for (let i = 0; i < entry.count; i++) {
      cards.push(createNamedCard(entry.key, nextId++));
    }
  }
  return cards;
}

/** Create a shop card from the uncommon/rare catalog, scaled by floor */
export function createShopCard(floor: number, id: number, rarity: CardRarity): Card {
  const pool = rarity === 'rare' ? RARE_CARDS : UNCOMMON_CARDS;
  const keys = Object.keys(pool);
  const seed = floor * 1000 + id * 137;
  const idx = Math.floor(seededRandom(seed) * keys.length);
  const template = pool[keys[idx]];

  const floorScale = 1 + (floor - 1) * 0.08;
  const damage = template.damage > 0 ? Math.floor(template.damage * floorScale) : 0;
  const shield = template.shield > 0 ? Math.floor(template.shield * floorScale) : 0;

  return new Card({ ...template, id, damage, shield });
}

/** Backward-compatible random common card */
export function createRandomCard(floor: number, id: number): Card {
  const keys = Object.keys(COMMON_CARDS);
  const seed = id * 7 + floor * 13;
  const idx = Math.floor(seededRandom(seed) * keys.length);
  return createNamedCard(keys[idx], id);
}

export function deserializeCard(data: CardData): Card {
  return new Card(data);
}
