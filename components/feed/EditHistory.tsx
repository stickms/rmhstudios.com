'use client';

/**
 * Public edit history (F23).
 *
 * `RMHarkEdit` rows were already being written on every edit; the reader's only
 * signal was an inert "edited" word. This turns that word into the affordance
 * it always looked like — click it, see exactly what changed.
 *
 * Accessibility is the whole design constraint here. Rendering a removal as
 * grey `line-through` text and an addition as a tint is invisible to a
 * colour-blind reader and *silent* to a screen reader — the two audiences most
 * dependent on knowing a quote was altered. So every run carries three signals
 * at once: the semantic element (`<del>` / `<ins>`, which assistive tech
 * announces), a non-colour decoration (strike vs underline), and only then a
 * token tint.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { diffWords, diffStat, type PostVersion } from '@/lib/feed/word-diff';
import { cn, relativeTimeShort } from '@/lib/utils';

interface HistoryResponse {
  postId: string;
  versions: PostVersion[];
}

/**
 * One version rendered as its diff against the version before it. The oldest
 * version has no predecessor, so it renders as plain text under an "original"
 * label rather than as a diff of everything-inserted.
 */
function VersionDiff({
  previous,
  version,
  index,
  total,
}: {
  previous: PostVersion | null;
  version: PostVersion;
  index: number;
  total: number;
}) {
  const { t } = useTranslation('feed');
  const parts = previous ? diffWords(previous.content, version.content) : [];
  const stat = previous ? diffStat(parts) : { added: 0, removed: 0 };
  const isCurrent = index === total - 1;

  return (
    <li className="glass-inset rounded-site p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-site-text-muted">
        <span className="font-semibold text-site-text">
          {previous
            ? isCurrent
              ? t('edit-history-current', { defaultValue: 'Current version' })
              : t('edit-history-revision', { defaultValue: 'Revision' })
            : t('edit-history-original', { defaultValue: 'Original' })}
        </span>
        <RelativeTime date={version.at} format={relativeTimeShort} />
        {previous && (stat.added > 0 || stat.removed > 0) ? (
          <span className="font-mono">
            {t('edit-history-stat', {
              defaultValue: '+{{added}} / −{{removed}} words',
              added: stat.added,
              removed: stat.removed,
            })}
          </span>
        ) : null}
      </div>

      <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-site-text">
        {previous ? (
          parts.map((part, i) => {
            if (part.op === 'equal') return <span key={i}>{part.value}</span>;
            if (part.op === 'insert') {
              return (
                <ins
                  key={i}
                  className="bg-site-success/15 text-site-success underline decoration-2 underline-offset-2"
                >
                  <span className="sr-only">
                    {t('edit-history-added', { defaultValue: 'added:' })}{' '}
                  </span>
                  {part.value}
                </ins>
              );
            }
            return (
              <del key={i} className="bg-site-danger/10 text-site-danger line-through">
                <span className="sr-only">
                  {t('edit-history-removed', { defaultValue: 'removed:' })}{' '}
                </span>
                {part.value}
              </del>
            );
          })
        ) : (
          <span>{version.content}</span>
        )}
      </p>
    </li>
  );
}

export function EditHistoryDialog({
  postId,
  open,
  onOpenChange,
}: {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('feed');
  const [versions, setVersions] = useState<PostVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/rmharks/${postId}/history`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<HistoryResponse>) : Promise.reject()))
      .then((data) => {
        if (!cancelled) setVersions(data.versions);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" mobileFullscreen>
        <DialogTitle>{t('edit-history-title', { defaultValue: 'Edit history' })}</DialogTitle>
        <DialogDescription>
          {t('edit-history-description', {
            defaultValue: 'Every version of this post, oldest first.',
          })}
        </DialogDescription>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : failed || !versions ? (
          <EmptyState
            icon={History}
            title={t('edit-history-unavailable', { defaultValue: 'History unavailable' })}
            description={t('edit-history-unavailable-detail', {
              defaultValue: 'This post has no readable history right now.',
            })}
          />
        ) : (
          <ol className="space-y-2">
            {versions.map((version, i) => (
              <VersionDiff
                key={`${version.at}-${i}`}
                previous={i === 0 ? null : versions[i - 1]}
                version={version}
                index={i}
                total={versions.length}
              />
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The inline "edited" marker, now a button.
 *
 * It sits inside clickable post cards, so the click is stopped from reaching
 * the card's own navigation — otherwise opening the history would also open the
 * post underneath it.
 */
export function EditHistoryButton({ postId, className }: { postId: string; className?: string }) {
  const { t } = useTranslation('feed');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn(
          'shrink-0 rounded-site-sm text-site-text-dim transition-colors hover:text-site-text',
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        aria-label={t('edit-history-open', { defaultValue: 'View edit history' })}
      >
        · {t('edited', { defaultValue: 'edited' })}
      </button>
      {open ? <EditHistoryDialog postId={postId} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
