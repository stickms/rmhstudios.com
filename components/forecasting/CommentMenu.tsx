// A market comment's menu (s15-05). Its own file so `pnpm i18n:extract` files its strings under `prediction-comments`
// rather than MarketPanel's `f-forecasting`.
import { lazy, Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { deletePredictionCommentApi } from '@/lib/predictions/predictions.contract';
import type { Comment } from './MarketPanel';

// The report dialog carries the report schema (zod), so it loads when a member opens it and not with the market.
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

/**
 * The three dots on one comment: Delete for its author (and an admin, after a confirmation), Report for everyone
 * else who is signed in. Each comment owns its trigger, so the menu hangs off the right row.
 */
export function CommentMenu({
  comment,
  own,
  admin,
  onDeleted,
}: {
  comment: Comment;
  own: boolean;
  admin: boolean;
  onDeleted: (id: string) => void;
}) {
  const { t } = useTranslation('prediction-comments');
  const confirm = useConfirm();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function remove() {
    setOpen(false);
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this comment?' }),
      description: t('delete-body', { defaultValue: 'It is removed for everyone and cannot be brought back.' }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deletePredictionCommentApi, { params: { id: comment.id } });
      onDeleted(comment.id);
    } catch {
      toast.error(t('delete-failed', { defaultValue: 'Could not delete the comment' }));
    }
  }

  const label = t('comment-actions', { defaultValue: 'Comment actions' });
  return (
    <>
      <Button
        ref={anchorRef}
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal aria-hidden />
      </Button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label={label} className="w-44">
        {!own && (
          <MenuItem
            icon={Flag}
            onSelect={() => {
              setOpen(false);
              setReporting(true);
            }}
          >
            {t('report', { defaultValue: 'Report' })}
          </MenuItem>
        )}
        {(own || admin) && (
          <MenuItem icon={Trash2} tone="danger" onSelect={() => void remove()}>
            {t('delete', { defaultValue: 'Delete' })}
          </MenuItem>
        )}
      </AnchoredMenu>
      {reporting && (
        <Suspense fallback={null}>
          <ReportDialog open onOpenChange={setReporting} entityType="prediction-comment" entityId={comment.id} />
        </Suspense>
      )}
    </>
  );
}
