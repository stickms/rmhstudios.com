/**
 * Per-type notification toggles backed by /api/notifications/preferences.
 * Toggles save optimistically and roll back (with a toast) on failure.
 */

import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { setNotificationTogglesApi } from '@/lib/preferences/preferences.contract';
import { notificationTogglesQuery } from '@/lib/settings/prefs.queries';
import { api } from '@/lib/contract/client';
import '@/components/settings/settings.css';

const PREF_KEYS =
  [
    'likes',
    'comments',
    'follows',
    'mentions',
    'reposts',
    'system',
  ] as const;
type PrefKey =
  (typeof PREF_KEYS)[number];
type Prefs =
  Record<
    PrefKey,
    boolean
  >;

const COPY: Record<
  PrefKey,
  {
    label: string;
    hint: string;
  }
> =
  {
    likes:
      {
        label:
          'Likes',
        hint: 'When someone likes your posts',
      },
    comments:
      {
        label:
          'Comments',
        hint: 'When someone replies to your posts',
      },
    follows:
      {
        label:
          'Follows',
        hint: 'When someone starts following you',
      },
    mentions:
      {
        label:
          'Mentions',
        hint: 'When someone mentions you in a post',
      },
    reposts:
      {
        label:
          'Reposts',
        hint: 'When someone reposts your content',
      },
    system:
      {
        label:
          'System',
        hint: 'Announcements, rewards, and account updates',
      },
  };

export function NotificationPrefsPanel() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const queryClient =
    useQueryClient();
  const query =
    notificationTogglesQuery();
  const {
    data: prefs,
    isError:
      failed,
  } =
    useQuery(
      query,
    );
  const arrival =
    useArrival(
      !!prefs ||
        failed,
    );

  const toggle =
    async (
      key: PrefKey,
      value: boolean,
    ) => {
      if (
        !prefs
      )
        return;
      const previous =
        prefs;
      queryClient.setQueryData<Prefs>(
        query.queryKey,
        {
          ...prefs,
          [key]:
            value,
        },
      );
      try {
        await api(
          setNotificationTogglesApi,
          {
            body: {
              [key]:
                value,
            },
          },
        );
      } catch {
        queryClient.setQueryData<Prefs>(
          query.queryKey,
          previous,
        );
        toast.error(
          t(
            'settings-notif-save-failed',
            {
              defaultValue:
                'Could not save that setting. Try again.',
            },
          ),
        );
      }
    };

  if (
    failed
  ) {
    return (
      <p
        className={cn(
          'text-sm text-site-text-muted',
          arrival,
        )}
      >
        {t(
          'settings-notif-load-failed',
          {
            defaultValue:
              'Could not load your notification settings. Refresh to try again.',
          },
        )}
      </p>
    );
  }

  if (
    !prefs
  ) {
    return (
      <div className="space-y-3">
        {PREF_KEYS.map(
          (
            key,
          ) => (
            <Skeleton
              key={
                key
              }
              className="h-11 w-full"
            />
          ),
        )}
      </div>
    );
  }

  return (
    <ul
      className={
        arrival
      }
    >
      {PREF_KEYS.map(
        (
          key,
        ) => {
          const labelId = `notif-pref-${key}-label`;
          const hintId = `notif-pref-${key}-hint`;
          return (
            <li
              key={
                key
              }
              className="chrome-row settings-row"
            >
              <div className="settings-row__text">
                <p
                  id={
                    labelId
                  }
                  className="settings-row__name"
                >
                  {t(
                    `settings-notif-${key}`,
                    {
                      defaultValue:
                        COPY[
                          key
                        ]
                          .label,
                    },
                  )}
                </p>
                <p
                  id={
                    hintId
                  }
                  className="settings-row__hint"
                >
                  {t(
                    `settings-notif-${key}-hint`,
                    {
                      defaultValue:
                        COPY[
                          key
                        ]
                          .hint,
                    },
                  )}
                </p>
              </div>
              <Switch
                checked={
                  prefs[
                    key
                  ]
                }
                onCheckedChange={(
                  v,
                ) =>
                  toggle(
                    key,
                    v,
                  )
                }
                aria-labelledby={
                  labelId
                }
                aria-describedby={
                  hintId
                }
              />
            </li>
          );
        },
      )}
    </ul>
  );
}
