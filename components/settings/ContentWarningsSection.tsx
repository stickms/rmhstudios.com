import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsSelectRow } from '@/components/settings/SettingsSelectRow';
import { api } from '@/lib/contract/client';
import { setContentWarningSettingApi } from '@/lib/feed/content-warning-settings.contract';
import { contentWarningSettingQuery } from '@/lib/feed/content-warning.queries';

/**
 * Sprint 06 #16 - "Posts with content warnings", in Settings -> Content preferences. "Cover them" (the default) shows a
 * post with a warning reason as the reason and a "Show post" button; "Show them" reveals those posts everywhere for
 * this reader and keeps the reason as a label. It only changes what this reader sees: the setting takes effect at once
 * (the query cache is updated before the server answers) and is applied on the client.
 */
export function ContentWarningsSection() {
  const { t } = useTranslation('content-warnings');
  const queryClient = useQueryClient();
  const query = contentWarningSettingQuery();
  const { data, isPending, isError } = useQuery(query);
  const [saving, setSaving] = useState(false);

  const change = async (next: boolean) => {
    setSaving(true);
    const prev = data;
    queryClient.setQueryData(query.queryKey, { showContentWarnings: next });
    try {
      const saved = await api(setContentWarningSettingApi, { body: { showContentWarnings: next } });
      queryClient.setQueryData(query.queryKey, saved);
    } catch {
      queryClient.setQueryData(query.queryKey, prev);
      toast.error(t('save-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(false);
    }
  };

  const ready = !isPending && !isError && !!data;
  const showing = data?.showContentWarnings === true;

  return (
    <SettingsSection
      title={t('setting-title', { defaultValue: 'Posts with content warnings' })}
      description={
        isError
          ? t('load-failed', { defaultValue: 'Could not load this setting. Reload the page to try again.' })
          : t('setting-hint', {
              defaultValue:
                'Cover them to see the reason first and choose to show each post. Show them to see every post, with the reason as a label.',
            })
      }
    >
      <SettingsSelectRow
        label={t('setting-label', { defaultValue: 'Content warnings' })}
        value={showing ? 'show' : 'cover'}
        disabled={!ready || saving}
        onChange={(v) => void change(v === 'show')}
        options={[
          { value: 'cover', label: t('option-cover', { defaultValue: 'Cover them' }) },
          { value: 'show', label: t('option-show', { defaultValue: 'Show them' }) },
        ]}
      />
    </SettingsSection>
  );
}
