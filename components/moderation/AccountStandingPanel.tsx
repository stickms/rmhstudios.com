'use client';

/**
 * Account standing — the user's own view of every strike on their account, and
 * the form to appeal one.
 *
 * The whole point of this surface is that the moderation record is legible to
 * the person it describes: what the strike was, when it expires, whether it
 * still counts, and what happened to any appeal. Nothing here is hidden behind
 * a support email.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ShieldCheck, ShieldAlert, ShieldX, Gavel, ExternalLink } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

type AppealStatus = 'NONE' | 'PENDING' | 'UPHELD' | 'OVERTURNED';

interface Strike {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
  entityType: string | null;
  entityId: string | null;
  appealStatus: AppealStatus;
  appealText: string | null;
  appealedAt: string | null;
  appealNote: string | null;
  decidedAt: string | null;
  canAppeal: boolean;
}

interface Standing {
  level: 'GOOD' | 'WARNED' | 'AT_RISK' | 'RESTRICTED';
  activeStrikes: number;
  totalStrikes: number;
  autoBanThreshold: number;
  appealWindowDays: number;
  banned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  strikes: Strike[];
}

const MIN_APPEAL = 20;
const MAX_APPEAL = 2000;

/** Link to the content a strike attached to, when we can address it. */
function entityHref(s: Strike): string | null {
  if (!s.entityId) return null;
  if (s.entityType === 'build') return `/user-builds/${s.entityId}`;
  if (s.entityType === 'rmhark') return `/thread/${s.entityId}`;
  return null;
}

export function AccountStandingPanel() {
  const { t } = useTranslation('feed');
  const [standing, setStanding] = useState<Standing | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/standing', { credentials: 'include' });
      if (res.ok) setStanding(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitAppeal = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/account/strikes/${id}/appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: draft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error ?? t('appeal-failed', { defaultValue: 'Could not submit your appeal.' })
        );
        return;
      }
      toast.success(
        t('appeal-submitted', {
          defaultValue: 'Appeal submitted. A moderator will review it.',
        })
      );
      setOpenId(null);
      setDraft('');
      load();
    } catch {
      toast.error(t('appeal-failed', { defaultValue: 'Could not submit your appeal.' }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!standing) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={t('standing-unavailable', { defaultValue: 'Could not load your account status.' })}
      />
    );
  }

  const levelCopy: Record<Standing['level'], { label: string; description: string }> = {
    GOOD: {
      label: t('standing-good', { defaultValue: 'Good standing' }),
      description: t('standing-good-desc', {
        defaultValue: 'No active strikes on your account. Nothing is limited.',
      }),
    },
    WARNED: {
      label: t('standing-warned', { defaultValue: 'Warning on file' }),
      description: t('standing-warned-desc', {
        defaultValue:
          'You have an active strike. Your account works normally, but further strikes carry restrictions.',
      }),
    },
    AT_RISK: {
      label: t('standing-at-risk', { defaultValue: 'At risk' }),
      description: t('standing-at-risk-desc', {
        defaultValue: 'One more active strike will suspend your account for 7 days.',
      }),
    },
    RESTRICTED: {
      label: t('standing-restricted', { defaultValue: 'Restricted' }),
      description: t('standing-restricted-desc', {
        defaultValue: 'Your account is currently suspended.',
      }),
    },
  };

  const LevelIcon =
    standing.level === 'GOOD' ? ShieldCheck : standing.level === 'RESTRICTED' ? ShieldX : ShieldAlert;
  const levelTone =
    standing.level === 'GOOD'
      ? 'text-site-success'
      : standing.level === 'RESTRICTED'
        ? 'text-site-danger'
        : 'text-site-warning';

  return (
    <div className="space-y-4">
      {/* Standing summary */}
      <section className="rounded-site border border-site-border bg-site-surface/40 p-4">
        <div className="mb-1 flex items-center gap-2">
          <LevelIcon className={`h-5 w-5 ${levelTone}`} aria-hidden />
          <h2 className="text-base font-bold text-site-text">{levelCopy[standing.level].label}</h2>
        </div>
        <p className="text-sm text-site-text-muted">{levelCopy[standing.level].description}</p>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-site border border-site-border bg-site-bg/40 px-3 py-2">
            <dt className="text-xs text-site-text-muted">
              {t('standing-active-strikes', { defaultValue: 'Active strikes' })}
            </dt>
            <dd className="text-lg font-bold text-site-text">
              {standing.activeStrikes}
              <span className="text-sm font-normal text-site-text-dim">
                {' / '}
                {standing.autoBanThreshold}
              </span>
            </dd>
          </div>
          <div className="rounded-site border border-site-border bg-site-bg/40 px-3 py-2">
            <dt className="text-xs text-site-text-muted">
              {t('standing-total-strikes', { defaultValue: 'Total on record' })}
            </dt>
            <dd className="text-lg font-bold text-site-text">{standing.totalStrikes}</dd>
          </div>
          <div className="rounded-site border border-site-border bg-site-bg/40 px-3 py-2">
            <dt className="text-xs text-site-text-muted">
              {t('standing-appeal-window', { defaultValue: 'Appeal window' })}
            </dt>
            <dd className="text-lg font-bold text-site-text">
              {t('standing-appeal-days', {
                defaultValue: '{{count}} days',
                count: standing.appealWindowDays,
              })}
            </dd>
          </div>
        </dl>

        {standing.banned && (
          <div className="mt-4 rounded-site border border-site-danger/20 bg-site-danger/10 p-3">
            <p className="text-sm font-semibold text-site-danger">
              {t('standing-suspended', { defaultValue: 'Account suspended' })}
            </p>
            <p className="mt-1 text-sm text-site-text">
              {standing.banReason ??
                t('standing-suspended-generic', { defaultValue: 'Policy violation.' })}
            </p>
            {standing.bannedUntil && (
              <p className="mt-1 text-xs text-site-text-muted">
                {t('standing-suspended-until', {
                  defaultValue: 'Ends {{when}}',
                  when: formatDistanceToNow(new Date(standing.bannedUntil), { addSuffix: true }),
                })}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Strike history */}
      <section className="rounded-site border border-site-border bg-site-surface/40 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Gavel className="h-5 w-5 text-site-accent" aria-hidden />
          <h2 className="text-base font-bold text-site-text">
            {t('standing-history', { defaultValue: 'Moderation history' })}
          </h2>
        </div>
        <p className="mb-4 text-sm text-site-text-muted">
          {t('standing-history-desc', {
            defaultValue:
              'Every strike issued against your account, and what happened to any appeal you filed.',
          })}
        </p>

        {standing.strikes.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={t('standing-empty', { defaultValue: 'No strikes on your account.' })}
          />
        ) : (
          <ul className="space-y-3">
            {standing.strikes.map((s) => {
              const href = entityHref(s);
              return (
                <li key={s.id} className="glass-fill rounded-site p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.appealStatus === 'OVERTURNED' ? (
                      <Badge variant="success" size="sm">
                        {t('appeal-overturned', { defaultValue: 'Overturned' })}
                      </Badge>
                    ) : s.active ? (
                      <Badge variant="danger" size="sm">
                        {t('strike-active', { defaultValue: 'Active' })}
                      </Badge>
                    ) : (
                      <Badge variant="default" size="sm">
                        {t('strike-expired', { defaultValue: 'Expired' })}
                      </Badge>
                    )}
                    {s.appealStatus === 'PENDING' && (
                      <Badge variant="warning" size="sm">
                        {t('appeal-pending', { defaultValue: 'Appeal under review' })}
                      </Badge>
                    )}
                    {s.appealStatus === 'UPHELD' && (
                      <Badge variant="outline" size="sm">
                        {t('appeal-upheld', { defaultValue: 'Appeal declined' })}
                      </Badge>
                    )}
                    <span className="text-xs text-site-text-dim">
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    </span>
                    {href && (
                      <Link
                        to={href}
                        className="ml-auto inline-flex items-center gap-1 text-xs text-site-accent hover:underline"
                      >
                        {t('view-content', { defaultValue: 'View content' })}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </Link>
                    )}
                  </div>

                  <p
                    className={`mt-2 text-sm text-site-text ${
                      s.appealStatus === 'OVERTURNED' ? 'line-through opacity-70' : ''
                    }`}
                  >
                    {s.reason}
                  </p>

                  {s.expiresAt && (
                    <p className="mt-1 text-xs text-site-text-muted">
                      {new Date(s.expiresAt).getTime() > Date.now()
                        ? t('strike-expires', {
                            defaultValue: 'Expires {{when}}',
                            when: formatDistanceToNow(new Date(s.expiresAt), { addSuffix: true }),
                          })
                        : t('strike-expired-when', {
                            defaultValue: 'Expired {{when}}',
                            when: formatDistanceToNow(new Date(s.expiresAt), { addSuffix: true }),
                          })}
                    </p>
                  )}

                  {s.appealText && (
                    <div className="mt-3 rounded-site border border-site-border bg-site-bg/40 p-3">
                      <p className="text-xs font-semibold text-site-text-muted">
                        {t('your-appeal', { defaultValue: 'Your appeal' })}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-site-text">
                        {s.appealText}
                      </p>
                      {s.appealNote && (
                        <>
                          <p className="mt-3 text-xs font-semibold text-site-text-muted">
                            {t('moderator-response', { defaultValue: 'Moderator response' })}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-site-text">
                            {s.appealNote}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {s.canAppeal &&
                    (openId === s.id ? (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={4}
                          maxLength={MAX_APPEAL}
                          placeholder={t('appeal-placeholder', {
                            defaultValue:
                              'Explain why this strike should be removed. Be specific — a moderator reads this.',
                          })}
                          aria-label={t('appeal-label', { defaultValue: 'Your appeal' })}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            onClick={() => submitAppeal(s.id)}
                            disabled={busy || draft.trim().length < MIN_APPEAL}
                          >
                            {busy
                              ? t('appeal-sending', { defaultValue: 'Sending…' })
                              : t('appeal-submit', { defaultValue: 'Submit appeal' })}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setOpenId(null);
                              setDraft('');
                            }}
                          >
                            {t('cancel', { defaultValue: 'Cancel' })}
                          </Button>
                          <span className="text-xs text-site-text-dim">
                            {t('appeal-counter', {
                              defaultValue: '{{count}} / {{max}}',
                              count: draft.trim().length,
                              max: MAX_APPEAL,
                            })}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          setOpenId(s.id);
                          setDraft('');
                        }}
                      >
                        {t('appeal-this-strike', { defaultValue: 'Appeal this strike' })}
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
