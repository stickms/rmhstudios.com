import { z } from 'zod';
import {
  ITEM_IDS,
  type ItemId,
} from './items';

export const CROP_IDS =
  [
    'wheat',
    'corn',
    'tomato',
    'pumpkin',
  ] as const;
export type CropId =
  (typeof CROP_IDS)[number];

export const cropSchema =
  z.object(
    {
      name: z
        .string()
        .min(
          1,
        ),
      seedPrice:
        z
          .number()
          .int()
          .positive(),
      /** Growth stages before it is ripe; a crop is ripe when stage === stages. */
      stages:
        z
          .number()
          .int()
          .min(
            2,
          ),
      /** Milliseconds of game time per stage. */
      stageMs:
        z
          .number()
          .int()
          .positive(),
      yieldItem:
        z.enum(
          ITEM_IDS,
        ),
      yieldQty:
        z
          .number()
          .int()
          .positive(),
    },
  );
export type CropDef =
  Omit<
    z.infer<
      typeof cropSchema
    >,
    'yieldItem'
  > & {
    yieldItem: ItemId;
  };

export const CROPS: Record<
  CropId,
  CropDef
> =
  {
    wheat:
      {
        name: 'Wheat',
        seedPrice: 2,
        stages: 3,
        stageMs: 6000,
        yieldItem:
          'wheat',
        yieldQty: 3,
      },
    corn: {
      name: 'Corn',
      seedPrice: 3,
      stages: 4,
      stageMs: 7000,
      yieldItem:
        'corn',
      yieldQty: 3,
    },
    tomato:
      {
        name: 'Tomato',
        seedPrice: 4,
        stages: 4,
        stageMs: 8000,
        yieldItem:
          'tomato',
        yieldQty: 4,
      },
    pumpkin:
      {
        name: 'Pumpkin',
        seedPrice: 8,
        stages: 5,
        stageMs: 10000,
        yieldItem:
          'pumpkin',
        yieldQty: 2,
      },
  };

export const isCropId =
  (
    v: unknown,
  ): v is CropId =>
    typeof v ===
      'string' &&
    (
      CROP_IDS as readonly string[]
    ).includes(
      v,
    );
