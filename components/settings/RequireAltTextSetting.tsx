import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { setAltTextSettingApi } from '@/lib/feed/alt-text.contract';
import { altTextSettingQuery } from '@/lib/settings/prefs.queries';

/**
 * X12 — the "Require alt text" switch, in Settings → Content preferences.
 *
 * Off by default. When on, the composer will not publish (or schedule) a post
 * with an image that has no description, and neither will the server, so the
 * rule holds from any client. The value is seeded by the route loader; a failed
 * read just leaves the switch off.
 */
export function RequireAltTextSetting() {
  const { t } = useTranslation('f-feed-plus');
  const labelId = useId();
  const hintId = useId();
  const queryClient = useQueryClient();
  const query = altTextSettingQuery();
  const { data, isPending } = useQuery(query);
  const [saving, setSaving] = useState(false);
  const value = data?.requireAltText ?? false;
  const ready = !isPending;

  const change = async (next: boolean) => {
    setSaving(true);
    const prev = data;
    queryClient.setQueryData(query.queryKey, { requireAltText: next });
    try {
      await api(setAltTextSettingApi, { body: { requireAltText: next } });
    } catch {
      queryClient.setQueryData(query.queryKey, prev);
      toast.error(t('alt-setting-failed', { defaultValue: 'Could not save that setting' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title={t('alt-setting-title', { defaultValue: 'Require alt text' })}
      titleId={labelId}
      description={t('alt-setting-hint', {
        defaultValue:
          'Block your own posts that have an image without a description, so everything you share can be read with a screen reader.',
      })}
      descriptionId={hintId}
      action={
        <Switch
          checked={value}
          onCheckedChange={(v) => void change(v)}
          disabled={!ready || saving}
          aria-labelledby={labelId}
          aria-describedby={hintId}
        />
      }
    />
  );
}
