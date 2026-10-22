/** D5 recipes — pure definitions + validation (shared by API and UI). */

export type { CreateRecipeInput } from './recipes-schema';
export const MAX_RECIPES = 10;
export const TRIGGERS = ['new_follower', 'new_pb', 'price_below'] as const;
export const ACTIONS = ['discord_webhook', 'dm_self'] as const;
export type RecipeTrigger = (typeof TRIGGERS)[number];
export type RecipeAction = (typeof ACTIONS)[number];

/** Only real Discord webhook URLs — the action is not a generic HTTP caller. */
export const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:(?:canary|ptb)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;

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
