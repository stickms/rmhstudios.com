/**
 * Account standing — the user's own view of every strike on their account, and
 * the form to appeal one.
 *
 * The whole point of this surface is that the moderation record is legible to
 * the person it describes: what the strike was, when it expires, whether it
 * still counts, and what happened to any appeal. Nothing here is hidden behind
 * a support email.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { formatDistanceToNow } from 'date-fns';
import { ShieldCheck, ShieldAlert, ShieldX, ExternalLink } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { appealStrikeApi } from '@/lib/moderation/standing.contract';
import { accountStandingQuery } from '@/lib/moderation/standing.queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { SettingsSection } from '@/components/settings/SettingsSection';

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
  const { data: standing, isPending: loading, refetch } = useQuery(accountStandingQuery());
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const submitAppeal = async (id: string) => {
    setBusy(true);
    try {
      await api(appealStrikeApi, { params: { id }, body: { text: draft.trim() } });
      toast.success(
        t('appeal-submitted', {
          defaultValue: 'Appeal submitted. A moderator will review it.',
        })
      );
      setOpenId(null);
      setDraft('');
      void refetch();
    } catch (e) {
      toast.error(
        serverError(e) ?? t('appeal-failed', { defaultValue: 'Could not submit your appeal.' }),
      );
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
    <>
      {/* Standing summary */}
      <SettingsSection
        title={levelCopy[standing.level].label}
        description={levelCopy[standing.level].description}
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-site px-4 py-3">
            <dt className="text-xs text-site-text-muted">
              {t('standing-active-strikes', { defaultValue: 'Active strikes' })}
            </dt>
            <dd className="text-lg font-semibold text-site-text">
              {standing.activeStrikes}
              <span className="text-sm font-normal text-site-text-muted">
                {' / '}
                {standing.autoBanThreshold}
              </span>
            </dd>
          </div>
          <div className="rounded-site px-4 py-3">
            <dt className="text-xs text-site-text-muted">
              {t('standing-total-strikes', { defaultValue: 'Total on record' })}
            </dt>
            <dd className="text-lg font-semibold text-site-text">{standing.totalStrikes}</dd>
          </div>
          <div className="rounded-site px-4 py-3">
            <dt className="text-xs text-site-text-muted">
              {t('standing-appeal-window', { defaultValue: 'Appeal window' })}
            </dt>
            <dd className="text-lg font-semibold text-site-text">
              {t('standing-appeal-days', {
                defaultValue: '{{count}} days',
                count: standing.appealWindowDays,
              })}
            </dd>
          </div>
        </dl>

        {standing.banned && (
          <div className="rounded-site border border-site-danger/20 bg-site-danger/10 px-4 py-3">
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
      </SettingsSection>

      {/* Strike history */}
      <SettingsSection
        title={t('standing-history', { defaultValue: 'Moderation history' })}
        description={t('standing-history-desc', {
          defaultValue:
            'Every strike issued against your account, and what happened to any appeal you filed.',
        })}
      >

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
                <li key={s.id} className="rounded-site px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.appealStatus === 'OVERTURNED' ? (
                      <Badge variant="success">
                        {t('appeal-overturned', { defaultValue: 'Overturned' })}
                      </Badge>
                    ) : s.active ? (
                      <Badge variant="danger">
                        {t('strike-active', { defaultValue: 'Active' })}
                      </Badge>
                    ) : (
                      <Badge variant="default">
                        {t('strike-expired', { defaultValue: 'Expired' })}
                      </Badge>
                    )}
                    {s.appealStatus === 'PENDING' && (
                      <Badge variant="warning">
                        {t('appeal-pending', { defaultValue: 'Appeal under review' })}
                      </Badge>
                    )}
                    {s.appealStatus === 'UPHELD' && (
                      <Badge variant="default">
                        {t('appeal-upheld', { defaultValue: 'Appeal declined' })}
                      </Badge>
                    )}
                    <span className="text-xs text-site-text-muted">
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    </span>
                    {href && (
                      <Link
                        to={href}
                        className="ms-auto inline-flex items-center gap-1 text-xs text-site-accent hover:underline"
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
                    <div className="mt-3 p-3">
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
                            variant="default"
                            onClick={() => {
                              setOpenId(null);
                              setDraft('');
                            }}
                          >
                            {t('cancel', { defaultValue: 'Cancel' })}
                          </Button>
                          <span className="text-xs text-site-text-muted">
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
                        variant="default"
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
      </SettingsSection>
    </>
  );
}
