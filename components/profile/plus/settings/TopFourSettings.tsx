import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  ArrowDown,
  ArrowUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import {
  TOP_FOUR_SIZE,
  type TopFourItem,
} from '@/lib/profile/modules';
import {
  resolveTopFour,
  topFourChoices,
} from '@/lib/profile/top-four';
import { api } from '@/lib/contract/client';
import {
  getTopFourApi,
  setTopFourApi,
} from '@/lib/profile/profile-extras.contract';

const keyOf =
  (
    i: TopFourItem,
  ) =>
    `${i.kind}:${i.id}`;

/** P1 — pick, order and save the four pinned favourites. */
export default function TopFourSettings() {
  const {
    t,
  } =
    useTranslation(
      'f-profile-plus',
    );
  const [
    items,
    setItems,
  ] =
    useState<
      | TopFourItem[]
      | null
    >(
      null,
    );
  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );
  const choices =
    useMemo(
      () =>
        topFourChoices(),
      [],
    );
  const arrival =
    useArrival(
      items !==
        null,
    );

  useEffect(() => {
    let cancelled = false;
    api(
      getTopFourApi,
      {
        retries: 0,
      },
    )
      .then(
        (
          json,
        ) => {
          if (
            !cancelled
          )
            setItems(
              json.items ??
                [],
            );
        },
      )
      .catch(
        () => {
          if (
            !cancelled
          )
            setItems(
              [],
            );
        },
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // The same placeholder as the other sections of this panel, so the editor does not land in a gap.
  if (
    items ===
    null
  )
    return (
      <Skeleton className="h-48 w-full" />
    );

  const picked =
    resolveTopFour(
      items,
    );
  const taken =
    new Set(
      items.map(
        keyOf,
      ),
    );
  const move =
    (
      from: number,
      to: number,
    ) => {
      const next =
        [
          ...items,
        ];
      const [
        x,
      ] =
        next.splice(
          from,
          1,
        );
      if (
        x
      )
        next.splice(
          to,
          0,
          x,
        );
      setItems(
        next,
      );
    };

  async function save() {
    setSaving(
      true,
    );
    try {
      const json =
        await api(
          setTopFourApi,
          {
            body: {
              items:
                items ??
                [],
            },
          },
        );
      setItems(
        json.items,
      );
      toast.success(
        t(
          'top-four-saved',
          {
            defaultValue:
              'Top four saved',
          },
        ),
      );
    } catch {
      toast.error(
        t(
          'top-four-failed',
          {
            defaultValue:
              "Couldn't save your top four",
          },
        ),
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  return (
    <div
      className={cn(
        'space-y-4',
        arrival,
      )}
    >
      <p className="text-sm text-site-text-muted">
        {t(
          'top-four-intro',
          {
            defaultValue:
              'Pin up to four games or apps that say the most about you.',
          },
        )}
      </p>

      <ol className="space-y-2">
        {picked.map(
          (
            entry,
            i,
          ) => (
            <li
              key={keyOf(
                entry,
              )}
              className="flex items-center gap-2 rounded-site-sm px-3 py-2"
            >
              <span className="w-5 text-sm tabular-nums text-site-text-muted">
                {i +
                  1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">
                {
                  entry.title
                }
              </span>
              <IconButton
                icon={
                  ArrowUp
                }
                size="icon-xs"
                label={t(
                  'top-four-up',
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
                    i -
                      1,
                  )
                }
              />
              <IconButton
                icon={
                  ArrowDown
                }
                size="icon-xs"
                label={t(
                  'top-four-down',
                  {
                    defaultValue:
                      'Move down',
                  },
                )}
                disabled={
                  i ===
                  picked.length -
                    1
                }
                onClick={() =>
                  move(
                    i,
                    i +
                      1,
                  )
                }
              />
              <IconButton
                icon={
                  X
                }
                size="icon-xs"
                label={t(
                  'top-four-remove',
                  {
                    defaultValue:
                      'Remove',
                  },
                )}
                onClick={() =>
                  setItems(
                    items.filter(
                      (
                        x,
                      ) =>
                        keyOf(
                          x,
                        ) !==
                        keyOf(
                          entry,
                        ),
                    ),
                  )
                }
              />
            </li>
          ),
        )}
      </ol>

      {picked.length <
      TOP_FOUR_SIZE ? (
        <Select
          value=""
          placeholder={t(
            'top-four-add',
            {
              defaultValue:
                'Add a game or app…',
            },
          )}
          aria-label={t(
            'top-four-add',
            {
              defaultValue:
                'Add a game or app…',
            },
          )}
          onChange={(
            e,
          ) => {
            const value =
              e
                .target
                .value;
            const sep =
              value.indexOf(
                ':',
              );
            if (
              sep >
              0
            ) {
              const kind =
                value.slice(
                  0,
                  sep,
                ) as TopFourItem['kind'];
              setItems(
                [
                  ...items,
                  {
                    kind,
                    id: value.slice(
                      sep +
                        1,
                    ),
                  },
                ],
              );
            }
          }}
        >
          {choices
            .filter(
              (
                c,
              ) =>
                !taken.has(
                  keyOf(
                    c,
                  ),
                ),
            )
            .map(
              (
                c,
              ) => (
                <option
                  key={keyOf(
                    c,
                  )}
                  value={keyOf(
                    c,
                  )}
                >
                  {
                    c.title
                  }
                  {
                    ' · '
                  }
                  {c.kind ===
                  'game'
                    ? t(
                        'kind-game',
                        {
                          defaultValue:
                            'Game',
                        },
                      )
                    : t(
                        'kind-app',
                        {
                          defaultValue:
                            'App',
                        },
                      )}
                </option>
              ),
            )}
        </Select>
      ) : null}

      <Button
        variant="default"
        loading={
          saving
        }
        onClick={() =>
          void save()
        }
      >
        {t(
          'top-four-save',
          {
            defaultValue:
              'Save top four',
          },
        )}
      </Button>
    </div>
  );
}
