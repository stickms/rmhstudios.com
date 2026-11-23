/**
 * Card rules text, generated from a card's numbers so the text can never disagree with the engine. Every
 * fragment is its own i18n key.
 */
import type { TFunction } from 'i18next';
import type { CardDef } from '@features/signal-forge/engine/types';

export function cardLines(d: CardDef, t: TFunction): string[] {
  const L: string[] = [];
  if (d.unplayable) L.push(t('cardtext.unplayable', { defaultValue: 'Unplayable.' }));
  const all = d.aoe;
  if (d.dmg || d.dmgPerHeat || d.dmgPerStatic || d.dmgPerPlayed) {
    const n = d.dmg ?? 0;
    const hits = d.hits ?? 1;
    if (n > 0) {
      if (hits > 1) L.push(all ? t('cardtext.dmg-hits-all', { defaultValue: 'Deal {{n}} damage {{hits}} times to every enemy.', n, hits }) : t('cardtext.dmg-hits', { defaultValue: 'Deal {{n}} damage {{hits}} times.', n, hits }));
      else L.push(all ? t('cardtext.dmg-all', { defaultValue: 'Deal {{n}} damage to every enemy.', n }) : t('cardtext.dmg', { defaultValue: 'Deal {{n}} damage.', n }));
    }
    if (d.dmgPerHeat) L.push(t('cardtext.dmg-per-heat', { defaultValue: '+{{n}} damage per Heat held.', n: d.dmgPerHeat }));
    if (d.dmgPerStatic) L.push(all && !n ? t('cardtext.dmg-per-static-all', { defaultValue: 'Deal {{n}} damage per Static to every enemy.', n: d.dmgPerStatic }) : t('cardtext.dmg-per-static', { defaultValue: '+{{n}} damage per Static.', n: d.dmgPerStatic }));
    if (d.dmgPerPlayed) L.push(t('cardtext.dmg-per-played', { defaultValue: '+{{n}} damage per card played this turn.', n: d.dmgPerPlayed }));
  }
  if (d.block) L.push(t('cardtext.block', { defaultValue: 'Gain {{n}} Block.', n: d.block }));
  if (d.blockPerHeat) L.push(t('cardtext.block-per-heat', { defaultValue: '+{{n}} Block per Heat held.', n: d.blockPerHeat }));
  if (d.blockFromHurt) L.push(t('cardtext.block-from-hurt', { defaultValue: 'At least the damage you took last turn.' }));
  if (d.blockAsDmg) L.push(all ? t('cardtext.block-as-dmg-all', { defaultValue: 'Deal damage equal to your Block to every enemy.' }) : t('cardtext.block-as-dmg', { defaultValue: 'Deal damage equal to your Block.' }));
  if (d.bleed) L.push(all ? t('cardtext.bleed-all', { defaultValue: 'Apply {{n}} Bleed to every enemy.', n: d.bleed }) : t('cardtext.bleed', { defaultValue: 'Apply {{n}} Bleed.', n: d.bleed }));
  if (d.doubleBleed) L.push(t('cardtext.double-bleed', { defaultValue: 'Double its Bleed.' }));
  if (d.weak) L.push(all ? t('cardtext.weak-all', { defaultValue: 'Apply {{n}} Weak to every enemy.', n: d.weak }) : t('cardtext.weak', { defaultValue: 'Apply {{n}} Weak.', n: d.weak }));
  if (d.vuln) L.push(all ? t('cardtext.vuln-all', { defaultValue: 'Apply {{n}} Vulnerable to every enemy.', n: d.vuln }) : t('cardtext.vuln', { defaultValue: 'Apply {{n}} Vulnerable.', n: d.vuln }));
  if (d.jam) L.push(all ? t('cardtext.jam-all', { defaultValue: 'Jam every enemy.' }) : t('cardtext.jam', { defaultValue: 'Jam it.' }));
  if (d.strength) L.push(t('cardtext.strength', { defaultValue: 'Gain {{n}} Strength.', n: d.strength }));
  if (d.energy) L.push(t('cardtext.energy', { defaultValue: 'Gain {{n}} Energy.', n: d.energy }));
  if (d.heat) L.push(t('cardtext.heat', { defaultValue: 'Gain {{n}} Heat.', n: d.heat }));
  if (d.draw) L.push(d.draw === 1 ? t('cardtext.draw-one', { defaultValue: 'Draw a card.' }) : t('cardtext.draw-many', { defaultValue: 'Draw {{n}} cards.', n: d.draw }));
  if (d.cool) L.push(t('cardtext.cool', { defaultValue: 'Remove {{n}} Static.', n: d.cool }));
  if (d.purge) L.push(t('cardtext.purge', { defaultValue: 'Destroy up to {{n}} Glitch.', n: d.purge }));
  if (d.burstBonus) L.push(t('cardtext.burst-bonus', { defaultValue: 'Your next Forge Burst deals {{n}} more.', n: d.burstBonus }));
  if (d.skipSlot) L.push(t('cardtext.skip-slot', { defaultValue: 'On the phrase: fills two slots.' }));
  if (d.spendHeat) L.push(t('cardtext.spend-heat', { defaultValue: 'Spend all Heat.' }));
  if (d.static) L.push(t('cardtext.static', { defaultValue: 'Add {{n}} Static.', n: d.static }));
  if (d.glitch) L.push(t('cardtext.glitch', { defaultValue: 'Add {{n}} Glitch to your discard.', n: d.glitch }));
  if (d.selfDmg) L.push(t('cardtext.self-dmg', { defaultValue: 'Lose {{n}} HP.', n: d.selfDmg }));
  if (d.heal) L.push(t('cardtext.heal', { defaultValue: 'Heal {{n}} HP.', n: d.heal }));
  const tags: string[] = [];
  if (d.retain) tags.push(t('cardtext.retain', { defaultValue: 'Retain' }));
  if (d.innate) tags.push(t('cardtext.innate', { defaultValue: 'Innate' }));
  if (d.ethereal) tags.push(t('cardtext.ethereal', { defaultValue: 'Ethereal' }));
  if (d.exhaust) tags.push(t('cardtext.exhaust', { defaultValue: 'Exhaust' }));
  if (tags.length) L.push(`${tags.join('. ')}.`);
  if (L.length === 0) L.push(t('cardtext.nothing', { defaultValue: 'Does nothing.' }));
  return L;
}
