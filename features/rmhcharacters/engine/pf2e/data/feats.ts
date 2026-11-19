/**
 * Every PF2e feat in the data set: general and skill feats, ancestry feats,
 * class feats and a set of popular archetype dedications. Ids are kebab-case
 * names; a name shared by several classes (Reach Spell, Counterspell) keeps the
 * plain id for its first owner and gets the owner suffixed for the rest.
 */
import type { Pf2eFeat } from '../../types';
import { feats, uniqueIds } from './dsl';
import { PF2E_ANCESTRY_FEATS } from './feats-ancestry';
import { PF2E_CLASS_FEATS_A } from './feats-class-a';
import { PF2E_CLASS_FEATS_B } from './feats-class-b';
import { PF2E_GENERAL_FEATS } from './feats-general';

const dedication = (owner: string, src: string) =>
  feats('archetype', owner, ['Archetype', 'Dedication'], src);

const ARCHETYPES: Pf2eFeat[] = [
  ...dedication('archer', `2|Archer Dedication|||Become trained in all simple and martial bows, expert in them when your class makes you expert in any weapon, and gain critical specialization effects with them.`),
  ...dedication('bard', `2|Bard Dedication||Charisma +2|Cast occult spells as a bard: two cantrips, trained in occult spell attacks and DCs, and training in Occultism and Performance.`),
  ...dedication('beastmaster', `2|Beastmaster Dedication||Trained in Nature|Gain a young animal companion and the call companion action to switch between companions.`),
  ...dedication('champion', `2|Champion Dedication||Strength +2 or Dexterity +2, Charisma +2|Become trained in light, medium and heavy armor and in Religion; choose a deity and cause and follow its tenets.`),
  ...dedication('cleric', `2|Cleric Dedication||Wisdom +2|Cast divine spells as a cleric: two cantrips, a deity, and training in Religion.`),
  ...dedication('fighter', `2|Fighter Dedication||Strength +2 or Dexterity +2|Become trained in martial weapons, Acrobatics or Athletics, and fighter class DC.`),
  ...dedication('marshal', `2|Marshal Dedication||Trained in Diplomacy or Intimidation|Gain a marshal’s aura that grants allies a +1 status bonus to saves against fear.`),
  ...dedication('medic', `2|Medic Dedication||Trained in Medicine|Become expert in Medicine; Battle Medicine and Treat Wounds heal more, and you can use Battle Medicine more often.`),
  ...dedication('rogue', `2|Rogue Dedication||Dexterity +2|Gain a skill feat, training in light armor, Stealth or Thievery, and one more skill.`),
  ...dedication('sentinel', `2|Sentinel Dedication|||Become trained in light, medium and heavy armor, with expert proficiency when your class grants it.`),
  ...dedication('wizard', `2|Wizard Dedication||Intelligence +2|Cast arcane spells as a wizard: a spellbook with four cantrips, two prepared, and training in Arcana.`),
  ...dedication('dual-weapon-warrior', `2|Dual-Weapon Warrior Dedication||Trained in martial weapons|Gain Double Slice or a similar two-weapon attack and fight with a weapon in each hand.`),
];

export const PF2E_FEATS: Pf2eFeat[] = uniqueIds([
  ...PF2E_GENERAL_FEATS,
  ...PF2E_ANCESTRY_FEATS,
  ...PF2E_CLASS_FEATS_A,
  ...PF2E_CLASS_FEATS_B,
  ...ARCHETYPES,
]);
