import type { Dnd5eData } from '../../types';
import { DND5E_BACKGROUNDS } from './backgrounds';
import { DND5E_CLASSES } from './classes';
import { DND5E_ARMOR, DND5E_GEAR, DND5E_WEAPONS } from './equipment';
import { DND5E_FEATS } from './feats';
import { DND5E_SPECIES } from './species';
import { DND5E_SPELLS } from './spells';

/**
 * The D&D 5e (2024) rules data set, drawn from the System Reference Document 5.2
 * (CC-BY-4.0) and summarised in plain words.
 */
export const DND5E_DATA: Dnd5eData = {
  classes: DND5E_CLASSES,
  species: DND5E_SPECIES,
  backgrounds: DND5E_BACKGROUNDS,
  feats: DND5E_FEATS,
  spells: DND5E_SPELLS,
  weapons: DND5E_WEAPONS,
  armor: DND5E_ARMOR,
  gear: DND5E_GEAR,
};
