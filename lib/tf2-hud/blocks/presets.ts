/**
 * Built-in groupings for the TF2 Default HUD. A preset is only a rule, so it finds
 * the matching panels in whatever HUD is open, including ones that were renamed
 * or moved by an import, and a HUD with none of the files simply gets none.
 */

import type { BlockRule } from './types';

export interface BlockPreset {
  id: string;
  name: string;
  description: string;
  rule: BlockRule;
}

const METER_FILES = [
  'resource/ui/hudmediccharge.res',
  'resource/ui/huddemomancharge.res',
  'resource/ui/hudbowcharge.res',
  'resource/ui/hudrocketpack.res',
  'resource/ui/huddemomanpipes.res',
  'resource/ui/hudpowerupeffectmeter.res',
  'resource/ui/huditemeffectmeter*.res',
];

export const BLOCK_PRESETS: readonly BlockPreset[] = [
  {
    id: 'meter-bars',
    name: 'Charge & effect meter bars',
    description: 'The fill bars: Über, charge, rage, hype, stickies, the item effect meters.',
    rule: { files: METER_FILES, controls: ['continuousprogressbar', 'progressbar'] },
  },
  {
    id: 'meter-labels',
    name: 'Charge & effect meter labels',
    description: 'The text beside the meters.',
    rule: { files: METER_FILES, controls: ['cexlabel', 'label'] },
  },
  {
    id: 'meter-backgrounds',
    name: 'Charge & effect meter backgrounds',
    description: 'The panels and images behind the meters.',
    rule: { files: METER_FILES, controls: ['ctfimagepanel', 'imagepanel', 'scalableimagepanel'] },
  },
  {
    id: 'health-ammo-text',
    name: 'Health & ammo numbers',
    description: 'The big numbers for the local player’s health and ammo.',
    rule: {
      files: ['resource/ui/hudplayerhealth.res', 'resource/ui/hudammoweapons.res'],
      controls: ['cexlabel', 'label'],
    },
  },
];

export const presetById = (id: string): BlockPreset | undefined =>
  BLOCK_PRESETS.find((p) => p.id === id);
