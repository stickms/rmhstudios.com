/**
 * Home dashboard & sidebar customization (§15) — the zod schema for the layout
 * sync API. Split from `lib/home-widgets.ts`, which the home rail and the
 * settings editor import, so they stay zod-free.
 */
import { z } from 'zod';

import { MAX_STACK, SIDEBAR_HIDEABLE_IDS, SIDEBAR_NAV_IDS, WIDGET_KINDS } from './home-widgets';

const homeStackItemSchema = z.object({
  kind: z.enum(WIDGET_KINDS),
  collapsed: z.boolean().optional(),
});

export const layoutPrefsSchema = z.object({
  sidebar: z
    .object({
      pinned: z.array(z.enum(SIDEBAR_NAV_IDS)).max(SIDEBAR_NAV_IDS.length).optional(),
      hidden: z.array(z.enum(SIDEBAR_HIDEABLE_IDS)).max(SIDEBAR_HIDEABLE_IDS.length).optional(),
      order: z.array(z.enum(SIDEBAR_NAV_IDS)).max(SIDEBAR_NAV_IDS.length).optional(),
    })
    .optional(),
  homeStack: z.array(homeStackItemSchema).max(MAX_STACK).optional(),
});

export type LayoutPrefsInput = z.infer<typeof layoutPrefsSchema>;
