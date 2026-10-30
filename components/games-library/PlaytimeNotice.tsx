'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { isPlaytimePrivacy, shouldShowNotice, type PlaytimePrivacy } from '@/lib/playtime/privacy';

type Settings = { playtimePrivacy: PlaytimePrivacy; noticeDismissed: boolean };

/**
 * The one-time notice that playtime is visible. Playtime is public by default
 * (opt out), so an existing account becomes visible without doing anything; this
 * says so once, links straight to the setting, and stays gone once dismissed.
 */
export function PlaytimeNotice() {
  const { t } = useTranslation('games-hub');
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch('/api/settings/playtime-privacy', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { playtimePrivacy?: unknown; noticeDismissed?: unknown } | null) => {
        if (cancelled || !d || !isPlaytimePrivacy(d.playtimePrivacy)) return;
        setSettings({ playtimePrivacy: d.playtimePrivacy, noticeDismissed: d.noticeDismissed === true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!settings || !shouldShowNotice({ signedIn, ...settings, privacy: settings.playtimePrivacy })) {
    return null;
  }

  function dismiss() {
    setSettings((s) => (s ? { ...s, noticeDismissed: true } : s));
    fetch('/api/settings/playtime-privacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dismissNotice: true }),
    }).catch(() => {});
  }

  return (
    <aside
      aria-label={t('playtime-notice-label', { defaultValue: 'Playtime visibility' })}
      className="glass-fill mb-4 flex flex-wrap items-center gap-3 rounded-site px-4 py-3"
    >
      <Eye className="size-4 shrink-0 text-site-text-muted" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-site-text">
        {t('playtime-notice-body', {
          defaultValue: 'Your playtime is now visible to other signed-in members. You can change who sees it.',
        })}
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/settings/privacy">{t('playtime-notice-change', { defaultValue: 'Change' })}</Link>
      </Button>
      <Button variant="ghost" size="sm" onClick={dismiss}>
        {t('playtime-notice-dismiss', { defaultValue: 'Got it' })}
      </Button>
    </aside>
  );
}
