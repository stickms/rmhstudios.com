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
import { usePopPresence } from '@/hooks/usePopPresence';
import { cn } from '@/lib/utils';

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
}

export function RMHarkActions({ item, onUpdate, className }: RMHarkActionsProps) {
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
 // The shared bloom (globals.css §7.1) — held mounted for its close.
 const { present: repostPresent, state: repostState } = usePopPresence(repostMenu);
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
 // §15.4 — the four controls are distributed across the FULL width of the
 // post, not packed into fixed columns inside a `max-w-md` box. The old grid
 // pinned each control's left edge (so a growing count could not shift its
 // neighbours) but it bought that with a row that stopped short of the card:
 // three icons evenly spaced, then Views alone against the grid's right edge,
 // which read as one icon flung away from the other three.
 //
 // The stability it protected is worth less than it looks: a count moves by
 // one, on the control the viewer just pressed, and `justify-between` spreads
 // that fraction across three gaps of ~100px. `-mx-2` cancels the pills' own
 // padding so the first and last icons line up with the text above them
 // rather than sitting inset from it.
 <div className={cn('flex w-full items-center justify-between -mx-2', className)}>
 {/* Comment */}
 <button
 onClick={handleCommentClick}
 title={t('comment', { defaultValue:'Comment'})}
 aria-label={t('comment', { defaultValue:'Comment'})}
 className="group flex min-h-11 min-w-11 items-center rounded-full text-site-text-muted hover:text-site-accent transition-colors duration-site-fast"
 >
 <span className={`${engagementPill} h-9 gap-0.5 px-2 sm:gap-1 sm:px-2.5 group-hover:bg-site-accent-dim/50 group-active:scale-95`}>
 <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform"aria-hidden />
 <EngagementCount value={item.commentCount} />
 </span>
 </button>

 {/* reRMHark */}
 <div className="relative"ref={repostRef}>
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
 className={`group flex min-h-11 min-w-11 items-center rounded-full transition-colors duration-site-fast ${
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
 {repostPresent && (
 <div
 ref={repostPanelRef}
 data-motion="pop"
 data-state={repostState}
 role="menu"
 tabIndex={-1}
 className="absolute left-0 top-full mt-1 w-40 origin-top-left glass-overlay py-1 z-50"
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
 className={`group flex min-h-11 min-w-11 items-center rounded-full transition-colors duration-site-fast ${
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

 {/* Views. Last in the row and therefore against its right edge, which is
 also where it wants to be: this is the largest number on the row
 ("18.4K") and the only one nothing the viewer taps can change. */}
 <div className="flex min-h-11 items-center text-site-text-dim">
 <span className={`${engagementPill} h-9 gap-0.5 px-2 sm:gap-1 sm:px-2.5`}>
 <Eye className="w-4 h-4"/>
 <EngagementCount value={item.viewCount} />
 </span>
 </div>
 </div>
 );
}
