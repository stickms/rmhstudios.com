/**
 * What a moderator needs to decide an impersonation report (sprint 14, feature 09): the reported account and the one it
 * is said to be copying side by side (when each was made, former handles, the websites each claims and has proved), and
 * for each website the reported account claims, the other accounts that claim it, verified ones first. Facts only: it
 * scores nothing, and nothing here is shown to the reporter. Admin only; both reads are admin endpoints.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { reportClaimsApi } from '@/lib/admin/reports-claims.contract';
import type { ImpersonationComparisonSide } from '@/lib/handles/impersonation';
import { getImpersonationComparisonApi } from '@/lib/handles/impersonation.contract';

function Side({ heading, side }: { heading: string; side: ImpersonationComparisonSide | null }) {
  const { t } = useTranslation('profile-reports');
  const fmt = useLocaleFormat();
  return (
    <div className="min-w-0 space-y-2">
      <p className="t-label">{heading}</p>
      {side === null ? (
        <p className="t-body text-site-text-muted">
          {t('comparison-gone', { defaultValue: 'This account no longer exists.' })}
        </p>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <UserAvatar src={side.image} alt="" size={32} fallbackName={side.name || 'U'} />
            <div className="min-w-0">
              <p className="t-body truncate font-medium">
                <bdi>{side.name || side.handle}</bdi>
              </p>
              {side.handle ? (
                <p className="t-meta truncate">
                  <bdi>@{side.handle}</bdi>
                </p>
              ) : null}
            </div>
          </div>
          <p className="t-meta">
            {t('comparison-created', {
              date: fmt.date(new Date(side.createdAt), { year: 'numeric', month: 'short', day: 'numeric' }),
              defaultValue: 'Created {{date}}',
            })}
          </p>
          {side.previousHandles.length > 0 ? (
            <p className="t-meta">
              {t('comparison-former-handles', { defaultValue: 'Former handles' })}{' '}
              {side.previousHandles.map((entry, index) => (
                <span key={`${entry.handle}-${entry.changedAt}`}>
                  {index > 0 ? ', ' : ''}
                  <bdi>@{entry.handle}</bdi>
                </span>
              ))}
            </p>
          ) : null}
          <div>
            <p className="t-meta">{t('comparison-websites', { defaultValue: 'Websites on the profile' })}</p>
            {side.claimedHosts.length === 0 ? (
              <p className="t-meta">{t('comparison-no-websites', { defaultValue: 'None' })}</p>
            ) : (
              <ul className="t-meta">
                {side.claimedHosts.map((entry) => (
                  <li key={entry.host}>
                    <bdi>{entry.host}</bdi>
                    {entry.verified ? ` · ${t('verified', { defaultValue: 'verified' })}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The two accounts of one impersonation report, side by side. */
export function ImpersonationComparison({ reportId }: { reportId: string }) {
  const { t } = useTranslation('profile-reports');
  const fmt = useLocaleFormat();
  const verifiedText = t('verified', { defaultValue: 'verified' });
  const notVerifiedText = t('not-verified', { defaultValue: 'not verified' });
  const query = useQuery({
    queryKey: ['admin', 'impersonation-comparison', reportId],
    retry: false,
    staleTime: 60_000,
    queryFn: () => api(getImpersonationComparisonApi, { query: { reportId }, retries: 0 }),
  });
  const arrival = useArrival(!query.isPending);

  if (query.isPending) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="t-body text-site-danger" role="alert">
        {t('comparison-error', { defaultValue: 'The two accounts could not be loaded.' })}
      </p>
    );
  }
  const comparison = query.data;
  return (
    <section className={arrival} aria-label={t('comparison-label', { defaultValue: 'The two accounts side by side' })}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Side heading={t('comparison-accused', { defaultValue: 'Reported account' })} side={comparison.accused} />
        <div className="min-w-0 lg:border-s lg:border-site-border lg:ps-6">
          <Side
            heading={t('comparison-impersonated', { defaultValue: 'Said to be copied' })}
            side={comparison.impersonated}
          />
        </div>
      </div>
      <p className="t-meta pt-2">
        {t('comparison-similarity', {
          percent: fmt.number(Math.round(comparison.nameSimilarity * 100)),
          defaultValue: 'The display names are {{percent}}% alike.',
        })}
      </p>
      {comparison.contestedHosts.length > 0 ? (
        <div className="pt-2">
          <p className="t-label">{t('comparison-contested', { defaultValue: 'Websites both accounts claim' })}</p>
          <ul className="divide-y divide-site-border border-y border-site-border">
            {comparison.contestedHosts.map((entry) => (
              <li key={entry.host} className="t-body flex flex-wrap items-baseline justify-between gap-2 py-2">
                <bdi>{entry.host}</bdi>
                <span className="t-meta">
                  {t('comparison-contested-state', {
                    reported: entry.accusedVerified ? verifiedText : notVerifiedText,
                    copied: entry.impersonatedVerified ? verifiedText : notVerifiedText,
                    defaultValue: 'Reported account: {{reported}}. Other account: {{copied}}.',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The websites a reported account claims, each with the other accounts that claim it (verified first). */
export function ImpersonationClaims({ userId }: { userId: string }) {
  const { t } = useTranslation('profile-reports');
  const query = useQuery({
    queryKey: ['admin', 'report-claims', userId],
    retry: false,
    staleTime: 60_000,
    queryFn: () => api(reportClaimsApi, { query: { userId }, retries: 0 }),
  });
  const arrival = useArrival(!query.isPending);

  if (query.isPending) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="t-body text-site-danger" role="alert">
        {t('claims-error', { defaultValue: 'The websites could not be loaded.' })}
      </p>
    );
  }
  const { hosts } = query.data;
  return (
    <section
      className={arrival}
      aria-label={t('claims-label', { defaultValue: 'Other accounts claiming the same websites' })}
    >
      <p className="t-label">{t('claims-heading', { defaultValue: 'Other accounts claiming the same websites' })}</p>
      {hosts.length === 0 ? (
        <p className="t-body text-site-text-muted">
          {t('claims-none', { defaultValue: 'The reported account claims no website.' })}
        </p>
      ) : (
        <ul className="divide-y divide-site-border border-y border-site-border">
          {hosts.map((entry) => (
            <li key={entry.host} className="space-y-1 py-2">
              <p className="t-body">
                <bdi>{entry.host}</bdi>
                <span className="t-meta">
                  {' '}
                  {entry.verified
                    ? t('claims-reported-verified', { defaultValue: 'verified by the reported account' })
                    : t('claims-reported-unverified', { defaultValue: 'not verified by the reported account' })}
                </span>
              </p>
              {entry.others.length === 0 ? (
                <p className="t-meta">{t('claims-no-others', { defaultValue: 'No other account claims it.' })}</p>
              ) : (
                <ul className="t-meta">
                  {entry.others.map((other) => (
                    <li key={other.userId}>
                      {other.handle ? (
                        <a href={`/u/${other.handle}`} target="_blank" rel="noreferrer" className="underline">
                          <bdi>@{other.handle}</bdi>
                        </a>
                      ) : (
                        <bdi>{other.name ?? other.userId}</bdi>
                      )}
                      {other.verified ? ` · ${t('verified', { defaultValue: 'verified' })}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
