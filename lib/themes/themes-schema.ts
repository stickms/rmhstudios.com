/** Theme Studio — the zod request schemas for /api/themes (client-safe). */
import { z } from 'zod';
import {
  THEME_PRICE_MIN,
  THEME_PRICE_MAX,
} from '@/lib/themes/tokens';
import { themeTokensSchema } from '@/lib/themes/tokens-schema';

export const createThemeBody =
  z.object(
    {
      name: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          40,
        ),
      tokens:
        themeTokensSchema,
    },
  );

export const updateThemeBody =
  z.object(
    {
      name: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          40,
        )
        .optional(),
      tokens:
        themeTokensSchema.optional(),
    },
  );

export const publishThemeBody =
  z.object(
    {
      priceCoins:
        z
          .number()
          .int()
          .min(
            THEME_PRICE_MIN,
          )
          .max(
            THEME_PRICE_MAX,
          ),
    },
  );

/** An unknown or missing `sort` is the default ordering. */
export const shopQuery =
  z.object(
    {
      sort: z
        .enum(
          [
            'top',
            'new',
          ],
        )
        .catch(
          'top',
        ),
    },
  );
