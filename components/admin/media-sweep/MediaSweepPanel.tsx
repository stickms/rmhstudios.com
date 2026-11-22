import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminSection } from '@/components/admin/AdminRows';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { mediaSweepPreviewApi, mediaSweepRunApi, mediaSweepStateApi } from '@/lib/media/sweep-admin.contract';
import type { ClipSweepSummary, SweepKind, SweepSummary } from '@/lib/media/sweep-summary';

/** What one run takes at most; the server's `SWEEP_ROW_CAP` and `CLIP_LIST_LIMIT`, shown in the confirmation. */
const MEDIA_RUN_LIMIT = 2000;
const CLIP_RUN_LIMIT = 5000;

type Summary = SweepSummary | ClipSweepSummary;

/** Counts on `t-meta` lines, then the first keys on rules. A preview and a finished run read the same. */
function SummaryLines({ summary }: { summary: Summary }) {
  const { t } = useTranslation('media-sweep');
  const fmt = useLocaleFormat();
  const lines =
    'byRule' in summary
      ? [
          t('line-rows', {
            scanned: fmt.number(summary.scanned),
            kept: fmt.number(summary.kept),
            defaultValue: '{{scanned}} rows looked at, {{kept}} kept because something still uses them',
          }),
          t('line-rules', {
            pending: fmt.number(summary.byRule['orphan-pending']),
            soft: fmt.number(summary.byRule['soft-deleted-post']),
            hard: fmt.number(summary.byRule['hard-deleted-post']),
            defaultValue:
              '{{pending}} never attached, {{soft}} from deleted posts past the recycle bin, {{hard}} from posts that are gone',
          }),
        ]
      : [
          t('line-clips', {
            listed: fmt.number(summary.listed),
            referenced: fmt.number(summary.referenced),
            fresh: fmt.number(summary.tooNew + summary.noTime),
            defaultValue:
              '{{listed}} clips looked at, {{referenced}} in use, {{fresh}} kept for being under a week old or having no time',
          }),
        ];
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <p key={line} className="t-meta">
          {line}
        </p>
      ))}
      <p className="t-meta">
        {summary.dryRun
          ? t('line-would', { number: fmt.number(summary.targets), defaultValue: '{{number}} would be deleted' })
          : t('line-done', {
              deleted: fmt.number(summary.deleted),
              failed: fmt.number(summary.failed),
              defaultValue: '{{deleted}} deleted, {{failed}} failed (they stay and are tried again)',
            })}
      </p>
      {summary.capped ? (
        <p className="t-meta">
          {t('line-capped', { defaultValue: 'The limit for one run was reached; the rest waits for the next run.' })}
        </p>
      ) : null}
      {summary.sampleKeys.length > 0 ? (
        <ul className="mt-2 border-t border-site-border">
          {summary.sampleKeys.map((key) => (
            <li key={key} className="t-meta break-all border-b border-site-border py-1.5">
              {key}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SweepSection({ kind }: { kind: SweepKind }) {
  const { t } = useTranslation('media-sweep');
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const preview = useMutation({
    mutationFn: () => api(mediaSweepPreviewApi, { body: { kind } }),
    onError: () => toast.error(t('preview-error', { defaultValue: 'The preview could not be made.' })),
  });
  const run = useMutation({
    mutationFn: () => api(mediaSweepRunApi, { body: { kind } }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: [mediaSweepStateApi.path] });
      toast.success(
        t('run-done', {
          number: fmt.number(data.summary.deleted),
          defaultValue: 'The sweep finished. {{number}} deleted.',
        }),
      );
    },
    onError: () => toast.error(t('run-error', { defaultValue: 'The sweep could not run.' })),
  });

  const askRun = async () => {
    const limit = fmt.number(kind === 'media' ? MEDIA_RUN_LIMIT : CLIP_RUN_LIMIT);
    const ok = await confirm({
      title: t('confirm-title', { defaultValue: 'Run the sweep now?' }),
      description:
        kind === 'media'
          ? t('confirm-body-media', {
              limit,
              defaultValue:
                'Deletes up to {{limit}} stored uploads nobody uses, oldest first, with their smaller sizes. This cannot be undone. Preview first to see which.',
            })
          : t('confirm-body-clips', {
              limit,
              defaultValue:
                'Looks at up to {{limit}} pronunciation clips and deletes those no profile uses that are over a week old. This cannot be undone. Preview first to see which.',
            }),
      confirmLabel: t('run-action', { defaultValue: 'Run now' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      danger: true,
    });
    if (ok) run.mutate();
  };

  const result = run.data?.summary ?? preview.data?.summary ?? null;
  const busy = preview.isPending || run.isPending;
  return (
    <AdminSection
      title={
        kind === 'media'
          ? t('media-title', { defaultValue: 'Uploads nobody uses' })
          : t('clips-title', { defaultValue: 'Pronunciation clips' })
      }
      description={
        kind === 'media'
          ? t('media-description', {
              defaultValue:
                'Uploads never attached to a post after a day, and the pictures of posts deleted past their recycle-bin window. A picture a scheduled post, a flashcard or a build page still uses is kept.',
            })
          : t('clips-description', {
              defaultValue: 'Recordings that no profile names any more and that are over a week old.',
            })
      }
      action={
        <div className="flex gap-2">
          <Button variant="default" disabled={busy} onClick={() => preview.mutate()}>
            {t('preview-action', { defaultValue: 'Preview' })}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void askRun()}>
            {t('run-action', { defaultValue: 'Run now' })}
          </Button>
        </div>
      }
    >
      {busy ? <Skeleton className="h-16 w-full" aria-busy="true" /> : null}
      {result && !busy ? <SummaryLines summary={result} /> : null}
    </AdminSection>
  );
}

export function MediaSweepPanel() {
  const { t } = useTranslation('media-sweep');
  const fmt = useLocaleFormat();
  const state = useQuery(apiQuery(mediaSweepStateApi));
  const arrival = useArrival(!state.isPending);

  return (
    <>
      <AdminSection
        title={t('schedule-title', { defaultValue: 'Scheduled sweeps' })}
        description={t('schedule-description', {
          defaultValue: 'The uploads sweep runs nightly and the clip sweep weekly, once the media-sweep flag is on.',
        })}
      >
        {state.isPending ? (
          <Skeleton className="h-5 w-64" aria-busy="true" />
        ) : state.isError ? (
          <p role="alert" className="t-body text-site-danger">
            {t('load-error', { defaultValue: 'The sweep state could not be loaded.' })}
          </p>
        ) : (
          <p className={`t-body ${arrival ?? ''}`}>
            {state.data.enabled
              ? t('flag-on', { defaultValue: 'The scheduled sweeps are on.' })
              : t('flag-off', { defaultValue: 'The scheduled sweeps are off. Nothing runs at night.' })}{' '}
            <Link to="/admin/flags" className="underline">
              {t('flags-link', { defaultValue: 'Flags' })}
            </Link>
          </p>
        )}
      </AdminSection>

      <SweepSection kind="media" />
      <SweepSection kind="clips" />

      <AdminSection
        title={t('runs-title', { defaultValue: 'Last runs' })}
        description={t('runs-description', {
          defaultValue: 'Runs started from this page. The scheduled runs are in the jobs log, as counts only.',
        })}
      >
        {state.isPending ? (
          <Skeleton className="h-16 w-full" aria-busy="true" />
        ) : state.isError ? null : state.data.runs.length === 0 ? (
          <EmptyState
            title={t('runs-empty-title', { defaultValue: 'No runs yet' })}
            description={t('runs-empty-description', { defaultValue: 'A run started here is listed once it is done.' })}
          />
        ) : (
          <ul className={`border-t border-site-border ${arrival ?? ''}`}>
            {state.data.runs.map((r) => (
              <li key={r.id} className="border-b border-site-border py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="t-heading">
                    {r.kind === 'media'
                      ? t('run-kind-media', { defaultValue: 'Uploads' })
                      : t('run-kind-clips', { defaultValue: 'Clips' })}
                  </p>
                  <p className="t-meta">{fmt.dateTime(r.at)}</p>
                </div>
                <p className="t-meta mt-1">
                  {t('run-row', {
                    deleted: fmt.number(r.deleted),
                    targets: fmt.number(r.targets),
                    failed: fmt.number(r.failed),
                    defaultValue: '{{deleted}} deleted of {{targets}} chosen, {{failed}} failed',
                  })}
                  {r.capped ? ` · ${t('run-capped', { defaultValue: 'limit reached' })}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </>
  );
}
