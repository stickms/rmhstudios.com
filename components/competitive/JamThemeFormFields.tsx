import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  MAX_THEME_CANDIDATES,
  MIN_THEME_CANDIDATES,
  THEME_TEXT_MAX,
} from '@/lib/competitive/jam-themes';

export interface ThemeVotingDraft {
  enabled: boolean;
  candidates: string[];
  /** A datetime-local value; empty means "now". */
  opensAt: string;
}

export const EMPTY_THEME_VOTING: ThemeVotingDraft =
  {
    enabled: false,
    candidates:
      [
        '',
        '',
        '',
      ],
    opensAt:
      '',
  };

/** The admin create form's theme-voting section: a switch, the shortlist (add, remove, reorder) and the opening time. */
export function JamThemeFormFields({
  value,
  onChange,
}: {
  value: ThemeVotingDraft;
  onChange: (
    next: ThemeVotingDraft,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'jam-themes',
    );
  const set =
    (
      candidates: string[],
    ) =>
      onChange(
        {
          ...value,
          candidates,
        },
      );
  const move =
    (
      i: number,
      by:
        | -1
        | 1,
    ) => {
      const next =
        [
          ...value.candidates,
        ];
      const j =
        i +
        by;
      if (
        j <
          0 ||
        j >=
          next.length
      )
        return;
      [
        next[
          i
        ],
        next[
          j
        ],
      ] =
        [
          next[
            j
          ]!,
          next[
            i
          ]!,
        ];
      set(
        next,
      );
    };
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex items-center gap-3">
        <Switch
          id="jam-theme-voting"
          checked={
            value.enabled
          }
          onCheckedChange={(
            enabled,
          ) =>
            onChange(
              {
                ...value,
                enabled,
              },
            )
          }
          aria-labelledby="jam-theme-voting-label"
        />
        <Label
          id="jam-theme-voting-label"
          htmlFor="jam-theme-voting"
        >
          {t(
            'form-switch',
            {
              defaultValue:
                'Let members vote on the theme',
            },
          )}
        </Label>
      </div>
      {value.enabled && (
        <div className="space-y-3">
          <p className="t-meta">
            {t(
              'form-hint',
              {
                defaultValue:
                  'Offer {{min}} to {{max}} themes. The first one wins a tie.',
                min: MIN_THEME_CANDIDATES,
                max: MAX_THEME_CANDIDATES,
              },
            )}
          </p>
          <ul>
            {value.candidates.map(
              (
                text,
                i,
              ) => (
                <li
                  key={
                    i
                  }
                  className="flex items-center gap-2 border-b border-site-border py-2"
                >
                  <Input
                    value={
                      text
                    }
                    maxLength={
                      THEME_TEXT_MAX
                    }
                    aria-label={t(
                      'form-candidate',
                      {
                        defaultValue:
                          'Theme {{n}}',
                        n:
                          i +
                          1,
                      },
                    )}
                    onChange={(
                      e,
                    ) =>
                      set(
                        value.candidates.map(
                          (
                            c,
                            k,
                          ) =>
                            k ===
                            i
                              ? e
                                  .target
                                  .value
                              : c,
                        ),
                      )
                    }
                  />
                  <IconButton
                    icon={
                      ArrowUp
                    }
                    label={t(
                      'form-up',
                      {
                        defaultValue:
                          'Move up',
                      },
                    )}
                    disabled={
                      i ===
                      0
                    }
                    onClick={() =>
                      move(
                        i,
                        -1,
                      )
                    }
                  />
                  <IconButton
                    icon={
                      ArrowDown
                    }
                    label={t(
                      'form-down',
                      {
                        defaultValue:
                          'Move down',
                      },
                    )}
                    disabled={
                      i ===
                      value
                        .candidates
                        .length -
                        1
                    }
                    onClick={() =>
                      move(
                        i,
                        1,
                      )
                    }
                  />
                  <IconButton
                    icon={
                      X
                    }
                    label={t(
                      'form-remove',
                      {
                        defaultValue:
                          'Remove theme',
                      },
                    )}
                    disabled={
                      value
                        .candidates
                        .length <=
                      MIN_THEME_CANDIDATES
                    }
                    onClick={() =>
                      set(
                        value.candidates.filter(
                          (
                            _,
                            k,
                          ) =>
                            k !==
                            i,
                        ),
                      )
                    }
                  />
                </li>
              ),
            )}
          </ul>
          <Button
            type="button"
            disabled={
              value
                .candidates
                .length >=
              MAX_THEME_CANDIDATES
            }
            onClick={() =>
              set(
                [
                  ...value.candidates,
                  '',
                ],
              )
            }
          >
            <Plus />
            {t(
              'form-add',
              {
                defaultValue:
                  'Add a theme',
              },
            )}
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor="jam-theme-opens">
              {t(
                'form-opens',
                {
                  defaultValue:
                    'Voting opens (blank is now)',
                },
              )}
            </Label>
            <Input
              id="jam-theme-opens"
              name="themeOpensAt"
              type="datetime-local"
              value={
                value.opensAt
              }
              onChange={(
                e,
              ) =>
                onChange(
                  {
                    ...value,
                    opensAt:
                      e
                        .target
                        .value,
                  },
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
