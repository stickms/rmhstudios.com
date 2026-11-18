/**
 * Re-derive a cached applied theme whose derivation is out of date (`isStaleAppliedTheme`).
 *
 * The applied theme is cached on the device as derived `--site-*` values, not tokens, so a cache written before the
 * derivation last changed keeps painting the old look on every page. Providers loads this module (lazily, only for a
 * stale cache) at startup; it fetches the theme's tokens and replaces the cache with a fresh derivation. A theme that
 * is gone (deleted, delisted draft) or a failed request leaves the cache as it is: the old look beats no look.
 */

import { api } from '@/lib/contract/client';
import { getThemeApi } from '@/lib/themes/themes.contract';
import { deriveAppliedTheme } from '@/lib/themes/tokens';
import { useThemeStore } from '@/stores/themeStore';

export async function refreshAppliedTheme(
  id: string,
): Promise<void> {
  try {
    const theme =
      await api(
        getThemeApi,
        {
          params:
            {
              id,
            },
          retries: 0,
        },
      );
    // The user may have switched or removed the theme while the request was in flight.
    if (
      useThemeStore.getState()
        .userTheme
        ?.id !==
      id
    )
      return;
    useThemeStore
      .getState()
      .setUserTheme(
        deriveAppliedTheme(
          id,
          theme.tokens,
        ),
      );
  } catch {
    // Keep the cached look.
  }
}
