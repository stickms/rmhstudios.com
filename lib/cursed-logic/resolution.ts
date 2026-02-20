import type {
  PlayerAction,
  ProtocolAction,
  LastRound,
  RoundModifier,
  RunUpgradeId,
  Stance,
  PlayerCondition,
  ProtocolCondition,
} from './types';
import { getStanceEffect } from './types';

const CHIP = 1;

/** Block reduces Strike to chip (1). Stance/reinforced/conditions apply. */
export function resolveRound(
  playerAction: PlayerAction,
  protocolAction: ProtocolAction,
  playerPrepared: boolean,
  protocolPrepared: boolean,
  modifier: RoundModifier | null,
  playerHadZeroCharge: boolean,
  runUpgrades: RunUpgradeId[] = [],
  doubleDown = false,
  stance: Stance | null = null,
  reinforced = false,
  playerCondition: PlayerCondition = null,
  protocolCondition: ProtocolCondition = null
): LastRound {
  let effectivePlayer = playerAction;
  let effectiveProtocol = protocolAction;

  if (modifier === 'Chaos') {
    const actions: PlayerAction[] = ['Strike', 'Block', 'Prepare', 'Probe'];
    const protoActions: ProtocolAction[] = ['Strike', 'Block', 'Idle', 'Prepare'];
    if (Math.random() < 0.5) {
      effectivePlayer = actions[Math.floor(Math.random() * actions.length)];
    } else {
      effectiveProtocol = protoActions[Math.floor(Math.random() * protoActions.length)];
    }
  }

  if (modifier === 'NoBlock') {
    if (effectivePlayer === 'Block') effectivePlayer = 'Prepare';
    if (effectiveProtocol === 'Block') effectiveProtocol = 'Idle';
  }

  const baseStrike = doubleDown ? 2 : 1;
  const doubleStrike = modifier === 'DoubleStrike';
  let playerStrikeDamage = (effectivePlayer === 'Strike' ? (playerPrepared ? 2 : baseStrike) : 0) * (doubleStrike ? 2 : 1);
  const protocolStrikeDamage = (effectiveProtocol === 'Strike' ? (protocolPrepared ? 2 : baseStrike) : 0) * (doubleStrike ? 2 : 1);

  if (runUpgrades.includes('strikePlus1') && effectivePlayer === 'Strike') playerStrikeDamage += 1;
  const eff = stance ? getStanceEffect(stance) : null;
  const strikePlusOne = eff === 'strike_plus_one' || eff === 'reckless';
  if ((strikePlusOne || reinforced) && effectivePlayer === 'Strike') playerStrikeDamage += 1;

  const playerBlocked = effectivePlayer === 'Block';
  const protocolBlocked = effectiveProtocol === 'Block';

  let chipToPlayer = playerBlocked && protocolStrikeDamage > 0 ? CHIP : 0;
  let chipToProtocol = protocolBlocked && playerStrikeDamage > 0 ? CHIP : 0;
  const blockNoChip = eff === 'block_no_chip';
  if ((blockNoChip || reinforced) && playerBlocked) chipToPlayer = 0;
  const strikeChipTwo = eff === 'strike_chip_two' || eff === 'strike_double_chip';
  if (strikeChipTwo && protocolBlocked && playerStrikeDamage > 0) chipToProtocol = 2;
  const chipReduceOne = eff === 'chip_reduce_one';
  if (chipReduceOne && playerBlocked && chipToPlayer > 0) chipToPlayer = Math.max(0, chipToPlayer - 1);
  if (protocolCondition === 'Shaken' && protocolBlocked && playerStrikeDamage > 0) chipToProtocol = Math.min(2, CHIP + 1);
  if (playerCondition === 'Overextended' && playerBlocked) chipToPlayer = Math.min(2, chipToPlayer + 1);

  let damageToProtocol = protocolBlocked ? chipToProtocol : playerStrikeDamage;
  let damageToPlayer = playerBlocked ? chipToPlayer : protocolStrikeDamage;

  const blockReflectOne = eff === 'block_reflect_one';
  if ((runUpgrades.includes('blockReflect') || blockReflectOne) && playerBlocked && effectiveProtocol === 'Strike') {
    damageToProtocol += 1;
  }
  if (protocolCondition === 'LockedIn' && damageToProtocol > 0) damageToProtocol += 1;
  if (playerCondition === 'Exposed' && damageToPlayer > 0) damageToPlayer += 1;

  const vengeance = eff === 'vengeance';
  if (vengeance && damageToPlayer > 0) damageToProtocol += 1;

  const protocolStrikeWeaker = eff === 'protocol_strike_weaker';
  if (protocolStrikeWeaker && !playerBlocked && damageToPlayer > 0) damageToPlayer = Math.max(0, damageToPlayer - 1);
  const damageReduceOne = eff === 'damage_reduce_one';
  if (damageReduceOne && damageToPlayer > 0) damageToPlayer = Math.max(0, damageToPlayer - 1);
  const reckless = eff === 'reckless';
  if (reckless && damageToPlayer > 0) damageToPlayer += 1;

  const noOverdrawPenalty = eff === 'no_overdraw_penalty';
  const overdrawPenalty = playerHadZeroCharge && !noOverdrawPenalty ? 1 : 0;
  const finalDamageToPlayer = damageToPlayer + overdrawPenalty;

  return {
    playerAction: effectivePlayer,
    protocolAction: effectiveProtocol,
    playerDamage: finalDamageToPlayer,
    protocolDamage: damageToProtocol,
    overdraw: playerHadZeroCharge,
    reinforced,
  };
}

/** Charge after spending this round (1 or 2 if reinforced). */
export function chargeAfterSpend(currentCharge: number, cap: number, spent: number = 1): number {
  return Math.max(0, currentCharge - spent);
}
