/** Request schema for POST /api/games/how-to-play. Client-safe. */
import { z } from 'zod';

export const howToPlaySchema =
  z.object(
    {
      gameId:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            64,
          ),
      question:
        z
          .string()
          .trim()
          .min(
            2,
          )
          .max(
            400,
          ),
    },
  );
