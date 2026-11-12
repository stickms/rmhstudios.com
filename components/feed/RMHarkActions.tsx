import { Repeat, PenSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useState, useRef } from 'react';
import { useFeedStore } from '@/stores/feedStore';
import { useSession } from '@/components/Providers';
import type { FeedItem } from '@/lib/feed-types';

// Quote-compose modal — only opens on the"quote"repost action, so it's
// code-split out of the initial feed chunk and imported on first open.
const ComposeModal = lazy(() =>
  import('./ComposeModal').then((m) => ({ default: m.ComposeModal })),
);
// Quotes view (X10) — its own chunk, fetched the first time "View quotes" is picked.
const QuotesDialog = lazy(() =>
  import('./QuotesDialog').then((m) => ({ default: m.QuotesDialog })),
);
import { QuotesMenuItem } from './QuotesMenuItem';
import { useTranslation } from 'react-i18next';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { useSignInPrompt } from '@/hooks/useSignInPrompt';
import { formatCount } from './format-count';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import { likePostApi, repostPostApi } from '@/lib/feed/rmhark-actions.contract';
import { api } from '@/lib/contract/client';

interface RMHarkActionsProps {
  item: FeedItem;
  onUpdate?: (id: string, updates: Partial<FeedItem>) => void;
  /**
   * Spacing from whatever sits above, supplied by the host.
   *
   * The row used to carry its own `mt-3`, which is wrong for a shared component:
   * the wheel card places it in a flex column that ALREADY has a gap, so the two
   * stacked and the toolbar sat twice as far from the post as it should.
   */
  className?: string;
  /** Where "Reply" goes. A feed row opens the post; the post page itself focuses its reply field instead. */
  onReply?: () => void;
}

export function RMHarkActions({ item, onUpdate, className, onReply }: RMHarkActionsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('feed');
  // Select just the action (a stable reference) so this component doesn't
  // re-render on every unrelated feed-store change.
  const storeUpdate = useFeedStore((s) => s.updateItem);
  // Shared root-level session (one subscription for the whole app).
  const { data: session } = useSession();
  const [repostMenu, setRepostMenu] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Latch so the quote modal stays mounted after first open (close animation).
  const quoteMounted = useRef(false);
  quoteMounted.current ||= quoteOpen;
  const [quotesOpen, setQuotesOpen] = useState(false);
  const quotesMounted = useRef(false);
  quotesMounted.current ||= quotesOpen;
  const repostBtnRef = useRef<HTMLButtonElement>(null);
  const { run: runLike } = useOptimisticAction();
  const { run: runRepost } = useOptimisticAction();
  const promptSignIn = useSignInPrompt();

  // Outside-press dismissal, Escape, focus return, the roving arrow keys and the
  // close animation all live in AnchoredMenu now. This file used to carry its own
  // copy of the first three — and, because the panel was an in-place
  // `absolute left-0 top-full … z-50`, it was measured inside `.radial-frame`'s
  // stacking context (pinned at z-index 1), so on a post near the top of the
  // column it painted UNDER the top bar. AnchoredMenu portals to <body>.

  const updateItem = onUpdate ?? storeUpdate;
  const actualId = item.actualId ?? item.id;

  const handleCommentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReply) {
      onReply();
      return;
    }
    navigate({ to: `/u/${item.user?.handle || item.user?.id}/post/${actualId}` });
  };

  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) {
      promptSignIn(t('like-sign-in', { defaultValue: 'Sign in to like RMHarks.' }));
      return;
    }
    const wasLiked = item.liked;
    const prevCount = item.likeCount;
    runLike({
      apply: () =>
        updateItem(item.id, {
          liked: !wasLiked,
          likeCount: (item.likeCount ?? 0) + (wasLiked ? -1 : 1),
        }),
      rollback: () => updateItem(item.id, { liked: wasLiked, likeCount: prevCount }),
      commit: () => api(likePostApi, { params: { id: actualId } }),
    });
  };

  const toggleRepost = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!session) {
      promptSignIn(t('rermhark-sign-in', { defaultValue: 'Sign in to reRMHark.' }));
      return;
    }
    const wasReposted = item.reposted;
    const prevCount = item.repostCount;
    runRepost({
      apply: () =>
        updateItem(item.id, {
          reposted: !wasReposted,
          repostCount: (item.repostCount ?? 0) + (wasReposted ? -1 : 1),
        }),
      rollback: () => updateItem(item.id, { reposted: wasReposted, repostCount: prevCount }),
      commit: () => api(repostPostApi, { params: { id: actualId } }),
    });
  };

  const repostLabel = t('action-repost', { defaultValue: 'Repost' });

  // K8 (Steel): plain muted 13px words, 18px apart. "On" is ink at weight 600 (A2), never a colour. No icons, no
  // counter animation: a count is the plain number beside the word. Each word keeps a 44px hit area (A3) through the
  // stylesheet's ::after, so the row can sit as tight as the plan says.
  return (
    <div className={cn('feed-actions', className)}>
      <button
        type="button"
        onClick={toggleLike}
        aria-pressed={!!item.liked}
        data-on={item.liked ? '' : undefined}
        className="feed-action"
      >
        {t('like', { defaultValue: 'Like' })}
        <ActionCount value={item.likeCount} />
      </button>

      <div className="relative">
        <button
          ref={repostBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Every item in this menu needs an account, so a signed-out visitor gets
            // the prompt at the trigger instead of a menu that dead-ends.
            if (!session) {
              promptSignIn(t('rermhark-sign-in', { defaultValue: 'Sign in to reRMHark.' }));
              return;
            }
            setRepostMenu((v) => !v);
          }}
          data-on={item.reposted ? '' : undefined}
          className="feed-action"
          aria-haspopup="menu"
          aria-expanded={repostMenu}
        >
          {repostLabel}
          <ActionCount value={item.repostCount} />
          {item.reposted && (
            <span className="sr-only">{t('action-reposted', { defaultValue: 'Reposted' })}</span>
          )}
        </button>
        <AnchoredMenu
          open={repostMenu}
          onClose={() => setRepostMenu(false)}
          anchorRef={repostBtnRef}
          align="start"
          // Named after its trigger, so the panel's accessible name is not English-only.
          label={repostLabel}
          // Wide enough that "Undo repost" does not truncate inside the panel's own padding.
          className="w-48"
        >
          <MenuItem
            icon={Repeat}
            onSelect={() => {
              setRepostMenu(false);
              toggleRepost();
            }}
          >
            {item.reposted ? t('action-undo-repost', { defaultValue: 'Undo repost' }) : repostLabel}
          </MenuItem>
          <MenuItem
            icon={PenSquare}
            onSelect={() => {
              setRepostMenu(false);
              setQuoteOpen(true);
            }}
          >
            {t('quote', { defaultValue: 'Quote' })}
          </MenuItem>
          {(item.repostCount ?? 0) > 0 && (
            <QuotesMenuItem
              onSelect={() => {
                setRepostMenu(false);
                setQuotesOpen(true);
              }}
            />
          )}
        </AnchoredMenu>
      </div>

      {quoteMounted.current && (
        <Suspense fallback={null}>
          <ComposeModal
            open={quoteOpen}
            onClose={() => setQuoteOpen(false)}
            quoteItem={{ id: item.actualId ?? item.id, content: item.content, user: item.user }}
          />
        </Suspense>
      )}

      {quotesMounted.current && (
        <Suspense fallback={null}>
          <QuotesDialog
            open={quotesOpen}
            onClose={() => setQuotesOpen(false)}
            postId={item.actualId ?? item.id}
          />
        </Suspense>
      )}

      <button type="button" onClick={handleCommentClick} className="feed-action">
        {t('reply', { defaultValue: 'Reply' })}
        <ActionCount value={item.commentCount} />
      </button>

      {/* Views are a fact, not an action: metadata at the inline end of the row, in `t-meta`. */}
      {(item.viewCount ?? 0) > 0 && (
        <span className="feed-actions__views t-meta">
          {t('post-views', { n: formatCount(item.viewCount), defaultValue: '{{n}} views' })}
        </span>
      )}
    </div>
  );
}

/** The plain number beside an action word. Nothing at zero, and no animation (K8). */
function ActionCount({ value }: { value: number | undefined }) {
  const text = formatCount(value);
  return text ? <span className="feed-action__count">{text}</span> : null;
}
