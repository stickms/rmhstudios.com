'use client';

import { MessageCircle, Repeat2, Heart, Eye, Repeat, PenSquare } from'lucide-react';
import { useNavigate } from'@tanstack/react-router';
import { lazy, Suspense, useState, useRef, useEffect } from'react';
import { useFeedStore } from'@/stores/feedStore';
import { useSession } from'@/components/Providers';
import type { FeedItem } from'@/lib/feed-types';

// Quote-compose modal — only opens on the"quote"repost action, so it's
// code-split out of the initial feed chunk and imported on first open.
const ComposeModal = lazy(() =>
 import('./ComposeModal').then((m) => ({ default: m.ComposeModal })),
);
import { useTranslation } from'react-i18next';
import { useOptimisticAction } from'@/hooks/useOptimisticAction';
import { useSignInPrompt } from'@/hooks/useSignInPrompt';
import { EngagementCount, engagementPill } from'./EngagementCount';
import { useLiquidPop } from'@/components/ui/liquid-pop';

interface RMHarkActionsProps {
 item: FeedItem;
 onUpdate?: (id: string, updates: Partial<FeedItem>) => void;
}

export function RMHarkActions({ item, onUpdate }: RMHarkActionsProps) {
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
 const repostRef = useRef<HTMLDivElement>(null);
 const repostBtnRef = useRef<HTMLButtonElement>(null);
 // The button also spans the count slot, so the menu buds off the round icon
 // surface instead — that circle is what reads as the trigger on screen.
 const repostIconRef = useRef<HTMLSpanElement>(null);
 const repostPanelRef = useRef<HTMLDivElement>(null);
 // §15.6 liquid pop — the reRMHark menu buds out of its trigger.
 const { underlay: repostUnderlay } = useLiquidPop({
 triggerRef: repostIconRef,
 panelRef: repostPanelRef,
 open: repostMenu,
 });
 const { run: runLike } = useOptimisticAction();
 const { run: runRepost } = useOptimisticAction();
 const promptSignIn = useSignInPrompt();

 useEffect(() => {
 if (!repostMenu) return;
 const onClick = (e: MouseEvent) => {
 if (repostRef.current && !repostRef.current.contains(e.target as Node)) setRepostMenu(false);
 };
 // Escape closes and returns focus to the trigger. Capture phase so the
 // panel's own stopPropagation can't swallow it (see RMHarkOverflowMenu).
 const onKey = (e: KeyboardEvent) => {
 if (e.key !== 'Escape') return;
 setRepostMenu(false);
 repostBtnRef.current?.focus();
 };
 document.addEventListener('mousedown', onClick);
 document.addEventListener('keydown', onKey, true);
 return () => {
 document.removeEventListener('mousedown', onClick);
 document.removeEventListener('keydown', onKey, true);
 };
 }, [repostMenu]);

 const updateItem = onUpdate ?? storeUpdate;
 const actualId = item.actualId ?? item.id;

 const handleCommentClick = (e: React.MouseEvent) => {
 e.stopPropagation();
 navigate({ to: `/u/${item.user?.handle || item.user?.id}/post/${actualId}`});
 };

 const toggleLike = (e: React.MouseEvent) => {
 e.stopPropagation();
 if (!session) {
 promptSignIn(t('like-sign-in', { defaultValue:'Sign in to like RMHarks.'}));
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
 commit: () => fetch(`/api/rmharks/${actualId}/like`, { method:'POST'}),
 });
 };

 const toggleRepost = (e?: React.MouseEvent) => {
 e?.stopPropagation();
 if (!session) {
 promptSignIn(t('rermhark-sign-in', { defaultValue:'Sign in to reRMHark.'}));
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
 commit: () => fetch(`/api/rmharks/${actualId}/repost`, { method:'POST'}),
 });
 };

 return (
 // §15.4 — fixed columns rather than `justify-between`, so each control's
 // left edge is pinned. The pills hug their contents, so their widths change
 // as counts appear and grow; spacing them by distributing free space would
 // let that ripple sideways into every other icon in the row.
 <div className="grid grid-cols-4 items-center mt-3 -ml-2 max-w-md">
 {/* Comment */}
 <button
 onClick={handleCommentClick}
 title={t('comment', { defaultValue:'Comment'})}
 aria-label={t('comment', { defaultValue:'Comment'})}
 className="group flex min-h-11 min-w-11 items-center justify-self-start rounded-full text-site-text-muted hover:text-site-accent transition-colors duration-150"
 >
 <span className={`${engagementPill} h-9 gap-0.5 px-2 sm:gap-1 sm:px-2.5 group-hover:bg-site-accent-dim/50 group-active:scale-95`}>
 <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform"aria-hidden />
 <EngagementCount value={item.commentCount} />
 </span>
 </button>

 {/* reRMHark */}
 <div className="relative justify-self-start"ref={repostRef}>
 {repostUnderlay}
 <button
 ref={repostBtnRef}
 onClick={(e) => {
 e.stopPropagation();
 // Every item in this menu needs an account, so a signed-out visitor gets
 // the prompt at the trigger instead of a menu that dead-ends.
 if (!session) {
 promptSignIn(t('rermhark-sign-in', { defaultValue:'Sign in to reRMHark.'}));
 return;
 }
 setRepostMenu((v) => !v);
 }}
 className={`group flex min-h-11 min-w-11 items-center rounded-full transition-colors duration-150 ${
 item.reposted ?'text-site-success':'text-site-text-muted hover:text-site-success'
 }`}
 title="reRMHark"
 aria-label="reRMHark"
 aria-haspopup="menu"
 aria-expanded={repostMenu}
 >
 <span
 ref={repostIconRef}
 className={`${engagementPill} h-9 gap-0.5 px-2 sm:gap-1 sm:px-2.5 group-hover:bg-site-success/10 group-active:scale-95`}
 >
 <Repeat2 className="w-4 h-4 group-hover:scale-110 transition-transform"aria-hidden />
 <EngagementCount value={item.repostCount} />
 </span>
 </button>
 {repostMenu && (
 <div
 ref={repostPanelRef}
 role="menu"
 tabIndex={-1}
 className="absolute left-0 top-full mt-1 w-40 bg-site-surface border border-site-border rounded-site shadow-site-sm py-1 z-30"
 onClick={(e) => e.stopPropagation()}
 >
 <button
 type="button"
 role="menuitem"
 onClick={() => {
 setRepostMenu(false);
 toggleRepost();
 }}
 className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <Repeat className="w-4 h-4 text-site-text-dim"/>
 {item.reposted
 ? t('undo-rermhark', { defaultValue:'Undo reRMHark'})
 : t('rermhark', { defaultValue:'reRMHark'})}
 </button>
 <button
 type="button"
 role="menuitem"
 onClick={() => {
 setRepostMenu(false);
 setQuoteOpen(true);
 }}
 className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <PenSquare className="w-4 h-4 text-site-text-dim"/>
 {t('quote', { defaultValue:'Quote'})}
 </button>
 </div>
 )}
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

 {/* Like */}
 <button
 onClick={toggleLike}
 aria-pressed={!!item.liked}
 className={`group flex min-h-11 min-w-11 items-center justify-self-start rounded-full transition-colors duration-150 ${
 item.liked ?'text-site-danger':'text-site-text-muted hover:text-site-danger'
 }`}
 title={
 item.liked
 ? t('unlike', { defaultValue:'Unlike'})
 : t('like', { defaultValue:'Like'})
 }
 aria-label={
 item.liked
 ? t('unlike', { defaultValue:'Unlike'})
 : t('like', { defaultValue:'Like'})
 }
 >
 <span className={`${engagementPill} h-9 gap-0.5 px-2 sm:gap-1 sm:px-2.5 group-hover:bg-site-danger/10 group-active:scale-95`}>
 <Heart
 className={`w-4 h-4 group-hover:scale-110 transition-transform ${item.liked ?'fill-current':''}`}
 aria-hidden
 />
 <EngagementCount value={item.likeCount} />
 </span>
 </button>

 {/* Views — pinned to the row's RIGHT edge rather than its column's left.
 The pills hug their counts and the view count is the largest number on
 the row ("18.4K"), so a left-pinned last column let this pill grow out
 past the end of the row on a 320px screen. Nothing the viewer taps
 changes this count, so anchoring the far side costs no stability. */}
 <div className="flex min-h-11 items-center justify-self-end text-site-text-dim">
 <span className={`${engagementPill} h-9 gap-0.5 px-2 sm:gap-1 sm:px-2.5`}>
 <Eye className="w-4 h-4"/>
 <EngagementCount value={item.viewCount} />
 </span>
 </div>
 </div>
 );
}
