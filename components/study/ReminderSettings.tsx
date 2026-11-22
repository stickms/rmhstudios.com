import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { DEFAULT_REMINDER_TIME, GRID_TIMES } from '@/lib/study/reminders';
import { getReminderApi, saveReminderApi, type ReminderSettings } from '@/lib/study/reminders.contract';
import type { saveReminderBody } from '@/lib/study/reminders-schema';
import type { z } from 'zod';

type SaveInput = z.infer<typeof saveReminderBody>;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function supportedZones(): string[] {
  const list = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
  return list ?? [];
}

/**
 * The "Reminders" row on /study and /study/stats: a switch, the local time, the time zone (prefilled from the
 * browser) and when the next reminder comes. Each change saves at once. Render it for a signed-in member only.
 */
export function ReminderSettings() {
  const { t, i18n } = useTranslation('study-reminders');
  const locale = i18n.language;
  const queryClient = useQueryClient();
  const query = useQuery({ ...apiQuery(getReminderApi), retry: false });
  const arrival = useArrival(!!query.data);
  const [editingZone, setEditingZone] = useState(false);

  const save = useMutation({
    mutationFn: (input: SaveInput) => api(saveReminderApi, { body: input }),
    onSuccess: (res) => {
      queryClient.setQueryData(apiQuery(getReminderApi).queryKey, { reminder: res.reminder });
      setEditingZone(false);
    },
    onError: () => toast.error(t('save-failed', { defaultValue: 'Could not save your reminder' })),
  });

  const current: ReminderSettings = query.data?.reminder ?? {
    enabled: false,
    time: DEFAULT_REMINDER_TIME,
    timeZone: browserTimeZone(),
    nextAt: null,
    paused: false,
  };

  const timeLabel = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' });
    return (time: string) => f.format(new Date(`1970-01-01T${time}:00Z`));
  }, [locale]);
  const zones = useMemo(() => {
    const all = new Set([current.timeZone, browserTimeZone(), ...supportedZones()]);
    return [...all];
  }, [current.timeZone]);
  const nextLabel = useMemo(() => {
    if (!current.nextAt) return null;
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: current.timeZone,
      }).format(new Date(current.nextAt));
    } catch {
      return null;
    }
  }, [locale, current.nextAt, current.timeZone]);

  const change = (patch: Partial<SaveInput>) =>
    save.mutate({ enabled: current.enabled, time: current.time, timeZone: current.timeZone, ...patch });

  if (query.isError) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-site-border p-4">
        <p className="t-body">{t('load-failed', { defaultValue: 'Could not load your reminder' })}</p>
        <Button variant="default" size="sm" onClick={() => void query.refetch()}>
          {t('retry', { defaultValue: 'Try again' })}
        </Button>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="border-b border-site-border p-4" aria-busy>
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <section
      className={`space-y-2 border-b border-site-border p-4 ${arrival ?? ''}`}
      aria-labelledby="study-reminder-title"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="study-reminder-title" className="t-label">
          {t('title', { defaultValue: 'Reminders' })}
        </h2>
        <Switch
          checked={current.enabled}
          disabled={save.isPending}
          aria-labelledby="study-reminder-title"
          onCheckedChange={(enabled) => change({ enabled })}
        />
        <Select
          aria-label={t('time-label', { defaultValue: 'Reminder time' })}
          controlSize="sm"
          value={current.time}
          disabled={save.isPending}
          onChange={(e) => change({ time: e.target.value })}
        >
          {GRID_TIMES.map((time) => (
            <option key={time} value={time}>
              {timeLabel(time)}
            </option>
          ))}
        </Select>
        {editingZone ? (
          <Select
            aria-label={t('zone-label', { defaultValue: 'Time zone' })}
            controlSize="sm"
            value={current.timeZone}
            disabled={save.isPending}
            onChange={(e) => change({ timeZone: e.target.value })}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        ) : (
          <span className="t-body flex items-center gap-2">
            {current.timeZone}
            <Button variant="ghost" size="sm" onClick={() => setEditingZone(true)}>
              {t('zone-change', { defaultValue: 'Change' })}
            </Button>
          </span>
        )}
      </div>
      {current.paused ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="t-meta">{t('paused', { defaultValue: 'Paused because you have not reviewed in two weeks' })}</p>
          <Button
            variant="default"
            size="sm"
            disabled={save.isPending}
            onClick={() => change({ enabled: true, resume: true })}
          >
            {t('resume', { defaultValue: 'Resume' })}
          </Button>
        </div>
      ) : nextLabel ? (
        <p className="t-meta">{t('next', { defaultValue: 'Next reminder: {{when}}', when: nextLabel })}</p>
      ) : (
        <p className="t-meta">{t('off', { defaultValue: 'Turn on to get a reminder when cards are due.' })}</p>
      )}
    </section>
  );
}
