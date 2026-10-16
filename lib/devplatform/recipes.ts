/** D5 recipes — pure definitions + validation (shared by API and UI). */
import { z } from 'zod';

export const MAX_RECIPES = 10;
export const TRIGGERS = ['new_follower', 'new_pb', 'price_below'] as const;
export const ACTIONS = ['discord_webhook', 'dm_self'] as const;
export type RecipeTrigger = (typeof TRIGGERS)[number];
export type RecipeAction = (typeof ACTIONS)[number];

/** Only real Discord webhook URLs — the action is not a generic HTTP caller. */
export const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;

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

export interface RecipeView {
  id: string;
  name: string;
  trigger: RecipeTrigger;
  triggerLabel: string;
  action: RecipeAction;
  actionLabel: string;
  enabled: boolean;
  fireCount: number;
  lastFiredAt: string | null;
  lastError: string | null;
}
