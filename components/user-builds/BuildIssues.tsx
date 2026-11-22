import { lazy, Suspense, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { useSession } from '@/components/Providers';
import { api, errorField } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { cn } from '@/lib/utils';
import {
  CREATOR_STATUSES,
  ISSUE_FILTERS,
  ISSUE_WONT_FIX_REASON_MAX,
  type CreatorStatus,
  type IssueFilter,
  type IssuePlatform,
  type IssueRefusal,
  type IssueSort,
  type IssueStatus,
  type IssueView,
} from '@/lib/builds/issues';
import {
  closeBuildIssueApi,
  hideBuildIssueApi,
  listBuildIssuesApi,
  setBuildIssueStatusApi,
  voteBuildIssueApi,
} from '@/lib/builds/issues.contract';
import { BuildIssueForm } from './BuildIssueForm';

// The report form carries zod, which stays off the build pages' first load (lib/__tests__/zod-off-hot-routes.test.ts).
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

type Release = { id: string; version: string };

function useStatusLabel() {
  const { t } = useTranslation('build-issues');
  return (status: IssueStatus): string => {
    switch (status) {
      case 'confirmed':
        return t('status-confirmed', { defaultValue: 'Confirmed' });
      case 'fixed':
        return t('status-fixed', { defaultValue: 'Fixed' });
      case 'wont_fix':
        return t('status-wont-fix', { defaultValue: "Won't fix" });
      case 'duplicate':
        return t('status-duplicate', { defaultValue: 'Duplicate' });
      case 'closed':
        return t('status-closed', { defaultValue: 'Closed by reporter' });
      default:
        return t('status-open', { defaultValue: 'Open' });
    }
  };
}

function usePlatformLabel() {
  const { t } = useTranslation('build-issues');
  return (p: IssuePlatform): string => {
    switch (p) {
      case 'phone':
        return t('platform-phone', { defaultValue: 'Phone browser' });
      case 'tablet':
        return t('platform-tablet', { defaultValue: 'Tablet browser' });
      default:
        return t('platform-desktop', { defaultValue: 'Desktop browser' });
    }
  };
}

/** The creator's status line: the status, the release, the duplicate target or the reason, as one sentence. */
function StatusLine({ issue }: { issue: IssueView }) {
  const { t } = useTranslation('build-issues');
  const label = useStatusLabel();
  return (
    <p className="t-meta">
      {issue.status === 'fixed' && issue.fixedIn
        ? t('status-line-fixed', { version: issue.fixedIn.version, defaultValue: 'Fixed in {{version}}' })
        : label(issue.status)}
      {issue.status === 'duplicate' && issue.duplicateOf && (
        <>
          {' · '}
          {t('status-line-duplicate-of', { defaultValue: 'Duplicate of' })} <bdi>{issue.duplicateOf.title}</bdi>
        </>
      )}
      {issue.status === 'wont_fix' && issue.wontFixReason && (
        <>
          {' · '}
          <bdi>{issue.wontFixReason}</bdi>
        </>
      )}
    </p>
  );
}

/** The creator's controls: a status, the release it was fixed in or the issue it duplicates, a reason. */
function StatusEditor({
  buildId,
  issue,
  releases,
  others,
  onChanged,
}: {
  buildId: string;
  issue: IssueView;
  releases: Release[];
  others: IssueView[];
  onChanged: () => void;
}) {
  const { t } = useTranslation('build-issues');
  const label = useStatusLabel();
  const [status, setStatus] = useState<CreatorStatus>(
    issue.status === 'closed' ? 'open' : (issue.status as CreatorStatus),
  );
  const [fixedInId, setFixedInId] = useState(issue.fixedIn?.id ?? releases[0]?.id ?? '');
  const [duplicateOfId, setDuplicateOfId] = useState(issue.duplicateOf?.id ?? others[0]?.id ?? '');
  const [reason, setReason] = useState(issue.wontFixReason ?? '');
  const [busy, setBusy] = useState(false);

  const missing = (status === 'fixed' && !fixedInId) || (status === 'duplicate' && !duplicateOfId);

  async function save() {
    if (busy || missing) return;
    setBusy(true);
    try {
      await api(setBuildIssueStatusApi, {
        params: { id: buildId, issueId: issue.id },
        body: {
          expected: issue.status,
          status,
          ...(status === 'fixed' ? { fixedInId } : {}),
          ...(status === 'duplicate' ? { duplicateOfId } : {}),
          ...(status === 'wont_fix' && reason.trim() ? { reason: reason.trim() } : {}),
        },
      });
      toast.success(t('status-saved', { defaultValue: 'Status updated' }));
    } catch (error) {
      toast.error(
        errorField<IssueRefusal>(error, 'reason') === 'stale'
          ? t('status-stale', { defaultValue: 'This issue changed while you were looking. The list was refreshed.' })
          : t('status-failed', { defaultValue: 'Could not update the status' }),
      );
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const id = `status-${issue.id}`;
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{t('set-status', { defaultValue: 'Status' })}</Label>
        <Select id={id} controlSize="sm" value={status} onChange={(e) => setStatus(e.target.value as CreatorStatus)}>
          {CREATOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </Select>
      </div>
      {status === 'fixed' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-release`}>{t('fixed-in', { defaultValue: 'Fixed in' })}</Label>
          <Select
            id={`${id}-release`}
            controlSize="sm"
            value={fixedInId}
            onChange={(e) => setFixedInId(e.target.value)}
          >
            {releases.map((r) => (
              <option key={r.id} value={r.id}>
                {r.version}
              </option>
            ))}
          </Select>
        </div>
      )}
      {status === 'duplicate' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-dup`}>{t('duplicate-of', { defaultValue: 'Duplicate of' })}</Label>
          <Select
            id={`${id}-dup`}
            controlSize="sm"
            value={duplicateOfId}
            onChange={(e) => setDuplicateOfId(e.target.value)}
          >
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </div>
      )}
      {status === 'wont_fix' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-reason`}>{t('wont-fix-reason', { defaultValue: 'Reason (optional)' })}</Label>
          <Input
            id={`${id}-reason`}
            dir="auto"
            maxLength={ISSUE_WONT_FIX_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
      <Button size="sm" variant="primary" loading={busy} disabled={missing} onClick={() => void save()}>
        {t('save-status', { defaultValue: 'Save status' })}
      </Button>
    </div>
  );
}

function IssueRow({
  buildId,
  issue,
  releases,
  others,
  signedIn,
  arriving,
  onChanged,
  onReport,
  onEdit,
}: {
  buildId: string;
  issue: IssueView;
  releases: Release[];
  others: IssueView[];
  signedIn: boolean;
  arriving: boolean;
  onChanged: () => void;
  onReport: (id: string) => void;
  onEdit: (issue: IssueView) => void;
}) {
  const { t, i18n } = useTranslation('build-issues');
  const confirm = useConfirm();
  const label = useStatusLabel();
  const platform = usePlatformLabel();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panel = `issue-${issue.id}`;
  const name = issue.reporter.name ?? t('deleted-user', { defaultValue: 'Deleted user' });

  async function toggleVote() {
    if (busy) return;
    setBusy(true);
    try {
      await api(voteBuildIssueApi, { params: { id: buildId, issueId: issue.id }, body: { voted: !issue.voted } });
    } catch {
      toast.error(t('vote-failed', { defaultValue: 'Could not save that' }));
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  async function hide(hidden: boolean) {
    try {
      await api(hideBuildIssueApi, { params: { id: buildId, issueId: issue.id }, body: { hidden } });
    } catch {
      toast.error(t('hide-failed', { defaultValue: 'Could not change that' }));
    } finally {
      onChanged();
    }
  }

  async function close() {
    const ok = await confirm({
      title: t('close-title', { defaultValue: 'Close this issue?' }),
      description: t('close-body', { defaultValue: 'It stays in the list as closed. You cannot reopen it.' }),
      confirmLabel: t('close', { defaultValue: 'Close issue' }),
    });
    if (!ok) return;
    try {
      await api(closeBuildIssueApi, { params: { id: buildId, issueId: issue.id } });
    } catch {
      toast.error(t('close-failed', { defaultValue: 'Could not close the issue' }));
    } finally {
      onChanged();
    }
  }

  return (
    <li className={cn('border-b border-site-border', arriving && ARRIVE)}>
      <button
        type="button"
        className="flex w-full items-start gap-3 py-3 text-start"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-site-text-muted', open && 'rotate-180')} />
        <span className="min-w-0 flex-1">
          <span dir="auto" className="t-heading block break-words">
            {issue.title}
          </span>
          <span className="t-meta block">
            {label(issue.status)}
            {issue.version && <> · {issue.version.version}</>} · <bdi>{name}</bdi> ·{' '}
            <RelativeTime date={issue.createdAt} format={(at, now) => formatRelativeTime(at, i18n.language, now)} />
            {issue.hidden && <> · {t('hidden', { defaultValue: 'Hidden by the creator' })}</>}
          </span>
        </span>
        <span className="t-meta shrink-0">
          {t('seen-too-count', { votes: issue.voteCount, defaultValue: '{{votes}} see this too' })}
        </span>
      </button>
      {open && (
        <div id={panel} className="pb-4 ps-7">
          <StatusLine issue={issue} />
          <p dir="auto" className="t-body mt-2 break-words whitespace-pre-wrap">
            {issue.body}
          </p>
          {issue.steps && (
            <>
              <h3 className="t-label mt-3">{t('steps-heading', { defaultValue: 'Steps to reproduce' })}</h3>
              <p dir="auto" className="t-body break-words whitespace-pre-wrap">
                {issue.steps}
              </p>
            </>
          )}
          <p className="t-meta mt-2">{platform(issue.platform)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {issue.rights.canVote || issue.voted ? (
              <Button
                size="sm"
                variant="default"
                aria-pressed={issue.voted}
                loading={busy}
                disabled={!signedIn}
                onClick={() => void toggleVote()}
              >
                {issue.voted
                  ? t('seen-too-undo', { defaultValue: 'You see this too' })
                  : t('seen-too', { defaultValue: 'I see this too' })}
              </Button>
            ) : null}
            {issue.rights.canEdit && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(issue)}>
                {t('edit', { defaultValue: 'Edit' })}
              </Button>
            )}
            {issue.rights.canClose && (
              <Button size="sm" variant="ghost" onClick={() => void close()}>
                {t('close', { defaultValue: 'Close issue' })}
              </Button>
            )}
            {issue.rights.canHide && (
              <Button size="sm" variant="ghost" onClick={() => void hide(!issue.hidden)}>
                {issue.hidden ? t('unhide', { defaultValue: 'Show to everyone' }) : t('hide', { defaultValue: 'Hide' })}
              </Button>
            )}
            {issue.rights.canReport && (
              <Button size="sm" variant="ghost" onClick={() => onReport(issue.id)}>
                {t('report', { defaultValue: 'Report to moderators' })}
              </Button>
            )}
          </div>
          {issue.rights.canSetStatus && (
            <StatusEditor buildId={buildId} issue={issue} releases={releases} others={others} onChanged={onChanged} />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * A build's issue list: a filter strip by status (counts on each tab), newest or most "me too" first, each issue an
 * expanding row with the creator's status line. The report form opens in a dialog. Hidden issues reach this list only
 * for the creator and the reporter, as decided by the server.
 */
export function BuildIssues({ buildId }: { buildId: string }) {
  const { t } = useTranslation('build-issues');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<IssueFilter>('all');
  const [sort, setSort] = useState<IssueSort>('newest');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IssueView | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: [listBuildIssuesApi.path, buildId, filter, sort],
    queryFn: ({ pageParam }) =>
      api(listBuildIssuesApi, {
        params: { id: buildId },
        query: { status: filter, sort, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });

  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const arrival = useArrival(!!first);
  const arriving = useArrivingKeys(items.map((i) => i.id));
  const label = useStatusLabel();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [listBuildIssuesApi.path] });

  const tabs = ISSUE_FILTERS.map((f) => ({
    id: f,
    label: f === 'all' ? t('filter-all', { defaultValue: 'All' }) : label(f),
    ...(first ? { count: first.counts[f] } : {}),
  }));

  return (
    <section aria-labelledby="build-issues-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="build-issues-heading" className="t-heading">
          {t('heading', { defaultValue: 'Issues' })}
        </h2>
        {!session ? (
          <p className="t-body text-site-text-muted">
            <Link to="/login" className="underline">
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('to-report', { defaultValue: 'to report an issue.' })}
          </p>
        ) : first?.canReport ? (
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            {t('report-issue', { defaultValue: 'Report an issue' })}
          </Button>
        ) : first ? (
          <p className="t-body text-site-text-muted">
            {t('cannot-report', { defaultValue: 'You cannot report issues on this build.' })}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={tabs}
          value={filter}
          onChange={(id) => setFilter(id as IssueFilter)}
          aria-label={t('filter-label', { defaultValue: 'Filter issues by status' })}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="build-issues-sort">{t('sort-label', { defaultValue: 'Sort' })}</Label>
          <Select
            id="build-issues-sort"
            controlSize="sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as IssueSort)}
          >
            <option value="newest">{t('sort-newest', { defaultValue: 'Newest' })}</option>
            <option value="popular">{t('sort-popular', { defaultValue: 'Most see this too' })}</option>
          </Select>
        </div>
      </div>

      <div className="mt-2">
        {list.isPending ? (
          <div className="space-y-3 py-3" aria-busy="true">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : list.isError ? (
          <div className="py-6">
            <p role="alert" className="t-body text-site-danger">
              {t('load-failed', { defaultValue: 'Could not load the issues.' })}
            </p>
            <Button variant="default" className="mt-2" onClick={() => void list.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={
              filter === 'all'
                ? t('empty-title', { defaultValue: 'No issues reported' })
                : t('empty-filtered-title', { defaultValue: 'No issues with this status' })
            }
            description={t('empty-body', { defaultValue: 'Bugs reported on this build appear here.' })}
          />
        ) : (
          <ul className={arrival}>
            {items.map((issue) => (
              <IssueRow
                key={issue.id}
                buildId={buildId}
                issue={issue}
                releases={first?.releases ?? []}
                others={items.filter((o) => o.id !== issue.id)}
                signedIn={!!session}
                arriving={arriving(issue.id)}
                onChanged={refresh}
                onReport={setReporting}
                onEdit={setEditing}
              />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="py-3">
            <Button variant="default" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {t('load-more', { defaultValue: 'Show more' })}
            </Button>
          </div>
        )}
      </div>

      {formOpen && (
        <BuildIssueForm open onOpenChange={setFormOpen} buildId={buildId} releases={first?.releases ?? []} />
      )}
      {editing && (
        <BuildIssueForm
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          buildId={buildId}
          releases={first?.releases ?? []}
          issue={editing}
        />
      )}
      {reporting && (
        <Suspense fallback={null}>
          <ReportDialog
            open
            onOpenChange={(next) => {
              if (!next) setReporting(null);
            }}
            entityType="build-issue"
            entityId={reporting}
          />
        </Suspense>
      )}
    </section>
  );
}
