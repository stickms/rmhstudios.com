'use client';

/**
 * Account recovery (I3) — recovery codes, requests opened against this account,
 * and the redemption form the emailed link lands on.
 *
 * Two deliberate pieces of friction are surfaced rather than hidden:
 *  - codes are shown **once**, and the panel says so before generating, because
 *    they are hashed with the password hasher and genuinely cannot be shown
 *    again;
 *  - a recovery request against this account is rendered as an alarm with a
 *    cancel button, because the 24-hour mandatory delay exists precisely so the
 *    real owner can press it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { CopyButton } from '@/components/ui/copy-button';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface CodeStatus {
  remaining: number;
  total: number;
  generatedAt: string | null;
}

interface RequestRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  unlocksAt: string | null;
  phase: 'collecting' | 'waiting' | 'ready' | 'expired' | 'rejected' | 'used';
  approvals: number;
  approvalsNeeded: number;
}

interface HoldState {
  active: boolean;
  until: string | null;
}

export interface RecoveryPanelProps {
  /** Present when the user arrived from a recovery email link. */
  completion?: { requestId: string; token: string } | null;
  /** False when nobody is signed in — only the completion form renders. */
  signedIn?: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function RecoveryPanel({ completion, signedIn = true }: RecoveryPanelProps) {
  const { t } = useTranslation('feed');
  const confirm = useConfirm();
  const [status, setStatus] = useState<CodeStatus | null>(null);
  const [hold, setHold] = useState<HoldState | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const [completionEmail, setCompletionEmail] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const load = useCallback(async () => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [codesRes, holdRes, requestsRes] = await Promise.all([
        fetch('/api/account/recovery/codes'),
        fetch('/api/account/recovery/hold'),
        fetch('/api/account/recovery/requests'),
      ]);
      if (codesRes.ok) setStatus((await codesRes.json()) as CodeStatus);
      if (holdRes.ok) setHold((await holdRes.json()) as HoldState);
      if (requestsRes.ok) {
        const data = (await requestsRes.json()) as { mine: RequestRow[] };
        setRequests(data.mine.filter((row) => row.phase !== 'expired' && row.phase !== 'rejected'));
      }
    } catch {
      // Leave the panel in its empty state rather than throwing at the user.
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    const confirmed = await confirm({
      title: t('recovery-codes-regen-title', { defaultValue: 'Generate new recovery codes?' }),
      description: t('recovery-codes-regen-confirm', {
        defaultValue:
          'Your existing codes stop working immediately, and the new ones are shown once and never again.',
      }),
      confirmLabel: t('recovery-codes-regen', { defaultValue: 'Generate codes' }),
      danger: true,
    });
    if (!confirmed) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/account/recovery/codes', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { codes?: string[]; error?: string };
      if (!res.ok || !data.codes) {
        toast.error(
          data.error ?? t('recovery-codes-failed', { defaultValue: 'Could not generate codes.' }),
        );
        return;
      }
      setFreshCodes(data.codes);
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const cancelRequest = async (row: RequestRow) => {
    const confirmed = await confirm({
      title: t('recovery-cancel-title', { defaultValue: 'Cancel this recovery request?' }),
      description: t('recovery-cancel-confirm', {
        defaultValue: 'Nobody will be able to take over the account with it.',
      }),
      confirmLabel: t('recovery-cancel', { defaultValue: 'Cancel request' }),
      danger: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/account/recovery/requests/${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error(t('recovery-cancel-failed', { defaultValue: 'Could not cancel that request.' }));
      return;
    }
    setRequests((prev) => prev.filter((item) => item.id !== row.id));
    toast.success(t('recovery-cancelled', { defaultValue: 'Recovery request cancelled.' }));
  };

  const submitCompletion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!completion) return;
    setCompleting(true);
    try {
      const res = await fetch('/api/account/recovery/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: completion.requestId,
          token: completion.token,
          email: completionEmail.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(
          data.error ??
            t('recovery-complete-failed', { defaultValue: 'That recovery link did not work.' }),
        );
        return;
      }
      setCompleted(true);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <section className="glass-pane rounded-site p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-site-accent" aria-hidden />
        <h2 className="text-base font-bold text-site-text">
          {t('recovery-title', { defaultValue: 'Account recovery' })}
        </h2>
      </div>
      <p className="mb-4 text-sm text-site-text-muted">
        {t('recovery-description', {
          defaultValue:
            'Ways back into this account that do not depend on one email address still working.',
        })}
      </p>

      {completion ? (
        <div className="glass-inset mb-4 rounded-site-sm p-3">
          <h3 className="text-sm font-semibold text-site-text">
            {t('recovery-complete-title', { defaultValue: 'Finish account recovery' })}
          </h3>
          {completed ? (
            <p className="mt-1 text-sm text-site-text-muted">
              {t('recovery-complete-done', {
                defaultValue:
                  'Done. Every session and API key was signed out, and we have emailed you a link to verify the address and set a new password. Coins, payouts and redemptions are paused for 72 hours.',
              })}
            </p>
          ) : (
            <>
              <p className="mt-1 mb-3 text-sm text-site-text-muted">
                {t('recovery-complete-hint', {
                  defaultValue:
                    'Confirm the email address this recovery was started for. It becomes the new sign-in address.',
                })}
              </p>
              <form
                onSubmit={submitCompletion}
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1">
                  <Label htmlFor="recovery-complete-email">
                    {t('recovery-complete-email', { defaultValue: 'Email address' })}
                  </Label>
                  <Input
                    id="recovery-complete-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={completionEmail}
                    onChange={(event) => setCompletionEmail(event.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button type="submit" loading={completing} disabled={!completionEmail.trim()}>
                  {t('recovery-complete-submit', { defaultValue: 'Recover account' })}
                </Button>
              </form>
            </>
          )}
        </div>
      ) : null}

      {!signedIn ? null : loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <>
          {hold?.active ? (
            <p className="glass-fill mb-4 flex items-start gap-2 rounded-site-sm p-3 text-sm text-site-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t('recovery-hold-active', {
                  defaultValue:
                    'This account was recently recovered. Coin transfers, payout changes and redemptions are paused until',
                })}{' '}
                {hold.until ? formatDate(hold.until) : ''}.
              </span>
            </p>
          ) : null}

          {requests.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {requests.map((row) => (
                <li key={row.id} className="glass-fill rounded-site-sm p-3">
                  <p className="flex items-start gap-2 text-sm font-semibold text-site-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      {t('recovery-request-alarm', {
                        defaultValue: 'Someone started a recovery request on this account.',
                      })}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-site-text-muted">
                    {t('recovery-request-detail', { defaultValue: 'Approvals so far:' })}{' '}
                    {row.approvals} · {t('recovery-request-expires', { defaultValue: 'expires' })}{' '}
                    {formatDate(row.expiresAt)}
                  </p>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="mt-2"
                    onClick={() => void cancelRequest(row)}
                  >
                    {t('recovery-cancel', { defaultValue: 'Cancel request' })}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="glass-fill rounded-site-sm p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-site-accent" aria-hidden />
              <h3 className="text-sm font-semibold text-site-text">
                {t('recovery-codes-title', { defaultValue: 'Recovery codes' })}
              </h3>
            </div>
            <p className="mt-1 text-sm text-site-text-muted">
              {status && status.total > 0
                ? t('recovery-codes-remaining', {
                    defaultValue: 'Single-use codes left:',
                  }) + ` ${status.remaining} / ${status.total}`
                : t('recovery-codes-none', {
                    defaultValue:
                      'You have no recovery codes. Generate ten and keep them somewhere that is not this account.',
                  })}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              loading={generating}
              onClick={() => void generate()}
            >
              {status && status.total > 0
                ? t('recovery-codes-regen', { defaultValue: 'Generate codes' })
                : t('recovery-codes-create', { defaultValue: 'Generate codes' })}
            </Button>

            {freshCodes ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold text-site-warning">
                  {t('recovery-codes-once', {
                    defaultValue: 'Copy these now — this is the only time they will ever be shown.',
                  })}
                </p>
                <ul className="grid grid-cols-1 gap-1 font-mono text-sm text-site-text sm:grid-cols-2">
                  {freshCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
                <CopyButton
                  value={freshCodes.join('\n')}
                  className="mt-2"
                  label={t('recovery-codes-copy', { defaultValue: 'Copy all codes' })}
                />
                <p className="mt-2 text-xs text-site-text-muted">
                  {t('recovery-codes-count-hint', {
                    defaultValue: 'Each code works once, and there are ten of them.',
                  })}
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
