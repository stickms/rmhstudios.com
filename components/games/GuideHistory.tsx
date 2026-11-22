import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { diffGuideBodies } from '@/components/games/guide-diff';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  getGuideRevisionApi,
  listGuideRevisionsApi,
  restoreGuideRevisionApi,
  type GuideRevisionRow,
} from '@/lib/games/guide-history.contract';

/** The author's "History" link on the guide page. */
export function GuideHistoryLink({ gameId, guideId }: { gameId: string; guideId: string }) {
  const { t } = useTranslation('guide-history');
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/games/$gameId/guides/$guideId/history" params={{ gameId, guideId }}>
        <History className="h-4 w-4" aria-hidden />
        {t('history-link', {
          defaultValue: 'History',
        })}
      </Link>
    </Button>
  );
}

type CompareMode = 'current' | 'next';

function useFormatDate() {
  const { i18n } = useTranslation('guide-history');
  return (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };
}

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

interface GuideHistoryProps {
  guideId: string;
  /** The current text, from the loader; it moves to the restored version after a restore. */
  currentBody: string;
  /** The author only: an admin reads the history and cannot restore. */
  canRestore: boolean;
}

/**
 * A guide's edits as rows on rules, each opening the version before that edit, a line diff against the current text
 * (or the next-newer version) and restore. Restoring is an edit like any other: the text it replaces joins the list.
 */
export function GuideHistory({ guideId, currentBody, canRestore }: GuideHistoryProps) {
  const { t } = useTranslation('guide-history');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const formatDate = useFormatDate();
  const [current, setCurrent] = useState(currentBody);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CompareMode>('current');
  const [restoring, setRestoring] = useState(false);

  const list = useQuery(apiQuery(listGuideRevisionsApi, { params: { id: guideId } }));
  const arrival = useArrival(list.isSuccess);
  const revisions = list.data?.revisions ?? [];
  const index = selectedId ? revisions.findIndex((r) => r.id === selectedId) : -1;
  const selected: GuideRevisionRow | undefined = index >= 0 ? revisions[index] : undefined;
  // The row above is the next-newer edit; above the newest there is only the current text.
  const newer: GuideRevisionRow | undefined = index > 0 ? revisions[index - 1] : undefined;

  const before = useQuery({
    ...apiQuery(getGuideRevisionApi, { params: { id: guideId, revisionId: selected?.id ?? '' } }),
    enabled: !!selected,
  });
  const after = useQuery({
    ...apiQuery(getGuideRevisionApi, { params: { id: guideId, revisionId: newer?.id ?? '' } }),
    enabled: !!selected && mode === 'next' && !!newer,
  });

  const afterBody = mode === 'next' && newer ? after.data?.body : current;
  const diff = useMemo(
    () => (before.data && afterBody !== undefined ? diffGuideBodies(before.data.body, afterBody) : null),
    [before.data, afterBody],
  );

  async function restore() {
    if (!selected) return;
    const ok = await confirm({
      title: t('restore-confirm-title', {
        defaultValue: 'Restore this version?',
      }),
      description: t('restore-confirm-body', {
        defaultValue: 'It becomes the current text. The text it replaces stays in the history.',
      }),
      confirmLabel: t('restore', {
        defaultValue: 'Restore this version',
      }),
    });
    if (!ok) return;
    setRestoring(true);
    try {
      await api(restoreGuideRevisionApi, { params: { id: guideId, revisionId: selected.id } });
      if (before.data) setCurrent(before.data.body);
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: [listGuideRevisionsApi.path] });
      toast.success(
        t('restored', {
          defaultValue: 'Version restored',
        }),
      );
    } catch {
      toast.error(
        t('restore-failed', {
          defaultValue: 'Could not restore that version',
        }),
      );
    } finally {
      setRestoring(false);
    }
  }

  if (list.isPending) {
    return (
      <div className="space-y-3 py-4" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (list.isError) {
    return (
      <EmptyState
        title={t('load-failed', {
          defaultValue: 'Could not load the history',
        })}
        action={
          <Button variant="ghost" size="sm" onClick={() => void list.refetch()}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </Button>
        }
      />
    );
  }

  if (revisions.length === 0) {
    return (
      <EmptyState
        className={arrival}
        title={t('empty-title', {
          defaultValue: 'No earlier versions',
        })}
        description={t('empty-body', {
          defaultValue: 'A version is kept each time the text of this guide changes.',
        })}
      />
    );
  }

  return (
    <div className={arrival}>
      <p className="t-body py-3 text-site-text-muted">
        {t('intro', {
          defaultValue: 'Each row is an edit. Open one to see the text as it was before that edit.',
        })}
      </p>
      <ul className="border-t border-site-border">
        {revisions.map((r) => {
          const active = r.id === selected?.id;
          return (
            <li key={r.id} className="border-b border-site-border">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedId(active ? null : r.id)}
                className="flex min-h-11 w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-start"
              >
                <span className="min-w-0">
                  <span className={active ? 't-heading block' : 't-body block font-medium'}>
                    {r.note ??
                      t('no-note', {
                        defaultValue: 'No note',
                      })}
                  </span>
                  <span className="t-meta block">{formatDate(r.createdAt)}</span>
                </span>
                <span className="t-meta">
                  {t('size-change', {
                    defaultValue: '{{change}} characters',
                    change: signed(r.delta),
                  })}
                </span>
              </button>
              {active ? (
                <div className="pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                    <Tabs
                      aria-label={t('compare-label', {
                        defaultValue: 'Compare with',
                      })}
                      value={mode}
                      onChange={(id) => setMode(id === 'next' ? 'next' : 'current')}
                      tabs={[
                        {
                          id: 'current',
                          label: t('compare-current', {
                            defaultValue: 'Against the current text',
                          }),
                        },
                        {
                          id: 'next',
                          label: t('compare-next', {
                            defaultValue: 'Against the next version',
                          }),
                        },
                      ]}
                    />
                    {canRestore ? (
                      <Button variant="default" size="sm" loading={restoring} onClick={() => void restore()}>
                        {t('restore', {
                          defaultValue: 'Restore this version',
                        })}
                      </Button>
                    ) : null}
                  </div>
                  <DiffPanel diff={diff} failed={before.isError || (mode === 'next' && !!newer && after.isError)} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DiffPanel({ diff, failed }: { diff: ReturnType<typeof diffGuideBodies> | null; failed: boolean }) {
  const { t } = useTranslation('guide-history');
  if (failed) {
    return (
      <p className="t-body text-site-danger">
        {t('version-failed', {
          defaultValue: 'Could not load that version',
        })}
      </p>
    );
  }
  if (!diff) return <Skeleton className="h-24 w-full" />;
  if (diff.tooLong) {
    return (
      <p className="t-body text-site-text-muted">
        {t('too-long', {
          defaultValue: 'Too long to compare',
        })}
      </p>
    );
  }
  if (diff.identical) {
    return (
      <p className="t-body text-site-text-muted">
        {t('identical', {
          defaultValue: 'No differences',
        })}
      </p>
    );
  }
  return (
    <div>
      <p className="t-meta pb-2">
        {t('diff-summary', {
          defaultValue: '{{added}} added, {{removed}} removed',
          added: diff.summary.added,
          removed: diff.summary.removed,
        })}
      </p>
      <ol className="border-t border-b border-site-border py-2">
        {diff.entries.map((e, i) => {
          if (e.op === 'gap') {
            return (
              <li key={i} className="t-meta py-1 ps-6">
                {t('unchanged-lines', {
                  defaultValue: '{{lines}} unchanged lines',
                  lines: e.count,
                })}
              </li>
            );
          }
          const added = e.op === 'insert';
          const removed = e.op === 'delete';
          return (
            <li
              key={i}
              className={
                'flex gap-2 font-mono t-body break-words whitespace-pre-wrap ' +
                (added ? 'text-site-success' : removed ? 'text-site-danger' : 'text-site-text')
              }
            >
              <span className="w-4 shrink-0 text-center" aria-hidden>
                {added ? '+' : removed ? '−' : ' '}
              </span>
              <span className="sr-only">
                {added
                  ? t('line-added', {
                      defaultValue: 'Added line',
                    })
                  : removed
                    ? t('line-removed', {
                        defaultValue: 'Removed line',
                      })
                    : t('line-unchanged', {
                        defaultValue: 'Unchanged line',
                      })}
              </span>
              <span className="min-w-0 flex-1">{e.text === '' ? ' ' : e.text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
