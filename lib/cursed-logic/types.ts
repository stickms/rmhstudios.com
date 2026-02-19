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

export type GamePhase = 'commit' | 'reveal' | 'resolved' | 'gameover';

export interface LastRound {
  playerAction: PlayerAction;
  protocolAction: ProtocolAction;
  playerDamage: number;
  protocolDamage: number;
  overdraw: boolean;
}

/** State passed to protocol AI and resolution. */
export interface RoundState {
  round: number;
  lastPlayerAction: PlayerAction | null;
  lastProtocolAction: ProtocolAction | null;
  playerPrepared: boolean;
  protocolPrepared: boolean;
  protocolHealth: number;
  currentModifier: RoundModifier | null;
}

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
}

export const CHARGE_CAP = 5;
export const START_CHARGE = 3;
export const START_INTEGRITY = 5;
export const PROTOCOL_HEALTH = 10;
