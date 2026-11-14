import { z } from 'zod';
import { MIN_SPEED_FLOOR } from '@/lib/game/assist';

/** Request body for `POST /api/settings/game-assists` (client-safe; the contract names its type). */
export const assistPatchSchema =
  z.object(
    {
      holdToPress:
        z
          .boolean()
          .optional(),
      speedFloor:
        z
          .number()
          .min(
            MIN_SPEED_FLOOR,
          )
          .max(
            1,
          )
          .optional(),
      calmVisuals:
        z
          .boolean()
          .optional(),
      colorSafe:
        z
          .boolean()
          .optional(),
      noTimedInput:
        z
          .boolean()
          .optional(),
    },
  );
