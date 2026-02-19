import type { PlayerAction, ProtocolAction, LastRound, RoundModifier } from './types';

/** Block negates incoming Strike. Strike deals 1 (or 2 if that side had Prepare last round). */
export function resolveRound(
  playerAction: PlayerAction,
  protocolAction: ProtocolAction,
  playerPrepared: boolean,
  protocolPrepared: boolean,
  modifier: RoundModifier | null,
  playerHadZeroCharge: boolean
): LastRound {
  let effectivePlayer = playerAction;
  let effectiveProtocol = protocolAction;

  if (modifier === 'Chaos') {
    const actions: PlayerAction[] = ['Strike', 'Block', 'Prepare', 'Probe'];
    const protoActions: ProtocolAction[] = ['Strike', 'Block', 'Idle', 'Prepare'];
    effectivePlayer = actions[Math.floor(Math.random() * actions.length)];
    effectiveProtocol = protoActions[Math.floor(Math.random() * protoActions.length)];
  }

  if (modifier === 'NoBlock') {
    if (effectivePlayer === 'Block') effectivePlayer = 'Prepare'; // treat as no defense
    if (effectiveProtocol === 'Block') effectiveProtocol = 'Idle';
  }

  const doubleStrike = modifier === 'DoubleStrike';
  const playerStrikeDamage = (effectivePlayer === 'Strike' ? (playerPrepared ? 2 : 1) : 0) * (doubleStrike ? 2 : 1);
  const protocolStrikeDamage = (effectiveProtocol === 'Strike' ? (protocolPrepared ? 2 : 1) : 0) * (doubleStrike ? 2 : 1);

  const playerBlocked = effectivePlayer === 'Block';
  const protocolBlocked = effectiveProtocol === 'Block';

  const damageToProtocol = protocolBlocked ? 0 : playerStrikeDamage;
  const damageToPlayer = playerBlocked ? 0 : protocolStrikeDamage;

  const overdrawPenalty = playerHadZeroCharge ? 1 : 0;
  const finalDamageToPlayer = damageToPlayer + overdrawPenalty;

  return {
    playerAction: effectivePlayer,
    protocolAction: effectiveProtocol,
    playerDamage: finalDamageToPlayer,
    protocolDamage: damageToProtocol,
    overdraw: playerHadZeroCharge,
  };
}

/** Compute charge after round: spend 1 (or overdraw), then we add +1 at start of next round (done in advanceToCommit). So "next" charge here is after spending. */
export function chargeAfterSpend(currentCharge: number, cap: number): number {
  return Math.max(0, currentCharge - 1);
}
