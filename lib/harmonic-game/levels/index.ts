/** Every playable level, in play order. Chapters join `dev_box` here as they land. */
import type { LevelSource } from '../compiler';
import { devBoxSource } from './dev_box';
import { devCombatSource } from './dev_combat';
import { devPhaseSource } from './dev_phase';
import { devModelsSource } from './dev_models';
import { devDialogueSource } from './dev_dialogue';
import { devWeaponsSource } from './dev_weapons';

export interface HarmonicLevel {
  id: string;
  titleKey: string;
  titleDefault: string;
  source: () => LevelSource;
}

export const HARMONIC_LEVELS: HarmonicLevel[] = [
  { id: 'dev_box', titleKey: 'level_dev_box', titleDefault: 'Dev box', source: devBoxSource },
  {
    id: 'dev_combat',
    titleKey: 'level_dev_combat',
    titleDefault: 'Dev combat range',
    source: devCombatSource,
  },
  {
    id: 'dev_phase',
    titleKey: 'level_dev_phase',
    titleDefault: 'Dev phase',
    source: devPhaseSource,
  },
  {
    id: 'dev_models',
    titleKey: 'level_dev_models',
    titleDefault: 'Dev models',
    source: devModelsSource,
  },
  {
    id: 'dev_dialogue',
    titleKey: 'level_dev_dialogue',
    titleDefault: 'Dev dialogue',
    source: devDialogueSource,
  },
  {
    id: 'dev_weapons',
    titleKey: 'level_dev_weapons',
    titleDefault: 'Dev weapons range',
    source: devWeaponsSource,
  },
];

export function findHarmonicLevel(id: string): HarmonicLevel | undefined {
  return HARMONIC_LEVELS.find((l) => l.id === id);
}
