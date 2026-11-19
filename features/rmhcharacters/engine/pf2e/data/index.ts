/**
 * The PF2e Remaster rules data set: Player Core, Player Core 2 and the
 * kineticist from Rage of Elements. Rules text is summarised in our own words;
 * Paizo publishes these rules under the ORC license.
 */
import type { Pf2eData } from '../../types';
import { PF2E_ANCESTRIES, PF2E_VERSATILE_HERITAGES } from './ancestries';
import { PF2E_BACKGROUNDS } from './backgrounds';
import { PF2E_CLASSES } from './classes';
import { PF2E_ARMOR, PF2E_GEAR, PF2E_WEAPONS } from './equipment';
import { PF2E_FEATS } from './feats';
import { PF2E_SPELLS } from './spells';

export const PF2E_DATA: Pf2eData = {
  ancestries: PF2E_ANCESTRIES,
  versatileHeritages: PF2E_VERSATILE_HERITAGES,
  backgrounds: PF2E_BACKGROUNDS,
  classes: PF2E_CLASSES,
  feats: PF2E_FEATS,
  spells: PF2E_SPELLS,
  weapons: PF2E_WEAPONS,
  armor: PF2E_ARMOR,
  gear: PF2E_GEAR,
};
