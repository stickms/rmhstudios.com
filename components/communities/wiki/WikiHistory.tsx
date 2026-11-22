/**
 * A wiki page's history (s09-04): edits as rows on rules, newest first.
 *
 * A revision row is the text BEFORE its editor's change, carrying that editor's name and summary, so each row is
 * presented as what it is: "Before this edit" opens that snapshot read-only, and the page itself is the "after" of the
 * newest row. "Restore this version" (for editors) puts that text back as a new edit; nothing is ever erased.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { DocBody } from '@/components/communities/DocEditor';
import { useWikiText } from '@/components/communities/wiki/useWikiText';
import { listCommunityPageRevisionsApi, rollbackCommunityPageApi } from '@/lib/communities/pages.contract';

interface WikiHistoryProps {
  pageId: string;
  /** The page's current `updatedAt`: what a restore is based on. */
  updatedAt: string;
  canEdit: boolean;
}

export function WikiHistory({ pageId, updatedAt, canEdit }: WikiHistoryProps) {
  const { t } = useTranslation('community-wiki');
  const fmt = useLocaleFormat();
  const router = useRouter();
  const confirm = useConfirm();
  const { failureText } = useWikiText();
  const [open, setOpen] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const history = useQuery(apiQuery(listCommunityPageRevisionsApi, { params: { id: pageId } }));
  const revisions = history.data?.revisions;
  const arrival = useArrival(revisions !== undefined);

  if (history.isError) {
    return (
      <EmptyState
        title={t('history-error-title', { defaultValue: "Couldn't load the history" })}
        action={
          <Button variant="ghost" onClick={() => void history.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        }
      />
    );
  }
  if (!revisions) {
    return (
      <div className="space-y-3 py-4" aria-busy="true">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    );
  }
  if (revisions.length === 0) {
    return (
      <EmptyState
        className={arrival}
        title={t('history-empty-title', { defaultValue: 'No edits yet' })}
        description={t('history-empty-body', { defaultValue: 'This page is as it was first written.' })}
      />
    );
  }

  const restore = async (revisionId: string) => {
    const ok = await confirm({
      title: t('restore-confirm-title', { defaultValue: 'Restore this version?' }),
      description: t('restore-confirm-body', {
        defaultValue: 'The page goes back to this text. The current text stays in the history.',
      }),
      confirmLabel: t('restore-confirm', { defaultValue: 'Restore' }),
    });
    if (!ok) return;
    setRestoring(revisionId);
    try {
      await api(rollbackCommunityPageApi, {
        params: { id: pageId },
        body: { revisionId, baseUpdatedAt: updatedAt },
      });
      toast.success(t('restored', { defaultValue: 'Version restored' }));
      await router.invalidate();
      await history.refetch();
    } catch (error) {
      toast.error(failureText(error));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className={arrival}>
      <p className="t-meta py-3">
        {t('history-note', {
          defaultValue: 'Newest first. Each row shows the page as it was before that edit.',
        })}
      </p>
      <ol>
        {revisions.map((revision, index) => {
          const shown = open === revision.id;
          const editorName = revision.editor?.name ?? revision.editor?.handle;
          return (
            <li key={revision.id} className="border-b border-site-border py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="t-body">
                  <bdi className="font-medium">{editorName ?? t('deleted-user', { defaultValue: 'Deleted user' })}</bdi>{' '}
                  <span className="text-site-text-muted">
                    {revision.summary ?? t('no-summary', { defaultValue: 'No summary' })}
                  </span>
                </p>
                <time className="t-meta" dateTime={revision.createdAt}>
                  {fmt.dateTime(revision.createdAt)}
                </time>
              </div>
              {index === 0 ? (
                <p className="t-meta mt-1">
                  {t('after-current', { defaultValue: 'After this edit: the page as it reads now' })}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={shown}
                  onClick={() => setOpen(shown ? null : revision.id)}
                >
                  {shown
                    ? t('hide-before', { defaultValue: 'Hide' })
                    : t('view-before', { defaultValue: 'Before this edit' })}
                </Button>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={restoring === revision.id}
                    onClick={() => void restore(revision.id)}
                  >
                    {t('restore', { defaultValue: 'Restore this version' })}
                  </Button>
                ) : null}
              </div>
              {shown ? (
                <div className="mt-3 border-l border-site-border pl-4">
                  <DocBody body={revision.body} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
