'use client';

import { lazy, Suspense, useEffect, useState, useRef, useCallback } from'react';
import { useTranslation } from'react-i18next';
import { toast } from'sonner';
import { BadgeCheck, ShieldCheck } from'lucide-react';
import { Spinner } from'@/components/ui/spinner';
import { GiftSubDialog } from'@/components/economy/GiftSubDialog';
import { useNavigate } from'@tanstack/react-router';
import { Button } from'@/components/ui/button';
import { authClient } from'@/lib/auth-client';
import { useResolvedUser, useSession } from'@/components/Providers';
import { VirtualPostList } from'./VirtualPostList';
import { LiquidTabs } from'@/components/ui/liquid-tabs';
import { AchievementsColumn } from'./AchievementsColumn';
import { ProfileEditModal } from'./ProfileEditModal';
import { SocialListModal } from'./SocialListModal';
import { Link } from'@tanstack/react-router';
import type { FeedItem, FeedItemUser } from'@/lib/feed-types';
import { useUserDisplayStore } from'@/stores/userDisplayStore';
import { useOptimisticAction } from'@/hooks/useOptimisticAction';
import { ProfileShowcase } from'@/components/profile/ProfileShowcase';
import { ProfileHero } from'@/components/profile/ProfileHero';
import { useProfileSong } from'@/hooks/useProfileSong';
import type { ProfileData } from'@/components/profile/profile-types';
import { useShelvesTab } from'@/components/reading/useShelvesTab';
import { useKudosTabLabel } from'@/components/gifting/useKudosTabLabel';

type ProfileTab ='rmharks'|'likes'|'achievements'|'guestbook'|'shelves'|'kudos';

// Plan U15 — loaded the first time the tab is opened, never on a plain profile view.
const GuestbookPanel = lazy(() => import('@/components/profile/GuestbookPanel'));
// P13 reading (L7) — the shelves panel is lazy; only the tiny tab hook ships here.
// P11 gifting (G4) — kudos panel and the birthday chip load only when needed.
const KudosPanel = lazy(() => import('@/components/gifting/KudosPanel'));
const BirthdayBadge = lazy(() => import('@/components/gifting/BirthdayBadge'));
const ProfileShelvesPanel = lazy(() => import('@/components/reading/ProfileShelves'));
// P7 — only fetched when a visitor taps a song that has no preview clip.
const ProfileSongEmbed = lazy(() => import('@/components/profile/plus/ProfileSongEmbed'));
// Lazy and mounted on first open, as in RMHarkOverflowMenu: the dialog
// validates with the API's zod schema, which would otherwise put zod on every
// profile page for a button most visitors never press.
const TipDialog = lazy(() =>
 import('@/components/economy/TipDialog').then((m) => ({ default: m.TipDialog })),
);

export function ProfileColumn({
 userId,
 initialProfile,
}: {
 userId: string;
 /**
 * Profile prefetched by the route loader. `undefined`= no loader (fall back
 * to the client fetch); `null`= loader ran and the user wasn't found.
 */
 initialProfile?: ProfileData | null;
}) {
 // Seed from the route loader when present so the profile paints immediately.
 // `undefined`initialProfile means no loader supplied one → client fetch.
 const seeded = useRef(initialProfile !== undefined);
 const [profile, setProfile] = useState<ProfileData | null>(initialProfile ?? null);
 const { run: runFollow } = useOptimisticAction();
 const [loading, setLoading] = useState(initialProfile === undefined);
 const [notFound, setNotFound] = useState(initialProfile === null);
 const [showEdit, setShowEdit] = useState(false);
 const [tipOpen, setTipOpen] = useState(false);
 const [tipMounted, setTipMounted] = useState(false);
 const [giftOpen, setGiftOpen] = useState(false);
 const [membershipBusy, setMembershipBusy] = useState(false);
 const [tab, setTab] = useState<ProfileTab>('rmharks');
 const [socialModal, setSocialModal] = useState<'followers'|'following'| null>(null);
 const { refresh: refreshResolvedUser } = useResolvedUser();
 const kudosTabLabel = useKudosTabLabel();
 const shelvesTab = useShelvesTab(profile?.id, !!profile?.isOwnProfile);

 // Use freshest user data from cache (may have been updated by RMHark fetches)
 const cachedUser = useUserDisplayStore((state) =>
 profile ? state.cache[profile.id] : undefined,
 );
 const displayName = cachedUser?.name ?? profile?.name;
 const displayImage = cachedUser?.image ?? profile?.image;

 // RMHark list state
 const [items, setItems] = useState<FeedItem[]>([]);
 const [cursor, setCursor] = useState<string | null>(null);
 const [hasMore, setHasMore] = useState(true);
 const [loadingItems, setLoadingItems] = useState(false);
 const sentinelRef = useRef<HTMLDivElement>(null);
 const initialFetched = useRef(false);

 // Liked items state
 const [likedItems, setLikedItems] = useState<FeedItem[]>([]);
 const [likedCursor, setLikedCursor] = useState<string | null>(null);
 const [likedHasMore, setLikedHasMore] = useState(true);
 const [loadingLiked, setLoadingLiked] = useState(false);
 const likedSentinelRef = useRef<HTMLDivElement>(null);
 const likedInitialFetched = useRef(false);

 // Profile song (P7): tap-to-play preview or tap-to-load Spotify embed; nothing
 // is fetched or loaded until the visitor taps.
 const song = useProfileSong(
 profile
 ? { spotifyId: profile.profileSongSpotifyId, previewUrl: profile.profileSongPreviewUrl }
 : null,
 );

 const { t } = useTranslation('feed');
 const { data: session } = useSession();
 const navigate = useNavigate();
 const [messageSending, setMessageSending] = useState(false);
 const [messageError, setMessageError] = useState<string | null>(null);

 // Fetch profile
 useEffect(() => {
 // Loader already provided this profile — prime the display cache from it and
 // skip the redundant client fetch. (The component is remounted via `key`on
 // profile→profile navigation, so `seeded`/`initialProfile`are always fresh.)
 if (seeded.current) {
 if (initialProfile) {
 useUserDisplayStore.getState().setUsers([
 {
 id: initialProfile.id,
 name: initialProfile.name,
 image: initialProfile.image,
 username: initialProfile.username,
 handle: initialProfile.handle,
 isVerified: initialProfile.isVerified,
 isAdmin: initialProfile.isAdmin,
 },
 ]);
 }
 return;
 }
 setLoading(true);
 setNotFound(false);
 fetch(`/api/profile/${encodeURIComponent(userId)}`)
 .then(async (res) => {
 if (!res.ok) {
 setNotFound(true);
 return;
 }
 const data = await res.json();
 // Seed user display cache with profile data
 useUserDisplayStore.getState().setUsers([
 {
 id: data.id,
 name: data.name,
 image: data.image,
 username: data.username,
 handle: data.handle,
 isVerified: data.isVerified,
 isAdmin: data.isAdmin,
 },
 ]);
 setProfile(data);
 })
 .catch(console.error)
 .finally(() => setLoading(false));
 }, [initialProfile, userId]);

 // Reset per-profile post state when navigating to a different profile. The
 // ProfileColumn instance is reused across /u/$userid routes, so without this
 // the previous user's RMHarks/likes (and the"already fetched"refs) linger
 // until a full page refresh.
 useEffect(() => {
 setItems([]);
 setCursor(null);
 setHasMore(true);
 setLoadingItems(false);
 initialFetched.current = false;
 setLikedItems([]);
 setLikedCursor(null);
 setLikedHasMore(true);
 setLoadingLiked(false);
 likedInitialFetched.current = false;
 // `/u/<id>#guestbook` (the guestbook notification's link) opens that tab.
 setTab(window.location.hash ==='#guestbook'?'guestbook':'rmharks');
 }, [userId]);

 // Fetch RMHarks
 const fetchRMHarks = useCallback(async () => {
 if (loadingItems) return;
 setLoadingItems(true);
 try {
 const params = new URLSearchParams({ limit:'20'});
 if (cursor) params.set('cursor', cursor);
 const res = await fetch(`/api/profile/${encodeURIComponent(userId)}/rmharks?${params}`);
 if (!res.ok) return;
 const data = await res.json();
 // Update user display cache
 const users: FeedItemUser[] = [];
 for (const item of data.items as FeedItem[]) {
 if (item.user) users.push(item.user);
 if (item.repostedBy) users.push(item.repostedBy);
 if (item.original?.user) users.push(item.original.user);
 }
 if (users.length > 0) useUserDisplayStore.getState().setUsers(users);
 setItems((prev) => [...prev, ...data.items]);
 setCursor(data.nextCursor);
 setHasMore(data.hasMore);
 } catch (error) {
 console.error('Fetch rmharks error:', error);
 } finally {
 setLoadingItems(false);
 }
 }, [userId, cursor, loadingItems]);

 // Fetch Liked posts
 const fetchLikedPosts = useCallback(async () => {
 if (loadingLiked) return;
 setLoadingLiked(true);
 try {
 const params = new URLSearchParams({ limit:'20'});
 if (likedCursor) params.set('cursor', likedCursor);
 const res = await fetch(`/api/profile/${encodeURIComponent(userId)}/likes?${params}`);
 if (!res.ok) return;
 const data = await res.json();
 // Update user display cache
 const likeUsers: FeedItemUser[] = [];
 for (const item of data.items as FeedItem[]) {
 if (item.user) likeUsers.push(item.user);
 if (item.repostedBy) likeUsers.push(item.repostedBy);
 if (item.original?.user) likeUsers.push(item.original.user);
 }
 if (likeUsers.length > 0) useUserDisplayStore.getState().setUsers(likeUsers);
 setLikedItems((prev) => [...prev, ...data.items]);
 setLikedCursor(data.nextCursor);
 setLikedHasMore(data.hasMore);
 } catch (error) {
 console.error('Fetch liked posts error:', error);
 } finally {
 setLoadingLiked(false);
 }
 }, [userId, likedCursor, loadingLiked]);

 // Initial fetch for RMHarks
 useEffect(() => {
 if (!initialFetched.current && !loading && profile) {
 initialFetched.current = true;
 fetchRMHarks();
 }
 }, [loading, profile, fetchRMHarks]);

 // Infinite scroll for RMHarks
 const observerCallback = useCallback(
 (entries: IntersectionObserverEntry[]) => {
 if (entries[0].isIntersecting && hasMore && !loadingItems) {
 fetchRMHarks();
 }
 },
 [hasMore, loadingItems, fetchRMHarks],
 );

 useEffect(() => {
 const sentinel = sentinelRef.current;
 if (!sentinel || tab !=='rmharks') return;
 const observer = new IntersectionObserver(observerCallback, { rootMargin:'200px'});
 observer.observe(sentinel);
 return () => observer.disconnect();
 }, [observerCallback, tab]);

 // Infinite scroll for Liked posts
 const likedObserverCallback = useCallback(
 (entries: IntersectionObserverEntry[]) => {
 if (entries[0].isIntersecting && likedHasMore && !loadingLiked) {
 fetchLikedPosts();
 }
 },
 [likedHasMore, loadingLiked, fetchLikedPosts],
 );

 useEffect(() => {
 const sentinel = likedSentinelRef.current;
 if (!sentinel || tab !=='likes') return;
 const observer = new IntersectionObserver(likedObserverCallback, { rootMargin:'200px'});
 observer.observe(sentinel);
 return () => observer.disconnect();
 }, [likedObserverCallback, tab]);

 // Follow toggle
 const handleFollowToggle = () => {
 if (!profile || !session) return;
 const wasFollowing = profile.isFollowing;
 runFollow({
 apply: () =>
 setProfile((prev) =>
 prev
 ? {
 ...prev,
 isFollowing: !wasFollowing,
 followerCount: prev.followerCount + (wasFollowing ? -1 : 1),
 }
 : prev,
 ),
 rollback: () =>
 setProfile((prev) =>
 prev
 ? {
 ...prev,
 isFollowing: wasFollowing,
 followerCount: prev.followerCount + (wasFollowing ? 1 : -1),
 }
 : prev,
 ),
 commit: () => fetch(`/api/profile/${encodeURIComponent(userId)}/follow`, { method:'POST'}),
 });
 };

 const handleJoinMembership = async () => {
 if (!profile || !session || membershipBusy) return;
 setMembershipBusy(true);
 try {
 const res = await fetch(`/api/profile/${profile.id}/membership`, { method:'POST'});
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 toast.error(data.error || t('membership-failed', { defaultValue:'Could not join'}));
 return;
 }
 setProfile((prev) =>
 prev
 ? {
 ...prev,
 isMember: true,
 memberCount: (prev.memberCount ?? 0) + (prev.isMember ? 0 : 1),
 }
 : prev,
 );
 toast.success(t('membership-joined', { defaultValue:"You're now a member! 🎉"}));
 } catch {
 toast.error(t('membership-failed', { defaultValue:'Could not join'}));
 } finally {
 setMembershipBusy(false);
 }
 };

 const handleMessage = async () => {
 if (!profile || !session || messageSending) return;
 setMessageSending(true);
 setMessageError(null);

 try {
 const res = await fetch('/api/messages', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ recipientId: profile.id }),
 });

 if (!res.ok) {
 const data = await res.json();
 setMessageError(
 data.error ||
 t('failed-to-start-conversation', { defaultValue:'Failed to start conversation'}),
 );
 return;
 }

 const data = await res.json();
 navigate({ to: `/messages/${data.conversationId}`});
 } catch {
 setMessageError(
 t('failed-to-start-conversation', { defaultValue:'Failed to start conversation'}),
 );
 } finally {
 setMessageSending(false);
 }
 };

 const handleTabChange = (newTab: ProfileTab) => {
 setTab(newTab);
 if (newTab ==='likes'&& !likedInitialFetched.current) {
 likedInitialFetched.current = true;
 fetchLikedPosts();
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-20">
 <Spinner size={32} />
 </div>
 );
 }

 if (notFound || !profile) {
 return (
 <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
 <p className="text-lg font-medium text-site-text mb-1">
 {t('user-not-found', { defaultValue:'User not found'})}
 </p>
 <p className="text-sm text-site-text-muted mb-4">
 {t('user-not-found-desc', { defaultValue:"This user doesn't exist."})}
 </p>
 <Link to="/">
 <Button variant="accent"size="sm">
 {t('go-home', { defaultValue:'Go Home'})}
 </Button>
 </Link>
 </div>
 );
 }

 const showLikesTab = profile.isOwnProfile || profile.showLikes;
 const showGuestbookTab =
 profile.isOwnProfile || (!!profile.guestbookMode && profile.guestbookMode !=='off');

 // An equipped premium theme recolors this profile by overriding the accent CSS
 // variables for the column's subtree (follow button, links, name, tab indicator,
 // badges). Its gradient also backs the profile header when no banner is equipped.
 const theme = profile.cosmetics?.theme;
 const themeStyle = theme
 ? ({
 ...(theme.accent ? {'--site-accent': theme.accent } : {}),
 ...(theme.accentHover ? {'--site-accent-hover': theme.accentHover } : {}),
 ...(theme.accentFg ? {'--site-accent-fg': theme.accentFg } : {}),
 ...(theme.accentDim ? {'--site-accent-dim': theme.accentDim } : {}),
 } as React.CSSProperties)
 : undefined;
 return (
 <div className="flex flex-col"style={themeStyle}>
 {/* Compact identity chrome stays visible while the full glass hero scrolls away. */}
 <div className="glass-chrome site-sticky-chrome">
 <div className="flex items-center gap-3 px-4 py-3">
 <div className="min-w-0 flex-1">
 <div className="flex min-w-0 items-center gap-1.5">
 <h1 className="truncate font-display text-lg font-bold text-site-text">
 {displayName || profile.username || t('user', { defaultValue:'User'})}
 </h1>
 {profile.isVerified ? (
 <BadgeCheck className="size-4 shrink-0 text-site-success"aria-hidden />
 ) : null}
 {profile.isAdmin ? (
 <ShieldCheck className="size-4 shrink-0 text-site-accent"aria-hidden />
 ) : null}
 </div>
 <p className="text-xs text-site-text-dim">
 {t('rmhark-count', {
 count: profile.rmharkCount,
 defaultValue:'{{count}} RMHarks',
 })}
 </p>
 </div>
 </div>
 </div>

 <ProfileHero
 profile={profile}
 displayName={displayName}
 displayImage={displayImage}
 signedIn={Boolean(session)}
 isPlaying={song.isPlaying}
 membershipBusy={membershipBusy}
 messageSending={messageSending}
 messageError={messageError}
 onTogglePlay={song.toggle}
 onEdit={() => setShowEdit(true)}
 onFollow={handleFollowToggle}
 onMessage={handleMessage}
 onTip={() => {
 setTipMounted(true);
 setTipOpen(true);
 }}
 onGift={() => setGiftOpen(true)}
 onJoinMembership={handleJoinMembership}
 onShowSocial={setSocialModal}
 onShowAchievements={() => handleTabChange('achievements')}
 />

 {profile.birthdayToday && (
 <Suspense fallback={null}>
 <BirthdayBadge />
 </Suspense>
 )}

 <div className="px-3 pt-3">
 <ProfileShowcase
 modules={profile.modules ?? []}
 isOwner={profile.isOwnProfile}
 profile={{
 id: profile.id,
 followerCount: profile.followerCount,
 followingCount: profile.followingCount,
 rmharkCount: profile.rmharkCount,
 status: profile.status ?? null,
 }}
 />
 </div>

 {/* Tab bar → shared LiquidTabs (§5.4). handleTabChange keeps the lazy
 liked-posts fetch on first switch. */}
 <div className="px-3 py-3">
 <LiquidTabs
 tabs={[
 {
 id:'rmharks',
 label: t('rmharks-label', { defaultValue:'RMHarks'}),
 },
 ...(showLikesTab
 ? [{ id:'likes', label: t('likes', { defaultValue:'Likes'}) }]
 : []),
 { id:'achievements', label: t('achievements', { defaultValue:'Achievements'}) },
 ...(showGuestbookTab
 ? [{ id:'guestbook', label: t('guestbook-tab', { defaultValue:'Guestbook'}) }]
 : []),
 ...(shelvesTab.show ? [{ id:'shelves', label: shelvesTab.label }] : []),
 { id:'kudos', label: kudosTabLabel },
 ]}
 value={tab}
 onChange={(id) => handleTabChange(id as ProfileTab)}
 scroll
 />
 </div>

 {/* RMHarks tab content */}
 {tab ==='rmharks'&& (
 <div>
 <VirtualPostList items={items} />

 {loadingItems && (
 <div className="flex items-center justify-center py-8">
 <Spinner />
 </div>
 )}

 {!loadingItems && items.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
 <p className="text-lg font-medium text-site-text mb-1">
 {t('no-rmharks-yet', { defaultValue:'No RMHarks yet'})}
 </p>
 <p className="text-sm text-site-text-muted">
 {profile.isOwnProfile
 ? t('no-rmharks-own', { defaultValue:"You haven't posted any RMHarks yet."})
 : t('no-rmharks-other', {
 handle: profile.handle,
 defaultValue:"@{{handle}} hasn't posted any RMHarks yet.",
 })}
 </p>
 </div>
 )}

 {!hasMore && items.length > 0 && (
 <div className="py-8 text-center text-sm text-site-text-dim">
 {t('reached-the-end', { defaultValue:"You've reached the end"})}
 </div>
 )}

 <div ref={sentinelRef} className="h-1"/>
 </div>
 )}

 {/* Likes tab content */}
 {tab ==='likes'&& (
 <div>
 <VirtualPostList items={likedItems} />

 {loadingLiked && (
 <div className="flex items-center justify-center py-8">
 <Spinner />
 </div>
 )}

 {!loadingLiked && likedItems.length === 0 && (
 <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
 <p className="text-lg font-medium text-site-text mb-1">
 {t('no-likes-yet', { defaultValue:'No likes yet'})}
 </p>
 <p className="text-sm text-site-text-muted">
 {profile.isOwnProfile
 ? t('no-likes-own', { defaultValue:"You haven't liked any posts yet."})
 : t('no-likes-other', {
 handle: profile.handle,
 defaultValue:"@{{handle}} hasn't liked any posts yet.",
 })}
 </p>
 </div>
 )}

 {!likedHasMore && likedItems.length > 0 && (
 <div className="py-8 text-center text-sm text-site-text-dim">
 {t('reached-the-end', { defaultValue:"You've reached the end"})}
 </div>
 )}

 <div ref={likedSentinelRef} className="h-1"/>
 </div>
 )}

 {/* Achievements tab content — AchievementsColumn self-fetches (public API) */}
 {tab ==='achievements'&& (
 <div className="p-4">
 <AchievementsColumn userId={profile.id} hideHeader />
 </div>
 )}

 {tab ==='guestbook'&& (
 <Suspense
 fallback={
 <div className="flex justify-center py-12">
 <Spinner />
 </div>
 }
 >
 <GuestbookPanel
 ownerId={profile.id}
 onModeChange={(mode) => setProfile((p) => (p ? { ...p, guestbookMode: mode } : p))}
 />
 </Suspense>
 )}

 {tab ==='kudos'&& (
 <Suspense
 fallback={
 <div className="flex justify-center py-12">
 <Spinner />
 </div>
 }
 >
 <KudosPanel ownerId={profile.id} isOwner={profile.isOwnProfile} />
 </Suspense>
 )}

 {tab ==='shelves'&& (
 <Suspense
 fallback={
 <div className="flex justify-center py-12">
 <Spinner />
 </div>
 }
 >
 <ProfileShelvesPanel ownerId={profile.id} />
 </Suspense>
 )}

 {song.embedOpen && profile.profileSongSpotifyId && (
 <Suspense fallback={null}>
 <ProfileSongEmbed
 spotifyId={profile.profileSongSpotifyId}
 title={profile.profileSongTitle}
 onClose={song.closeEmbed}
 />
 </Suspense>
 )}

 {/* Tip dialog (non-owner) */}
 {profile && !profile.isOwnProfile && tipMounted && (
 <Suspense fallback={null}>
 <TipDialog
 open={tipOpen}
 onOpenChange={setTipOpen}
 recipientId={profile.id}
 recipientName={displayName ?? profile.name}
 entityType="profile"
 entityId={profile.id}
 />
 </Suspense>
 )}

 {/* Gift membership dialog (non-owner) */}
 {profile && !profile.isOwnProfile && (
 <GiftSubDialog
 open={giftOpen}
 onOpenChange={setGiftOpen}
 recipientId={profile.id}
 recipientName={displayName ?? profile.name}
 />
 )}

 {/* Edit modal */}
 {showEdit && (
 <ProfileEditModal
 open={showEdit}
 onClose={() => setShowEdit(false)}
 initial={{
 handle: profile.handle,
 handleCooldownMs: profile.handleCooldownMs ?? 0,
 name: displayName ?? profile.name,
 image: displayImage ?? profile.image,
 hasCustomAvatar: profile.hasCustomAvatar,
 bio: profile.bio,
 location: profile.location,
 website: profile.website,
 links: profile.links,
 bannerUrl: profile.bannerUrl,
 showLikes: profile.showLikes,
 dmPrivacy: profile.dmPrivacy,
 tipGoal: profile.tipGoal,
 tipGoalLabel: profile.tipGoalLabel,
 membershipPriceCoins: profile.membershipPriceCoins,
 profileSongSpotifyId: profile.profileSongSpotifyId,
 profileSongTitle: profile.profileSongTitle,
 profileSongArtist: profile.profileSongArtist,
 profileSongPreviewUrl: profile.profileSongPreviewUrl,
 profileSongAlbumArt: profile.profileSongAlbumArt,
 }}
 onSaved={(data) => {
 setProfile((prev) => {
 if (!prev) return prev;
 return {
 ...prev,
 ...(data.displayName !== undefined ? { name: data.displayName } : {}),
 ...(data.image !== undefined
 ? {
 image: data.image,
 hasCustomAvatar: !!data.image?.startsWith('/api/profile/avatar/'),
 }
 : {}),
 ...(data.handle !== undefined ? { handle: data.handle } : {}),
 ...(data.bio !== undefined ? { bio: data.bio } : {}),
 ...(data.location !== undefined ? { location: data.location } : {}),
 ...(data.website !== undefined ? { website: data.website } : {}),
 ...(data.links !== undefined ? { links: data.links } : {}),
 ...(data.bannerUrl !== undefined ? { bannerUrl: data.bannerUrl } : {}),
 ...(data.membershipPriceCoins !== undefined
 ? { membershipPriceCoins: data.membershipPriceCoins }
 : {}),
 ...(data.tipGoal !== undefined ? { tipGoal: data.tipGoal } : {}),
 ...(data.tipGoalLabel !== undefined ? { tipGoalLabel: data.tipGoalLabel } : {}),
 ...(data.showLikes !== undefined ? { showLikes: data.showLikes } : {}),
 ...(data.dmPrivacy !== undefined ? { dmPrivacy: data.dmPrivacy } : {}),
 ...(data.profileSongSpotifyId !== undefined
 ? { profileSongSpotifyId: data.profileSongSpotifyId }
 : {}),
 ...(data.profileSongTitle !== undefined
 ? { profileSongTitle: data.profileSongTitle }
 : {}),
 ...(data.profileSongArtist !== undefined
 ? { profileSongArtist: data.profileSongArtist }
 : {}),
 ...(data.profileSongPreviewUrl !== undefined
 ? { profileSongPreviewUrl: data.profileSongPreviewUrl }
 : {}),
 ...(data.profileSongAlbumArt !== undefined
 ? { profileSongAlbumArt: data.profileSongAlbumArt }
 : {}),
 };
 });

 // Sync display name into the better-auth session
 // (avatar is handled by useResolvedUser via UserProfile.customImage)
 if (data.displayName !== undefined && data.displayName !== null) {
 authClient.updateUser({ name: data.displayName });
 }
 refreshResolvedUser();

 // Force-update user display cache so all rendered RMHarks get fresh data
 // (forceSetUser because reset avatar intentionally sets image to null/default)
 useUserDisplayStore.getState().forceSetUser({
 id: profile.id,
 name: data.displayName !== undefined ? data.displayName : profile.name,
 image: data.image !== undefined ? data.image : profile.image,
 username: profile.username,
 handle: data.handle !== undefined ? data.handle : profile.handle,
 isVerified: profile.isVerified,
 isAdmin: profile.isAdmin,
 });
 }}
 />
 )}

 {/* Followers / Following modal */}
 {socialModal && (
 <SocialListModal
 open={socialModal !== null}
 onClose={() => setSocialModal(null)}
 userId={userId}
 type={socialModal}
 />
 )}
 </div>
 );
}
