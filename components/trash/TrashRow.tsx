'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, MessageSquare, RotateCcw, StickyNote, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TrashItem } from '@/lib/trash/types';
import { DELETED_POST_GRACE_MS } from '@/lib/media/sweep-policy';
import { refusalCopy } from '@/components/trash/copy';

interface TrashRowProps {
  item: TrashItem;
  busy: boolean;
  onRestore: (item: TrashItem) => void;
  onPurge: (item: TrashItem) => void;
}

/**
 * One row of the bin.
 *
 * `.glass-fill` (L1), never `.glass-pane`: these are repeated list items and the
 * blur budget is **zero** on repeated surfaces. The actions are full-height
 * `Button`s at the default size, which is the 44px touch target — a `sm` button
 * here would be 36px and fail on a phone, which is where a mis-tapped Delete is
 * most likely to have happened in the first place.
 */
export function TrashRow({ item, busy, onRestore, onPurge }: TrashRowProps) {
  const { t } = useTranslation('settings-content');
  const reasons = refusalCopy(t);
  const Icon = item.kind === 'post' ? StickyNote : MessageSquare;

  const daysLeft =
    item.daysRemaining > 0
      ? t('trash-days-left', {
          count: item.daysRemaining,
          defaultValue: '{{count}} days left',
        })
      : t('trash-expired', { defaultValue: 'Recovery window passed' });

  // The media sweep reclaims a soft-deleted post's images after
  // DELETED_POST_GRACE_MS (7 days), which is far shorter than either retention
  // window — so past that point the text restores and the pictures do not. Say
  // so rather than letting the restore be a quiet disappointment.
  const mediaLikelyGone =
    item.kind === 'post' &&
    (item.imageCount ?? 0) > 0 &&
    Date.now() - Date.parse(item.deletedAt) > DELETED_POST_GRACE_MS;

  return (
    <li className="glass-fill rounded-site p-4">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-site-text-dim" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm break-words text-site-text">
              {item.excerpt ||
                t('trash-no-text', { defaultValue: '(no text — media or poll only)' })}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge size="sm" variant={item.daysRemaining > 3 ? 'default' : 'warning'}>
                {daysLeft}
              </Badge>
              <span className="text-xs text-site-text-dim">
                {t('trash-deleted-on', {
                  date: new Date(item.deletedAt).toLocaleDateString(),
                  defaultValue: 'Deleted {{date}}',
                })}
              </span>
              {item.kind === 'post' && (item.imageCount ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-site-text-dim">
                  <ImageIcon className="size-3" aria-hidden />
                  {item.imageCount}
                </span>
              ) : null}
              {item.kind === 'comment' && item.postId ? (
                <Link
                  to="/thread/$rootId"
                  params={{ rootId: item.postId }}
                  className="text-xs text-site-accent hover:underline"
                >
                  {t('trash-view-thread', { defaultValue: 'View thread' })}
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {!item.restorable && item.reason ? (
          <p className="text-xs text-site-text-muted">{reasons[item.reason]}</p>
        ) : null}

        {mediaLikelyGone ? (
          <p className="text-xs text-site-warning">
            {t('trash-media-reclaimed', {
              defaultValue:
                'The images on this post have probably been cleared already — the text will come back without them.',
            })}
          </p>
        ) : null}

        {/* Stacks on a 360px phone and sits inline from `xs` up, so neither
            action is ever clipped or forced into a horizontal scroll. */}
        <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:justify-end">
          <Button
            variant="secondary"
            onClick={() => onRestore(item)}
            disabled={busy || !item.restorable}
          >
            <RotateCcw aria-hidden />
            {t('trash-restore', { defaultValue: 'Restore' })}
          </Button>
          <Button variant="ghost" onClick={() => onPurge(item)} disabled={busy}>
            <Trash2 aria-hidden />
            {t('trash-purge', { defaultValue: 'Delete forever' })}
          </Button>
        </div>
      </div>
    </li>
  );
}
