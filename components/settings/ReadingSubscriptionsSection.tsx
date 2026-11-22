import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useArrival } from '@/components/ui/arrive';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { deleteReadingSubscriptionApi, updateReadingSubscriptionApi } from '@/lib/reading/subscriptions.contract';
import { readingSubscriptionsQuery } from '@/lib/reading/subscriptions.queries';
import type { SubscriptionView } from '@/lib/reading/subscriptions-schema';

// Literal t() keys per kind: i18next-parser cannot see a templated key.
function subscriptionName(t: TFunction, sub: SubscriptionView): string {
  switch (sub.kind) {
    case 'blog':
      return t('sub-blog', {
        defaultValue: 'The Logs',
      });
    case 'blog_tag':
      return t('sub-tag', {
        defaultValue: 'Logs tagged {{tag}}',
        tag: sub.target,
      });
    case 'news_category':
      return t('sub-category', {
        defaultValue: '{{category}} news',
        category: sub.target,
      });
    case 'news_story':
      return t('sub-story', {
        defaultValue: 'Story: {{title}}',
        title: sub.title ?? sub.target,
      });
  }
}

/**
 * "Logs and news" in `/settings/notifications`: what the member follows, with an in-site and an email switch for
 * each and Unfollow. Rows on rules, no boxes.
 */
export function ReadingSubscriptionsSection() {
  const { t } = useTranslation('subscriptions');
  const queryClient = useQueryClient();
  const query = readingSubscriptionsQuery();
  const { data, isPending, isError, refetch } = useQuery(query);
  const arrival = useArrival(data !== undefined);
  const [pending, setPending] = useState<string | null>(null);

  const setList = (update: (list: SubscriptionView[]) => SubscriptionView[]) =>
    queryClient.setQueryData<{
      subscriptions: SubscriptionView[];
    }>(query.queryKey, (old) => ({
      subscriptions: update(old?.subscriptions ?? []),
    }));

  async function setChannel(sub: SubscriptionView, channel: 'inApp' | 'email', value: boolean) {
    setPending(sub.id);
    setList((list) =>
      list.map((s) =>
        s.id === sub.id
          ? {
              ...s,
              [channel]: value,
            }
          : s,
      ),
    );
    try {
      const { subscription } = await api(updateReadingSubscriptionApi, {
        params: {
          id: sub.id,
        },
        body: {
          [channel]: value,
        },
      });
      setList((list) => list.map((s) => (s.id === sub.id ? subscription : s)));
    } catch {
      setList((list) => list.map((s) => (s.id === sub.id ? sub : s)));
      toast.error(
        t('error-update', {
          defaultValue: 'Could not save that. Try again.',
        }),
      );
    } finally {
      setPending(null);
    }
  }

  async function unfollow(sub: SubscriptionView) {
    setPending(sub.id);
    try {
      await api(deleteReadingSubscriptionApi, {
        params: {
          id: sub.id,
        },
      });
      setList((list) => list.filter((s) => s.id !== sub.id));
    } catch {
      toast.error(
        t('error-unfollow', {
          defaultValue: 'Could not unfollow. Try again.',
        }),
      );
    } finally {
      setPending(null);
    }
  }

  const subscriptions = data?.subscriptions ?? [];

  return (
    <SettingsSection
      className={arrival}
      title={t('title', {
        defaultValue: 'Logs and news',
      })}
      description={t('desc', {
        defaultValue:
          'What you follow. New items reach you here, and by email once a day if you turn email on for them.',
      })}
    >
      {isPending ? (
        <div className="space-y-3 py-3" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="t-body text-site-text-muted" role="alert">
            {t('error-load', {
              defaultValue: 'Could not load what you follow.',
            })}
          </p>
          <Button type="button" size="sm" onClick={() => void refetch()}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </Button>
        </div>
      ) : subscriptions.length === 0 ? (
        <p className="t-body py-3 text-site-text-muted">
          {t('empty', {
            defaultValue: 'You are not following anything yet. Use Follow on a Log, a News category or a story.',
          })}
        </p>
      ) : (
        <ul className="divide-y divide-site-border">
          {subscriptions.map((sub) => {
            const name = subscriptionName(t, sub);
            return (
              <li key={sub.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="t-body min-w-0 flex-1 basis-40 text-site-text">{name}</span>
                <label className="t-label flex items-center gap-2">
                  {t('channel-in-app', {
                    defaultValue: 'In the site',
                  })}
                  <Switch
                    checked={sub.inApp}
                    disabled={pending === sub.id}
                    aria-label={t('channel-in-app-for', {
                      defaultValue: 'Notify me in the site: {{name}}',
                      name,
                    })}
                    onCheckedChange={(v) => void setChannel(sub, 'inApp', v)}
                  />
                </label>
                <label className="t-label flex items-center gap-2">
                  {t('channel-email', {
                    defaultValue: 'Email',
                  })}
                  <Switch
                    checked={sub.email}
                    disabled={pending === sub.id}
                    aria-label={t('channel-email-for', {
                      defaultValue: 'Email me daily: {{name}}',
                      name,
                    })}
                    onCheckedChange={(v) => void setChannel(sub, 'email', v)}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending === sub.id}
                  aria-label={t('unfollow-named', {
                    defaultValue: 'Unfollow {{name}}',
                    name,
                  })}
                  onClick={() => void unfollow(sub)}
                >
                  {t('unfollow', {
                    defaultValue: 'Unfollow',
                  })}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
