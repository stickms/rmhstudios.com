/**
 * Every name and rule line the game shows for an engine id, translated. One literal `t()` per string (the extractor
 * reads literals), numbers interpolated from `engine/data.ts` so the text cannot drift from the rules.
 */
import { useTranslation } from 'react-i18next';
import {
  DAMAGE,
  PACTS,
  SHOP_NUMBERS,
  STANCE_NUMBERS as S,
} from '@features/cursed-logic/engine/data';
import type {
  PactId,
  PlayerAction,
  PlayerCondition,
  ProtocolAction,
  ProtocolCondition,
  ProtocolId,
  RoundModifier,
  ShopItemId,
  Stance,
} from '@features/cursed-logic/engine/types';

const pct = (bonus: number) => Math.round(bonus * 100);

export function useCopy() {
  const { t } = useTranslation('c-cursed-logic');

  const protocolName = (id: ProtocolId): string => {
    switch (id) {
      case 'warden':
        return t('proto-warden', { defaultValue: 'WARDEN.exe' });
      case 'mimic':
        return t('proto-mimic', { defaultValue: 'MIMIC.dll' });
      case 'berserk':
        return t('proto-berserk', { defaultValue: 'BERSERK.sys' });
      case 'liar':
        return t('proto-liar', { defaultValue: 'LIAR.bat' });
      case 'leech':
        return t('proto-leech', { defaultValue: 'LEECH.so' });
      case 'oracle':
        return t('proto-oracle', { defaultValue: 'ORACLE.ko' });
      case 'nullroot':
        return t('proto-nullroot', { defaultValue: 'NULL//ROOT' });
      case 'trainer':
        return t('proto-trainer', { defaultValue: 'TRAINER.tmp' });
    }
  };

  const protocolBio = (id: ProtocolId): string => {
    switch (id) {
      case 'warden':
        return t('bio-warden', { defaultValue: 'A gatekeeper. Blocks often and rarely lies. Striking into its Block stings.' });
      case 'mimic':
        return t('bio-mimic', { defaultValue: 'Half the time it does what you did last round.' });
      case 'berserk':
        return t('bio-berserk', { defaultValue: 'Strikes, and strikes harder once it is below half.' });
      case 'liar':
        return t('bio-liar', { defaultValue: 'Its tells are almost always lies. Read them backwards.' });
      case 'leech':
        return t('bio-leech', { defaultValue: 'Prepares often. A clean hit heals it.' });
      case 'oracle':
        return t('bio-oracle', { defaultValue: 'Watches your last three moves and counters your habit.' });
      case 'nullroot':
        return t('bio-nullroot', {
          defaultValue: 'The root process. Reads your habits, then turns savage at half. Mutates the rules every third round.',
        });
      case 'trainer':
        return t('bio-trainer', { defaultValue: 'A training process. Its tells are always true.' });
    }
  };

  const stanceName = (s: Stance): string => {
    switch (s) {
      case 'Commit':
        return t('stance-commit', { defaultValue: 'Commit' });
      case 'Guard':
        return t('stance-guard', { defaultValue: 'Guard' });
      case 'Read':
        return t('stance-read', { defaultValue: 'Read' });
      case 'Pressure':
        return t('stance-pressure', { defaultValue: 'Pressure' });
      case 'Counter':
        return t('stance-counter', { defaultValue: 'Counter' });
      case 'Recover':
        return t('stance-recover', { defaultValue: 'Recover' });
      case 'Scan':
        return t('stance-scan', { defaultValue: 'Scan' });
      case 'Harvest':
        return t('stance-harvest', { defaultValue: 'Harvest' });
      case 'Resist':
        return t('stance-resist', { defaultValue: 'Resist' });
      case 'Reckless':
        return t('stance-reckless', { defaultValue: 'Reckless' });
      case 'Surge':
        return t('stance-surge', { defaultValue: 'Surge' });
      case 'Bastion':
        return t('stance-bastion', { defaultValue: 'Bastion' });
    }
  };

  const stanceRule = (s: Stance): string => {
    switch (s) {
      case 'Commit':
        return t('rule-commit', { defaultValue: 'Strike +{{n}}.', n: S.commitStrike });
      case 'Guard':
        return t('rule-guard', { defaultValue: 'Your Block takes no chip.' });
      case 'Read':
        return t('rule-read', {
          defaultValue: 'Prepare holds even when struck (hit -{{n}}); a held Prepare gives +{{c}} Charge.',
          n: S.readReduce,
          c: S.readCharge,
        });
      case 'Pressure':
        return t('rule-pressure', { defaultValue: 'Strike into a Block deals {{n}} and you stay balanced.', n: S.pressureChip });
      case 'Counter':
        return t('rule-counter', { defaultValue: 'Block a Strike: it takes {{n}}.', n: S.counterReflect });
      case 'Recover':
        return t('rule-recover', { defaultValue: 'A held Prepare heals {{n}}.', n: S.recoverHeal });
      case 'Scan':
        return t('rule-scan', { defaultValue: 'Probe is free, gives +{{c}} Charge and locks two rounds.', c: S.scanCharge });
      case 'Harvest':
        return t('rule-harvest', { defaultValue: 'Deal damage: +{{n}} Charge.', n: S.harvestCharge });
      case 'Resist':
        return t('rule-resist', { defaultValue: 'Take {{n}} less; your Strike -{{n}}.', n: S.resistReduce });
      case 'Reckless':
        return t('rule-reckless', {
          defaultValue: 'Strike +{{n}}; take +{{p}} when struck.',
          n: S.recklessStrike,
          p: S.recklessPenalty,
        });
      case 'Surge':
        return t('rule-surge', { defaultValue: 'An unprimed hit of {{n}}+ heals {{h}}.', n: S.surgeThreshold, h: S.surgeHeal });
      case 'Bastion':
        return t('rule-bastion', { defaultValue: 'When you take damage, it takes {{n}}.', n: S.bastionThorns });
    }
  };

  const actionName = (a: PlayerAction | ProtocolAction): string => {
    switch (a) {
      case 'Strike':
        return t('action-strike', { defaultValue: 'Strike' });
      case 'Block':
        return t('action-block', { defaultValue: 'Block' });
      case 'Prepare':
        return t('action-prepare', { defaultValue: 'Prepare' });
      case 'Probe':
        return t('action-probe', { defaultValue: 'Probe' });
      case 'Idle':
        return t('action-idle', { defaultValue: 'Glitch' });
    }
  };

  const actionRule = (a: PlayerAction): string => {
    switch (a) {
      case 'Strike':
        return t('action-strike-rule', { defaultValue: 'Deal {{n}}. Into a Block: {{c}}.', n: DAMAGE.strike, c: DAMAGE.chip });
      case 'Block':
        return t('action-block-rule', { defaultValue: 'A Strike deals {{c}}.', c: DAMAGE.chip });
      case 'Prepare':
        return t('action-prepare-rule', { defaultValue: 'Free. Next Strike +{{n}}. Fails if struck.', n: DAMAGE.primedBonus });
      case 'Probe':
        return t('action-probe-rule', { defaultValue: 'Next tell is the truth.' });
    }
  };

  const modifierName = (m: RoundModifier): string => {
    switch (m) {
      case 'Overcharge':
        return t('mod-overcharge', { defaultValue: 'Overcharge' });
      case 'NoBlock':
        return t('mod-noblock', { defaultValue: 'No Block' });
      case 'Chaos':
        return t('mod-chaos', { defaultValue: 'Chaos' });
      case 'ChargeDrain':
        return t('mod-drain', { defaultValue: 'Charge Drain' });
      case 'Reveal':
        return t('mod-reveal', { defaultValue: 'Reveal' });
      case 'Static':
        return t('mod-static', { defaultValue: 'Static' });
    }
  };

  const modifierRule = (m: RoundModifier): string => {
    switch (m) {
      case 'Overcharge':
        return t('mod-overcharge-rule', { defaultValue: 'Every Strike +1 this round.' });
      case 'NoBlock':
        return t('mod-noblock-rule', { defaultValue: 'Block does nothing this round.' });
      case 'Chaos':
        return t('mod-chaos-rule', { defaultValue: 'One side’s action is replaced at random.' });
      case 'ChargeDrain':
        return t('mod-drain-rule', { defaultValue: 'No Charge next round.' });
      case 'Reveal':
        return t('mod-reveal-rule', { defaultValue: 'The tell is the truth this round.' });
      case 'Static':
        return t('mod-static-rule', { defaultValue: 'No tell this round.' });
    }
  };

  const conditionName = (c: NonNullable<PlayerCondition> | NonNullable<ProtocolCondition>): string => {
    switch (c) {
      case 'Overextended':
        return t('cond-overextended', { defaultValue: 'Overextended: next hit +1' });
      case 'Exposed':
        return t('cond-exposed', { defaultValue: 'Exposed: next Strike on you +1' });
      case 'Shaken':
        return t('cond-shaken', { defaultValue: 'Shaken: its next Block takes +1' });
      case 'LockedIn':
        return t('cond-lockedin', { defaultValue: 'Locked In: your next hit +1' });
    }
  };

  const itemName = (i: ShopItemId): string => {
    switch (i) {
      case 'patch':
        return t('item-patch', { defaultValue: 'Patch' });
      case 'hull':
        return t('item-hull', { defaultValue: 'Hull Plate' });
      case 'capacitor':
        return t('item-capacitor', { defaultValue: 'Capacitor' });
      case 'decoder':
        return t('item-decoder', { defaultValue: 'Decoder' });
      case 'strikePlus1':
        return t('item-strike', { defaultValue: 'Edge Script' });
      case 'blockReflect':
        return t('item-reflect', { defaultValue: 'Mirror Ward' });
      case 'probeReveals2':
        return t('item-probe', { defaultValue: 'Deep Probe' });
      case 'prepareHeal':
        return t('item-prepare', { defaultValue: 'Self-Repair' });
      case 'chargeOnHit':
        return t('item-charge', { defaultValue: 'Siphon Loop' });
    }
  };

  const itemRule = (i: ShopItemId): string => {
    switch (i) {
      case 'patch':
        return t('item-patch-rule', { defaultValue: 'Heal {{n}} Integrity.', n: SHOP_NUMBERS.patchHeal });
      case 'hull':
        return t('item-hull-rule', { defaultValue: 'Max Integrity +{{n}}, and heal {{n}}.', n: SHOP_NUMBERS.hullMax });
      case 'capacitor':
        return t('item-capacitor-rule', { defaultValue: 'Charge cap and starting Charge +{{n}}.', n: SHOP_NUMBERS.capacitorCharge });
      case 'decoder':
        return t('item-decoder-rule', { defaultValue: 'Once per duel, learn whether a tell is true.' });
      case 'strikePlus1':
        return t('item-strike-rule', { defaultValue: 'Your Strikes +1 for the rest of the run.' });
      case 'blockReflect':
        return t('item-reflect-rule', { defaultValue: 'Blocking a Strike reflects 1.' });
      case 'probeReveals2':
        return t('item-probe-rule', { defaultValue: 'Probe locks two rounds, not one.' });
      case 'prepareHeal':
        return t('item-prepare-rule', { defaultValue: 'A held Prepare heals 1.' });
      case 'chargeOnHit':
        return t('item-charge-rule', { defaultValue: 'Deal damage: +1 Charge.' });
    }
  };

  const pactName = (p: PactId): string => {
    switch (p) {
      case 'chaosRun':
        return t('pact-chaos', { defaultValue: 'Pact of Chaos' });
      case 'glassCannon':
        return t('pact-glass', { defaultValue: 'Pact of Glass' });
      case 'doubleDown':
        return t('pact-double', { defaultValue: 'Pact of Edges' });
      case 'blackout':
        return t('pact-blackout', { defaultValue: 'Pact of Silence' });
    }
  };

  const pactRule = (p: PactId): string => {
    switch (p) {
      case 'chaosRun':
        return t('pact-chaos-rule', { defaultValue: 'Mutations and glitches twice as often. Score +{{n}}%.', n: pct(PACTS.chaosRun.bonus) });
      case 'glassCannon':
        return t('pact-glass-rule', { defaultValue: 'Max Integrity 8, your Strikes +1. Score +{{n}}%.', n: pct(PACTS.glassCannon.bonus) });
      case 'doubleDown':
        return t('pact-double-rule', { defaultValue: 'Every Strike on both sides +1. Score +{{n}}%.', n: pct(PACTS.doubleDown.bonus) });
      case 'blackout':
        return t('pact-blackout-rule', { defaultValue: 'No tell on even rounds. Score +{{n}}%.', n: pct(PACTS.blackout.bonus) });
    }
  };

  return {
    t,
    protocolName,
    protocolBio,
    stanceName,
    stanceRule,
    actionName,
    actionRule,
    modifierName,
    modifierRule,
    conditionName,
    itemName,
    itemRule,
    pactName,
    pactRule,
  };
}

export type Copy = ReturnType<typeof useCopy>;
