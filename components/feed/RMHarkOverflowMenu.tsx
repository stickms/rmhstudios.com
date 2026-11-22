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
import { useQuery } from '@tanstack/react-query';
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
 Pencil,
 Languages,
 TrendingUp,
 AlarmClock,
 ShieldAlert,
 CircleStop,
 CalendarPlus,
 ImagePlus,
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
import { RepostMuteMenuItem } from './RepostMuteMenuItem';
import { PinMenuItems } from './PinMenuItems';
import { CommunityPinMenuItems } from '@/components/communities/CommunityPinMenuItems';
import {
 MuteConversationChoices,
 MuteConversationItem,
 useConversationMute,
} from './MuteConversationMenu';
import type { FeedItem } from'@/lib/feed-types';
import { bookmarkPostApi, deletePostApi } from '@/lib/feed/rmhark-actions.contract';
import { endPollApi } from '@/lib/feed/poll-lifecycle.contract';
import type { PollLifecycleView } from '@/lib/feed/poll-lifecycle';
import { api } from '@/lib/contract/client';
import { getRulesApi } from '@/lib/communities/rules.contract';
import type { ReportableRules } from '@/lib/communities/rules';
import { toggleBlockApi, toggleMuteApi } from '@/lib/moderation/moderation.contract';
import { HttpError, serverError } from '@/lib/http';

// These dialogs render only after a menu action — code-split so they stay out of
// the initial feed chunk and their (per-post) code isn't evaluated during
// hydration. Mounted lazily on first open (see the `mounted`latch below).
const ReportDialog = lazy(() =>
 import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);
const TipDialog = lazy(() =>
 import('@/components/wallet/TipDialog').then((m) => ({ default: m.TipDialog })),
);
const EditPostModal = lazy(() =>
 import('./EditPostModal').then((m) => ({ default: m.EditPostModal })),
);
const EditAltTextDialog = lazy(() =>
 import('./EditAltTextDialog').then((m) => ({ default: m.EditAltTextDialog })),
);
const EngagementListModal = lazy(() =>
 import('./EngagementListModal').then((m) => ({ default: m.EngagementListModal })),
);
const InsightsModal = lazy(() =>
 import('./InsightsModal').then((m) => ({ default: m.InsightsModal })),
);
const ShareModal = lazy(() => import('./ShareModal').then((m) => ({ default: m.ShareModal })));
const PollExtendDialog = lazy(() =>
 import('./PollExtendDialog').then((m) => ({ default: m.PollExtendDialog })),
);
const RemindMeDialog = lazy(() => import('@/components/reminders/RemindMeDialog'));
const ModerateContentDialog = lazy(() =>
 import('@/components/moderation/moderation-ui').then((m) => ({ default: m.ModerateContentDialog })),
);

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
 const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

 const setMenuOpen = (_open: false) => onClose();
 const [engagementModal, setEngagementModal] = useState<'likes'|'reposts'| null>(null);
 const [shareModalOpen, setShareModalOpen] = useState(false);
 const [reportOpen, setReportOpen] = useState(false);
 // s03-13: a community post's report dialog also offers the community's own rules.
 const communitySlug = item.communitySlug;
 const { data: communityRules } = useQuery({
 queryKey: ['community-rules', communitySlug],
 enabled: reportOpen && !!communitySlug,
 staleTime: 60_000,
 // No rules option on failure: the site reasons still work.
 retry: false,
 queryFn: async (): Promise<ReportableRules> => {
 const r = await api(getRulesApi, { params: { slug: communitySlug! } });
 return { slug: r.community.slug, name: r.community.name, rules: r.rules };
 },
 });
 const [tipOpen, setTipOpen] = useState(false);
 const [editOpen, setEditOpen] = useState(false);
 const [insightsOpen, setInsightsOpen] = useState(false);
 const [remindOpen, setRemindOpen] = useState(false);
 const [moderateOpen, setModerateOpen] = useState(false);
 const [extendOpen, setExtendOpen] = useState(false);
 const [altOpen, setAltOpen] = useState(false);
 // Conversation mute: the choice loads when the menu opens; the four options are a small menu of their own.
 const [muteChoicesOpen, setMuteChoicesOpen] = useState(false);
 const conversationMute = useConversationMute(actualId, menuOpen && !!session);
 const [bookmarked, setBookmarked] = useState(!!item.bookmarked);
 const { run: runBookmark } = useOptimisticAction();

 // Latch: mount a lazy modal the first time it opens, then keep it mounted so
 // its close animation still runs (a bare `open && <Modal/>`would unmount
 // mid-animation). The lazy import fires on first open, not at hydration.
 const mounted = useRef({ share: false, report: false, tip: false, edit: false, remind: false, moderate: false, extend: false, alt: false });
 mounted.current.moderate ||= moderateOpen;
 mounted.current.extend ||= extendOpen;
 mounted.current.remind ||= remindOpen;
 mounted.current.share ||= shareModalOpen;
 mounted.current.report ||= reportOpen;
 mounted.current.tip ||= tipOpen;
 mounted.current.edit ||= editOpen;
 mounted.current.alt ||= altOpen;

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

 // Own post with pictures: descriptions can be added or fixed after posting (s05-16).
 const hasImages = (item.imageUrls?.length ?? 0) > 0;
 // A GIF can be described after posting as well (s06-15); the dialog lists it with the images.
 const hasGif = !!item.gifUrl;

 // The author's poll actions. An ended poll offers neither; an untimed one can only be ended.
 const poll = item.poll;
 const pollOpen = !!poll && !poll.ended && !(poll.closesAt && new Date(poll.closesAt).getTime() <= Date.now());
 const pollTimed = pollOpen && !!poll?.closesAt;
 const applyPollView = (view: PollLifecycleView) => {
 if (poll) onUpdate?.({ poll: { ...poll, ...view } });
 };

 const handleEndPoll = async () => {
 setMenuOpen(false);
 if (
 !(await confirm({
 title: t('end-confirm-title', { ns: 'poll-lifecycle', defaultValue: 'End this poll now?' }),
 description: t('end-confirm-description', { ns: 'poll-lifecycle',
 defaultValue: 'It shows its final results and takes no more votes. This cannot be undone.',
 }),
 confirmLabel: t('end-confirm-action', { ns: 'poll-lifecycle', defaultValue: 'End poll' }),
 danger: true,
 }))
 )
 return;
 try {
 applyPollView(await api(endPollApi, { params: { id: actualId } }));
 toast.success(t('end-done', { ns: 'poll-lifecycle', defaultValue: 'Poll ended' }));
 } catch (e) {
 toast.error(serverError(e) || t('end-error', { ns: 'poll-lifecycle', defaultValue: 'Could not end the poll' }));
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
 {session && (
 <MuteConversationItem
 mute={conversationMute}
 onChoices={() => {
 setMenuOpen(false);
 setMuteChoicesOpen(true);
 }}
 onDone={() => setMenuOpen(false)}
 />
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
 {isAuthor && item.repostedBy && item.repostedBy.id !== session?.user?.id && (
 <>
 <MenuSeparator />
 {/* A repost of the member's own post by someone else: the person to turn off is the reposter (s05-07). */}
 <RepostMuteMenuItem item={item} enabled={menuOpen} onDone={() => setMenuOpen(false)} />
 </>
 )}
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
 {(hasImages || hasGif) && (
 <MenuItem
 icon={ImagePlus}
 onSelect={() => {
 setMenuOpen(false);
 setAltOpen(true);
 }}
 >
 {hasImages
 ? t('menu-item', { ns: 'alt-text-editing', defaultValue: 'Edit image descriptions' })
 : t('menu-item-gif', { ns: 'gif-descriptions', defaultValue: 'Describe GIF' })}
 </MenuItem>
 )}
 {pollOpen && (
 <>
 <MenuItem icon={CircleStop} onSelect={handleEndPoll}>
 {t('end-poll', { ns: 'poll-lifecycle', defaultValue: 'End poll now' })}
 </MenuItem>
 {pollTimed && (
 <MenuItem
 icon={CalendarPlus}
 onSelect={() => {
 setMenuOpen(false);
 setExtendOpen(true);
 }}
 >
 {t('extend-poll', { ns: 'poll-lifecycle', defaultValue: 'Extend poll' })}
 </MenuItem>
 )}
 </>
 )}
 <PinMenuItems item={item} enabled={menuOpen} onDone={() => setMenuOpen(false)} onUpdate={onUpdate} />
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
 <RepostMuteMenuItem item={item} enabled={menuOpen} onDone={() => setMenuOpen(false)} />
 <MenuItem icon={Ban} tone="danger" onSelect={handleBlock}>
 {t('block', { defaultValue:'Block'})}
 </MenuItem>
 </>
 )}
 {!isAuthor && isAdmin && (
 <>
 <MenuSeparator />
 <MenuItem
 icon={ShieldAlert}
 tone="danger"
 onSelect={() => {
 setMenuOpen(false);
 setModerateOpen(true);
 }}
 >
 {t('moderate-post', { defaultValue:'Moderate'})}
 </MenuItem>
 </>
 )}
 {session && communitySlug && (
 <CommunityPinMenuItems item={item} enabled={menuOpen} onDone={() => setMenuOpen(false)} />
 )}
 </AnchoredMenu>

 <MuteConversationChoices
 open={muteChoicesOpen}
 onClose={() => setMuteChoicesOpen(false)}
 anchorRef={anchorRef}
 mute={conversationMute}
 />

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
 {isAdmin && mounted.current.moderate && (
 <Suspense fallback={null}>
 <ModerateContentDialog
 open={moderateOpen}
 onOpenChange={setModerateOpen}
 entityType="rmhark"
 entityId={actualId}
 current={{ content: item.content }}
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
 community={communityRules ?? undefined}
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
 initialGifAlt={item.gifAlt ??''}
 initialContentWarning={item.contentWarning ??''}
 initialSensitive={item.isSensitive ?? false}
 quiz={
 item.poll?.quiz && item.poll.correctOptionId
 ? {
 options: item.poll.options.map((o) => ({ id: o.id, text: o.text })),
 correctOptionId: item.poll.correctOptionId,
 explanation: item.poll.explanation ??'',
 locked: item.poll.totalVotes > 0,
 }
 : undefined
 }
 onSaved={(content, gifUrl, gifAlt, warning, quizEdit) =>
 onUpdate?.({
 content,
 gifUrl: gifUrl ?? undefined,
 gifAlt: gifAlt ?? undefined,
 isSensitive: warning.isSensitive,
 contentWarning: warning.contentWarning ?? undefined,
 edited: true,
 ...(quizEdit && item.poll
 ? {
 poll: {
 ...item.poll,
 correctOptionId: quizEdit.correctOptionId,
 explanation: quizEdit.explanation || undefined,
 },
 }
 : {}),
 })
 }
 />
 </Suspense>
 )}

  {isAuthor && (hasImages || hasGif) && mounted.current.alt && (
 <Suspense fallback={null}>
 <EditAltTextDialog
 open={altOpen}
 onOpenChange={setAltOpen}
 postId={actualId}
 imageUrls={item.imageUrls ?? []}
 imageAlts={item.imageAlts}
 gifUrl={item.gifUrl}
 gifAlt={item.gifAlt}
 restoreFocusTo={() => anchorRef.current}
 onSaved={(imageAlts, gifAlt) =>
 onUpdate?.({ imageAlts, ...(gifAlt !== undefined ? { gifAlt: gifAlt ?? undefined } : {}) })
 }
 />
 </Suspense>
 )}

 {isAuthor && pollTimed && mounted.current.extend && (
 <Suspense fallback={null}>
 <PollExtendDialog
 open={extendOpen}
 onOpenChange={setExtendOpen}
 postId={actualId}
 allowedDays={poll?.extendDays ?? []}
 onExtended={applyPollView}
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
