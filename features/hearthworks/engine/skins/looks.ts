import type { PaletteKey } from '../art/palette';
import type { SkinId } from './catalog';

/**
 * What a skin looks like when the Source model is not available: a small, readable stand-in built from palette
 * colours, with the silhouette cues that tell the characters apart (hat, prop, build). The catalog's `source`
 * path replaces this with the real model once the asset channel can supply it.
 */
export type HatKind =
  | 'cap'
  | 'helmet'
  | 'hardhat'
  | 'wide'
  | 'mask'
  | 'visor'
  | 'hair';
export type PropKind =
  | 'briefcase'
  | 'crowbar'
  | 'wrench'
  | 'bag';

export interface SkinLook {
  suit: PaletteKey;
  trim: PaletteKey;
  skin: PaletteKey;
  hat?: {
    kind: HatKind;
    color: PaletteKey;
  };
  prop?: PropKind;
  /** Torso width multiplier. */
  build: number;
  /** Overall height multiplier. */
  height: number;
}

export const SKIN_LOOKS: Record<
  SkinId,
  SkinLook
> =
  {
    citizen:
      {
        suit: 'powder',
        trim: 'teal',
        skin: 'blush',
        build: 1,
        height: 1,
      },
    worker:
      {
        suit: 'butter',
        trim: 'wood',
        skin: 'blush',
        hat: {
          kind: 'hardhat',
          color:
            'butter',
        },
        build: 1.05,
        height: 1,
      },
    rebel:
      {
        suit: 'leafDeep',
        trim: 'wood',
        skin: 'blush',
        hat: {
          kind: 'cap',
          color:
            'leaf',
        },
        prop: 'crowbar',
        build: 1,
        height: 1,
      },
    barney:
      {
        suit: 'deepTeal',
        trim: 'stone',
        skin: 'blush',
        hat: {
          kind: 'cap',
          color:
            'deepTeal',
        },
        build: 1.1,
        height: 1.02,
      },
    metrocop:
      {
        suit: 'ink',
        trim: 'stone',
        skin: 'blush',
        hat: {
          kind: 'cap',
          color:
            'ink',
        },
        build: 1.05,
        height: 1.02,
      },
    'combine-soldier':
      {
        suit: 'deepTeal',
        trim: 'stone',
        skin: 'stone',
        hat: {
          kind: 'visor',
          color:
            'ink',
        },
        build: 1.12,
        height: 1.05,
      },
    'combine-elite':
      {
        suit: 'ink',
        trim: 'powder',
        skin: 'stone',
        hat: {
          kind: 'visor',
          color:
            'powder',
        },
        build: 1.15,
        height: 1.08,
      },
    scout:
      {
        suit: 'blush',
        trim: 'cream',
        skin: 'blush',
        hat: {
          kind: 'cap',
          color:
            'blush',
        },
        build: 0.9,
        height: 0.96,
      },
    soldier:
      {
        suit: 'blush',
        trim: 'leafDeep',
        skin: 'blush',
        hat: {
          kind: 'helmet',
          color:
            'leafDeep',
        },
        build: 1.1,
        height: 1,
      },
    pyro: {
      suit: 'blush',
      trim: 'stone',
      skin: 'stone',
      hat: {
        kind: 'mask',
        color:
          'stone',
      },
      build: 1.05,
      height: 1,
    },
    demoman:
      {
        suit: 'blush',
        trim: 'wood',
        skin: 'wood',
        hat: {
          kind: 'cap',
          color:
            'ink',
        },
        build: 1.05,
        height: 1,
      },
    heavy:
      {
        suit: 'blush',
        trim: 'cream',
        skin: 'blush',
        build: 1.5,
        height: 1.1,
      },
    engineer:
      {
        suit: 'blush',
        trim: 'wood',
        skin: 'blush',
        hat: {
          kind: 'hardhat',
          color:
            'butter',
        },
        prop: 'wrench',
        build: 1,
        height: 0.97,
      },
    medic:
      {
        suit: 'cream',
        trim: 'blush',
        skin: 'blush',
        hat: {
          kind: 'hair',
          color:
            'stone',
        },
        build: 1,
        height: 1.03,
      },
    sniper:
      {
        suit: 'wood',
        trim: 'leafDeep',
        skin: 'blush',
        hat: {
          kind: 'wide',
          color:
            'wood',
        },
        build: 0.95,
        height: 1.06,
      },
    spy: {
      suit: 'ink',
      trim: 'blush',
      skin: 'blush',
      hat: {
        kind: 'mask',
        color:
          'cream',
      },
      build: 0.95,
      height: 1.04,
    },
    breen:
      {
        suit: 'cream',
        trim: 'stone',
        skin: 'blush',
        hat: {
          kind: 'hair',
          color:
            'cream',
        },
        build: 0.95,
        height: 1,
      },
    gman: {
      suit: 'ink',
      trim: 'cream',
      skin: 'blush',
      prop: 'briefcase',
      build: 0.92,
      height: 1.1,
    },
  };
