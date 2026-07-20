'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  NOTIFY_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DEFAULTS,
  resolveChannels,
  type NotifyCategory,
  type NotifyMatrix,
} from '@/lib/notify/categories';

type Channel = 'inapp' | 'push' | 'email';
const CHANNELS: Channel[] = ['inapp', 'push', 'email'];

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function toHHMM(mins: number | null): string {
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface Prefs {
  matrix: NotifyMatrix;
  quietStart: number | null;
  quietEnd: number | null;
  tz: string | null;
}

/**
 * NotificationSettings (§16) — per-category × per-channel matrix (accordion on
 * mobile) plus quiet hours. Saves through /api/preferences/notifications.
 */
export function NotificationSettings() {
  const { t } = useTranslation('settings-notifications');
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [open, setOpen] = useState<NotifyCategory | null>(null);

  useEffect(() => {
    fetch('/api/preferences/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Prefs | null) => {
        if (!d) return;
        setPrefs({
          matrix: d.matrix ?? {},
          quietStart: d.quietStart ?? null,
          quietEnd: d.quietEnd ?? null,
          tz: d.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      })
      .catch(() => {});
  }, []);

  function persist(next: Prefs) {
    setPrefs(next);
    fetch('/api/preferences/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => toast.error(t('error', { defaultValue: 'Something went wrong' })));
  }

  function setChannel(category: NotifyCategory, channel: Channel, value: boolean) {
    if (!prefs) return;
    const current = resolveChannels(prefs.matrix, category);
    const nextCat = { ...current, [channel]: value };
    persist({ ...prefs, matrix: { ...prefs.matrix, [category]: nextCat } });
  }

  function setQuiet(field: 'quietStart' | 'quietEnd', hhmm: string) {
    if (!prefs) return;
    persist({ ...prefs, [field]: toMinutes(hhmm) });
  }

  if (!prefs) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-site-text">{t('categories', { defaultValue: 'Categories' })}</h3>
        <ul className="divide-y divide-site-border">
          {NOTIFY_CATEGORIES.map((cat) => {
            const ch = resolveChannels(prefs.matrix, cat);
            const summary = CHANNELS.filter((c) => ch[c])
              .map((c) => t(`channel-${c}`, { defaultValue: c }))
              .join(' · ') || t('off', { defaultValue: 'Off' });
            const expanded = open === cat;
            return (
              <li key={cat}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : cat)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 py-3 text-start"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-site-text">
                      {t(`category-${cat}`, { defaultValue: CATEGORY_LABELS[cat] })}
                    </span>
                    <span className="block text-xs text-site-text-muted">{summary}</span>
                  </span>
                  <span className="text-site-text-dim">{expanded ? '−' : '+'}</span>
                </button>
                {expanded ? (
                  <div className="pb-3 ps-1">
                    {CHANNELS.map((c) => (
                      <label key={c} className="flex items-center justify-between py-2">
                        <span className="text-sm text-site-text">{t(`channel-${c}`, { defaultValue: c })}</span>
                        <Switch
                          checked={ch[c]}
                          onCheckedChange={(v) => setChannel(cat, c, v)}
                        />
                      </label>
                    ))}
                    {CATEGORY_DEFAULTS[cat].email ? null : (
                      <p className="text-xs text-site-text-dim">
                        {t('email-note', { defaultValue: 'Email off by default for this category.' })}
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-site-text">{t('quiet-hours', { defaultValue: 'Quiet hours' })}</h3>
        <p className="mb-2 text-sm text-site-text-muted">
          {t('quiet-desc', { defaultValue: 'Push notifications are held during these hours.' })}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-site-text">
            {t('from', { defaultValue: 'From' })}
            <input
              type="time"
              value={toHHMM(prefs.quietStart)}
              onChange={(e) => setQuiet('quietStart', e.target.value)}
              className="glass-inset rounded-site-sm px-2 py-1 text-site-text"
              aria-label={t('quiet-start', { defaultValue: 'Quiet hours start' })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-site-text">
            {t('to', { defaultValue: 'To' })}
            <input
              type="time"
              value={toHHMM(prefs.quietEnd)}
              onChange={(e) => setQuiet('quietEnd', e.target.value)}
              className="glass-inset rounded-site-sm px-2 py-1 text-site-text"
              aria-label={t('quiet-end', { defaultValue: 'Quiet hours end' })}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-site-text-dim">{prefs.tz}</p>
      </section>
    </div>
  );
}
