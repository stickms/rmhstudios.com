import { Bookmark, CheckCircle, ExternalLink, EyeOff, MapPin, ShieldCheck } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { JobActionValue } from '@/lib/rmhladder/server/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RungMeter } from './RungMeter';
import { timeAgo } from './time';
import { safeExternalUrl, sourceDomain, trackApplyClick } from './url';

type JobDetailRow = Record<string, unknown>;

export function JobDetail({
  job,
  isAuthenticated,
  onAction,
}: {
  job: JobDetailRow;
  isAuthenticated: boolean;
  onAction: (action: JobActionValue) => Promise<void>;
}) {
  const { t } = useTranslation('site');
  const company = job.company as { name?: string } | null;
  const verifications = (job.verifications as Array<Record<string, unknown>> | undefined) ?? [];
  const verification = verifications[0];
  const userAction = (job.userAction as string | null) ?? null;
  const applicationStatus = ((job.application as { status?: string } | null)?.status) ?? null;
  const applyUrl = safeExternalUrl(job.originalPostingUrl);
  const location = [job.city, job.state].filter(Boolean).join(', ') || t('ladder.locationMissing', { defaultValue: 'Location not listed' });
  const score = (job.relevanceScoreBase as number | undefined) ?? 0;
  const programType = typeof job.programType === 'string' ? job.programType : null;
  const verificationEvidence = typeof verification?.evidence === 'string' ? verification.evidence : null;
  const verificationCheckedAt = verification?.checkedAt as Date | string | undefined;
  const summary = typeof job.descriptionSummary === 'string' ? job.descriptionSummary : null;

  const trackingActions = [
    { value: 'saved' as const, label: t('ladder.save', { defaultValue: 'Save job' }), icon: Bookmark },
    {
      value: 'applied' as const,
      label: applicationStatus && applicationStatus !== 'not_applied'
        ? t('ladder.applied', { defaultValue: 'Applied' })
        : t('ladder.markApplied', { defaultValue: 'Mark as applied' }),
      icon: CheckCircle,
    },
    { value: 'ignored' as const, label: t('ladder.ignore', { defaultValue: 'Ignore job' }), icon: EyeOff },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/rmhladder/jobs" className="inline-flex min-h-11 items-center text-sm font-medium text-site-accent hover:underline">
        ← {t('ladder.backToJobs', { defaultValue: 'Back to jobs' })}
      </Link>

      <Card className="gap-5">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success"><ShieldCheck aria-hidden />{t('ladder.verifiedRole', { defaultValue: 'Verified role' })}</Badge>
            {programType && <Badge variant="outline">{programType.replaceAll('_', ' ')}</Badge>}
          </div>
          <div>
            <CardTitle className="text-xl leading-snug sm:text-2xl">{job.title as string}</CardTitle>
            <p className="mt-2 font-medium text-site-text-muted">{company?.name ?? t('ladder.unknownCompany', { defaultValue: 'Unknown company' })}</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-site-text-muted">
            <MapPin className="size-4" aria-hidden />{location}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <section aria-labelledby="ladder-match-heading" className="rounded-site-sm border border-site-border bg-site-bg p-4">
            <h2 id="ladder-match-heading" className="text-sm font-semibold text-site-text">{t('ladder.roleRelevance', { defaultValue: 'Role relevance' })}</h2>
            <div className="mt-3 flex items-center gap-3">
              <RungMeter score={score} size="lg" />
              <span className="font-mono text-sm text-site-text">{score}/100</span>
            </div>
          </section>

          {verification && (
            <section aria-labelledby="ladder-verification-heading">
              <h2 id="ladder-verification-heading" className="text-sm font-semibold text-site-text">{t('ladder.verification', { defaultValue: 'Verification' })}</h2>
              {verificationEvidence && <p className="mt-2 text-sm leading-6 text-site-text-muted">{verificationEvidence}</p>}
              {verificationCheckedAt && (
                <p className="mt-1 text-xs text-site-text-dim">
                  {t('ladder.lastVerified', { defaultValue: 'Last verified {{time}}', time: timeAgo(verificationCheckedAt as Date) })}
                </p>
              )}
            </section>
          )}

          {summary && (
            <section aria-labelledby="ladder-summary-heading">
              <h2 id="ladder-summary-heading" className="text-sm font-semibold text-site-text">{t('ladder.summary', { defaultValue: 'Role summary' })}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-site-text-muted">{summary}</p>
            </section>
          )}
        </CardContent>

        <CardFooter className="flex-col items-stretch gap-3 border-t border-site-border sm:flex-row sm:items-center">
          {applyUrl ? (
            <Button asChild size="lg" className="sm:mr-auto">
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackApplyClick(job.id as string, applyUrl)}
              >
                {t('ladder.applyOn', { defaultValue: 'Apply on {{domain}}', domain: sourceDomain(applyUrl) })}
                <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : (
            <p className="text-sm text-site-danger sm:mr-auto">{t('ladder.applyUnavailable', { defaultValue: 'The source application link is unavailable.' })}</p>
          )}

          {isAuthenticated ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ladder.jobActions', { defaultValue: 'Job tracking actions' })}>
              {trackingActions.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={value === 'applied'
                    ? applicationStatus && applicationStatus !== 'not_applied' ? 'accent' : 'outline'
                    : userAction === value ? 'accent' : 'outline'}
                  aria-pressed={value === 'applied'
                    ? Boolean(applicationStatus && applicationStatus !== 'not_applied')
                    : userAction === value}
                  onClick={() => {
                    if (value === 'applied' && applicationStatus && applicationStatus !== 'not_applied') return;
                    void onAction(userAction === value ? null : value);
                  }}
                  className="min-h-11"
                >
                  <Icon aria-hidden />{label}
                </Button>
              ))}
            </div>
          ) : (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/login" search={{ callbackURL: `/rmhladder/jobs/${job.id as string}` }}>
                {t('ladder.signInToTrack', { defaultValue: 'Sign in to track this job' })}
              </Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
