/**
 * One clash: both actions are known, nothing random happens here (Chaos is applied by `duel.ts` before this is
 * called), so every rule is a pure function of its input and unit-testable. Numbers come from `data.ts`.
 *
 * The triangle at the heart of it: Strike beats Prepare and a glitch; Block blunts Strike to chip and leaves the
 * striker Overextended; Prepare beats Block (you are primed and the Block wasted a turn); Probe trades a round for the
 * truth about the next one.
 */
import { DAMAGE, STANCE_NUMBERS as S } from './data';
import type { ProtocolTrait } from './data';
import type {
  LastRound,
  PlayerAction,
  PlayerCondition,
  ProtocolAction,
  ProtocolCondition,
  RoundModifier,
  RunUpgradeId,
  Stance,
} from './types';

export interface ClashInput {
  player: PlayerAction;
  protocol: ProtocolAction;
  playerPrimed: boolean;
  protocolPrimed: boolean;
  stance: Stance | null;
  reinforced: boolean;
  overdraw: boolean;
  modifier: RoundModifier | null;
  playerCondition: PlayerCondition;
  protocolCondition: ProtocolCondition;
  upgrades: readonly RunUpgradeId[];
  /** Pacts that add to the player's Strike (Glass Cannon, Double Down). */
  playerStrikeBonus: number;
  /** Sector bonus, Double Down and Berserk's overclock. */
  protocolStrikeBonus: number;
  trait: ProtocolTrait;
  traitPower: number;
}

export interface ClashResult extends LastRound {
  nextPlayerCondition: PlayerCondition;
  nextProtocolCondition: ProtocolCondition;
}

export function resolveClash(i: ClashInput): ClashResult {
  const overcharge = i.modifier === 'Overcharge' ? 1 : 0;
  const blocksWork = i.modifier !== 'NoBlock';
  const stance = i.stance;

  const playerStrike =
    i.player === 'Strike'
      ? DAMAGE.strike +
        (i.playerPrimed ? DAMAGE.primedBonus : 0) +
        (i.reinforced ? DAMAGE.reinforceStrike : 0) +
        (stance === 'Commit' ? S.commitStrike : 0) +
        (stance === 'Reckless' ? S.recklessStrike : 0) +
        (stance === 'Resist' ? -S.resistReduce : 0) +
        (i.upgrades.includes('strikePlus1') ? 1 : 0) +
        i.playerStrikeBonus +
        overcharge
      : 0;
  const protocolStrike =
    i.protocol === 'Strike'
      ? DAMAGE.protocolStrike + (i.protocolPrimed ? DAMAGE.primedBonus : 0) + i.protocolStrikeBonus + overcharge
      : 0;

  const playerBlocks = i.player === 'Block' && blocksWork;
  const protocolBlocks = i.protocol === 'Block' && blocksWork;

  let toProtocol = 0;
  let toPlayer = 0;
  let protocolHeal = 0;
  let playerHeal = 0;
  let chargeGain = 0;
  let nextPlayerCondition: PlayerCondition = null;
  let nextProtocolCondition: ProtocolCondition = null;

  // The player's Strike.
  if (playerStrike > 0) {
    if (protocolBlocks) {
      let chip = stance === 'Pressure' ? S.pressureChip : DAMAGE.chip;
      if (i.protocolCondition === 'Shaken') chip += DAMAGE.condition;
      toProtocol += chip;
      if (i.trait === 'bulwark') toPlayer += i.traitPower;
      if (stance !== 'Pressure') nextPlayerCondition = 'Overextended';
    } else {
      toProtocol += playerStrike;
      if (i.protocol === 'Prepare') {
        toProtocol += DAMAGE.interruptBonus;
        nextProtocolCondition = 'LockedIn';
      }
      if (i.protocolCondition === 'LockedIn') toProtocol += DAMAGE.condition;
    }
  }

  // The Protocol's Strike.
  let struckClean = false;
  if (protocolStrike > 0) {
    if (playerBlocks) {
      const chip = i.reinforced || stance === 'Guard' ? 0 : DAMAGE.chip;
      toPlayer += chip;
      toProtocol +=
        (stance === 'Counter' ? S.counterReflect : 0) +
        (i.upgrades.includes('blockReflect') ? 1 : 0) +
        (i.reinforced ? DAMAGE.reinforceReflect : 0);
      nextProtocolCondition = 'Shaken';
    } else {
      struckClean = true;
      let hit = protocolStrike;
      if (i.player === 'Prepare') {
        if (stance === 'Read') hit -= S.readReduce;
        else {
          hit += DAMAGE.interruptBonus;
          nextPlayerCondition = 'Exposed';
        }
      }
      if (i.playerCondition === 'Exposed') hit += DAMAGE.condition;
      if (stance === 'Reckless') hit += S.recklessPenalty;
      hit = Math.max(0, hit);
      toPlayer += hit;
      if (i.trait === 'siphon' && hit > 0) protocolHeal += i.traitPower;
    }
  }

  // Overextended (you Struck into a Block last round): the next damage you take is heavier.
  if (i.playerCondition === 'Overextended' && toPlayer > 0) toPlayer += DAMAGE.condition;
  if (stance === 'Resist' && toPlayer > 0) toPlayer = Math.max(0, toPlayer - S.resistReduce);
  if (stance === 'Bastion' && toPlayer > 0) toProtocol += S.bastionThorns;
  if (i.overdraw) toPlayer += DAMAGE.overdraw;

  const playerPrimed = i.player === 'Prepare' && (!struckClean || stance === 'Read');
  const protocolPrimed = i.protocol === 'Prepare' && playerStrike === 0;

  if (playerPrimed && stance === 'Recover') playerHeal += S.recoverHeal;
  if (playerPrimed && i.upgrades.includes('prepareHeal')) playerHeal += 1;
  if (toProtocol >= S.surgeThreshold && stance === 'Surge' && !i.playerPrimed) playerHeal += S.surgeHeal;
  if (toProtocol > 0 && stance === 'Harvest') chargeGain += S.harvestCharge;
  if (toProtocol > 0 && i.upgrades.includes('chargeOnHit')) chargeGain += 1;
  if (i.player === 'Probe' && stance === 'Scan') chargeGain += S.scanCharge;
  if (playerPrimed && stance === 'Read') chargeGain += S.readCharge;

  return {
    playerAction: i.player,
    protocolAction: i.protocol,
    playerDamage: toPlayer,
    protocolDamage: toProtocol,
    playerHeal,
    protocolHeal,
    overdraw: i.overdraw,
    reinforced: i.reinforced,
    playerPrimed,
    protocolPrimed,
    chargeGain,
    nextPlayerCondition,
    nextProtocolCondition,
  };
}
