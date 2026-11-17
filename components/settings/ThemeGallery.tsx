/**
 * The theme picker (Steel section 10, Settings): one settings row, the name and a line on what it does at the start,
 * a dropdown of the two editions at the end. Choosing an edition applies it at once; there is no hover preview.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import {
  SITE_STYLES,
  useThemeStore,
  type SiteStyle,
} from '@/stores/themeStore';

export function ThemeGallery() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const style =
    useThemeStore(
      (
        s,
      ) =>
        s.style,
    );
  const setStyle =
    useThemeStore(
      (
        s,
      ) =>
        s.setStyle,
    );
  const labelId =
    useId();
  const hintId =
    useId();

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
            'settings-theme-label',
            {
              defaultValue:
                'Theme',
            },
          )}
        </span>
        <span
          id={
            hintId
          }
          className="settings-row__hint block"
        >
          {t(
            'settings-theme-hint',
            {
              defaultValue:
                'Day is a light page; Night is near-black.',
            },
          )}
        </span>
      </span>
      <Select
        value={
          style
        }
        onChange={(
          e,
        ) =>
          setStyle(
            e
              .target
              .value as SiteStyle,
          )
        }
        aria-labelledby={
          labelId
        }
        aria-describedby={
          hintId
        }
        controlSize="sm"
        containerClassName="w-36 shrink-0 sm:w-40"
      >
        {SITE_STYLES.map(
          (
            s,
          ) => (
            <option
              key={
                s.id
              }
              value={
                s.id
              }
            >
              {s.id ===
              'graphite'
                ? t(
                    'settings-edition-night',
                    {
                      defaultValue:
                        'Night',
                    },
                  )
                : t(
                    'settings-edition-day',
                    {
                      defaultValue:
                        'Day',
                    },
                  )}
            </option>
          ),
        )}
      </Select>
    </div>
  );
}
