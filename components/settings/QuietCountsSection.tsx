import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { setQuietCountsApi } from '@/lib/feed/quiet-counts.contract';
import { quietCountsQuery } from '@/lib/feed/quiet-counts.queries';

type Key = 'hideCountsOnMine' | 'hideCountsInFeed';

/**
 * Sprint 04 #14 — the two "quiet counts" switches, in Settings → Content preferences.
 *
 * "Hide counts on my posts" is enforced by the server in every path that returns a post's numbers, so it holds for
 * the API, embeds and cards too; you still see your own numbers and your insights. "Hide counts while browsing" is
 * about what you see: the number beside the like, repost, reply and view buttons is left out everywhere. Each toggle
 * is its own request and takes effect at once (the query cache is updated before the server answers).
 */
export function QuietCountsSection() {
  const { t } = useTranslation('quiet-counts');
  const mineId = useId();
  const mineHintId = useId();
  const feedId = useId();
  const feedHintId = useId();
  const queryClient = useQueryClient();
  const query = quietCountsQuery();
  const { data, isPending, isError } = useQuery(query);
  const [saving, setSaving] = useState<Key | null>(null);

  const change = async (key: Key, next: boolean) => {
    setSaving(key);
    const prev = data;
    queryClient.setQueryData(query.queryKey, (old) => (old ? { ...old, [key]: next } : old));
    try {
      const body = key === 'hideCountsOnMine' ? { hideCountsOnMine: next } : { hideCountsInFeed: next };
      const saved = await api(setQuietCountsApi, { body });
      queryClient.setQueryData(query.queryKey, saved);
    } catch {
      queryClient.setQueryData(query.queryKey, prev);
      toast.error(t('save-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(null);
    }
  };

  const ready = !isPending && !isError && !!data;

  return (
    <>
      <SettingsSection
        title={t('hide-on-mine-title', { defaultValue: 'Hide counts on my posts' })}
        titleId={mineId}
        description={t('hide-on-mine-hint', {
          defaultValue:
            'Other people see your posts without like, repost, reply or view numbers. You still see them, and your insights.',
        })}
        descriptionId={mineHintId}
        action={
          <Switch
            checked={data?.hideCountsOnMine ?? false}
            onCheckedChange={(v) => void change('hideCountsOnMine', v)}
            disabled={!ready || saving === 'hideCountsOnMine'}
            aria-labelledby={mineId}
            aria-describedby={mineHintId}
          />
        }
      />
      <SettingsSection
        title={t('hide-in-feed-title', { defaultValue: 'Hide counts while browsing' })}
        titleId={feedId}
        description={
          isError
            ? t('load-failed', { defaultValue: 'Could not load this setting. Reload the page to try again.' })
            : t('hide-in-feed-hint', {
                defaultValue:
                  'Leave out the numbers beside the like, repost, reply and view buttons on every post, including yours.',
              })
        }
        descriptionId={feedHintId}
        action={
          <Switch
            checked={data?.hideCountsInFeed ?? false}
            onCheckedChange={(v) => void change('hideCountsInFeed', v)}
            disabled={!ready || saving === 'hideCountsInFeed'}
            aria-labelledby={feedId}
            aria-describedby={feedHintId}
          />
        }
      />
    </>
  );
}
