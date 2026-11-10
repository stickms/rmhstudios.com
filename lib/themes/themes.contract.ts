/**
 * Contracts for /api/themes (redesign audit C1, batch 3). Client-safe: request
 * types come from the zod schemas by `import type`. Failures carry the
 * server's `{ error }` code (`MEMBERS_ONLY`, `INSUFFICIENT_COINS`, …) as the
 * `HttpError` message.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  createThemeBody,
  publishThemeBody,
  shopQuery,
  updateThemeBody,
} from '@/lib/themes/themes-schema';
import type { UserThemeView } from '@/lib/themes/tokens';

export const listMyThemesApi = endpoint<{ res: { themes: UserThemeView[] } }>()({
  method: 'GET',
  path: '/api/themes',
});

/** Creates a draft. */
export const createThemeApi = endpoint<{
  body: z.infer<typeof createThemeBody>;
  res: { id: string };
}>()({ method: 'POST', path: '/api/themes' });

export const updateThemeApi = endpoint<{
  body: z.infer<typeof updateThemeBody>;
  res: { ok: true };
}>()({ method: 'PUT', path: '/api/themes/$id' });

/** Published community themes. */
export const themeShopApi = endpoint<{
  query: z.infer<typeof shopQuery>;
  res: { themes: UserThemeView[] };
}>()({ method: 'GET', path: '/api/themes/shop' });

/** Buy a published theme with coins. */
export const buyThemeApi = endpoint<{ res: { ok: true; balance: number } }>()({
  method: 'POST',
  path: '/api/themes/$id/buy',
});

/** Runs the contrast gate, then lists the theme. */
export const publishThemeApi = endpoint<{
  body: z.infer<typeof publishThemeBody>;
  res: { ok: true };
}>()({ method: 'POST', path: '/api/themes/$id/publish' });
