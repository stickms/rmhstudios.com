'use client';

/**
 * Active session (device) management — lists the signed-in user's sessions and
 * lets them revoke any single one or log out of all other devices. Rendered on
 * /settings/security. Talks to the core Better Auth session endpoints through
 * authClient.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Laptop, LogOut, Monitor, Smartphone, Tablet } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface SessionRow {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

/** Best-effort friendly device label from a User-Agent string. */
function describeDevice(ua?: string | null): { label: string; kind: 'mobile' | 'tablet' | 'desktop' } {
  if (!ua) return { label: 'Unknown device', kind: 'desktop' };
  const isTablet = /iPad|Tablet/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone/i.test(ua);
  const os =
    /Windows/i.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/i.test(ua) ? 'macOS' :
    /Android/i.test(ua) ? 'Android' :
    /iPhone|iPad|iOS/i.test(ua) ? 'iOS' :
    /Linux/i.test(ua) ? 'Linux' : '';
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /OPR\/|Opera/i.test(ua) ? 'Opera' :
    /Chrome\//i.test(ua) ? 'Chrome' :
    /Firefox\//i.test(ua) ? 'Firefox' :
    /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  const label = [browser, os].filter(Boolean).join(' · ') || 'Unknown device';
  return { label, kind: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop' };
}

export function SessionManager() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const currentToken = (session as { session?: { token?: string } } | null)?.session?.token;
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authClient.listSessions();
      if (res.data) setSessions(res.data as unknown as SessionRow[]);
    } catch {
      // Signed out or network error — leave the list empty.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeOne = async (row: SessionRow) => {
    if (
      !window.confirm(
        t('session-revoke-confirm', {
          defaultValue: 'Sign this device out? It will need to log in again.',
        })
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await authClient.revokeSession({ token: row.token });
      setSessions((prev) => prev.filter((s) => s.token !== row.token));
      toast.success(t('session-revoked', { defaultValue: 'Device signed out.' }));
    } catch {
      toast.error(t('session-revoke-failed', { defaultValue: 'Could not sign that device out.' }));
    } finally {
      setBusy(false);
    }
  };

  const revokeOthers = async () => {
    if (
      !window.confirm(
        t('session-revoke-others-confirm', {
          defaultValue: 'Sign out of every other device? You will stay signed in here.',
        })
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await authClient.revokeOtherSessions();
      toast.success(t('session-revoked-others', { defaultValue: 'All other devices signed out.' }));
      await load();
    } catch {
      toast.error(t('session-revoke-others-failed', { defaultValue: 'Could not sign out other devices.' }));
    } finally {
      setBusy(false);
    }
  };

  const otherCount = sessions.filter((s) => s.token !== currentToken).length;

  return (
    <section className="rounded-site border border-site-border bg-site-surface/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Monitor className="h-5 w-5 text-site-accent" aria-hidden />
        <h2 className="text-base font-bold text-site-text">
          {t('sessions-title', { defaultValue: 'Active sessions' })}
        </h2>
      </div>
      <p className="mb-4 text-sm text-site-text-muted">
        {t('sessions-description', {
          defaultValue:
            'Devices currently signed in to your account. Revoke any you don’t recognize.',
        })}
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mb-3 text-sm text-site-text-dim">
          {t('sessions-empty', { defaultValue: 'No active sessions found.' })}
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-site-border rounded-site-sm border border-site-border">
          {sessions.map((s) => {
            const { label, kind } = describeDevice(s.userAgent);
            const Icon = kind === 'mobile' ? Smartphone : kind === 'tablet' ? Tablet : Laptop;
            const isCurrent = s.token === currentToken;
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <Icon className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-site-text">
                    {label}
                    {isCurrent && (
                      <span className="ml-2 rounded-full bg-site-accent/15 px-2 py-0.5 text-xs font-medium text-site-accent">
                        {t('session-current', { defaultValue: 'This device' })}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-site-text-dim">
                    {s.ipAddress ? `${s.ipAddress} · ` : ''}
                    {s.updatedAt
                      ? t('session-active', {
                          defaultValue: 'Active {{when}}',
                          when: formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true }),
                        })
                      : null}
                  </p>
                </div>
                {!isCurrent && (
                  <button
                    onClick={() => revokeOne(s)}
                    disabled={busy}
                    aria-label={t('session-revoke', { defaultValue: 'Sign out device' })}
                    className="rounded-site-sm p-1.5 text-site-text-dim transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {otherCount > 0 && (
        <Button variant="outline" onClick={revokeOthers} disabled={busy} className="gap-2">
          <LogOut className="h-4 w-4" aria-hidden />
          {t('sessions-revoke-others', { defaultValue: 'Log out of all other devices' })}
        </Button>
      )}
    </section>
  );
}
