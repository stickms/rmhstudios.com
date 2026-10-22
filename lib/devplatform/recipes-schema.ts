/**
 * D5 recipes — the zod input schemas for the recipe API routes. Split from
 * `./recipes`, which the /developer page imports for the definitions.
 */
import { z } from 'zod';

import { ACTIONS, DISCORD_WEBHOOK_RE, TRIGGERS } from './recipes';

export const createRecipeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    trigger: z.enum(TRIGGERS),
    gameId: z.string().trim().min(1).max(64).optional(),
    itemId: z.string().trim().min(1).max(64).optional(),
    maxPrice: z.number().int().min(1).max(1_000_000_000).optional(),
    action: z.enum(ACTIONS),
    discordUrl: z.string().trim().max(300).optional(),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message: string) =>
      ok || ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.trigger === 'new_pb') need(!!v.gameId, 'gameId', 'Pick a game');
    if (v.trigger === 'price_below') {
      need(!!v.itemId, 'itemId', 'Pick an item');
      need(v.maxPrice != null, 'maxPrice', 'Set a price');
    }
    if (v.action === 'discord_webhook')
      need(
        !!v.discordUrl && DISCORD_WEBHOOK_RE.test(v.discordUrl),
        'discordUrl',
        'Enter a Discord webhook URL',
      );
  });

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;

export const patchRecipeSchema = z.object({ enabled: z.boolean() });
