import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { IconButton } from '@/components/ui/icon-button';
import { MAX_ALERTS, MAX_ALERT_LENGTH } from '@/lib/search/keyword-alerts';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  addDiscoveryAlertApi,
  removeDiscoveryAlertApi,
  setDiscoveryMemoriesApi,
  type DiscoveryAlert as Alert,
} from '@/lib/discovery/discovery.contract';
import { discoveryAlertsQuery, discoveryMemoriesQuery } from '@/lib/settings/prefs.queries';
import { cn } from '@/lib/utils';

/** A6 keyword alerts and the A5 "On this day" opt-in, on the notification settings page. */
export function DiscoverySettings() {
  const { t } = useTranslation('f-discovery');
  const queryClient = useQueryClient();
  const alertsKey = discoveryAlertsQuery();
  const memoriesKey = discoveryMemoriesQuery();
  const { data: alertsData } = useQuery(alertsKey);
  const { data: memoriesData } = useQuery(memoriesKey);
  const alerts: Alert[] | null = alertsData?.alerts ?? null;
  const memories: boolean | null = memoriesData?.enabled ?? null;
  // Steel M9: the saved alerts fill the gap under the form once fetched.
  const alertsArrival = useArrival(alerts !== null);
  const setAlerts = (update: (a: Alert[] | null) => Alert[] | null) =>
    queryClient.setQueryData(alertsKey.queryKey, (old: { alerts: Alert[] } | undefined) => ({
      alerts: update(old?.alerts ?? null) ?? [],
    }));
  const setMemories = (enabled: boolean) =>
    queryClient.setQueryData(memoriesKey.queryKey, { enabled });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      let added: Alert;
      try {
        added = (await api(addDiscoveryAlertApi, { body: { query: draft } })).alert;
      } catch (e) {
        toast.error(
          serverError(e) ?? t('alerts-add-failed', { defaultValue: 'Could not add that alert' }),
        );
        return;
      }
      setAlerts((a) => [...(a ?? []).filter((x) => x.id !== added.id), added]);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const prev = alerts;
    setAlerts((a) => (a ?? []).filter((x) => x.id !== id));
    const ok = await api(removeDiscoveryAlertApi, { query: { id } }).then(
      () => true,
      () => false,
    );
    if (!ok) {
      setAlerts(() => prev);
      toast.error(t('alerts-remove-failed', { defaultValue: 'Could not remove that alert' }));
    }
  };

  const toggleMemories = async (enabled: boolean) => {
    setMemories(enabled);
    const ok = await api(setDiscoveryMemoriesApi, { body: { enabled } }).then(
      () => true,
      () => false,
    );
    if (!ok) {
      setMemories(!enabled);
      toast.error(t('memories-failed', { defaultValue: 'Could not save that setting' }));
    }
  };

  return (
    <>
      <SettingsSection
        title={t('alerts-title', { defaultValue: 'Keyword alerts' })}
        description={t('alerts-desc', {
          max: MAX_ALERTS,
          defaultValue:
            'Get a notification when someone posts a word or phrase. Use quotes for phrases, -word to exclude, #tag for tags. Up to {{max}} alerts.',
        })}
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim().length >= 2) void add();
          }}
        >
          <Input
            value={draft}
            maxLength={MAX_ALERT_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t('alerts-input', { defaultValue: 'New alert' })}
            placeholder={t('alerts-placeholder', { defaultValue: '"slice it" charts -leak' })}
          />
          <Button
            type="submit"
            variant="default"
            loading={busy}
            disabled={draft.trim().length < 2 || (alerts?.length ?? 0) >= MAX_ALERTS}
          >
            {t('alerts-add', { defaultValue: 'Add' })}
          </Button>
        </form>
        {alerts && alerts.length > 0 && (
          <ul className={cn('space-y-2', alertsArrival)}>
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-site px-3 py-2 text-sm text-site-text"
              >
                <span className="min-w-0 truncate">{a.query}</span>
                <IconButton
                  icon={X}
                  label={t('alerts-remove', { defaultValue: 'Remove alert' })}
                  onClick={() => void remove(a.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('memories-title', { defaultValue: 'On this day' })}
        description={t('memories-desc', {
          defaultValue:
            'Once a day, get a notification with a post of yours from this date in a past year.',
        })}
        action={
          <Switch
            checked={!!memories}
            disabled={memories === null}
            onCheckedChange={(c) => void toggleMemories(c)}
            aria-label={t('memories-title', { defaultValue: 'On this day' })}
          />
        }
      />
    </>
  );
}
