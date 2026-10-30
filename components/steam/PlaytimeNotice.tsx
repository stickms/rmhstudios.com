'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { isPlaytimePrivacy, shouldShowNotice, type PlaytimePrivacy } from '@/lib/playtime/privacy';

type Settings = { playtimePrivacy: PlaytimePrivacy; noticeDismissed: boolean };

/**
 * The one-time notice that playtime is visible, as Steam's blue banner. Playtime is
 * public by default (opt out), so an existing account becomes visible without doing
 * anything; this says so once, links to the setting, and stays gone once dismissed.
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

  if (!settings || !shouldShowNotice({ signedIn, noticeDismissed: settings.noticeDismissed, privacy: settings.playtimePrivacy })) {
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
    <aside className="stm-notice" aria-label={t('playtime-notice-label', { defaultValue: 'Playtime visibility' })}>
      <Eye aria-hidden />
      <p>
        {t('playtime-notice-body', {
          defaultValue: 'Your playtime is now visible to other signed-in members. You can change who sees it.',
        })}
      </p>
      <Link to="/settings/privacy" className="stm-btn stm-btn-ghost">
        {t('playtime-notice-change', { defaultValue: 'Change' })}
      </Link>
      <button type="button" className="stm-btn stm-btn-ghost" onClick={dismiss}>
        {t('playtime-notice-dismiss', { defaultValue: 'Got it' })}
      </button>
    </aside>
  );
}
