/**
 * The store dialog's action for an owned site theme: Apply or Remove, in place of Equip.
 *
 * A site theme is not an equip slot (that is the profile-cosmetics model, `UserInventory.equipped`): it recolours the
 * site on this device, exactly as Settings › Bought themes and the theme studio's Apply do, through the theme store.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { deriveAppliedTheme } from '@/lib/themes/tokens';
import {
  OFFICIAL_ID_PREFIX,
  OFFICIAL_SITE_THEMES,
} from '@/lib/themes/official';
import { useThemeStore } from '@/stores/themeStore';

export function SiteThemeApply({
  siteThemeId,
}: {
  siteThemeId:
    | string
    | undefined;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const appliedId =
    useThemeStore(
      (
        s,
      ) =>
        s
          .userTheme
          ?.id ??
        null,
    );
  const setUserTheme =
    useThemeStore(
      (
        s,
      ) =>
        s.setUserTheme,
    );
  const theme =
    siteThemeId
      ? OFFICIAL_SITE_THEMES[
          siteThemeId
        ]
      : undefined;
  if (
    !siteThemeId ||
    !theme
  )
    return null;
  const id = `${OFFICIAL_ID_PREFIX}${siteThemeId}`;
  const applied =
    appliedId ===
    id;

  return (
    <Button
      variant="primary"
      onClick={() => {
        setUserTheme(
          applied
            ? null
            : deriveAppliedTheme(
                id,
                theme.tokens,
              ),
        );
        toast.success(
          applied
            ? t(
                'shop-site-theme-removed',
                {
                  defaultValue:
                    'Back to your edition',
                },
              )
            : t(
                'shop-site-theme-applied',
                {
                  defaultValue:
                    'Theme applied',
                },
              ),
        );
      }}
    >
      {applied
        ? t(
            'shop-site-theme-remove',
            {
              defaultValue:
                'Remove theme',
            },
          )
        : t(
            'shop-site-theme-apply',
            {
              defaultValue:
                'Apply theme',
            },
          )}
    </Button>
  );
}
