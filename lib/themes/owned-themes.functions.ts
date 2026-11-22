/**
 * The themes this account owns (official site themes bought in the store and community themes from the theme
 * studio), for the theme picker on Settings and Settings → Appearance. Empty when signed out. A server function so
 * both routes' loaders share it; the server-only modules are imported inside the handler.
 */
import { createServerFn } from '@tanstack/react-start';
import type { UserThemeView } from '@/lib/themes/tokens';

export const fetchOwnedThemes = createServerFn({
  method: 'GET',
}).handler(async (): Promise<UserThemeView[]> => {
  const { getRequestSession } = await import('@/lib/auth-session.server');
  const session = await getRequestSession();
  if (!session) return [];
  const { listOwnedThemes } = await import('@/lib/themes/themes.server');
  return listOwnedThemes(session.user.id);
});
