/**
 * The theme picker (Steel section 10, Settings; owner 2026-11-18, design
 * docs/superpowers/specs/2026-11-18-theme-carousel-design.md). One row: Day, Night and every theme the account owns,
 * as a carousel of the store's own preview (`ThemeMiniShell`), with "Show all" opening the same cards as a grid in
 * place. Choosing a card applies it at once. There is no separate edition: a bought theme is light or dark by its own
 * background (`editionForBackground`), and each card says which.
 *
 * The cards are native radios, so arrow keys move through them and Tab leaves the group; the label carries the K10
 * ring for its hidden input.
 */
import './settings.css';
import {
  useId,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  Check,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HorizontalScroller } from '@/components/ui/horizontal-scroller';
import { ThemeMiniShell } from '@/components/themes/ThemeMiniShell';
import {
  editionForBackground,
  useThemeStore,
  type SiteStyle,
} from '@/stores/themeStore';
import {
  deriveAppliedTheme,
  type ThemeTokens,
  type UserThemeView,
} from '@/lib/themes/tokens';

type Choice =
  | {
      kind: 'edition';
      id: SiteStyle;
      name: string;
      dark: boolean;
    }
  | {
      kind: 'owned';
      id: string;
      name: string;
      dark: boolean;
      tokens: ThemeTokens;
    };

export function ThemePicker({
  owned = [],
}: {
  owned?: UserThemeView[];
}) {
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
  const applied =
    useThemeStore(
      (
        s,
      ) =>
        s.userTheme,
    );
  const setStyle =
    useThemeStore(
      (
        s,
      ) =>
        s.setStyle,
    );
  const setUserTheme =
    useThemeStore(
      (
        s,
      ) =>
        s.setUserTheme,
    );
  const [
    expanded,
    setExpanded,
  ] =
    useState(
      false,
    );
  const labelId =
    useId();
  const hintId =
    useId();
  const group =
    useId();
  const listId =
    useId();

  const choices: Choice[] =
    [
      {
        kind: 'edition',
        id: 'default',
        name: t(
          'settings-edition-day',
          {
            defaultValue:
              'Day',
          },
        ),
        dark: false,
      },
      {
        kind: 'edition',
        id: 'graphite',
        name: t(
          'settings-edition-night',
          {
            defaultValue:
              'Night',
          },
        ),
        dark: true,
      },
      ...owned.map(
        (
          o,
        ): Choice => ({
          kind: 'owned',
          id: o.id,
          name: o.name,
          dark:
            editionForBackground(
              o
                .tokens
                .canvasBase,
            ) ===
            'graphite',
          tokens:
            o.tokens,
        }),
      ),
    ];
  // A theme applied on this device but not in the owned list (signed out, or no longer owned) selects no card.
  const selected =
    applied
      ? applied.id
      : style;

  const choose =
    (
      c: Choice,
    ) => {
      if (
        c.kind ===
        'edition'
      ) {
        setUserTheme(
          null,
        );
        setStyle(
          c.id,
        );
      } else {
        setUserTheme(
          deriveAppliedTheme(
            c.id,
            c.tokens,
          ),
        );
      }
    };

  const cards =
    choices.map(
      (
        c,
      ) => {
        const on =
          c.id ===
          selected;
        return (
          <label
            key={
              c.id
            }
            data-slot="theme-choice"
            data-on={
              on ||
              undefined
            }
            className="theme-choice"
          >
            <input
              type="radio"
              name={
                group
              }
              value={
                c.id
              }
              checked={
                on
              }
              onChange={() =>
                choose(
                  c,
                )
              }
              className="sr-only"
            />
            <span className="theme-choice__picture">
              {c.kind ===
              'owned' ? (
                <ThemeMiniShell
                  tokens={
                    c.tokens
                  }
                />
              ) : (
                <ThemeMiniShell
                  edition={
                    c.id
                  }
                />
              )}
            </span>
            <span className="theme-choice__name">
              <span className="t-body truncate">
                {
                  c.name
                }
              </span>
              {on && (
                <Check
                  aria-hidden
                  className="size-4 shrink-0"
                />
              )}
            </span>
            <span className="t-meta">
              {c.dark
                ? t(
                    'settings-theme-scheme-dark',
                    {
                      defaultValue:
                        'Dark',
                    },
                  )
                : t(
                    'settings-theme-scheme-light',
                    {
                      defaultValue:
                        'Light',
                    },
                  )}
            </span>
          </label>
        );
      },
    );

  const browse =
    (
      <Link
        to="/store"
        search={{
          tab: 'shop',
          kind: 'SITE_THEME',
        }}
        className="theme-picker__browse t-body"
      >
        {t(
          'settings-owned-themes-browse',
          {
            defaultValue:
              'Browse themes',
          },
        )}
        <ChevronRight
          aria-hidden
          className="size-4"
        />
      </Link>
    );

  return (
    <div
      data-slot="theme-picker"
      className="theme-picker"
    >
      <div className="flex items-start justify-between gap-4">
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
              'settings-theme-picker-hint',
              {
                defaultValue:
                  'Day, Night or a theme you own. Each is light or dark by its own colours.',
              },
            )}
          </span>
        </span>
        {owned.length >
          0 && (
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={
              expanded
            }
            aria-controls={
              listId
            }
            onClick={() =>
              setExpanded(
                (
                  v,
                ) =>
                  !v,
              )
            }
          >
            {expanded
              ? t(
                  'settings-theme-show-fewer',
                  {
                    defaultValue:
                      'Show fewer',
                  },
                )
              : t(
                  'settings-theme-show-all',
                  {
                    defaultValue:
                      'Show all',
                  },
                )}
          </Button>
        )}
      </div>
      <div
        id={
          listId
        }
        role="radiogroup"
        aria-labelledby={
          labelId
        }
        aria-describedby={
          hintId
        }
        className="theme-picker__list"
      >
        {expanded ? (
          <div className="theme-picker__grid">
            {
              cards
            }
          </div>
        ) : (
          <HorizontalScroller
            surface="none"
            aria-label={t(
              'settings-theme-carousel-label',
              {
                defaultValue:
                  'Themes',
              },
            )}
            contentClassName="theme-picker__rail"
          >
            {
              cards
            }
          </HorizontalScroller>
        )}
      </div>
      <div className="theme-picker__foot">
        {
          browse
        }
      </div>
    </div>
  );
}
