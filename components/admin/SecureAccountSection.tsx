/**
 * "Secure account" in the admin user drawer: sign a member out everywhere and revoke the keys and
 * tokens that could still act for them, without a ban. A section on a rule; the one danger button is
 * its only action. The preview lists passkeys and linked sign-in accounts read-only, because this
 * never removes them.
 */
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { previewSecureAccountApi, secureAccountApi } from '@/lib/admin/secure-account.contract';
import {
  SECURE_GROUPS,
  SECURE_REASON_MAX,
  isValidReason,
  summaryLines,
  type SecureAccountResult,
  type SecureGroup,
  type SummaryLine,
} from '@/lib/admin/secure-account';

export function SecureAccountSection({
  userId,
  displayName,
}: {
  userId: string;
  /** Named in the confirmation. */
  displayName: string;
}) {
  const { t } = useTranslation('admin-secure-account');
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const ids = useId();
  const [groups, setGroups] = useState<SecureGroup[]>([...SECURE_GROUPS]);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<SecureAccountResult | null>(null);

  const query = useQuery(
    apiQuery(previewSecureAccountApi, {
      params: {
        id: userId,
      },
    }),
  );
  const preview = query.data;
  const arrival = useArrival(!!preview);

  const run = useMutation({
    mutationFn: () =>
      api(secureAccountApi, {
        params: {
          id: userId,
        },
        body: {
          groups,
          reason,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      setReason('');
      void queryClient.invalidateQueries({
        queryKey: [previewSecureAccountApi.path],
      });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'user-moderation', userId],
      });
    },
    onError: (e) =>
      toast.error(
        serverError(e) ??
          t('failed', {
            defaultValue: 'Could not secure the account.',
          }),
      ),
  });

  const label = (g: SecureGroup): string => {
    switch (g) {
      case 'sessions':
        return t('group-sessions', {
          defaultValue: 'Sign out everywhere',
        });
      case 'tokens':
        return t('group-tokens', {
          defaultValue: 'Revoke API keys and RMHCode sign-ins',
        });
      case 'webhooks':
        return t('group-webhooks', {
          defaultValue: 'Disable webhooks and replace their secrets',
        });
      case 'calendar':
        return t('group-calendar', {
          defaultValue: 'Replace the calendar link',
        });
    }
  };

  const line = (l: SummaryLine): string => {
    switch (l.key) {
      case 'sessions':
        return t('result-sessions', {
          count: l.count,
          defaultValue: 'Sessions ended: {{count}}',
        });
      case 'apiKeys':
        return t('result-api-keys', {
          count: l.count,
          defaultValue: 'API keys revoked: {{count}}',
        });
      case 'rmhCodeTokens':
        return t('result-rmhcode', {
          count: l.count,
          defaultValue: 'RMHCode sign-ins revoked: {{count}}',
        });
      case 'webhooks':
        return t('result-webhooks', {
          count: l.count,
          defaultValue: 'Webhooks disabled: {{count}}',
        });
      case 'calendar':
        return l.count > 0
          ? t('result-calendar-rotated', {
              defaultValue: 'Calendar link replaced',
            })
          : t('result-calendar-none', {
              defaultValue: 'No calendar link to replace',
            });
    }
  };

  const toggle = (g: SecureGroup, on: boolean) =>
    setGroups((cur) => (on ? SECURE_GROUPS.filter((x) => x === g || cur.includes(x)) : cur.filter((x) => x !== g)));

  const canSubmit = groups.length > 0 && isValidReason(reason) && !run.isPending;

  const submit = async () => {
    const ok = await confirm({
      title: t('confirm-title', {
        name: displayName,
        defaultValue: 'Secure the account of {{name}}?',
      }),
      description: t('confirm-description', {
        defaultValue:
          'They are not banned. Their sessions, keys and tokens stop working and they are told what changed.',
      }),
      confirmLabel: t('submit', {
        defaultValue: 'Secure account',
      }),
      danger: true,
    });
    if (ok) run.mutate();
  };

  return (
    <section className="space-y-3 border-t border-site-border pt-4" aria-labelledby={`${ids}-h`}>
      <h3 id={`${ids}-h`} className="t-label">
        {t('heading', {
          defaultValue: 'Secure account',
        })}
      </h3>
      <p className="t-meta">
        {t('help', {
          defaultValue:
            'Cuts off whoever else may be using this account without banning the member. Passkeys, linked sign-in accounts and the password stay. A signed-out browser can still read pages for up to 5 minutes, and an open live connection stays until it reconnects.',
        })}
      </p>

      {query.isPending ? (
        <Spinner />
      ) : query.isError || !preview ? (
        <p className="t-body text-site-danger" role="alert">
          {t('load-failed', {
            defaultValue: 'Could not load this account.',
          })}
        </p>
      ) : (
        <div className={arrival}>
          <ul className="border-y border-site-border">
            <li className="t-body flex justify-between border-b border-site-border py-2">
              <span>
                {t('count-sessions', {
                  defaultValue: 'Signed-in sessions',
                })}
              </span>
              <span className="t-meta">{fmt.number(preview.sessions)}</span>
            </li>
            <li className="t-body flex justify-between border-b border-site-border py-2">
              <span>
                {t('count-api-keys', {
                  defaultValue: 'API keys',
                })}
              </span>
              <span className="t-meta">{fmt.number(preview.apiKeys)}</span>
            </li>
            <li className="t-body flex justify-between border-b border-site-border py-2">
              <span>
                {t('count-rmhcode', {
                  defaultValue: 'RMHCode sign-ins',
                })}
              </span>
              <span className="t-meta">{fmt.number(preview.rmhCodeTokens)}</span>
            </li>
            <li className="t-body flex justify-between border-b border-site-border py-2">
              <span>
                {t('count-webhooks', {
                  defaultValue: 'Enabled webhooks',
                })}
              </span>
              <span className="t-meta">{fmt.number(preview.webhooks)}</span>
            </li>
            <li className="t-body flex justify-between py-2">
              <span>
                {t('count-calendar', {
                  defaultValue: 'Calendar link',
                })}
              </span>
              <span className="t-meta">
                {preview.calendarFeed
                  ? t('calendar-yes', {
                      defaultValue: 'Yes',
                    })
                  : t('calendar-no', {
                      defaultValue: 'None',
                    })}
              </span>
            </li>
          </ul>

          <div className="mt-3 space-y-1">
            <h4 className="t-label">
              {t('methods-heading', {
                defaultValue: 'Sign-in methods kept',
              })}
            </h4>
            {preview.passkeys.length === 0 && preview.accounts.length === 0 ? (
              <p className="t-meta">
                {t('methods-none', {
                  defaultValue: 'No passkeys or linked accounts.',
                })}
              </p>
            ) : (
              <ul className="border-t border-site-border">
                {preview.passkeys.map((p) => (
                  <li key={p.id} className="t-body flex justify-between gap-3 border-b border-site-border py-2">
                    <span className="min-w-0 break-words">
                      {p.name
                        ? t('passkey-named', {
                            name: p.name,
                            defaultValue: 'Passkey: {{name}}',
                          })
                        : t('passkey', {
                            defaultValue: 'Passkey',
                          })}
                    </span>
                    {p.createdAt && <span className="t-meta">{fmt.dateTime(new Date(p.createdAt))}</span>}
                  </li>
                ))}
                {preview.accounts.map((a) => (
                  <li key={a.id} className="t-body flex justify-between gap-3 border-b border-site-border py-2">
                    <span className="min-w-0 break-words">
                      {t('account-provider', {
                        provider: a.providerId,
                        defaultValue: 'Linked: {{provider}}',
                      })}
                    </span>
                    <span className="t-meta">{fmt.dateTime(new Date(a.createdAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="t-label">
          {t('include-legend', {
            defaultValue: 'Include',
          })}
        </legend>
        {SECURE_GROUPS.map((g) => (
          <label key={g} className="t-body flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={groups.includes(g)}
              onChange={(e) => toggle(g, e.target.checked)}
              className="size-4 shrink-0 accent-site-text pointer-coarse:size-5"
            />
            <span>{label(g)}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-1">
        <label htmlFor={`${ids}-reason`} className="t-label">
          {t('reason-label', {
            defaultValue: 'Reason (staff only, never shown to the member)',
          })}
        </label>
        <Textarea
          id={`${ids}-reason`}
          value={reason}
          maxLength={SECURE_REASON_MAX}
          rows={2}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <Button variant="danger" disabled={!canSubmit} loading={run.isPending} onClick={() => void submit()}>
        {t('submit', {
          defaultValue: 'Secure account',
        })}
      </Button>

      <div role="status" aria-live="polite">
        {result && (
          <div className="space-y-1">
            <p className="t-body">
              {t('result-heading', {
                when: fmt.dateTime(new Date(result.at)),
                defaultValue: 'Account secured at {{when}}',
              })}
            </p>
            <ul>
              {summaryLines(result).map((l) => (
                <li key={l.key} className="t-meta">
                  {line(l)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
