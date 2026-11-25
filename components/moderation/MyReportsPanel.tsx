/**
 * Your reports (s03-16) — the reports the member filed, with where each one stands and, once decided, a two-word
 * outcome. A waiting report can be withdrawn. Nothing about the moderator or the action taken is ever shown: the
 * server does not send it.
 *
 * Mounted on /settings/security under Account standing, which is a signed-in page; signed out, this renders nothing.
 */

import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { listMyReportsApi, withdrawReportApi, type MyReport } from '@/lib/moderation/my-reports.contract';
import type { MyReportsFilter, ReporterStatus } from '@/lib/moderation/my-reports';
import type { ReportEntityType, ReportReason } from '@/lib/moderation/report-schema';
import { useSession } from '@/components/Providers';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { relativeTimeShort } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';

const QUERY_KEY = ['account', 'reports'] as const;

export function MyReportsPanel() {
  const { t } = useTranslation('my-reports');
  const { t: ts } = useTranslation('c-moderation');
  const refusalText = useRefusalText();
  const { data: session } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<MyReportsFilter>('all');
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const q = useInfiniteQuery({
    queryKey: [...QUERY_KEY, filter],
    enabled: !!session?.user,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api(listMyReportsApi, { query: { filter, ...(pageParam ? { cursor: pageParam } : {}) } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const arrival = useArrival(!q.isPending);
  const isNew = useArrivingKeys(items.map((r) => r.id));

  if (!session?.user) return null;

  const tabs = [
    { id: 'all', label: t('filter-all', { defaultValue: 'All' }) },
    { id: 'open', label: t('filter-open', { defaultValue: 'Open' }) },
    { id: 'closed', label: t('filter-closed', { defaultValue: 'Closed' }) },
  ];

  const REASONS: Record<ReportReason, string> = {
    SPAM: ts('reason-spam', { defaultValue: 'Spam or scam' }),
    HARASSMENT: ts('reason-harassment', { defaultValue: 'Harassment or bullying' }),
    HATE: ts('reason-hate', { defaultValue: 'Hate speech' }),
    VIOLENCE: ts('reason-violence', { defaultValue: 'Violence or threats' }),
    SEXUAL: ts('reason-sexual', { defaultValue: 'Sexual or explicit content' }),
    SELF_HARM: ts('reason-self-harm', { defaultValue: 'Self-harm' }),
    MISINFORMATION: ts('reason-misinformation', { defaultValue: 'Misinformation' }),
    ILLEGAL: ts('reason-illegal', { defaultValue: 'Illegal content' }),
    OTHER: ts('reason-other', { defaultValue: 'Something else' }),
  };

  const STATUS: Record<ReporterStatus, string> = {
    WAITING: t('status-waiting', { defaultValue: 'Waiting for review' }),
    REVIEWING: t('status-reviewing', { defaultValue: 'Being reviewed' }),
    ACTION_TAKEN: t('status-action-taken', { defaultValue: 'Action taken' }),
    NO_VIOLATION: t('status-no-violation', { defaultValue: 'No violation found' }),
    WITHDRAWN: t('status-withdrawn', { defaultValue: 'Withdrawn' }),
  };

  // What was reported, in words: the kind, then the start of the content when it is still visible to this member.
  const KIND: Record<ReportEntityType, string> = {
    rmhark: t('kind-rmhark', { defaultValue: 'Post' }),
    comment: t('kind-comment', { defaultValue: 'Reply' }),
    user: t('kind-user', { defaultValue: 'Profile' }),
    build: t('kind-build', { defaultValue: 'Build' }),
    dm: t('kind-dm', { defaultValue: 'Message' }),
    song: t('kind-song', { defaultValue: 'Song' }),
    stamp: t('kind-stamp', { defaultValue: 'Stamp' }),
    webring: t('kind-webring', { defaultValue: 'Webring' }),
    'ladder-interview': t('kind-ladder-interview', { defaultValue: 'Interview report' }),
    'music-score': t('kind-music-score', { defaultValue: 'Music score' }),
    'music-share': t('kind-music-share', { defaultValue: 'Shared music result' }),
    'jam-feedback': t('kind-jam-feedback', { defaultValue: 'Jam feedback' }),
    'build-comment': t('kind-build-comment', { defaultValue: 'Build comment' }),
    'build-issue': t('kind-build-issue', { defaultValue: 'Build issue' }),
    // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
    // s11-05 lights-out-maker
    'lights-out-board': t('kind-lights-out-board', { defaultValue: 'Lights Out board' }),
    // s11-07 studio-share
    'studio-share': t('kind-studio-share', { defaultValue: 'Shared Studio project' }),
    // s12-16 member-reports
    'connections-grid': t('kind-connections-grid', { defaultValue: 'Connections grid' }),
    'study-deck': t('kind-study-deck', { defaultValue: 'Flashcard deck' }),
    persona: t('kind-persona', { defaultValue: 'AI persona' }),
    'home-listing': t('kind-home-listing', { defaultValue: 'Home listing' }),
  };
  const GONE: Partial<Record<ReportEntityType, string>> = {
    rmhark: t('gone-rmhark', { defaultValue: 'A post that is no longer available' }),
    comment: t('gone-comment', { defaultValue: 'A reply that is no longer available' }),
    user: t('gone-user', { defaultValue: 'A profile that is no longer available' }),
    build: t('gone-build', { defaultValue: 'A build that is no longer available' }),
    'build-comment': t('gone-build-comment', { defaultValue: 'A build comment that is no longer available' }),
    'build-issue': t('gone-build-issue', { defaultValue: 'A build issue that is no longer available' }),
    // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
    // s11-05 lights-out-maker
    'lights-out-board': t('gone-lights-out-board', { defaultValue: 'A Lights Out board that is no longer available' }),
    // s11-07 studio-share
    'studio-share': t('gone-studio-share', { defaultValue: 'A shared Studio project that is no longer available' }),
    // s12-16 member-reports
    'connections-grid': t('gone-connections-grid', { defaultValue: 'A Connections grid that is no longer available' }),
    'study-deck': t('gone-study-deck', { defaultValue: 'A flashcard deck that is no longer available' }),
    persona: t('gone-persona', { defaultValue: 'An AI persona that is no longer available' }),
    'home-listing': t('gone-home-listing', { defaultValue: 'A home listing that is no longer available' }),
  };

  const whatOf = (r: MyReport): string =>
    !r.target.available
      ? (GONE[r.target.kind] ?? KIND[r.target.kind])
      : r.target.name
        ? t('what-named', {
            kind: KIND[r.target.kind],
            name: r.target.name,
            defaultValue: '{{kind}}: {{name}}',
          })
        : KIND[r.target.kind];

  const withdraw = async (r: MyReport) => {
    const ok = await confirm({
      title: t('withdraw-title', { defaultValue: 'Withdraw this report?' }),
      description: t('withdraw-description', {
        defaultValue: 'Moderators will not review it. You can report this again later.',
      }),
      confirmLabel: t('withdraw', { defaultValue: 'Withdraw' }),
    });
    if (!ok) return;
    setWithdrawing(r.id);
    try {
      await api(withdrawReportApi, { params: { id: r.id } });
      toast.success(t('withdrawn-toast', { defaultValue: 'Report withdrawn.' }));
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('withdraw-failed', { defaultValue: 'Could not withdraw the report.' }));
    } finally {
      setWithdrawing(null);
      // A 409 means a moderator moved first: refetching shows where the report stands now.
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    }
  };

  return (
    <SettingsSection
      id="your-reports"
      title={t('title', { defaultValue: 'Your reports' })}
      description={t('description', {
        defaultValue:
          'Reports you made in the last 180 days, and what came of them. You never see who decided or what was done.',
      })}
    >
      <Tabs
        tabs={tabs}
        value={filter}
        onChange={(id) => setFilter(id as MyReportsFilter)}
        aria-label={t('filters', { defaultValue: 'Filter your reports' })}
      />
      {q.isPending ? (
        <div
          className="space-y-3 pt-4"
          role="status"
          aria-label={t('loading', { defaultValue: 'Loading your reports' })}
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : q.isError ? (
        <EmptyState
          className={arrival}
          title={t('error', { defaultValue: 'Could not load your reports.' })}
          action={
            <Button variant="default" onClick={() => void q.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          className={arrival}
          icon={Flag}
          title={
            filter === 'all'
              ? t('empty', { defaultValue: 'You have not reported anything.' })
              : t('empty-filter', { defaultValue: 'No reports here.' })
          }
          description={t('empty-hint', {
            defaultValue: 'Use Report on a post, reply or profile when something breaks the rules.',
          })}
        />
      ) : (
        <>
          <ul className={`divide-y divide-site-border ${arrival ?? ''}`}>
            {items.map((r) => {
              const what = whatOf(r);
              return (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-start gap-x-4 gap-y-2 py-3 ${isNew(r.id) ? ARRIVE : ''}`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="t-body break-words text-site-text">
                      {r.target.href ? (
                        <Link to={r.target.href} className="underline">
                          {what}
                        </Link>
                      ) : (
                        what
                      )}
                    </p>
                    <p className="t-meta">
                      {REASONS[r.reason]} · <RelativeTime date={r.createdAt} format={relativeTimeShort} />
                    </p>
                  </div>
                  <p className="t-label text-site-text">{STATUS[r.status]}</p>
                  {r.canWithdraw && (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={withdrawing === r.id}
                      aria-label={t('withdraw-label', {
                        what,
                        defaultValue: 'Withdraw report: {{what}}',
                      })}
                      onClick={() => void withdraw(r)}
                    >
                      {t('withdraw', { defaultValue: 'Withdraw' })}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {q.hasNextPage && (
            <div className="pt-3">
              <Button variant="default" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                {q.isFetchingNextPage
                  ? t('loading-more', { defaultValue: 'Loading…' })
                  : t('load-more', { defaultValue: 'Load more' })}
              </Button>
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}
