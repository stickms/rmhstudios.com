'use client';

/**
 * Per-type notification toggles backed by /api/notifications/preferences.
 * Toggles save optimistically and roll back (with a toast) on failure.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

const PREF_KEYS = ['likes', 'comments', 'follows', 'mentions', 'reposts', 'system'] as const;
type PrefKey = (typeof PREF_KEYS)[number];
type Prefs = Record<PrefKey, boolean>;

const COPY: Record<PrefKey, { label: string; hint: string }> = {
  likes: { label: 'Likes', hint: 'When someone likes your posts' },
  comments: { label: 'Comments', hint: 'When someone replies to your posts' },
  follows: { label: 'Follows', hint: 'When someone starts following you' },
  mentions: { label: 'Mentions', hint: 'When someone mentions you in a post' },
  reposts: { label: 'Reposts', hint: 'When someone reposts your content' },
  system: { label: 'System', hint: 'Announcements, rewards, and account updates' },
};

export function NotificationPrefsPanel() {
  const { t } = useTranslation('feed');
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/notifications/preferences', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => {
        if (active) setPrefs(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (key: PrefKey, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch {
      setPrefs(previous);
      toast.error(
        t('settings-notif-save-failed', { defaultValue: 'Could not save that setting. Try again.' })
      );
    }
  };

  if (failed) {
    return (
      <p className="text-sm text-site-text-muted">
        {t('settings-notif-load-failed', {
          defaultValue: 'Could not load your notification settings. Refresh to try again.',
        })}
      </p>
    );
  }

  if (!prefs) {
    return (
      <div className="space-y-3">
        {PREF_KEYS.map((key) => (
          <Skeleton key={key} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-site-border">
      {PREF_KEYS.map((key) => {
        const labelId = `notif-pref-${key}-label`;
        const hintId = `notif-pref-${key}-hint`;
        return (
          <li key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p id={labelId} className="text-sm font-medium text-site-text">
                {t(`settings-notif-${key}`, { defaultValue: COPY[key].label })}
              </p>
              <p id={hintId} className="text-xs text-site-text-muted">
                {t(`settings-notif-${key}-hint`, { defaultValue: COPY[key].hint })}
              </p>
            </div>
            <Switch
              checked={prefs[key]}
              onCheckedChange={(v) => toggle(key, v)}
              aria-labelledby={labelId}
              aria-describedby={hintId}
            />
          </li>
        );
      })}
    </ul>
  );
}
