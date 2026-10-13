'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { IconButton } from '@/components/ui/icon-button';
import { MAX_ALERTS, MAX_ALERT_LENGTH } from '@/lib/search/keyword-alerts';

interface Alert {
  id: string;
  query: string;
}

const json = { 'Content-Type': 'application/json' };

/** A6 keyword alerts and the A5 "On this day" opt-in, on the notification settings page. */
export function DiscoverySettings() {
  const { t } = useTranslation('f-discovery');
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [memories, setMemories] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/discovery/alerts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { alerts: Alert[] } | null) => d && setAlerts(d.alerts))
      .catch(() => {});
    fetch('/api/discovery/memories', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { enabled: boolean } | null) => d && setMemories(d.enabled))
      .catch(() => {});
  }, []);

  const add = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/discovery/alerts', {
        method: 'POST',
        credentials: 'include',
        headers: json,
        body: JSON.stringify({ query: draft }),
      });
      const d = (await res.json().catch(() => null)) as { alert?: Alert; error?: string } | null;
      if (!res.ok || !d?.alert) {
        toast.error(
          d?.error ?? t('alerts-add-failed', { defaultValue: 'Could not add that alert' }),
        );
        return;
      }
      const added = d.alert;
      setAlerts((a) => [...(a ?? []).filter((x) => x.id !== added.id), added]);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const prev = alerts;
    setAlerts((a) => (a ?? []).filter((x) => x.id !== id));
    const res = await fetch(`/api/discovery/alerts?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!res?.ok) {
      setAlerts(prev);
      toast.error(t('alerts-remove-failed', { defaultValue: 'Could not remove that alert' }));
    }
  };

  const toggleMemories = async (enabled: boolean) => {
    setMemories(enabled);
    const res = await fetch('/api/discovery/memories', {
      method: 'PUT',
      credentials: 'include',
      headers: json,
      body: JSON.stringify({ enabled }),
    }).catch(() => null);
    if (!res?.ok) {
      setMemories(!enabled);
      toast.error(t('memories-failed', { defaultValue: 'Could not save that setting' }));
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <section className="glass-pane space-y-3 rounded-site p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-site-text">
          <BellRing className="h-4 w-4" aria-hidden />{' '}
          {t('alerts-title', { defaultValue: 'Keyword alerts' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('alerts-desc', {
            max: MAX_ALERTS,
            defaultValue:
              'Get a notification when someone posts a word or phrase. Use quotes for phrases, -word to exclude, #tag for tags. Up to {{max}} alerts.',
          })}
        </p>
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
            variant="accent"
            size="sm"
            loading={busy}
            disabled={draft.trim().length < 2 || (alerts?.length ?? 0) >= MAX_ALERTS}
          >
            {t('alerts-add', { defaultValue: 'Add' })}
          </Button>
        </form>
        {alerts && alerts.length > 0 && (
          <ul className="space-y-1.5">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="glass-fill flex items-center justify-between gap-2 rounded-site px-3 py-1.5 text-sm text-site-text"
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
      </section>

      <section className="glass-pane flex items-center justify-between gap-3 rounded-site p-4">
        <div>
          <h2 className="text-base font-semibold text-site-text">
            {t('memories-title', { defaultValue: 'On this day' })}
          </h2>
          <p className="text-sm text-site-text-muted">
            {t('memories-desc', {
              defaultValue:
                'Once a day, get a notification with a post of yours from this date in a past year.',
            })}
          </p>
        </div>
        <Switch
          checked={!!memories}
          disabled={memories === null}
          onCheckedChange={(c) => void toggleMemories(c)}
          aria-label={t('memories-title', { defaultValue: 'On this day' })}
        />
      </section>
    </div>
  );
}
