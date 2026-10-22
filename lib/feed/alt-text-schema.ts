/**
 * Require-alt-text mode (X12) — the zod input schema for
 * `/api/settings/alt-text`. Split from `./alt-text` so the composer's import
 * of `missingAltIndexes` does not bring zod with it.
 */

import { z } from 'zod';

export const altTextSettingSchema = z.object({ requireAltText: z.boolean() });
