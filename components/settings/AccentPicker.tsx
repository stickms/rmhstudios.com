/**
 * Accent colour (Steel section 10, Settings): one row, a dropdown of the curated presets (lib/appearance.ts), so every
 * choice keeps readable contrast. "Theme default" clears the override. Applies at once and, signed in, syncs to the
 * account (Providers).
 *
 * The custom hex accent on the Appearance page outranks a preset. It shows here as "Custom" so the row never claims a
 * preset that is not on screen, and choosing anything here clears it, so the choice is always the one you see.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { ACCENT_PRESETS } from '@/lib/appearance';
import { useThemeStore } from '@/stores/themeStore';
import { api } from '@/lib/contract/client';
import { setAppearancePrefsApi } from '@/lib/preferences/preferences.contract';

const DEFAULT =
  '';
const CUSTOM =
  '__custom__';

export function AccentPicker() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const accent =
    useThemeStore(
      (
        s,
      ) =>
        s.accent,
    );
  const setAccent =
    useThemeStore(
      (
        s,
      ) =>
        s.setAccent,
    );
  const customAccent =
    useThemeStore(
      (
        s,
      ) =>
        s.customAccent,
    );
  const setCustomAccent =
    useThemeStore(
      (
        s,
      ) =>
        s.setCustomAccent,
    );
  const labelId =
    useId();
  const hintId =
    useId();

  const value =
    customAccent
      ? CUSTOM
      : (accent ??
        DEFAULT);

  return (
    <div
      id="accent"
      className="settings-row"
    >
      <span className="settings-row__text">
        <span
          id={
            labelId
          }
          className="settings-row__name block"
        >
          {t(
            'settings-accent-title',
            {
              defaultValue:
                'Accent color',
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
            'settings-accent-row-hint',
            {
              defaultValue:
                'Recolours buttons and highlights.',
            },
          )}
        </span>
      </span>
      <Select
        value={
          value
        }
        onChange={(
          e,
        ) => {
          const next =
            e
              .target
              .value;
          if (
            next ===
            CUSTOM
          )
            return;
          if (
            customAccent
          ) {
            setCustomAccent(
              null,
            );
            void api(
              setAppearancePrefsApi,
              {
                body: {
                  customAccent:
                    null,
                },
              },
            ).catch(
              () => {},
            );
          }
          setAccent(
            next ===
              DEFAULT
              ? null
              : next,
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
            DEFAULT
          }
        >
          {t(
            'settings-accent-default',
            {
              defaultValue:
                'Theme default',
            },
          )}
        </option>
        {ACCENT_PRESETS.map(
          (
            p,
          ) => (
            <option
              key={
                p.id
              }
              value={
                p.id
              }
            >
              {
                p.label
              }
            </option>
          ),
        )}
        {customAccent && (
          <option
            value={
              CUSTOM
            }
            disabled
          >
            {t(
              'settings-accent-custom',
              {
                defaultValue:
                  'Custom',
              },
            )}
          </option>
        )}
      </Select>
    </div>
  );
}
