/** Player and Protocol actions. Protocol has no Probe. */
export type PlayerAction = 'Strike' | 'Block' | 'Prepare' | 'Probe';
export type ProtocolAction = 'Strike' | 'Block' | 'Idle' | 'Prepare';

export type Action = PlayerAction | ProtocolAction;

/** Modifier applied for one round only (next round). */
export type RoundModifier =
  | 'DoubleStrike'   // Strikes deal 2 this round
  | 'NoBlock'        // Block disabled (counts as Idle)
  | 'Chaos'          // Both actions shuffled to random
  | 'ChargeDrain'    // Player gains 0 Charge this round
  | 'Reveal';        // Protocol intent shown at start (free Probe)

export type GamePhase = 'stance' | 'commit' | 'reveal' | 'resolved' | 'milestone' | 'gameover';

/** Stance chosen before modifier; shapes risk and biases follow-up. */
export type Stance = 'Commit' | 'Guard' | 'Read';

/** Protocol's visible behavioral mode this round (shifts over time). */
export type ProtocolMode = 'pressuring' | 'defensive' | 'recovering';

/** One-round condition affecting next round only. */
export type PlayerCondition = 'Overextended' | 'Exposed' | null;
export type ProtocolCondition = 'Shaken' | 'LockedIn' | null;

/** Protocol behavior variant for this run */
export type ProtocolVariant = 'default' | 'aggressor' | 'defender' | 'chaotic';

/** Run upgrade from milestone (rounds 3, 6, 9) */
export type RunUpgradeId =
  | 'strikePlus1'      // Your Strikes deal +1 this run
  | 'blockReflect'    // Block reflects 1 damage to Protocol
  | 'probeReveals2'   // Probe shows this round + next round intent
  | 'prepareHeal'     // Prepare heals 1 Integrity
  | 'chargeOnKill';   // When you deal damage this round, +1 Charge (capped)

export const RUN_UPGRADE_LABELS: Record<RunUpgradeId, string> = {
  strikePlus1: 'Strike +1',
  blockReflect: 'Block reflects 1',
  probeReveals2: 'Probe reveals 2 rounds',
  prepareHeal: 'Prepare heals 1',
  chargeOnKill: '+1 Charge on deal damage',
};

export interface LastRound {
  playerAction: PlayerAction;
  protocolAction: ProtocolAction;
  playerDamage: number;
  protocolDamage: number;
  overdraw: boolean;
  reinforced?: boolean;
}

export const STANCE_LABELS: Record<Stance, string> = {
  Commit: 'Commit',
  Guard: 'Guard',
  Read: 'Read',
};

export const STANCE_HINT: Record<Stance, string> = {
  Commit: 'Strike gains +1 damage this round',
  Guard: 'Block negates chip damage this round',
  Read: 'Probe reveals 2 rounds, or Prepare cannot fail',
};

/** State passed to protocol AI and resolution. */
export interface RoundState {
  round: number;
  lastPlayerAction: PlayerAction | null;
  lastProtocolAction: ProtocolAction | null;
  playerPrepared: boolean;
  protocolPrepared: boolean;
  protocolHealth: number;
  currentModifier: RoundModifier | null;
  protocolVariant: ProtocolVariant;
  protocolMode: ProtocolMode;
  /** From shop: chaosRun doubles glitch/mutation */
  chaosRun?: boolean;
  /** From shop: doubleDown makes base Strike damage 2 */
  doubleDown?: boolean;
}

export const PROTOCOL_MODE_LABELS: Record<ProtocolMode, string> = {
  pressuring: 'Pressuring',
  defensive: 'Defensive',
  recovering: 'Recovering',
};

export const PROTOCOL_VARIANT_NAMES: Record<ProtocolVariant, string> = {
  default: 'Standard',
  aggressor: 'Aggressor',
  defender: 'Defender',
  chaotic: 'Chaotic',
};

export interface GameState {
  phase: GamePhase;
  round: number;
  charge: number;
  integrity: number;
  protocolHealth: number;
  chargeCap: number;
  playerPrepared: boolean;
  protocolPrepared: boolean;
  currentModifier: RoundModifier | null;
  lastRound: LastRound | null;
  log: LastRound[];
  /** For reveal phase: chosen actions this round */
  pendingPlayerAction: PlayerAction | null;
  pendingProtocolAction: ProtocolAction | null;
  /** Probe reveal: protocol intent shown early */
  probeRevealedIntent: ProtocolAction | null;
  /** Win/loss result */
  result: 'win' | 'lose' | null;
  /** When Reveal modifier is active, Protocol intent for this round (set at round start). */
  revealedProtocolIntent: ProtocolAction | null;
  /** When player used Probe last round: Protocol's intent for this round (reveal next, not current). */
  probeRevealedNextIntent: ProtocolAction | null;
  /** Protocol variant for this run */
  protocolVariant: ProtocolVariant;
  /** Run upgrades from milestones (rounds 3, 6, 9) */
  runUpgrades: RunUpgradeId[];
  /** When phase is 'milestone', the two choices to pick from */
  milestoneChoices: [RunUpgradeId, RunUpgradeId] | null;
  /** From shop: one-time run modifier (chaosRun, glassCannon, etc.) */
  runModifier: string | null;
  /** Stance chosen this round (before modifier). */
  currentStance: Stance | null;
  /** Reinforced allocation this round (+1 Charge for amplified effect). */
  reinforced: boolean;
  /** Protocol's visible mode this round. */
  protocolMode: ProtocolMode;
  /** One-round conditions applied next round. */
  playerCondition: PlayerCondition;
  protocolCondition: ProtocolCondition;
  /** Sequential reveal step: 0=protocol, 1=player, 2=resolve. */
  revealStep: number;
}

export const CHARGE_CAP = 5;
export const START_CHARGE = 3;
export const START_INTEGRITY = 5;
export const PROTOCOL_HEALTH = 10;
