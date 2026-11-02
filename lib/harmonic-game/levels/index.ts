/** Every playable level, in play order. Chapters join `dev_box` here as they land. */
import type { LevelSource } from '../compiler';
import { devBoxSource } from './dev_box';
import { devPhaseSource } from './dev_phase';

export interface HarmonicLevel {
  id: string;
  titleKey: string;
  titleDefault: string;
  source: () => LevelSource;
}

export const HARMONIC_LEVELS: HarmonicLevel[] = [
  { id: 'dev_box', titleKey: 'level_dev_box', titleDefault: 'Dev box', source: devBoxSource },
  {
    id: 'dev_phase',
    titleKey: 'level_dev_phase',
    titleDefault: 'Dev phase',
    source: devPhaseSource,
  },
];

export function findHarmonicLevel(id: string): HarmonicLevel | undefined {
  return HARMONIC_LEVELS.find((l) => l.id === id);
}
