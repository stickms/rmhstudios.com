import { Bookmark, CheckCircle, ExternalLink, EyeOff, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { JobRow } from '@/lib/rmhladder/server/queries';
import type { JobActionValue } from '@/lib/rmhladder/server/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RungMeter } from './RungMeter';
import { safeExternalUrl, sourceDomain, trackApplyClick } from './url';

const PROGRAM_LABELS: Record<string, string> = {
  internship: 'Internship',
  summer_analyst: 'Summer Analyst',
  summer_associate: 'Summer Associate',
  analyst_program: 'Analyst Program',
  rotational_program: 'Rotational',
  new_grad: 'New Grad',
  leadership_development: 'LDP',
  entry_level: 'Entry Level',
  mba: 'MBA',
  other: 'Other',
};

function VerificationBadge({ status }: { status: string | null | undefined }) {
  const probable = status === 'verified_probable';
  return (
    <Badge variant={probable ? 'warning' : 'success'} size="sm">
      {probable ? 'Probably active' : 'Verified active'}
    </Badge>
  );
}

function formatDate(value: unknown) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(value as Date | string));
}

function Deadline({ value }: { value: unknown }) {
  if (!value) return <span className="text-site-text-dim">—</span>;
  const date = new Date(value as Date | string);
  const daysLeft = (date.getTime() - Date.now()) / 86_400_000;
  return (
    <span className={daysLeft >= 0 && daysLeft <= 14 ? 'font-medium text-site-danger' : undefined}>
      {formatDate(date)}
    </span>
  );
}

function JobActions({
  jobId,
  userAction,
  applicationStatus,
  onAction,
  compact = false,
}: {
  jobId: string;
  userAction: string | null;
  applicationStatus: string | null;
  onAction?: (jobId: string, action: JobActionValue) => Promise<void>;
  compact?: boolean;
}) {
  const { t } = useTranslation('site');
  if (!onAction) return null;
  const actionHandler = onAction;

  function toggle(action: JobActionValue, event: React.MouseEvent) {
    event.stopPropagation();
    if (action === 'applied' && applicationStatus && applicationStatus !== 'not_applied') return;
    void actionHandler(jobId, userAction === action ? null : action);
  }

  const actions = [
    {
      value: 'saved' as const,
      icon: Bookmark,
      label: userAction === 'saved'
        ? t('ladder.unsave', { defaultValue: 'Unsave job' })
        : t('ladder.save', { defaultValue: 'Save job' }),
    },
    {
      value: 'applied' as const,
      icon: CheckCircle,
      label: applicationStatus && applicationStatus !== 'not_applied'
        ? t('ladder.applied', { defaultValue: 'Applied' })
        : t('ladder.markApplied', { defaultValue: 'Mark as applied' }),
    },
    {
      value: 'ignored' as const,
      icon: EyeOff,
      label: userAction === 'ignored'
        ? t('ladder.unignore', { defaultValue: 'Unignore job' })
        : t('ladder.ignore', { defaultValue: 'Ignore job' }),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('ladder.jobActions', { defaultValue: 'Job tracking actions' })}>
      {actions.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          type="button"
          size={compact ? 'icon-sm' : 'sm'}
          variant={value === 'applied'
            ? applicationStatus && applicationStatus !== 'not_applied' ? 'accent' : 'outline'
            : userAction === value ? 'accent' : 'outline'}
          aria-label={label}
          aria-pressed={value === 'applied'
            ? Boolean(applicationStatus && applicationStatus !== 'not_applied')
            : userAction === value}
          onClick={(event) => toggle(value, event)}
          className={compact ? undefined : 'min-h-11'}
        >
          <Icon aria-hidden />
          {!compact && label}
        </Button>
      ))}
    </div>
  );
}

function jobFields(row: JobRow) {
  const city = row.city as string | null;
  const state = row.state as string | null;
  return {
    id: row.id as string,
    title: row.title as string,
    company: (row.company as { name?: string } | null)?.name ?? 'Unknown company',
    location: [city, state].filter(Boolean).join(', ') || 'Location not listed',
    program: PROGRAM_LABELS[row.programType as string] ?? (row.programType as string),
    verification: row.latestVerification as { status?: string } | null,
    applyUrl: safeExternalUrl(row.originalPostingUrl),
  };
}

interface JobsTableProps {
  rows: JobRow[];
  onRowClick: (row: JobRow) => void;
  onAction?: (jobId: string, action: JobActionValue) => Promise<void>;
}

export function JobsTable({ rows, onRowClick, onAction }: JobsTableProps) {
  const { t } = useTranslation('site');
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {t('ladder.resultsCount', { defaultValue: '{{count}} verified jobs', count: rows.length })}
      </p>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => {
          const job = jobFields(row);
          return (
            <Card key={job.id} className="gap-4 py-5">
              <CardHeader className="gap-3 px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <VerificationBadge status={job.verification?.status} />
                  <Badge variant="outline" size="sm">{job.program}</Badge>
                  {job.applyUrl && <Badge variant="outline" size="sm">{sourceDomain(job.applyUrl)}</Badge>}
                </div>
                <button type="button" className="text-left" onClick={() => onRowClick(row)}>
                  <CardTitle className="text-base leading-snug text-site-text">{job.title}</CardTitle>
                  <p className="mt-1 text-sm font-medium text-site-text-muted">{job.company}</p>
                </button>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                <p className="flex items-center gap-2 text-sm text-site-text-muted">
                  <MapPin className="size-4" aria-hidden />
                  {job.location}
                </p>
                <div className="flex items-center gap-2 text-sm text-site-text-muted">
                  <RungMeter score={row.finalRelevance} size="sm" />
                  <span>{t('ladder.relevance', { defaultValue: 'Relevance' })}: {row.finalRelevance}</span>
                </div>
              </CardContent>
              <CardFooter className="flex-wrap justify-between gap-2 px-5">
                <JobActions jobId={job.id} userAction={row.userAction} applicationStatus={row.applicationStatus} onAction={onAction} compact />
                {job.applyUrl && (
                  <Button asChild size="sm" className="min-h-11">
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackApplyClick(job.id, job.applyUrl!)}
                    >
                      {t('ladder.applyOn', { defaultValue: 'Apply on {{domain}}', domain: sourceDomain(job.applyUrl) })}
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-site border border-site-border bg-site-surface md:block">
        <table className="w-full border-collapse text-left text-sm" aria-label={t('ladder.jobPostings', { defaultValue: 'Job postings' })}>
          <thead className="border-b border-site-border bg-site-surface-hover text-xs uppercase tracking-wide text-site-text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">{t('ladder.titleCompany', { defaultValue: 'Title / Company' })}</th>
              <th scope="col" className="px-4 py-3">{t('ladder.location', { defaultValue: 'Location' })}</th>
              <th scope="col" className="px-4 py-3">{t('ladder.program', { defaultValue: 'Program' })}</th>
              <th scope="col" className="px-4 py-3">{t('ladder.deadline', { defaultValue: 'Deadline' })}</th>
              <th scope="col" className="px-4 py-3">{t('ladder.status', { defaultValue: 'Status' })}</th>
              <th scope="col" className="px-4 py-3">{t('ladder.match', { defaultValue: 'Match' })}</th>
              <th scope="col" className="px-4 py-3">{t('ladder.actions', { defaultValue: 'Actions' })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-site-border">
            {rows.map((row) => {
              const job = jobFields(row);
              return (
                <tr key={job.id} className="transition-colors hover:bg-site-surface-hover">
                  <td className="px-4 py-4">
                    <button type="button" className="text-left" onClick={() => onRowClick(row)}>
                      <span className="block font-semibold text-site-text hover:text-site-accent">{job.title}</span>
                      <span className="mt-1 block text-xs text-site-text-muted">{job.company}</span>
                    </button>
                  </td>
                  <td className="px-4 py-4 text-site-text-muted">{job.location}</td>
                  <td className="px-4 py-4"><Badge variant="outline" size="sm">{job.program}</Badge></td>
                  <td className="px-4 py-4 text-site-text-muted"><Deadline value={row.applicationDeadline} /></td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1">
                      <VerificationBadge status={job.verification?.status} />
                      {job.applyUrl && <span className="text-xs text-site-text-dim">{sourceDomain(job.applyUrl)}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2"><RungMeter score={row.finalRelevance} size="sm" /><span>{row.finalRelevance}</span></div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <JobActions jobId={job.id} userAction={row.userAction} applicationStatus={row.applicationStatus} onAction={onAction} compact />
                      {job.applyUrl && (
                        <Button asChild size="xs">
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('ladder.applyOn', { defaultValue: 'Apply on {{domain}}', domain: sourceDomain(job.applyUrl) })}
                            onClick={() => trackApplyClick(job.id, job.applyUrl!)}
                          >
                            {t('ladder.apply', { defaultValue: 'Apply' })}<ExternalLink aria-hidden />
                          </a>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
