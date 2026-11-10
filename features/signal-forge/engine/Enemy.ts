import { StatusEffect } from './StatusEffect';

export interface EnemyData {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  intent: string;
  damage: number;
  // Intent display for UI
  intentDisplay?: {
    type: 'attack' | 'shield' | 'heal' | 'special' | 'buff' | 'debuff';
    value?: number;
    label?: string;
  };
  // Ability / meta fields (optional, default to inert values)
  archetype?: string;
  shield?: number;
  regen?: number;
  enrage?: boolean;
  glitchGen?: number;
  glitchFreq?: number;
  staticPulse?: number;
  thorns?: number;
  armored?: number;
  shieldAlly?: number;
  healAlly?: number;
  vampiric?: number;
  empowerAlly?: number;
  phaseShift?: boolean;
  turnCounter?: number;
  description?: string;
  statusEffects?: StatusEffect[];
  // Phase 4 — New enemy abilities
  tempoSiphon?: number;   // Steal N tempo from player each turn
  onDeathGlitch?: number; // Inject N glitch cards into player discard on death
  onDeathStatic?: number; // Add N static to player on death
  // Phase 4.2 — Uncommon enemy abilities
  auraEchoCanceled?: boolean;  // Suppresses Echo keyword while alive
  auraDamageReduction?: number; // Reduces all player card damage by N while alive
  splitOnDeath?: { hp: number; damage: number; count: number }; // Spawn N mini-enemies
  immuneType?: string;   // Immune to this waveform type (changes each turn)
  // Phase 4.4 — Boss abilities
  reviveCount?: number;        // For Infinite Loop boss revives
  overwriteCards?: boolean;    // For Overwriter boss
  adaptiveImmunity?: boolean;  // For Debugger boss (immune to most common type)
  mimicType?: string;          // For Pulse Mimic (copies player's last waveform)
  glitchScaling?: boolean;     // For Glitch Hound (damage scales with glitches)
  // Phase 4.8 — New enemy abilities
  counterAttack?: number;      // Deals N damage back to player when hit
  adaptiveArmor?: Record<string, number>; // Gains armor vs specific waveform types after being hit
  healOnKill?: number;         // Heal % of dead ally's max HP when ally dies
  compileCounter?: number;     // For The Compiler: tracks turns for big attack
  timeEaterCharged?: boolean;  // For Time Eater: gained shield/dmg after player played 5+ cards
  sequenceScramble?: boolean;  // Randomizes 1 slot of target sequence each turn
  curseCaster?: boolean;       // Adds curse cards to player's hand each turn
  gravityWell?: boolean;       // Halves all player shield values
}

// ---------------------------------------------------------------------------
// Enemy Template (catalog entry)
// ---------------------------------------------------------------------------

export interface EnemyTemplate {
  name: string;
  baseHp: number;
  baseDamage: number;
  archetype: string;
  intent: string;
  description: string;
  tier: 'common' | 'uncommon' | 'elite' | 'boss';
  // Abilities
  shield?: number;
  regen?: number;
  enrage?: boolean;
  glitchGen?: number;
  glitchFreq?: number;
  staticPulse?: number;
  thorns?: number;
  armored?: number;
  shieldAlly?: number;
  healAlly?: number;
  vampiric?: number;
  empowerAlly?: number;
  phaseShift?: boolean;
  // Phase 4 — New enemy abilities
  tempoSiphon?: number;
  onDeathGlitch?: number;
  onDeathStatic?: number;
  // Phase 4.2 — Uncommon enemy abilities
  auraEchoCanceled?: boolean;
  auraDamageReduction?: number;
  splitOnDeath?: { hp: number; damage: number; count: number };
  immuneType?: string;
  // Phase 4.4 — Boss abilities
  reviveCount?: number;
  overwriteCards?: boolean;
  adaptiveImmunity?: boolean;
  mimicType?: string;
  glitchScaling?: boolean;
  // Phase 4.8 — New enemy abilities
  counterAttack?: number;
  adaptiveArmor?: Record<string, number>;
  healOnKill?: number;
  compileCounter?: number;
  timeEaterCharged?: boolean;
  sequenceScramble?: boolean;
  curseCaster?: boolean;
  gravityWell?: boolean;
}

// ---------------------------------------------------------------------------
// Enemy Catalog — 17 named enemies across 4 tiers
// ---------------------------------------------------------------------------

export const ENEMY_CATALOG: EnemyTemplate[] = [
  // === COMMON (floor 1+) ===
  {
    name: 'Signal Drone', baseHp: 14, baseDamage: 2,
    archetype: 'common', tier: 'common', intent: 'Attack',
    description: 'Basic patrol unit. Attacks each turn.',
  },
  {
    name: 'Pulse Beetle', baseHp: 18, baseDamage: 2,
    archetype: 'common', tier: 'common', intent: 'Attack',
    description: 'Sturdy but predictable.',
  },
  {
    name: 'Saw Wasp', baseHp: 10, baseDamage: 3,
    archetype: 'common', tier: 'common', intent: 'Attack',
    description: 'Fast and aggressive. Low HP, high damage.',
  },
  // Phase 4.1 — New common enemies
  {
    name: 'Signal Rat', baseHp: 12, baseDamage: 2,
    archetype: 'common', tier: 'common', intent: 'Attack',
    description: 'On death: injects 1 Glitch into discard.',
    onDeathGlitch: 1,
  },
  {
    name: 'Tempo Leech', baseHp: 14, baseDamage: 2,
    archetype: 'disruptor', tier: 'common', intent: 'Attack + Tempo Drain',
    description: 'Steals 1 tempo each turn.',
    tempoSiphon: 1,
  },
  {
    name: 'Noise Imp', baseHp: 8, baseDamage: 4,
    archetype: 'common', tier: 'common', intent: 'Heavy Attack',
    description: 'Glass cannon. Low HP, high damage.',
  },
  {
    name: 'Heal Sprite', baseHp: 10, baseDamage: 1,
    archetype: 'shielder', tier: 'common', intent: 'Heal Allies',
    description: 'Heals all allies for 3 each turn.',
    healAlly: 3,
  },
  {
    name: 'Static Mite', baseHp: 6, baseDamage: 1,
    archetype: 'common', tier: 'common', intent: 'Attack',
    description: 'On death: adds 3 static to player.',
    onDeathStatic: 3,
  },

  // === UNCOMMON (floor 1 rare, floor 2+ common) ===
  {
    name: 'Noise Wraith', baseHp: 13, baseDamage: 2,
    archetype: 'disruptor', tier: 'uncommon', intent: 'Attack + Glitch',
    description: 'Corrupts your deck with Glitch cards.',
    glitchGen: 1, glitchFreq: 2,
  },
  {
    name: 'Static Specter', baseHp: 14, baseDamage: 2,
    archetype: 'disruptor', tier: 'uncommon', intent: 'Attack + Static',
    description: 'Emits static interference each turn.',
    staticPulse: 1,
  },
  {
    name: 'Iron Brute', baseHp: 24, baseDamage: 3,
    archetype: 'brute', tier: 'uncommon', intent: 'Heavy Attack',
    description: 'Thick plating absorbs incoming damage.',
    armored: 2,
  },
  {
    name: 'Saw Stalker', baseHp: 16, baseDamage: 2,
    archetype: 'brute', tier: 'uncommon', intent: 'Attack (Enrage)',
    description: 'Becomes more dangerous when wounded.',
    enrage: true,
  },
  {
    name: 'Thorn Shade', baseHp: 15, baseDamage: 2,
    archetype: 'common', tier: 'uncommon', intent: 'Attack + Thorns',
    description: 'Reflects damage back at attackers.',
    thorns: 2,
  },
  {
    name: 'Sine Leech', baseHp: 13, baseDamage: 2,
    archetype: 'common', tier: 'uncommon', intent: 'Attack + Drain',
    description: 'Drains life from damage dealt to you.',
    vampiric: 30,
  },
  // Phase 4.2 — New uncommon enemies
  {
    name: 'Overclock Bot', baseHp: 16, baseDamage: 2,
    archetype: 'brute', tier: 'uncommon', intent: 'Attack (Escalating)',
    description: 'Deals +50% damage when below 50% HP. Kill it fast!',
    enrage: true, // +50% damage below 50% HP
  },
  {
    name: 'Echo Disruptor', baseHp: 18, baseDamage: 3,
    archetype: 'disruptor', tier: 'uncommon', intent: 'Attack + Echo Cancel',
    description: 'Aura: Echo keyword doesn\'t trigger on player cards.',
    auraEchoCanceled: true,
  },
  {
    name: 'Dampener', baseHp: 14, baseDamage: 2,
    archetype: 'disruptor', tier: 'uncommon', intent: 'Attack + Damage Aura',
    description: 'Aura: All player cards deal -2 damage.',
    auraDamageReduction: 2,
  },
  {
    name: 'Splitter', baseHp: 20, baseDamage: 3,
    archetype: 'uncommon', tier: 'uncommon', intent: 'Attack (Splits)',
    description: 'At ≤50% HP, dies and spawns 2 Half-Splitters.',
    splitOnDeath: { hp: 8, damage: 2, count: 2 },
  },
  {
    name: 'Waveform Guardian', baseHp: 22, baseDamage: 2,
    archetype: 'uncommon', tier: 'uncommon', intent: 'Attack (Adaptive)',
    description: 'Immune to 1 random waveform type each turn.',
    immuneType: 'Pulse', // Will be randomized each turn
  },

  // === ELITE (floor 2 rare, floor 3+ common) ===
  {
    name: 'Shield Relay', baseHp: 16, baseDamage: 1,
    archetype: 'shielder', tier: 'elite', intent: 'Shield Allies',
    description: 'Projects shields onto allies each turn.',
    shield: 4, shieldAlly: 3,
  },
  {
    name: 'Regen Drone', baseHp: 22, baseDamage: 2,
    archetype: 'shielder', tier: 'elite', intent: 'Attack + Regen',
    description: 'Steadily regenerates and absorbs hits.',
    regen: 3, armored: 1,
  },
  {
    name: 'Disruptor Core', baseHp: 18, baseDamage: 2,
    archetype: 'disruptor', tier: 'elite', intent: 'Disrupt',
    description: 'Maximum corruption: Glitch + Static.',
    glitchGen: 1, glitchFreq: 2, staticPulse: 1,
  },
  {
    name: 'War Beacon', baseHp: 14, baseDamage: 1,
    archetype: 'elite', tier: 'elite', intent: 'Empower',
    description: 'All allies deal extra damage while alive.',
    empowerAlly: 2, regen: 1,
  },
  {
    name: 'Phase Phantom', baseHp: 22, baseDamage: 3,
    archetype: 'elite', tier: 'elite', intent: 'Attack (Phase)',
    description: 'Phases in and out, halving damage taken.',
    phaseShift: true,
  },
  {
    name: 'Overload Sentinel', baseHp: 28, baseDamage: 3,
    archetype: 'elite', tier: 'elite', intent: 'Heavy Attack',
    description: 'Armored, thorny, and enrages when wounded.',
    armored: 2, thorns: 1, enrage: true,
  },

  // === BOSS (every 5th floor) ===
  {
    name: 'The Modulator', baseHp: 55, baseDamage: 4,
    archetype: 'boss', tier: 'boss', intent: 'Modulate',
    description: 'Regenerates, shields allies, and wears you down.',
    regen: 2, shieldAlly: 3, armored: 1,
  },
  {
    name: 'The Fault', baseHp: 50, baseDamage: 3,
    archetype: 'boss', tier: 'boss', intent: 'Corrupt',
    description: 'Floods you with corruption and drains life.',
    glitchGen: 2, glitchFreq: 1, staticPulse: 2, vampiric: 20,
  },
  // Phase 4.4 — New Bosses
  {
    name: 'The Debugger', baseHp: 70, baseDamage: 3,
    archetype: 'boss', tier: 'boss', intent: 'Debug',
    description: 'Analyzes your deck and adapts. Gains regen at low HP and becomes immune to your most common waveform.',
    adaptiveImmunity: true,
  },
  {
    name: 'The Overwriter', baseHp: 80, baseDamage: 4,
    archetype: 'boss', tier: 'boss', intent: 'Overwrite',
    description: 'Corrupts your hand by replacing cards with Glitches. Gets more aggressive at low HP.',
    armored: 1,
    overwriteCards: true,
  },
  // Phase 4.3 — New Elite Enemies
  {
    name: 'The Compiler', baseHp: 30, baseDamage: 3,
    archetype: 'elite', tier: 'elite', intent: 'Compile',
    description: 'Every 3rd turn deals 15 damage instead of base. Telegraphed 1 turn before.',
    compileCounter: 0,
  },
  {
    name: 'Time Eater', baseHp: 24, baseDamage: 3,
    archetype: 'elite', tier: 'elite', intent: 'Devour',
    description: 'If player plays 5+ cards in one turn, gains +10 shield and +3 bonus damage next turn.',
    timeEaterCharged: false,
  },
  {
    name: 'Null Sentinel', baseHp: 35, baseDamage: 4,
    archetype: 'elite', tier: 'elite', intent: 'Guard',
    description: 'Heavily armored. Tests Piercing keyword; massive effective HP.',
    armored: 3,
  },
  // Phase 4.5 — Additional Uncommon Enemies
  {
    name: 'Pulse Mimic', baseHp: 16, baseDamage: 3,
    archetype: 'disruptor', tier: 'uncommon', intent: 'Mimic',
    description: 'Copies waveform type of player\'s last played card — if matched, +2 bonus damage.',
    mimicType: '',
  },
  {
    name: 'Glitch Hound', baseHp: 20, baseDamage: 2,
    archetype: 'disruptor', tier: 'uncommon', intent: 'Hunt',
    description: '+1 damage per Glitch card in player\'s deck.',
    glitchScaling: true,
  },
  {
    name: 'Curse Caster', baseHp: 12, baseDamage: 2,
    archetype: 'disruptor', tier: 'uncommon', intent: 'Curse',
    description: 'Each turn, adds 1 unplayable Curse card to player\'s hand. Must-kill-first priority.',
    curseCaster: true,
  },
  // Phase 4.6 — Additional Elite Enemies
  {
    name: 'Gravity Well', baseHp: 28, baseDamage: 2,
    archetype: 'elite', tier: 'elite', intent: 'Warp',
    description: 'Aura: all player shield values are halved while alive.',
    gravityWell: true,
  },
  {
    name: 'Pattern Lock', baseHp: 20, baseDamage: 2,
    archetype: 'elite', tier: 'elite', intent: 'Lock',
    description: 'On its turn, locks one slot of target sequence to a specific forced type.',
    sequenceScramble: true,
  },
  // Phase 4.7 — Additional Boss: The Infinite Loop
  {
    name: 'The Infinite Loop', baseHp: 100, baseDamage: 4,
    archetype: 'boss', tier: 'boss', intent: 'Loop',
    description: 'Regenerates 5/turn. On death, revives at 30 HP (max 2 revives). Total effective HP: 160.',
    regen: 5, reviveCount: 0,
  },
];

// ---------------------------------------------------------------------------
// Enemy Class
// ---------------------------------------------------------------------------

export class Enemy implements EnemyData {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  intent: string;
  damage: number;
  intentDisplay?: {
    type: 'attack' | 'shield' | 'heal' | 'special' | 'buff' | 'debuff';
    value?: number;
    label?: string;
  };
  // Ability fields
  archetype: string;
  shield: number;
  regen: number;
  enrage: boolean;
  glitchGen: number;
  glitchFreq: number;
  staticPulse: number;
  thorns: number;
  armored: number;
  shieldAlly: number;
  healAlly: number;
  vampiric: number;
  empowerAlly: number;
  phaseShift: boolean;
  turnCounter: number;
  description: string;
  statusEffects: StatusEffect[];
  // Phase 4 — New enemy abilities
  tempoSiphon: number;
  onDeathGlitch: number;
  onDeathStatic: number;
  // Phase 4.2 — Uncommon enemy abilities
  auraEchoCanceled: boolean;
  auraDamageReduction: number;
  splitOnDeath?: { hp: number; damage: number; count: number };
  immuneType?: string;
  // Phase 4.8 — New enemy abilities
  counterAttack: number;
  adaptiveArmor: Record<string, number>;
  healOnKill: number;
  compileCounter: number;
  timeEaterCharged: boolean;
  sequenceScramble: boolean;
  curseCaster: boolean;
  gravityWell: boolean;
  reviveCount: number;
  overwriteCards: boolean;
  adaptiveImmunity: boolean;
  mimicType: string;
  glitchScaling: boolean;

  constructor(data: EnemyData) {
    this.id = data.id;
    this.name = data.name;
    this.hp = data.hp;
    this.maxHp = data.maxHp;
    this.intent = data.intent;
    this.damage = data.damage;
    // Abilities (all default to inert)
    this.archetype = data.archetype ?? 'common';
    this.shield = data.shield ?? 0;
    this.regen = data.regen ?? 0;
    this.enrage = data.enrage ?? false;
    this.glitchGen = data.glitchGen ?? 0;
    this.glitchFreq = data.glitchFreq ?? 0;
    this.staticPulse = data.staticPulse ?? 0;
    this.thorns = data.thorns ?? 0;
    this.armored = data.armored ?? 0;
    this.shieldAlly = data.shieldAlly ?? 0;
    this.healAlly = data.healAlly ?? 0;
    this.vampiric = data.vampiric ?? 0;
    this.empowerAlly = data.empowerAlly ?? 0;
    this.phaseShift = data.phaseShift ?? false;
    this.turnCounter = data.turnCounter ?? 0;
    this.description = data.description ?? '';
    this.statusEffects = data.statusEffects ?? [];
    this.tempoSiphon = data.tempoSiphon ?? 0;
    this.onDeathGlitch = data.onDeathGlitch ?? 0;
    this.onDeathStatic = data.onDeathStatic ?? 0;
    this.auraEchoCanceled = data.auraEchoCanceled ?? false;
    this.auraDamageReduction = data.auraDamageReduction ?? 0;
    this.splitOnDeath = data.splitOnDeath;
    this.immuneType = data.immuneType;
    // Phase 4.8
    this.counterAttack = data.counterAttack ?? 0;
    this.adaptiveArmor = data.adaptiveArmor ? { ...data.adaptiveArmor } : {};
    this.healOnKill = data.healOnKill ?? 0;
    this.compileCounter = data.compileCounter ?? 0;
    this.timeEaterCharged = data.timeEaterCharged ?? false;
    this.sequenceScramble = data.sequenceScramble ?? false;
    this.curseCaster = data.curseCaster ?? false;
    this.gravityWell = data.gravityWell ?? false;
    this.reviveCount = data.reviveCount ?? 0;
    this.overwriteCards = data.overwriteCards ?? false;
    this.adaptiveImmunity = data.adaptiveImmunity ?? false;
    this.mimicType = data.mimicType ?? '';
    this.glitchScaling = data.glitchScaling ?? false;
  }

  /** Get damage accounting for Enrage (+50% below 50% HP) */
  getDamage(): number {
    let dmg = this.damage;
    if (this.enrage && this.hp <= this.maxHp * 0.5) {
      dmg = Math.ceil(dmg * 1.5);
    }
    return dmg;
  }

  /** Check if this enemy has any special abilities */
  hasAbilities(): boolean {
    return !!(
      this.shield || this.regen || this.enrage || this.glitchGen ||
      this.staticPulse || this.thorns || this.armored || this.shieldAlly ||
      this.vampiric || this.empowerAlly || this.phaseShift
    );
  }

  /** Human-readable descriptions of all abilities for tooltips */
  getAbilityDescriptions(): string[] {
    const desc: string[] = [];
    if (this.armored > 0) desc.push(`🛡 Armored ${this.armored}: Reduces incoming damage by ${this.armored}`);
    if (this.shield > 0) desc.push(`🔵 Shield ${this.shield}: Absorbs damage before HP`);
    if (this.enrage) desc.push('🔥 Enrage: +50% damage below 50% HP');
    if (this.thorns > 0) desc.push(`🌿 Thorns ${this.thorns}: Reflects ${this.thorns} damage when hit`);
    if (this.regen > 0) desc.push(`💚 Regen ${this.regen}: Heals ${this.regen} HP each turn`);
    if (this.vampiric > 0) desc.push(`🩸 Vampiric ${this.vampiric}%: Heals from damage dealt`);
    if (this.phaseShift) desc.push('🔮 Phase Shift: Takes half damage on odd turns');
    if (this.glitchGen > 0) desc.push(`⚙ Glitch Gen: Injects ${this.glitchGen} Glitch every ${this.glitchFreq} turn${this.glitchFreq > 1 ? 's' : ''}`);
    if (this.staticPulse > 0) desc.push(`📡 Static Pulse: +${this.staticPulse} Static per turn`);
    if (this.shieldAlly > 0) desc.push(`🛡 Shield Ally: Grants ${this.shieldAlly} shield to allies/turn`);
    if (this.empowerAlly > 0) desc.push(`⚔ Empower: All allies deal +${this.empowerAlly} damage`);
    return desc;
  }

  /** Archetype-based rendering colors */
  getArchetypeColors(): { inner: string; outer: string; glow: string; border: string } {
    switch (this.archetype) {
      case 'disruptor': return { inner: '#bb77ff', outer: '#7733cc', glow: 'rgba(153, 102, 255, 0.25)', border: '#9966ff' };
      case 'brute':     return { inner: '#ffaa55', outer: '#cc6600', glow: 'rgba(255, 136, 51, 0.25)', border: '#ff8833' };
      case 'shielder':  return { inner: '#55aaff', outer: '#0077cc', glow: 'rgba(51, 153, 255, 0.25)', border: '#3399ff' };
      case 'elite':     return { inner: '#ffdd55', outer: '#ccaa00', glow: 'rgba(255, 204, 0, 0.25)', border: '#ffcc00' };
      case 'boss':      return { inner: '#ff5555', outer: '#bb0000', glow: 'rgba(255, 51, 51, 0.35)', border: '#ff3333' };
      default:          return { inner: '#ff6699', outer: '#ff007f', glow: 'rgba(255, 0, 127, 0.15)', border: '#ff00ff' };
    }
  }

  /**
   * Apply damage with armor, shield, and phase-shift reductions.
   * Returns the total effective damage absorbed (shield + HP).
   */
  takeDamage(amount: number, turn?: number, piercing?: boolean): number {
    let dmg = amount;

    // Phase Shift: half damage on odd turns
    if (this.phaseShift && turn !== undefined && turn % 2 === 1) {
      dmg = Math.floor(dmg / 2);
    }

    // Armored: flat damage reduction (bypassed by Piercing)
    if (this.armored > 0 && !piercing) {
      dmg = Math.max(0, dmg - this.armored);
    }

    let totalAbsorbed = 0;

    // Shield absorbs first
    if (this.shield > 0 && dmg > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      totalAbsorbed += absorbed;
    }

    // Remaining goes to HP
    const oldHp = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    totalAbsorbed += (oldHp - this.hp);

    return totalAbsorbed;
  }

  getMaxHp(): number { return this.maxHp; }
  getHpPercent(): number { return Math.max(0, Math.min(1, this.hp / this.maxHp)); }

  heal(amount: number): number {
    const oldHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - oldHp;
  }

  isDefeated(): boolean { return this.hp <= 0; }

  clone(): Enemy {
    return new Enemy(this.toData());
  }

  toData(): EnemyData {
    return {
      id: this.id, name: this.name, hp: this.hp, maxHp: this.maxHp,
      intent: this.intent, damage: this.damage,
      archetype: this.archetype, shield: this.shield, regen: this.regen,
      enrage: this.enrage, glitchGen: this.glitchGen, glitchFreq: this.glitchFreq,
      staticPulse: this.staticPulse, thorns: this.thorns, armored: this.armored,
      shieldAlly: this.shieldAlly, vampiric: this.vampiric, empowerAlly: this.empowerAlly,
      phaseShift: this.phaseShift, turnCounter: this.turnCounter, description: this.description,
      statusEffects: [...this.statusEffects],
      tempoSiphon: this.tempoSiphon,
      onDeathGlitch: this.onDeathGlitch,
      onDeathStatic: this.onDeathStatic,
      auraEchoCanceled: this.auraEchoCanceled,
      auraDamageReduction: this.auraDamageReduction,
      splitOnDeath: this.splitOnDeath,
      immuneType: this.immuneType,
      counterAttack: this.counterAttack,
      adaptiveArmor: { ...this.adaptiveArmor },
      healOnKill: this.healOnKill,
      compileCounter: this.compileCounter,
      timeEaterCharged: this.timeEaterCharged,
      sequenceScramble: this.sequenceScramble,
      curseCaster: this.curseCaster,
      gravityWell: this.gravityWell,
      reviveCount: this.reviveCount,
      overwriteCards: this.overwriteCards,
      adaptiveImmunity: this.adaptiveImmunity,
      mimicType: this.mimicType,
      glitchScaling: this.glitchScaling,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Create a scaled enemy from a catalog template */
function createEnemyFromTemplate(template: EnemyTemplate, floor: number, id: number): Enemy {
  const hpScale = 1 + (floor - 1) * 0.25;
  const dmgScale = 1 + (floor - 1) * 0.15;

  return new Enemy({
    id,
    name: template.name,
    hp: Math.floor(template.baseHp * hpScale),
    maxHp: Math.floor(template.baseHp * hpScale),
    intent: template.intent,
    damage: Math.max(1, Math.floor(template.baseDamage * dmgScale)),
    archetype: template.archetype,
    shield: template.shield ?? 0,
    regen: template.regen ?? 0,
    enrage: template.enrage ?? false,
    glitchGen: template.glitchGen ?? 0,
    glitchFreq: template.glitchFreq ?? 0,
    staticPulse: template.staticPulse ?? 0,
    thorns: template.thorns ?? 0,
    armored: template.armored ?? 0,
    shieldAlly: template.shieldAlly ?? 0,
    vampiric: template.vampiric ?? 0,
    empowerAlly: template.empowerAlly ?? 0,
    phaseShift: template.phaseShift ?? false,
    turnCounter: 0,
    description: template.description,
    tempoSiphon: template.tempoSiphon ?? 0,
    onDeathGlitch: template.onDeathGlitch ?? 0,
    onDeathStatic: template.onDeathStatic ?? 0,
    auraEchoCanceled: template.auraEchoCanceled ?? false,
    auraDamageReduction: template.auraDamageReduction ?? 0,
    splitOnDeath: template.splitOnDeath ? { ...template.splitOnDeath } : undefined,
    immuneType: template.immuneType,
    // Phase 4.4
    reviveCount: template.reviveCount ?? 0,
    overwriteCards: template.overwriteCards ?? false,
    adaptiveImmunity: template.adaptiveImmunity ?? false,
    mimicType: template.mimicType ?? '',
    glitchScaling: template.glitchScaling ?? false,
    // Phase 4.8
    counterAttack: template.counterAttack ?? 0,
    adaptiveArmor: template.adaptiveArmor ? { ...template.adaptiveArmor } : {},
    healOnKill: template.healOnKill ?? 0,
    compileCounter: template.compileCounter ?? 0,
    timeEaterCharged: template.timeEaterCharged ?? false,
    sequenceScramble: template.sequenceScramble ?? false,
    curseCaster: template.curseCaster ?? false,
    gravityWell: template.gravityWell ?? false,
  });
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/** Create an enemy for a given floor (legacy compat — picks from common catalog) */
export function createEnemy(floor: number, index: number, id: number): Enemy {
  const seed = floor * 100 + index;
  const pool = ENEMY_CATALOG.filter(t => t.tier === 'common');
  const template = pool[Math.floor(seededRandom(seed) * pool.length)];
  return createEnemyFromTemplate(template, floor, id);
}

/** Create all enemies for a floor with tier-weighted selection */
export function createEnemies(floor: number): Enemy[] {
  const enemyCount = 2 + Math.floor((floor - 1) / 4);
  const isBossFloor = floor > 0 && floor % 5 === 0;

  const commonPool = ENEMY_CATALOG.filter(t => t.tier === 'common');
  const uncommonPool = ENEMY_CATALOG.filter(t => t.tier === 'uncommon');
  const elitePool = ENEMY_CATALOG.filter(t => t.tier === 'elite');
  const bossPool = ENEMY_CATALOG.filter(t => t.tier === 'boss');

  const enemies: Enemy[] = [];

  for (let i = 0; i < enemyCount; i++) {
    const id = floor * 100 + i;
    const seed = floor * 100 + i;
    const roll = seededRandom(seed + 50);

    let pool: EnemyTemplate[];

    if (isBossFloor && i === 0) {
      pool = bossPool;
    } else if (floor <= 1) {
      pool = roll < 0.65 ? commonPool : uncommonPool;
    } else if (floor <= 2) {
      pool = roll < 0.4 ? commonPool : uncommonPool;
    } else if (floor <= 4) {
      pool = roll < 0.2 ? commonPool : roll < 0.7 ? uncommonPool : elitePool;
    } else {
      pool = roll < 0.1 ? commonPool : roll < 0.45 ? uncommonPool : elitePool;
    }

    const template = pool[Math.floor(seededRandom(seed + 99) * pool.length)];
    enemies.push(createEnemyFromTemplate(template, floor, id));
  }

  return enemies;
}

/** Deserialize an enemy from a plain data object */
export function deserializeEnemy(data: EnemyData): Enemy {
  return new Enemy(data);
}
