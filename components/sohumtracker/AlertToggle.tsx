'use client';

/**
 * "Tell me when he joins voice" — the page's only interactive control.
 *
 * Two things have to be true for it to work, and they are genuinely separate:
 * the browser has to have granted push permission and registered a subscription
 * (`usePushSubscription`, shared with the rest of the site), and the account has
 * to be opted in to THIS alert (`/api/sohumtracker/alert`). The button does both
 * in one press, in that order, because a user pressing it is asking for the
 * outcome and not for a two-step setup.
 *
 * It is deliberately the only notification the dossier sends. One for every
 * message would be several an hour about somebody's Tuesday, which is the line
 * between a running joke and surveillance nobody asked to receive.
 *
 * Signed out, the control renders as a sign-in prompt rather than vanishing: a
 * missing button is indistinguishable from a broken one.
 */

import { Bell, BellOff, BellRing } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { usePushSubscription } from '@/lib/usePushSubscription';

export function AlertToggle() {
  const { t } = useTranslation('r-sohumtracker');
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);

  const { supported, subscribed, busy, subscribe } = usePushSubscription(signedIn);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // The stored preference, which is a different question from whether this
  // BROWSER has a push subscription — he may have turned it on from his phone.
  useEffect(() => {
    if (!signedIn) {
      setEnabled(null);
      return;
    }
    let cancelled = false;
    fetch('/api/sohumtracker/alert', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled: boolean } | null) => {
        if (!cancelled && data) setEnabled(data.enabled);
      })
      .catch(() => {
        // A failed read leaves the button in its "unknown" state, which renders
        // as off. Pressing it then writes the truth, so there is nothing to
        // recover from and nothing worth interrupting the page for.
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const toggle = useCallback(async () => {
    const next = !enabled;
    setSaving(true);
    try {
      // Permission first, and only when turning ON: asking for it in order to
      // switch something OFF is the kind of prompt that makes people block the
      // site outright.
      if (next && !subscribed) {
        const granted = await subscribe();
        if (!granted) {
          toast.error(
            t('alert-denied', {
              defaultValue: 'Your browser refused notifications, so there is nowhere to send it.',
            }),
          );
          return;
        }
      }
      const res = await fetch('/api/sohumtracker/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEnabled(next);
      toast.success(
        next
          ? t('alert-on', { defaultValue: "You'll be told when he joins a voice channel." })
          : t('alert-off', { defaultValue: 'Alerts off.' }),
      );
    } catch {
      toast.error(t('alert-failed', { defaultValue: 'That did not save. Try again.' }));
    } finally {
      setSaving(false);
    }
  }, [enabled, subscribed, subscribe, t]);

  if (isPending) return null;

  // The label collapses to the icon on a phone (`.stk-btn__label`), so the
  // control never squeezes the page title into an ellipsis. Every branch
  // therefore carries an `aria-label` — the accessible name must not disappear
  // with the visible one.
  if (!signedIn) {
    const label = t('alert-signin', { defaultValue: 'Sign in to be alerted' });
    return (
      <a
        className="stk-btn stk-btn--ghost"
        href="/login?callbackURL=%2Fsohumtracker"
        aria-label={label}
      >
        <Bell aria-hidden size={15} />
        <span className="stk-btn__label">{label}</span>
      </a>
    );
  }

  // Push unavailable is a fact about the browser, not a failure — Safari without
  // an installed PWA, or a dev server with no service worker. Saying so beats a
  // button that silently never fires.
  if (!supported) {
    const label = t('alert-unsupported', { defaultValue: 'Notifications unavailable here' });
    return (
      <span className="stk-btn stk-btn--ghost" aria-disabled aria-label={label}>
        <BellOff aria-hidden size={15} />
        <span className="stk-btn__label">{label}</span>
      </span>
    );
  }

  const label = enabled
    ? t('alert-enabled', { defaultValue: 'Alerting on voice' })
    : t('alert-enable', { defaultValue: 'Alert me on voice' });

  return (
    <button
      type="button"
      className="stk-btn stk-btn--ghost"
      onClick={toggle}
      disabled={saving || busy}
      aria-pressed={enabled === true}
      aria-label={label}
    >
      {enabled ? <BellRing aria-hidden size={15} /> : <Bell aria-hidden size={15} />}
      <span className="stk-btn__label">{label}</span>
    </button>
  );
}
