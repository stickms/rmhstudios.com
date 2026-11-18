/**
 * Bought themes (Steel section 10, Settings): one row under the edition picker. The themes you own from the shop, in
 * a dropdown, with "None" to go back to the plain edition. Choosing one applies it at once, exactly as the theme
 * studio's Apply does. (A cache from an older derivation is refreshed on every page by Providers, not here:
 * lib/themes/refresh-applied.ts.)
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Select } from '@/components/ui/select';
import { useThemeStore } from '@/stores/themeStore';
import {
  deriveAppliedTheme,
  type UserThemeView,
} from '@/lib/themes/tokens';

const NONE =
  '';

export function OwnedThemesRow({
  owned,
}: {
  owned: UserThemeView[];
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const applied =
    useThemeStore(
      (
        s,
      ) =>
        s.userTheme,
    );
  const setUserTheme =
    useThemeStore(
      (
        s,
      ) =>
        s.setUserTheme,
    );
  const labelId =
    useId();
  const hintId =
    useId();

  const appliedId =
    applied?.id ??
    NONE;
  const appliedOwned =
    owned.find(
      (
        o,
      ) =>
        o.id ===
        appliedId,
    );

  return (
    <div className="settings-row">
      <span className="settings-row__text">
        <span
          id={
            labelId
          }
          className="settings-row__name block"
        >
          {t(
            'settings-owned-themes-label',
            {
              defaultValue:
                'Bought themes',
            },
          )}
        </span>
        <span
          id={
            hintId
          }
          className="settings-row__hint block"
        >
          {owned.length >
          0 ? (
            t(
              'settings-owned-themes-hint',
              {
                defaultValue:
                  'Recolours the page on top of the edition above.',
              },
            )
          ) : (
            <>
              {t(
                'settings-owned-themes-empty',
                {
                  defaultValue:
                    'You have not bought a theme yet.',
                },
              )}{' '}
              <Link
                to="/store"
                search={{
                  tab: 'shop',
                  kind: 'SITE_THEME',
                }}
                className="underline"
              >
                {t(
                  'settings-owned-themes-browse',
                  {
                    defaultValue:
                      'Browse themes',
                  },
                )}
              </Link>
            </>
          )}
        </span>
      </span>
      {owned.length >
        0 && (
        <Select
          value={
            appliedOwned
              ? appliedId
              : NONE
          }
          onChange={(
            e,
          ) => {
            const next =
              owned.find(
                (
                  o,
                ) =>
                  o.id ===
                  e
                    .target
                    .value,
              );
            setUserTheme(
              next
                ? deriveAppliedTheme(
                    next.id,
                    next.tokens,
                  )
                : null,
            );
          }}
          aria-labelledby={
            labelId
          }
          aria-describedby={
            hintId
          }
          controlSize="sm"
          containerClassName="w-36 shrink-0 sm:w-40"
        >
          <option
            value={
              NONE
            }
          >
            {t(
              'settings-owned-themes-none',
              {
                defaultValue:
                  'None',
              },
            )}
          </option>
          {owned.map(
            (
              o,
            ) => (
              <option
                key={
                  o.id
                }
                value={
                  o.id
                }
              >
                {
                  o.name
                }
              </option>
            ),
          )}
        </Select>
      )}
    </div>
  );
}
