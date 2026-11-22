import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { api, errorField } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { createReadingSubscriptionApi, deleteReadingSubscriptionApi } from '@/lib/reading/subscriptions.contract';
import { readingSubscriptionsQuery } from '@/lib/reading/subscriptions.queries';
import type { SubscriptionKind } from '@/lib/reading/subscriptions';
import type { SubscriptionView } from '@/lib/reading/subscriptions-schema';

type List = {
  subscriptions: SubscriptionView[];
};

/**
 * Whether the signed-in member follows `(kind, target)`, and a toggle that follows or unfollows it. Signed out,
 * `signedIn` is false and nothing is fetched. The list is the one shared query, so every follow control on the
 * page, and the settings list, agree.
 */
export function useReadingFollow() {
  const { t } = useTranslation('subscriptions');
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const queryClient = useQueryClient();
  const query = readingSubscriptionsQuery(signedIn);
  const { data, isPending } = useQuery(query);
  const [busy, setBusy] = useState<string | null>(null);

  const find = (kind: SubscriptionKind, target: string) =>
    data?.subscriptions.find((s) => s.kind === kind && s.target === target);

  const setList = (update: (list: SubscriptionView[]) => SubscriptionView[]) =>
    queryClient.setQueryData<List>(query.queryKey, (old) => ({
      subscriptions: update(old?.subscriptions ?? []),
    }));

  async function toggle(kind: SubscriptionKind, target: string) {
    const key = `${kind}:${target}`;
    if (busy) return;
    setBusy(key);
    const current = find(kind, target);
    try {
      if (current) {
        await api(deleteReadingSubscriptionApi, {
          params: {
            id: current.id,
          },
        });
        setList((list) => list.filter((s) => s.id !== current.id));
      } else {
        const { subscription } = await api(createReadingSubscriptionApi, {
          body: {
            kind,
            target,
          },
        });
        setList((list) => [...list.filter((s) => s.id !== subscription.id), subscription]);
      }
    } catch (error) {
      toast.error(
        errorField<string>(error, 'reason') === 'limit-reached'
          ? t('error-limit', {
              defaultValue: 'You follow the most you can. Unfollow something first.',
            })
          : t('error-follow', {
              defaultValue: 'Could not change that. Try again.',
            }),
      );
      // The cache may be stale (a follow made in another tab): read the truth again.
      void queryClient.invalidateQueries({
        queryKey: query.queryKey,
      });
    } finally {
      setBusy(null);
    }
  }

  return {
    signedIn,
    loading: signedIn && isPending,
    busy,
    find,
    toggle,
  };
}
