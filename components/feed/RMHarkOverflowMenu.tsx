/**
 * Shared three-dots menu for a RMHark. Used by the home feed row (FeedRow, through
 * the lazy FeedRowMenu), the feed card (RMHarkCard) and the post-detail page
 * (PostDetail) so the three can't drift apart: every action (bookmark, reminder,
 * share, copy link, likes/reposts, insights, edit, pin, delete, tip, report, mute,
 * block) and its modal live here once.
 *
 * Two exports. `RMHarkOverflowPanel` is the menu and its dialogs, hung off a
 * trigger the caller owns; `RMHarkOverflowMenu` is the trigger (PostMenuTrigger,
 * the three dots) and the panel together. The home feed keeps only the trigger
 * in its own chunk and fetches the panel the first time a menu is opened.
 *
 * Translation is the one action left to the parent: the translated text is
 * rendered in the post body, which each surface lays out differently, so the
 * parent owns that state and passes a `translate`control for the menu item.
 */

import { lazy, Suspense, useRef, useState, type RefObject } from'react';
import {
 Heart,
 Repeat,
 Trash2,
 Share2,
 Link2,
 Flag,
 Ban,
 VolumeX,
 Bookmark,
 Coins,
 Pin,
 Pencil,
 Languages,
 TrendingUp,
 AlarmClock,
} from'lucide-react';
import { toast } from '@/lib/toast';
import { useTranslation } from'react-i18next';
import { useSession } from'@/components/Providers';
import { useOptimisticAction } from'@/hooks/useOptimisticAction';
import { useConfirm } from'@/components/ui/confirm-dialog';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { cn } from'@/lib/utils';
import { PostMenuTrigger } from './PostMenuTrigger';
import type { FeedItem } from'@/lib/feed-types';
import { bookmarkPostApi, pinPostApi, deletePostApi } from '@/lib/feed/rmhark-actions.contract';
import { api } from '@/lib/contract/client';
import { toggleBlockApi, toggleMuteApi } from '@/lib/moderation/moderation.contract';
import { HttpError, serverError } from '@/lib/http';

// These dialogs render only after a menu action — code-split so they stay out of
// the initial feed chunk and their (per-post) code isn't evaluated during
// hydration. Mounted lazily on first open (see the `mounted`latch below).
const ReportDialog = lazy(() =>
 import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);
const TipDialog = lazy(() =>
 import('@/components/economy/TipDialog').then((m) => ({ default: m.TipDialog })),
);
const EditPostModal = lazy(() =>
 import('./EditPostModal').then((m) => ({ default: m.EditPostModal })),
);
const EngagementListModal = lazy(() =>
 import('./EngagementListModal').then((m) => ({ default: m.EngagementListModal })),
);
const InsightsModal = lazy(() =>
 import('./InsightsModal').then((m) => ({ default: m.InsightsModal })),
);
const ShareModal = lazy(() => import('./ShareModal').then((m) => ({ default: m.ShareModal })));
const RemindMeDialog = lazy(() => import('@/components/reminders/RemindMeDialog'));

export interface RMHarkTranslateControl {
 translating: boolean;
 hasTranslation: boolean;
 showing: boolean;
 onToggle: () => void;
}

interface RMHarkOverflowShared {
 item: FeedItem;
 isAuthor: boolean;
 /** Sync count/content changes back to the surface (feed store, local state). */
 onUpdate?: (updates: Partial<FeedItem>) => void;
 /** Remove the post from view after delete/block/mute (feed removes the row;
 * the post page navigates away). */
 onRemove?: () => void;
 /** Optional translate menu item; the translated body is rendered by the parent. */
 translate?: RMHarkTranslateControl;
}

interface RMHarkOverflowMenuProps extends RMHarkOverflowShared {
 /** Extra classes for the positioned wrapper. */
 className?: string;
}

interface RMHarkOverflowPanelProps extends RMHarkOverflowShared {
 open: boolean;
 onClose: () => void;
 /** The trigger the menu hangs off and hands focus back to. */
 anchorRef: RefObject<HTMLElement | null>;
}

/** The trigger and the panel together: the post card and the post page. */
export function RMHarkOverflowMenu({ className, ...shared }: RMHarkOverflowMenuProps) {
 const { t } = useTranslation('feed');
 const [menuOpen, setMenuOpen] = useState(false);
 const triggerRef = useRef<HTMLButtonElement>(null);
 return (
 <div className={cn('relative', className)}>
 <PostMenuTrigger
 ref={triggerRef}
 label={t('post-actions', { defaultValue: 'Post actions' })}
 open={menuOpen}
 onClick={(e) => {
 e.stopPropagation();
 setMenuOpen((v) => !v);
 }}
 />
 <RMHarkOverflowPanel
 {...shared}
 open={menuOpen}
 onClose={() => setMenuOpen(false)}
 anchorRef={triggerRef}
 />
 </div>
 );
}

export function RMHarkOverflowPanel({
 item,
 isAuthor,
 onUpdate,
 onRemove,
 translate,
 open: menuOpen,
 onClose,
 anchorRef,
}: RMHarkOverflowPanelProps) {
 const { t } = useTranslation('feed');
 const confirm = useConfirm();
 // Shared root-level session (one subscription for the whole app).
 const { data: session } = useSession();
 const actualId = item.actualId ?? item.id;
 const targetUserId = item.user?.id;

 const setMenuOpen = (_open: false) => onClose();
 const [engagementModal, setEngagementModal] = useState<'likes'|'reposts'| null>(null);
 const [shareModalOpen, setShareModalOpen] = useState(false);
 const [reportOpen, setReportOpen] = useState(false);
 const [tipOpen, setTipOpen] = useState(false);
 const [editOpen, setEditOpen] = useState(false);
 const [insightsOpen, setInsightsOpen] = useState(false);
 const [remindOpen, setRemindOpen] = useState(false);
 const [pinned, setPinned] = useState(!!item.pinned);
 const [bookmarked, setBookmarked] = useState(!!item.bookmarked);
 const { run: runBookmark } = useOptimisticAction();
 const { run: runPin } = useOptimisticAction();

 // Latch: mount a lazy modal the first time it opens, then keep it mounted so
 // its close animation still runs (a bare `open && <Modal/>`would unmount
 // mid-animation). The lazy import fires on first open, not at hydration.
 const mounted = useRef({ share: false, report: false, tip: false, edit: false, remind: false });
 mounted.current.remind ||= remindOpen;
 mounted.current.share ||= shareModalOpen;
 mounted.current.report ||= reportOpen;
 mounted.current.tip ||= tipOpen;
 mounted.current.edit ||= editOpen;

 // Outside-press dismissal, Escape, focus return, the roving arrow keys and the
 // close animation all live in AnchoredMenu now. This file used to carry its own
 // copy of the first three — and, because the panel was an in-place
 // `absolute top-full … z-50`, it was measured inside the page frame's stacking
 // context (pinned at z-index 1), so on a post near the top of the column the
 // menu's first rows painted UNDER the top bar. AnchoredMenu portals to <body>.

 const shareUrl =
 typeof window !=='undefined'
 ? `${window.location.origin}/u/${item.user?.handle || item.user?.id}/post/${actualId}`
 :'';

 const handleShare = () => {
 setMenuOpen(false);
 const userName = item.user?.name || item.user?.handle ||'someone';
 const shareText = `Check out what ${userName} RMHark'd on RMH Studios!`;
 if (typeof navigator !=='undefined'&& navigator.share) {
 navigator.share({ title:'RMH', text: shareText, url: shareUrl }).catch(() => {});
 } else {
 setShareModalOpen(true);
 }
 };

 const handleCopyLink = async () => {
 setMenuOpen(false);
 try {
 await navigator.clipboard.writeText(shareUrl);
 toast.success(t('post-link-copied', { defaultValue: 'Link copied' }));
 } catch {
 toast.error(t('post-link-copy-failed', { defaultValue: 'Could not copy the link' }));
 }
 };

 const handleBookmark = () => {
 setMenuOpen(false);
 const next = !bookmarked;
 runBookmark({
 apply: () => setBookmarked(next),
 rollback: () => setBookmarked(!next),
 commit: async () => {
 const data = await api(bookmarkPostApi, { params: { id: actualId } });
 setBookmarked(!!data.bookmarked);
 onUpdate?.({ bookmarked: !!data.bookmarked });
 toast.success(
 data.bookmarked
 ? t('bookmark-saved', { defaultValue:'Saved to bookmarks'})
 : t('bookmark-removed', { defaultValue:'Removed from bookmarks'}),
 );
 },
 onError: (err) => {
 if (err instanceof HttpError && err.status === 401)
 toast.error(t('bookmark-sign-in', { defaultValue:'Please sign in to bookmark posts.'}));
 },
 });
 };

 const handlePin = () => {
 setMenuOpen(false);
 const next = !pinned;
 runPin({
 apply: () => setPinned(next),
 rollback: () => setPinned(!next),
 commit: async () => {
 const data = await api(pinPostApi, { params: { id: actualId } });
 setPinned(!!data.pinned);
 onUpdate?.({ pinned: !!data.pinned });
 toast.success(
 data.pinned
 ? t('pinned-success', { defaultValue:'Pinned to your profile'})
 : t('unpinned-success', { defaultValue:'Unpinned'}),
 );
 },
 onError: (err) => {
 toast.error(serverError(err) || t('pin-error', { defaultValue:'Could not pin post'}));
 },
 });
 };

 const handleDelete = async () => {
 setMenuOpen(false);
 if (
 !(await confirm({
 title: t('delete-confirm', { defaultValue:'Delete this RMHark?'}),
 danger: true,
 }))
 )
 return;
 try {
 await api(deletePostApi, { params: { id: actualId } });
 onRemove?.();
 } catch {
 // ignore — surface handles its own error UX
 }
 };

 const handleBlock = async () => {
 setMenuOpen(false);
 if (!targetUserId) return;
 try {
 const data = await api(toggleBlockApi, { body: { targetUserId } });
 toast.success(
 data.blocked
 ? t('user-blocked', { defaultValue:'User blocked'})
 : t('user-unblocked', { defaultValue:'User unblocked'}),
 );
 if (data.blocked) onRemove?.();
 } catch (e) {
 toast.error(serverError(e) || t('block-error', { defaultValue:'Could not block user'}));
 }
 };

 const handleMute = async () => {
 setMenuOpen(false);
 if (!targetUserId) return;
 try {
 const data = await api(toggleMuteApi, { body: { targetUserId } });
 toast.success(
 data.muted
 ? t('user-muted', { defaultValue:'User muted'})
 : t('user-unmuted', { defaultValue:'User unmuted'}),
 );
 if (data.muted) onRemove?.();
 } catch (e) {
 toast.error(serverError(e) || t('mute-error', { defaultValue:'Could not mute user'}));
 }
 };

 const showTranslate =
 translate && !!item.content && !item.deletedAt && (item.content?.length ?? 0) > 8;

 // The rows, in groups: keep it for later, send it somewhere, who engaged, then what only the author or only a
 // reader can do, with the row that cannot be undone last in its group and in the danger tone.
 const keep = session ? (
 <>
 <MenuItem
 icon={Bookmark}
 // The fill IS the state here, so it overrides the row's default dim ink.
 iconClassName={bookmarked ?'fill-site-accent text-site-accent': undefined}
 onSelect={handleBookmark}
 >
 {bookmarked
 ? t('bookmark-saved-label', { defaultValue:'Saved'})
 : t('bookmark-label', { defaultValue:'Bookmark'})}
 </MenuItem>
 <MenuItem
 icon={AlarmClock}
 onSelect={() => {
 setMenuOpen(false);
 setRemindOpen(true);
 }}
 >
 {t('remind-me', { defaultValue:'Remind me'})}
 </MenuItem>
 <MenuSeparator />
 </>
 ) : null;

 return (
 <>
 <AnchoredMenu
 open={menuOpen}
 onClose={onClose}
 anchorRef={anchorRef}
 label={t('post-actions', { defaultValue: 'Post actions' })}
 className="w-52"
 >
 {keep}
 <MenuItem icon={Share2} onSelect={handleShare}>
 {t('share', { defaultValue:'Share'})}
 </MenuItem>
 <MenuItem icon={Link2} onSelect={handleCopyLink}>
 {t('copy-link', { defaultValue: 'Copy link' })}
 </MenuItem>
 {showTranslate && (
 <MenuItem
 icon={Languages}
 disabled={translate!.translating}
 onSelect={() => {
 setMenuOpen(false);
 translate!.onToggle();
 }}
 >
 {translate!.translating
 ? t('translating', { defaultValue:'Translating…'})
 : translate!.hasTranslation
 ? translate!.showing
 ? t('show-original', { defaultValue:'Show original'})
 : t('show-translation', { defaultValue:'Show translation'})
 : t('translate', { defaultValue:'Translate'})}
 </MenuItem>
 )}
 <MenuSeparator />
 <MenuItem
 icon={Heart}
 onSelect={() => {
 setMenuOpen(false);
 setEngagementModal('likes');
 }}
 >
 {t('liked-by', { defaultValue:'Liked by'})}
 </MenuItem>
 <MenuItem
 icon={Repeat}
 onSelect={() => {
 setMenuOpen(false);
 setEngagementModal('reposts');
 }}
 >
 {t('rermharkd-by', { defaultValue:"reRMHark'd by"})}
 </MenuItem>
 {isAuthor && (
 <>
 <MenuSeparator />
 <MenuItem
 icon={TrendingUp}
 onSelect={() => {
 setMenuOpen(false);
 setInsightsOpen(true);
 }}
 >
 {t('view-insights', { defaultValue:'View insights'})}
 </MenuItem>
 <MenuItem
 icon={Pencil}
 onSelect={() => {
 setMenuOpen(false);
 setEditOpen(true);
 }}
 >
 {t('edit', { defaultValue:'Edit'})}
 </MenuItem>
 <MenuItem
 icon={Pin}
 iconClassName={pinned ?'fill-site-accent text-site-accent': undefined}
 onSelect={handlePin}
 >
 {pinned
 ? t('unpin-from-profile', { defaultValue:'Unpin from profile'})
 : t('pin-to-profile', { defaultValue:'Pin to profile'})}
 </MenuItem>
 <MenuSeparator />
 <MenuItem icon={Trash2} tone="danger" onSelect={handleDelete}>
 {t('delete', { defaultValue:'Delete'})}
 </MenuItem>
 </>
 )}
 {!isAuthor && session && (
 <>
 <MenuSeparator />
 {targetUserId && (
 <>
 <MenuItem
 icon={Coins}
 iconClassName="text-site-warning"
 onSelect={() => {
 setMenuOpen(false);
 setTipOpen(true);
 }}
 >
 {t('send-tip', { defaultValue:'Send tip'})}
 </MenuItem>
 <MenuSeparator />
 </>
 )}
 <MenuItem
 icon={Flag}
 onSelect={() => {
 setMenuOpen(false);
 setReportOpen(true);
 }}
 >
 {t('report', { defaultValue:'Report'})}
 </MenuItem>
 <MenuItem icon={VolumeX} onSelect={handleMute}>
 {t('mute', { defaultValue:'Mute'})}
 </MenuItem>
 <MenuItem icon={Ban} tone="danger" onSelect={handleBlock}>
 {t('block', { defaultValue:'Block'})}
 </MenuItem>
 </>
 )}
 </AnchoredMenu>

 {engagementModal && (
 <Suspense fallback={null}>
 <EngagementListModal
 open={engagementModal !== null}
 onClose={() => setEngagementModal(null)}
 postId={actualId}
 type={engagementModal}
 />
 </Suspense>
 )}

 {mounted.current.share && (
 <Suspense fallback={null}>
 <ShareModal
 open={shareModalOpen}
 onClose={() => setShareModalOpen(false)}
 url={shareUrl}
 embedId={actualId}
 text={`Check out what ${item.user?.name || item.user?.handle ||'someone'} RMHark'd on RMH Studios!`}
 />
 </Suspense>
 )}

 {mounted.current.remind && (
 <Suspense fallback={null}>
 <RemindMeDialog
 open={remindOpen}
 onOpenChange={setRemindOpen}
 target={{
 kind:'post',
 targetId: actualId,
 label: t('remind-post-label', {
 defaultValue:'Post by {{name}}',
 name: item.user?.name || item.user?.handle ||'someone',
 }),
 url: `/u/${item.user?.handle || item.user?.id}/post/${actualId}`,
 }}
 />
 </Suspense>
 )}
 {mounted.current.report && (
 <Suspense fallback={null}>
 <ReportDialog
 open={reportOpen}
 onOpenChange={setReportOpen}
 entityType="rmhark"
 entityId={actualId}
 />
 </Suspense>
 )}

 {targetUserId && mounted.current.tip && (
 <Suspense fallback={null}>
 <TipDialog
 open={tipOpen}
 onOpenChange={setTipOpen}
 recipientId={targetUserId}
 recipientName={item.user?.name ?? item.user?.handle}
 entityType="rmhark"
 entityId={actualId}
 />
 </Suspense>
 )}

 {isAuthor && mounted.current.edit && (
 <Suspense fallback={null}>
 <EditPostModal
 open={editOpen}
 onOpenChange={setEditOpen}
 postId={actualId}
 initialContent={item.content ??''}
 initialGifUrl={item.gifUrl ??''}
 onSaved={(content, gifUrl) =>
 onUpdate?.({ content, gifUrl: gifUrl ?? undefined, edited: true })
 }
 />
 </Suspense>
 )}

 {isAuthor && insightsOpen && (
 <Suspense fallback={null}>
 <InsightsModal
 open={insightsOpen}
 onClose={() => setInsightsOpen(false)}
 postId={actualId}
 />
 </Suspense>
 )}
 </>
 );
}
