/** Request shape for POST /api/versecraft/save (client-safe; the contract imports it as a type). */
import { z } from 'zod';

export const versecraftProgress =
  z.object(
    {
      completedChapters:
        z
          .array(
            z.string(),
          )
          .optional(),
      unlockedEndings:
        z
          .array(
            z.string(),
          )
          .optional(),
      completedRoutes:
        z
          .array(
            z.string(),
          )
          .optional(),
      totalPoemsWritten:
        z
          .number()
          .optional(),
      totalPlaytime:
        z
          .number()
          .optional(),
    },
  );

export const versecraftSaveBody =
  z.object(
    {
      saveData:
        z.custom<object>(
          (
            v,
          ) =>
            typeof v ===
              'object' &&
            v !==
              null,
        ),
      progress:
        versecraftProgress.optional(),
    },
  );
