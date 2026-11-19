import {
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from '@/lib/toast';

import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { Input } from '@/components/ui/input';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { BedtimeRow } from '@/components/access/BedtimeRow';
import {
  readTabBadgePref,
  writeTabBadgePref,
} from '@/lib/tab-badge';
import { mirrorQuietHours } from '@/lib/access/prefs';
import {
  NOTIFY_CATEGORIES,
  resolveChannels,
  type NotifyCategory,
  type NotifyMatrix,
} from '@/lib/notify/categories';
import {
  getNotificationMatrixApi,
  setNotificationMatrixApi,
} from '@/lib/preferences/preferences.contract';
import { api } from '@/lib/contract/client';

// The grid's Email column is gone (settings audit, 2026-11-19): nothing read it. Email is the Email section below the
// grid, and the matrix keeps its stored `email` values untouched.
type Channel =
  | 'inapp'
  | 'push';
const CHANNELS: Channel[] =
  [
    'inapp',
    'push',
  ];

// The rows the grid shows. `events` is left out: nothing sends an "Events & live" notification, so its switches
// changed nothing. It stays in NOTIFY_CATEGORIES so stored matrices still parse.
const GRID_CATEGORIES: NotifyCategory[] =
  NOTIFY_CATEGORIES.filter(
    (c) => c !== 'events',
  );

// Static-key label resolvers. The category rows and channel headers are dynamic
// (driven by NOTIFY_CATEGORIES / CHANNELS), but i18next-parser can only extract
// STRING-LITERAL t() keys — a `t(`category-${cat}`)` template is invisible to
// `pnpm i18n:extract`, so those keys never reach locales/*/settings-notifications.json
// and non-English users saw English labels. Resolving through these literal
// switches keeps the keys extractable + translatable while still rendering per
// locale change (never bake t() into a module constant — it freezes to the
// first-loaded locale). English defaults are the authoritative source strings.
function categoryLabel(
  t: TFunction,
  cat: NotifyCategory,
): string {
  switch (
    cat
  ) {
    case 'social':
      return t(
        'category-social',
        {
          defaultValue:
            'Likes & reposts',
        },
      );
    case 'replies':
      return t(
        'category-replies',
        {
          defaultValue:
            'Replies & mentions',
        },
      );
    case 'follows':
      return t(
        'category-follows',
        {
          defaultValue:
            'Follows',
        },
      );
    case 'economy':
      return t(
        'category-tips-awards',
        {
          defaultValue:
            'Tips & awards',
        },
      );
    case 'events':
      return t(
        'category-events',
        {
          defaultValue:
            'Events & live',
        },
      );
    case 'system':
      return t(
        'category-system',
        {
          defaultValue:
            'System',
        },
      );
  }
}

function channelLabel(
  t: TFunction,
  c: Channel,
): string {
  switch (
    c
  ) {
    case 'inapp':
      return t(
        'channel-inapp',
        {
          defaultValue:
            'In-app',
        },
      );
    case 'push':
      return t(
        'channel-push',
        {
          defaultValue:
            'Push',
        },
      );
  }
}

function toMinutes(
  hhmm: string,
):
  | number
  | null {
  const m =
    /^(\d{2}):(\d{2})$/.exec(
      hhmm,
    );
  if (
    !m
  )
    return null;
  return (
    Number(
      m[1],
    ) *
      60 +
    Number(
      m[2],
    )
  );
}
function toHHMM(
  mins:
    | number
    | null,
): string {
  if (
    mins ==
    null
  )
    return '';
  const h =
    Math.floor(
      mins /
        60,
    );
  const m =
    mins %
    60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface Prefs {
  matrix: NotifyMatrix;
  quietStart:
    | number
    | null;
  quietEnd:
    | number
    | null;
  tz:
    | string
    | null;
}

/**
 * NotificationSettings (§16) — per-category in-app and push switches (one row
 * per category) plus quiet hours. Saves through /api/preferences/notifications.
 */
export function NotificationSettings() {
  const {
    t,
  } =
    useTranslation(
      'settings-notifications',
    );
  const [
    prefs,
    setPrefs,
  ] =
    useState<Prefs | null>(
      null,
    );
  // Each section is its own child of the settings spine, so each takes the fade.
  const arrival =
    useArrival(
      prefs !==
        null,
    );

  useEffect(() => {
    api(
      getNotificationMatrixApi,
    )
      .then(
        (
          d,
        ) => {
          mirrorQuietHours(
            d.quietStart ??
              null,
            d.quietEnd ??
              null,
            d.tz ??
              Intl.DateTimeFormat().resolvedOptions()
                .timeZone,
          );
          setPrefs(
            {
              matrix:
                d.matrix ??
                {},
              quietStart:
                d.quietStart ??
                null,
              quietEnd:
                d.quietEnd ??
                null,
              tz:
                d.tz ??
                Intl.DateTimeFormat().resolvedOptions()
                  .timeZone,
            },
          );
        },
      )
      .catch(
        () => {},
      );
  }, []);

  function persist(
    next: Prefs,
  ) {
    setPrefs(
      next,
    );
    mirrorQuietHours(
      next.quietStart,
      next.quietEnd,
      next.tz,
    );
    api(
      setNotificationMatrixApi,
      {
        body: next,
      },
    ).catch(
      () =>
        toast.error(
          t(
            'error',
            {
              defaultValue:
                'Something went wrong',
            },
          ),
        ),
    );
  }

  function setChannel(
    category: NotifyCategory,
    channel: Channel,
    value: boolean,
  ) {
    if (
      !prefs
    )
      return;
    const current =
      resolveChannels(
        prefs.matrix,
        category,
      );
    const nextCat =
      {
        ...current,
        [channel]:
          value,
      };
    persist(
      {
        ...prefs,
        matrix:
          {
            ...prefs.matrix,
            [category]:
              nextCat,
          },
      },
    );
  }

  function setQuiet(
    field:
      | 'quietStart'
      | 'quietEnd',
    hhmm: string,
  ) {
    if (
      !prefs
    )
      return;
    persist(
      {
        ...prefs,
        [field]:
          toMinutes(
            hhmm,
          ),
      },
    );
  }

  if (
    !prefs
  ) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <SettingsSection
        title={t(
          'categories',
          {
            defaultValue:
              'Categories',
          },
        )}
        description={t(
          'categories-desc',
          {
            defaultValue:
              'In-app puts it in your inbox. Push sends it to the devices where you turned on push notifications.',
          },
        )}
        className={
          arrival
        }
      >
        <div>
          {GRID_CATEGORIES.map((cat) => {
            const ch = resolveChannels(prefs.matrix, cat);
            const name = categoryLabel(t, cat);
            return (
              <div key={cat} className="settings-row flex-wrap">
                <span className="settings-row__text">
                  <span className="settings-row__name block">{name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-5">
                  {CHANNELS.map((c) => {
                    const channel = channelLabel(t, c);
                    return (
                      <span key={c} className="chrome-row flex items-center gap-2">
                        <span className="t-meta" aria-hidden>
                          {channel}
                        </span>
                        <Switch
                          checked={ch[c]}
                          onCheckedChange={(v) => setChannel(cat, c, v)}
                          aria-label={t('channel-switch-label', {
                            defaultValue: '{{category}}: {{channel}}',
                            category: name,
                            channel,
                          })}
                        />
                      </span>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        className={
          arrival
        }
        title={t(
          'quiet-hours',
          {
            defaultValue:
              'Quiet hours',
          },
        )}
        description={t(
          'quiet-desc',
          {
            defaultValue:
              'Push notifications are held during these hours.',
          },
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-site-text">
            {t(
              'from',
              {
                defaultValue:
                  'From',
              },
            )}
            <Input
              type="time"
              value={toHHMM(
                prefs.quietStart,
              )}
              onChange={(
                e,
              ) =>
                setQuiet(
                  'quietStart',
                  e
                    .target
                    .value,
                )
              }
              className="w-auto"
              aria-label={t(
                'quiet-start',
                {
                  defaultValue:
                    'Quiet hours start',
                },
              )}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-site-text">
            {t(
              'to',
              {
                defaultValue:
                  'To',
              },
            )}
            <Input
              type="time"
              value={toHHMM(
                prefs.quietEnd,
              )}
              onChange={(
                e,
              ) =>
                setQuiet(
                  'quietEnd',
                  e
                    .target
                    .value,
                )
              }
              className="w-auto"
              aria-label={t(
                'quiet-end',
                {
                  defaultValue:
                    'Quiet hours end',
                },
              )}
            />
          </label>
        </div>
        <p className="settings-row__hint py-2">
          {t(
            'quiet-tz',
            {
              defaultValue:
                'Times are in {{tz}}.',
              tz: prefs.tz,
            },
          )}
        </p>
        <BedtimeRow
          hasQuietHours={
            prefs.quietStart !=
              null &&
            prefs.quietEnd !=
              null &&
            prefs.quietStart !==
              prefs.quietEnd
          }
        />
      </SettingsSection>

      <TabBadgeToggle
        className={
          arrival
        }
      />
    </>
  );
}

/** Device-local: whether this browser shows "(3)" and a dot on the tab. */
function TabBadgeToggle({
  className,
}: {
  className?:
    | string
    | undefined;
}) {
  const {
    t,
  } =
    useTranslation(
      'settings-notifications',
    );
  const [
    on,
    setOn,
  ] =
    useState(
      true,
    );
  useEffect(
    () =>
      setOn(
        readTabBadgePref(),
      ),
    [],
  );
  return (
    <SettingsSection
      className={
        className
      }
      title={t(
        'tab-badge',
        {
          defaultValue:
            'Unread count in browser tab',
        },
      )}
      titleId="tab-badge-label"
      description={t(
        'tab-badge-desc',
        {
          defaultValue:
            'Shows the number of unread messages and notifications in the tab title and icon on this device.',
        },
      )}
      descriptionId="tab-badge-desc"
      action={
        <Switch
          checked={
            on
          }
          aria-labelledby="tab-badge-label"
          aria-describedby="tab-badge-desc"
          onCheckedChange={(
            v,
          ) => {
            setOn(
              v,
            );
            writeTabBadgePref(
              v,
            );
          }}
        />
      }
    />
  );
}
