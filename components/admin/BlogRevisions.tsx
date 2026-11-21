/**
 * Revisions panel for the Log editor (s03-05): the saved versions of a Log, newest first, with a line diff of the
 * selected one against the text in the editor and a Restore that loads it into the editor. Restoring changes
 * nothing on the server: the restored text becomes current only when the Log is saved, and then it is a new
 * revision on top of the list.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { getBlogRevisionApi, listBlogRevisionsApi } from '@/lib/admin/blog-revisions.contract';
import type { RevisionDetail } from '@/lib/blog/publication.server';
import { diffLines, splitLines, summarise } from '@/lib/toolbox/diff';

/** Changed lines shown for one revision; the rest are counted, not drawn. */
const MAX_DIFF_LINES = 300;

export interface RevisionPanelCurrent {
  title: string;
  description: string;
  /** The tags field as typed: comma-separated. */
  tags: string;
  content: string;
}

interface Props {
  slug: string;
  /** The editor's text right now: what the diff compares against. */
  current: RevisionPanelCurrent;
  onRestore: (revision: RevisionDetail) => void;
}

export function BlogRevisions({ slug, current, onRestore }: Props) {
  const { t } = useTranslation('log-drafts');
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'blog-revisions', slug],
    queryFn: () =>
      api(listBlogRevisionsApi, {
        params: {
          slug,
        },
      }),
    staleTime: 0,
  });
  const detail = useQuery({
    queryKey: ['admin', 'blog-revision', slug, selected],
    queryFn: () =>
      api(getBlogRevisionApi, {
        params: {
          slug,
          id: selected ?? '',
        },
      }),
    enabled: selected !== null,
    staleTime: Infinity,
  });
  const arrive = useArrival(!list.isPending);

  const revisions = list.data?.revisions ?? [];

  return (
    <section aria-labelledby="blog-revisions-heading" className="mt-6 border-t border-site-border pt-4">
      <h3 id="blog-revisions-heading" className="t-heading text-site-text">
        {t('revisions-heading', {
          defaultValue: 'Revisions',
        })}
      </h3>
      <p className="t-meta mt-1">
        {t('revisions-help', {
          defaultValue: 'Every save that changes the text keeps a version. The latest 50 are kept.',
        })}
      </p>

      {list.isPending ? (
        <div
          className="mt-3 space-y-2"
          role="status"
          aria-label={t('revisions-loading', {
            defaultValue: 'Loading revisions',
          })}
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : list.isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
          <p className="t-body text-site-danger">
            {t('revisions-error', {
              defaultValue: 'Could not load the revisions.',
            })}
          </p>
          <Button type="button" size="sm" onClick={() => void list.refetch()}>
            {t('revisions-retry', {
              defaultValue: 'Try again',
            })}
          </Button>
        </div>
      ) : revisions.length === 0 ? (
        <p className="t-body mt-3 text-site-text-muted">
          {t('revisions-empty', {
            defaultValue: 'No saved versions yet.',
          })}
        </p>
      ) : (
        <ul className={`mt-3 ${arrive ?? ''}`}>
          {revisions.map((rev) => {
            const open = selected === rev.id;
            return (
              <li key={rev.id} className="border-b border-site-border">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setSelected(open ? null : rev.id)}
                  className="flex min-h-9 w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-start pointer-coarse:min-h-11"
                >
                  <span className="t-body min-w-0 break-words text-site-text">
                    {new Date(rev.createdAt).toLocaleString()}
                    <span className="text-site-text-muted">
                      {' · '}
                      {rev.authorName ??
                        t('revisions-unknown-author', {
                          defaultValue: 'Unknown editor',
                        })}
                    </span>
                  </span>
                  <span className="t-meta">
                    {t('revisions-word-delta', {
                      defaultValue: '{{delta}} words',
                      delta: rev.wordDelta > 0 ? `+${rev.wordDelta}` : String(rev.wordDelta),
                    })}
                  </span>
                </button>
                {open ? (
                  <RevisionDetailView
                    loading={detail.isPending}
                    failed={detail.isError}
                    revision={detail.data?.revision ?? null}
                    current={current}
                    onRestore={onRestore}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RevisionDetailView({
  loading,
  failed,
  revision,
  current,
  onRestore,
}: {
  loading: boolean;
  failed: boolean;
  revision: RevisionDetail | null;
  current: RevisionPanelCurrent;
  onRestore: (revision: RevisionDetail) => void;
}) {
  const { t } = useTranslation('log-drafts');
  const arrive = useArrival(!loading);

  if (loading) return <Skeleton className="mb-3 h-24 w-full" />;
  if (failed || !revision) {
    return (
      <p role="alert" className="t-body mb-3 text-site-danger">
        {t('revision-error', {
          defaultValue: 'Could not load this version.',
        })}
      </p>
    );
  }

  // The version against the text in the editor: a `+` line is in the editor now and was not then, a `-` line was
  // in this version and is gone from the editor.
  const lines = diffLines(splitLines(revision.content), splitLines(current.content));
  const summary = summarise(lines);
  const changed = lines.filter((l) => l.op !== 'equal');
  const shown = changed.slice(0, MAX_DIFF_LINES);
  const metaDiffers =
    revision.title !== current.title ||
    revision.description !== current.description ||
    revision.tags.join(', ') !== current.tags;

  return (
    <div className={`mb-3 space-y-3 ${arrive ?? ''}`}>
      <p className="t-meta">
        {t('revision-summary', {
          defaultValue: 'Against the editor: lines added {{added}}, lines removed {{removed}}.',
          added: summary.added,
          removed: summary.removed,
        })}
      </p>
      {metaDiffers ? (
        <p className="t-meta">
          {t('revision-meta-differs', {
            defaultValue: 'The title, description or tags also differ from this version.',
          })}
        </p>
      ) : null}
      {changed.length === 0 ? (
        <p className="t-body text-site-text-muted">
          {t('revision-same-text', {
            defaultValue: 'The text is the same as in the editor.',
          })}
        </p>
      ) : (
        <pre
          tabIndex={0}
          aria-label={t('revision-diff-label', {
            defaultValue: 'Line changes',
          })}
          className="t-meta max-h-80 overflow-auto whitespace-pre-wrap break-words border-y border-site-border py-3"
        >
          {shown.map((line, i) => (
            <span key={i} className={`block ${line.op === 'insert' ? 'text-site-success' : 'text-site-danger'}`}>
              {line.op === 'insert' ? '+ ' : '- '}
              {line.text}
            </span>
          ))}
          {changed.length > shown.length ? (
            <span className="block text-site-text-muted">
              {t('revision-diff-more', {
                defaultValue: 'More changed lines not shown: {{more}}',
                more: changed.length - shown.length,
              })}
            </span>
          ) : null}
        </pre>
      )}
      <Button type="button" size="sm" onClick={() => onRestore(revision)}>
        {t('revision-restore', {
          defaultValue: 'Restore this version',
        })}
      </Button>
    </div>
  );
}
