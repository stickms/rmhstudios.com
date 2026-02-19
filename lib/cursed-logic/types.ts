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

export type GamePhase = 'stance' | 'commit' | 'reveal' | 'minigame' | 'resolved' | 'milestone' | 'gameover';

/** Minigame input primitive. */
export type MinigameKind = 'timed_press' | 'hold_zone' | 'rapid_choice';

/** Stance chosen before modifier; each has a unique mechanical effect. */
export type Stance =
  | 'Commit'      // strike_plus_one
  | 'Guard'       // block_no_chip
  | 'Read'        // prepare_immune
  | 'Pressure'    // strike_chip_two
  | 'Counter'     // block_reflect_one
  | 'Recover'     // prepare_heal_one
  | 'Scan'        // probe_two_rounds
  | 'Harvest'     // charge_on_damage
  | 'Steady'      // no_overdraw_penalty
  | 'Resist'      // damage_reduce_one
  | 'Deflect'     // chip_reduce_one
  | 'Break'       // strike_double_chip (2 chip when they block)
  | 'Endure'      // protocol_strike_weaker
  | 'Reckless'    // reckless
  | 'Bulk'        // block_heal_one
  | 'Focus'       // second_wind
  | 'Surge'       // rally
  | 'Bastion';    // vengeance

/** Unique mechanical effects (one per stance flavor; some stances share an effect). */
export type StanceEffect =
  | 'strike_plus_one'
  | 'block_no_chip'
  | 'prepare_immune'
  | 'strike_chip_two'       // your Strike vs their Block = 2 chip
  | 'block_reflect_one'     // you Block their Strike → they take 1
  | 'prepare_heal_one'      // if Prepare succeeds, heal 1
  | 'probe_two_rounds'      // Probe reveals this + next round
  | 'charge_on_damage'      // when you deal damage, +1 Charge
  | 'no_overdraw_penalty'   // overdraw penalty is 0 this round
  | 'damage_reduce_one'     // first damage to you reduced by 1
  | 'chip_reduce_one'       // chip you take reduced by 1 (min 0)
  | 'strike_double_chip'    // same as strike_chip_two
  | 'protocol_strike_weaker'// you take 1 less from Protocol Strike (non-block)
  | 'reckless'              // Strike +1 but take +1 when hit
  | 'block_heal_one'        // when you Block their Strike, heal 1
  | 'second_wind'           // when you Block, +1 Charge
  | 'rally'                 // when you deal damage, heal 1
  | 'vengeance';            // when you take damage, Protocol takes 1

export interface StanceDef {
  id: Stance;
  label: string;
  hint: string;
  effect: StanceEffect;
}

export const STANCE_POOL: StanceDef[] = [
  { id: 'Commit', label: 'Commit', hint: 'Strike +1 damage this round', effect: 'strike_plus_one' },
  { id: 'Guard', label: 'Guard', hint: 'Block negates chip damage this round', effect: 'block_no_chip' },
  { id: 'Read', label: 'Read', hint: 'Prepare cannot fail this round', effect: 'prepare_immune' },
  { id: 'Pressure', label: 'Pressure', hint: 'Strike vs Block: deal 2 chip instead of 1', effect: 'strike_chip_two' },
  { id: 'Counter', label: 'Counter', hint: 'Block their Strike: they take 1 damage', effect: 'block_reflect_one' },
  { id: 'Recover', label: 'Recover', hint: 'If Prepare succeeds, heal 1 Integrity', effect: 'prepare_heal_one' },
  { id: 'Scan', label: 'Scan', hint: 'Probe reveals this round and next', effect: 'probe_two_rounds' },
  { id: 'Harvest', label: 'Harvest', hint: 'When you deal damage, +1 Charge', effect: 'charge_on_damage' },
  { id: 'Steady', label: 'Steady', hint: 'No overdraw penalty this round', effect: 'no_overdraw_penalty' },
  { id: 'Resist', label: 'Resist', hint: 'First damage to you reduced by 1', effect: 'damage_reduce_one' },
  { id: 'Deflect', label: 'Deflect', hint: 'Chip damage you take reduced by 1', effect: 'chip_reduce_one' },
  { id: 'Break', label: 'Break', hint: 'Strike vs Block: deal 2 chip', effect: 'strike_double_chip' },
  { id: 'Endure', label: 'Endure', hint: 'Take 1 less from Protocol Strike (full hit)', effect: 'protocol_strike_weaker' },
  { id: 'Reckless', label: 'Reckless', hint: 'Strike +1 damage but take +1 when hit', effect: 'reckless' },
  { id: 'Bulk', label: 'Bulk', hint: 'Block their Strike: heal 1 Integrity', effect: 'block_heal_one' },
  { id: 'Focus', label: 'Focus', hint: 'Block this round: +1 Charge', effect: 'second_wind' },
  { id: 'Surge', label: 'Surge', hint: 'When you deal damage, heal 1', effect: 'rally' },
  { id: 'Bastion', label: 'Bastion', hint: 'When you take damage, Protocol takes 1', effect: 'vengeance' },
];

const STANCE_BY_ID = new Map<Stance, StanceDef>(STANCE_POOL.map((s) => [s.id, s]));

export function getStanceEffect(stance: Stance | null): StanceEffect | null {
  if (!stance) return null;
  return STANCE_BY_ID.get(stance)?.effect ?? null;
}

export function getStanceLabel(stance: Stance): string {
  return STANCE_BY_ID.get(stance)?.label ?? stance;
}

export function getStanceHint(stance: Stance): string {
  return STANCE_BY_ID.get(stance)?.hint ?? '';
}

/** Deterministic initial stance choices (avoids hydration mismatch from Math.random). */
export const INITIAL_STANCE_CHOICES: [Stance, Stance, Stance] = [
  STANCE_POOL[0]!.id,
  STANCE_POOL[1]!.id,
  STANCE_POOL[2]!.id,
];

export function pickRandomStances(count: 3): [Stance, Stance, Stance] {
  const shuffled = [...STANCE_POOL].sort(() => Math.random() - 0.5);
  const ids = shuffled.slice(0, count).map((s) => s.id);
  return [ids[0]!, ids[1]!, ids[2]!];
}

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

/** @deprecated Use getStanceLabel instead */
export const STANCE_LABELS: Record<Stance, string> = Object.fromEntries(
  STANCE_POOL.map((s) => [s.id, s.label])
) as Record<Stance, string>;

/** @deprecated Use getStanceHint instead */
export const STANCE_HINT: Record<Stance, string> = Object.fromEntries(
  STANCE_POOL.map((s) => [s.id, s.hint])
) as Record<Stance, string>;

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
  /** When player used Probe with Scan stance: Protocol's intent for the round after next. */
  probeRevealedRoundAfterNext: ProtocolAction | null;
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
  /** Three stances offered this round (set when entering stance phase). */
  stanceChoices: [Stance, Stance, Stance] | null;
  /** Reinforced allocation this round (+1 Charge for amplified effect). */
  reinforced: boolean;
  /** Protocol's visible mode this round. */
  protocolMode: ProtocolMode;
  /** One-round conditions applied next round. */
  playerCondition: PlayerCondition;
  protocolCondition: ProtocolCondition;
  /** Sequential reveal step: 0=protocol, 1=player, 2=resolve. */
  revealStep: number;
  /** When phase is 'minigame': which minigame and whether Chaos distorts it. */
  minigameKind: MinigameKind | null;
  minigameChaosDistort: boolean;
  /** Pending resolution to apply after minigame completes. */
  pendingMinigameResolution: { lastRound: LastRound; nextCharge: number; nextModifier: RoundModifier | null } | null;
}

export const CHARGE_CAP = 5;
export const START_CHARGE = 3;
export const START_INTEGRITY = 5;
export const PROTOCOL_HEALTH = 10;
