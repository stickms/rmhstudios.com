/**
 * Cursed Logic's types. Numbers live in `data.ts`; rules in `resolution.ts` (one clash), `protocol.ts` (the
 * opponent), `duel.ts` (rounds) and `run.ts` (the ladder). Display strings are not here: the UI translates ids.
 */

/** What you can do in a round. */
export type PlayerAction = 'Strike' | 'Block' | 'Prepare' | 'Probe';
/** What a Protocol can do. `Idle` reads as a glitch: it does nothing. */
export type ProtocolAction = 'Strike' | 'Block' | 'Prepare' | 'Idle';

export const PLAYER_ACTIONS: readonly PlayerAction[] = ['Strike', 'Block', 'Prepare', 'Probe'];
export const PROTOCOL_ACTIONS: readonly ProtocolAction[] = ['Strike', 'Block', 'Prepare', 'Idle'];

/** A one-round rule change rolled at the start of a round (a "mutation"). */
export type RoundModifier =
  | 'Overcharge' // every Strike +1
  | 'NoBlock' // Block does nothing
  | 'Chaos' // one side's action is replaced at random
  | 'ChargeDrain' // no Charge regen next round
  | 'Reveal' // the tell is the truth this round
  | 'Static'; // no tell this round

/** The twelve stances. Each changes one rule for one round (see `STANCES` in data.ts). */
export type Stance =
  | 'Commit'
  | 'Guard'
  | 'Read'
  | 'Pressure'
  | 'Counter'
  | 'Recover'
  | 'Scan'
  | 'Harvest'
  | 'Resist'
  | 'Reckless'
  | 'Surge'
  | 'Bastion';

/** Protocol ids: the opponent roster. */
export type ProtocolId = 'warden' | 'mimic' | 'berserk' | 'liar' | 'leech' | 'oracle' | 'nullroot' | 'trainer';

/** Run upgrades: the free milestone pick and some shop wares. */
export type RunUpgradeId = 'strikePlus1' | 'blockReflect' | 'probeReveals2' | 'prepareHeal' | 'chargeOnHit';

/** Pacts: optional handicaps chosen at the start of a run, each raising the score multiplier. */
export type PactId = 'chaosRun' | 'glassCannon' | 'doubleDown' | 'blackout';

/** Shop wares sold between sectors. */
export type ShopItemId = 'patch' | 'hull' | 'capacitor' | 'decoder' | RunUpgradeId;

/** One-round conditions that a clash leaves behind. */
export type PlayerCondition = 'Overextended' | 'Exposed' | null;
export type ProtocolCondition = 'Shaken' | 'LockedIn' | null;

/** The minigame input primitive a clash can trigger. */
export type MinigameKind = 'timed_press' | 'hold_zone' | 'rapid_choice';

/** What one clash did. */
export interface LastRound {
  playerAction: PlayerAction;
  protocolAction: ProtocolAction;
  /** Damage the player took. */
  playerDamage: number;
  /** Damage the Protocol took. */
  protocolDamage: number;
  /** Integrity the player healed. */
  playerHeal: number;
  /** Integrity the Protocol healed. */
  protocolHeal: number;
  overdraw: boolean;
  reinforced: boolean;
  /** True when a Prepare held (the player is primed next round). */
  playerPrimed: boolean;
  protocolPrimed: boolean;
  /** Charge gained from the clash (stance or upgrade), on top of regen. */
  chargeGain: number;
}
