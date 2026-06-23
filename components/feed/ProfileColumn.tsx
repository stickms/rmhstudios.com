'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Link as LinkIcon, Calendar, Loader2, MessageCircle, BadgeCheck, ShieldCheck, Coins, Store, Gift } from 'lucide-react';
import { TipDialog } from '@/components/economy/TipDialog';
import { GiftSubDialog } from '@/components/economy/GiftSubDialog';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { MobileMenuButton } from './MobileMenuButton';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser } from '@/components/Providers';
import { RMHarkCard } from './RMHarkCard';
import { ProfileEditModal } from './ProfileEditModal';
import { SocialListModal } from './SocialListModal';
import { VinylRecord } from './VinylRecord';
import { Link } from '@tanstack/react-router';
import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { useUserDisplayStore } from '@/stores/userDisplayStore';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { ProfilePet } from '@/components/rmhcoins/ProfilePet';

interface ProfileData {
  id: string;
  name: string | null;
  username: string | null;
  handle: string | null;
  image: string | null;
  isVerified: boolean;
  isAdmin: boolean;
  createdAt: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  showLikes: boolean;
  dmPrivacy: string;
  profileSongSpotifyId: string | null;
  profileSongTitle: string | null;
  profileSongArtist: string | null;
  profileSongPreviewUrl: string | null;
  profileSongAlbumArt: string | null;
  followerCount: number;
  followingCount: number;
  rmharkCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  handleCooldownMs?: number;
  hasCustomAvatar?: boolean;
  coins: number;
  hasProfilePet: boolean;
  showProfilePet: boolean;
  isOnline?: boolean;
  tipGoal?: number | null;
  tipGoalLabel?: string | null;
  tipsThisMonth?: number;
  cosmetics?: {
    nameColor?: { color?: string; gradient?: string };
    avatarFrame?: { color?: string; gradient?: string };
    badge?: { emoji?: string };
    banner?: { gradient?: string };
    pet?: { emoji?: string };
  };
}

type ProfileTab = 'rmharks' | 'likes';

const DEFAULT_AVATAR = '/images/social/default_avatar.png';

function ProfileAvatar({ image, name }: { image: string | null; name: string | null }) {
  const { t } = useTranslation('feed');
  const [imgError, setImgError] = useState(false);
  const imgSrc = imgError ? DEFAULT_AVATAR : image;

  return (
    <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-site-text font-bold text-2xl ring-4 ring-site-bg shrink-0">
      {imgSrc ? (
        <img src={imgSrc} alt={name || t('user', { defaultValue: 'User' })} className="w-full h-full rounded-full object-cover" onError={() => setImgError(true)} />
      ) : (
        (name?.[0] || 'U').toUpperCase()
      )}
    </div>
  );
}

export function ProfileColumn({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('rmharks');
  const [socialModal, setSocialModal] = useState<'followers' | 'following' | null>(null);
  const { refresh: refreshResolvedUser } = useResolvedUser();

  // Use freshest user data from cache (may have been updated by RMHark fetches)
  const cachedUser = useUserDisplayStore((state) => profile ? state.cache[profile.id] : undefined);
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

  // Spotify IFrame API state
  const [isPlaying, setIsPlaying] = useState(false);
  const embedContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controllerRef = useRef<any>(null);
  const scriptLoadedRef = useRef(false);

  const { t } = useTranslation('feed');
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Fetch profile
  useEffect(() => {
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
        useUserDisplayStore.getState().setUsers([{
          id: data.id, name: data.name, image: data.image,
          username: data.username, handle: data.handle,
          isVerified: data.isVerified, isAdmin: data.isAdmin,
        }]);
        setProfile(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  // Reset per-profile post state when navigating to a different profile. The
  // ProfileColumn instance is reused across /u/$userid routes, so without this
  // the previous user's RMHarks/likes (and the "already fetched" refs) linger
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
    setTab('rmharks');
  }, [userId]);

  // Spotify IFrame API — load script & create controller for profile song
  useEffect(() => {
    const spotifyId = profile?.profileSongSpotifyId;
    if (!spotifyId) return;

    let cancelled = false;

    const initController = (IFrameAPI: { createController: Function }) => {
      if (cancelled || !embedContainerRef.current) return;
      IFrameAPI.createController(
        embedContainerRef.current,
        { uri: `spotify:track:${spotifyId}`, width: 0, height: 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ctrl: any) => {
          if (cancelled) return;
          controllerRef.current = ctrl;
          ctrl.addListener('playback_update', (e: { data: { isPaused: boolean } }) => {
            setIsPlaying(!e.data.isPaused);
          });
        },
      );
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).SpotifyIframeApi) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initController((window as any).SpotifyIframeApi);
    } else if (!scriptLoadedRef.current) {
      scriptLoadedRef.current = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onSpotifyIframeApiReady = (IFrameAPI: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).SpotifyIframeApi = IFrameAPI;
        initController(IFrameAPI);
      };
      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      controllerRef.current = null;
    };
  }, [profile?.profileSongSpotifyId]);

  const handleTogglePlay = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    if (isPlaying) {
      ctrl.pause();
    } else {
      ctrl.play();
    }
  }, [isPlaying]);

  // Fetch RMHarks
  const fetchRMHarks = useCallback(async () => {
    if (loadingItems) return;
    setLoadingItems(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
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
      const params = new URLSearchParams({ limit: '20' });
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
    [hasMore, loadingItems, fetchRMHarks]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || tab !== 'rmharks') return;
    const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' });
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
    [likedHasMore, loadingLiked, fetchLikedPosts]
  );

  useEffect(() => {
    const sentinel = likedSentinelRef.current;
    if (!sentinel || tab !== 'likes') return;
    const observer = new IntersectionObserver(likedObserverCallback, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [likedObserverCallback, tab]);

  // Follow toggle
  const handleFollowToggle = async () => {
    if (!profile || !session) return;
    const wasFollowing = profile.isFollowing;

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: !wasFollowing,
            followerCount: prev.followerCount + (wasFollowing ? -1 : 1),
          }
        : prev
    );

    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(userId)}/follow`, {
        method: 'POST',
      });
      if (!res.ok) {
        setProfile((prev) =>
          prev ? { ...prev, isFollowing: wasFollowing, followerCount: prev.followerCount + (wasFollowing ? 1 : -1) } : prev
        );
      }
    } catch {
      setProfile((prev) =>
        prev ? { ...prev, isFollowing: wasFollowing, followerCount: prev.followerCount + (wasFollowing ? 1 : -1) } : prev
      );
    }
  };

  const handleMessage = async () => {
    if (!profile || !session || messageSending) return;
    setMessageSending(true);
    setMessageError(null);

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: profile.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessageError(data.error || t('failed-to-start-conversation', { defaultValue: 'Failed to start conversation' }));
        return;
      }

      const data = await res.json();
      navigate({ to: `/messages/${data.conversationId}` });
    } catch {
      setMessageError(t('failed-to-start-conversation', { defaultValue: 'Failed to start conversation' }));
    } finally {
      setMessageSending(false);
    }
  };

  const handleTabChange = (newTab: ProfileTab) => {
    setTab(newTab);
    if (newTab === 'likes' && !likedInitialFetched.current) {
      likedInitialFetched.current = true;
      fetchLikedPosts();
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <p className="text-lg font-medium text-site-text mb-1">{t('user-not-found', { defaultValue: 'User not found' })}</p>
        <p className="text-sm text-site-text-muted mb-4">
          {t('user-not-found-desc', { defaultValue: "This user doesn't exist." })}
        </p>
        <Link to="/">
          <Button variant="accent" size="sm">{t('go-home', { defaultValue: 'Go Home' })}</Button>
        </Link>
      </div>
    );
  }

  const showLikesTab = profile.isOwnProfile || profile.showLikes;

  return (
    <div className="flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <MobileMenuButton />
          <div>
            <div className="flex items-center gap-1">
              <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text truncate">
                {displayName || profile.username || 'User'}
              </h1>
              {profile.isVerified && <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" />}
              {profile.isAdmin && (
                <span title={t('admin', { defaultValue: 'Admin' })} className="inline-flex items-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-site-accent" />
                </span>
              )}
            </div>
            <p className="text-xs text-site-text-dim">{profile.rmharkCount} RMHarks</p>
          </div>
        </div>
      </div>

      {/* Equipped profile banner (cosmetic) */}
      {profile.cosmetics?.banner?.gradient && (
        <div className="h-24 w-full" style={{ background: profile.cosmetics.banner.gradient }} aria-hidden />
      )}

      {/* Profile header */}
      <div className="px-4 pt-6 pb-4 border-b border-site-border">
        <div className="flex items-start justify-between mb-4">
          <div className="relative shrink-0">
            {profile.cosmetics?.avatarFrame ? (
              <div
                className="rounded-full p-[3px]"
                style={{ background: profile.cosmetics.avatarFrame.gradient ?? profile.cosmetics.avatarFrame.color }}
              >
                <ProfileAvatar image={displayImage ?? null} name={displayName ?? null} />
              </div>
            ) : (
              <ProfileAvatar image={displayImage ?? null} name={displayName ?? null} />
            )}
            {profile.isOnline && (
              <span
                className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-site-bg bg-emerald-500"
                title={t('online-now', { defaultValue: 'Online now' })}
                aria-label={t('online-now', { defaultValue: 'Online now' })}
              />
            )}
          </div>

          {/* Profile Pet banner between avatar and vinyl */}
          {profile.hasProfilePet && profile.showProfilePet && (
            <div className="flex-1 mx-3 self-stretch">
              <ProfilePet />
            </div>
          )}

          {profile.profileSongSpotifyId && profile.profileSongAlbumArt && (
            <VinylRecord
              albumArt={profile.profileSongAlbumArt}
              title={profile.profileSongTitle ?? 'Unknown'}
              artist={profile.profileSongArtist ?? 'Unknown'}
              isPlaying={isPlaying}
              onToggle={handleTogglePlay}
            />
          )}
        </div>

        {messageError && (
          <p className="text-sm text-site-danger mt-2">{messageError}</p>
        )}

        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-1.5 align-middle">
              <h2
                className="font-bold text-xl text-site-text truncate"
                style={
                  profile.cosmetics?.nameColor?.gradient
                    ? { background: profile.cosmetics.nameColor.gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
                    : profile.cosmetics?.nameColor?.color
                    ? { color: profile.cosmetics.nameColor.color }
                    : undefined
                }
              >
                {displayName || 'Unknown'}
              </h2>
              {profile.cosmetics?.badge?.emoji && (
                <span className="shrink-0 text-lg" title={t('equipped-badge', { defaultValue: 'Equipped badge' })}>{profile.cosmetics.badge.emoji}</span>
              )}
              {profile.isVerified && <BadgeCheck className="w-5 h-5 text-emerald-500 shrink-0" />}
              {profile.isAdmin && (
                <span title={t('admin', { defaultValue: 'Admin' })} className="inline-flex items-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-site-accent" />
                </span>
              )}
              {/* RMH Coins */}
              <Link
                to="/predictions"
                className="inline-flex items-center gap-0.5 shrink-0 hover:opacity-80 transition-opacity"
                title={t('rmh-coins-count', { count: profile.coins, defaultValue: '{{count}} RMH Coins' })}
              >
                <CoinIcon className="w-4 h-4" />
                <span className="text-sm font-bold text-yellow-500">{profile.coins}</span>
              </Link>
            </div>
            {profile.handle && (
              <p className="text-sm text-site-text-dim">@{profile.handle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/store/${profile.handle || profile.id}` as string} title={t('storefront', { defaultValue: 'Storefront' })}>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg border-site-border text-site-text hover:bg-site-surface"
              >
                <Store className="w-4 h-4" />
              </Button>
            </Link>
            {profile.isOwnProfile ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEdit(true)}
                className="rounded-lg border-site-border text-site-text hover:bg-site-surface"
              >
                {t('edit-profile', { defaultValue: 'Edit Profile' })}
              </Button>
            ) : session ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTipOpen(true)}
                  className="rounded-lg border-site-border text-site-text hover:bg-site-surface"
                  title={t('send-a-tip', { defaultValue: 'Send a tip' })}
                >
                  <Coins className="w-4 h-4 text-amber-400" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGiftOpen(true)}
                  className="rounded-lg border-site-border text-site-text hover:bg-site-surface"
                  title={t('gift-a-membership', { defaultValue: 'Gift a membership' })}
                >
                  <Gift className="w-4 h-4 text-site-accent" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMessage}
                  disabled={messageSending}
                  className="rounded-lg border-site-border text-site-text hover:bg-site-surface"
                  title={t('message', { defaultValue: 'Message' })}
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
                <Button
                  variant={profile.isFollowing ? 'outline' : 'accent'}
                  size="sm"
                  onClick={handleFollowToggle}
                  className={`rounded-lg ${profile.isFollowing ? 'border-site-border text-site-text hover:border-site-danger hover:text-site-danger hover:bg-site-danger/10' : ''}`}
                >
                  {profile.isFollowing ? t('following', { defaultValue: 'Following' }) : t('follow', { defaultValue: 'Follow' })}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {profile.bio && (
          <p className="text-site-text text-[15px] whitespace-pre-wrap break-words mb-3">
            {profile.bio}
          </p>
        )}

        {/* Creator tip goal */}
        {profile.tipGoal && profile.tipGoal > 0 && (
          <div className="mb-3 rounded-xl border border-site-border bg-site-surface p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-site-text">
                <CoinIcon className="h-4 w-4" /> {profile.tipGoalLabel || t('tip-goal', { defaultValue: 'Tip goal' })}
              </span>
              <span className="text-site-text-muted">
                {(profile.tipsThisMonth ?? 0).toLocaleString()} / {profile.tipGoal.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-site-bg">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${Math.min(100, ((profile.tipsThisMonth ?? 0) / profile.tipGoal) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-site-text-dim mb-3">
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {profile.location}
            </span>
          )}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-site-accent hover:underline"
            >
              <LinkIcon className="w-4 h-4" />
              {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {t('joined-date', { date: formatDate(profile.createdAt), defaultValue: 'Joined {{date}}' })}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={() => setSocialModal('following')}
            className="hover:underline text-left"
          >
            <span className="font-bold text-site-text">{profile.followingCount}</span>{' '}
            <span className="text-site-text-dim">{t('following-label', { defaultValue: 'Following' })}</span>
          </button>
          <button
            onClick={() => setSocialModal('followers')}
            className="hover:underline text-left"
          >
            <span className="font-bold text-site-text">{profile.followerCount}</span>{' '}
            <span className="text-site-text-dim">{t('followers-label', { defaultValue: 'Followers' })}</span>
          </button>
        </div>

        {/* Hidden Spotify embed container */}
        {profile.profileSongSpotifyId && (
          <div
            ref={embedContainerRef}
            className="fixed -left-[9999px] -top-[9999px] w-px h-px overflow-hidden pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Tab bar */}
      <div className="border-b border-site-border">
        <div className="flex">
          <button
            onClick={() => handleTabChange('rmharks')}
            className={`flex-1 py-3 text-center text-sm font-bold transition-colors ${
              tab === 'rmharks'
                ? 'text-site-accent border-b-2 border-site-accent'
                : 'text-site-text-dim hover:text-site-text hover:bg-site-surface/50'
            }`}
          >
            RMHarks
          </button>
          {showLikesTab && (
            <button
              onClick={() => handleTabChange('likes')}
              className={`flex-1 py-3 text-center text-sm font-bold transition-colors ${
                tab === 'likes'
                  ? 'text-site-accent border-b-2 border-site-accent'
                  : 'text-site-text-dim hover:text-site-text hover:bg-site-surface/50'
              }`}
            >
              {t('likes', { defaultValue: 'Likes' })}
            </button>
          )}
        </div>
      </div>

      {/* RMHarks tab content */}
      {tab === 'rmharks' && (
        <div>
          {items.map((item) => (
            <RMHarkCard key={item.id} item={item} />
          ))}

          {loadingItems && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
            </div>
          )}

          {!loadingItems && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-lg font-medium text-site-text mb-1">{t('no-rmharks-yet', { defaultValue: 'No RMHarks yet' })}</p>
              <p className="text-sm text-site-text-muted">
                {profile.isOwnProfile
                  ? t('no-rmharks-own', { defaultValue: "You haven't posted any RMHarks yet." })
                  : t('no-rmharks-other', { handle: profile.handle, defaultValue: "@{{handle}} hasn't posted any RMHarks yet." })}
              </p>
            </div>
          )}

          {!hasMore && items.length > 0 && (
            <div className="py-8 text-center text-sm text-site-text-dim">
              {t('reached-the-end', { defaultValue: "You've reached the end" })}
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
        </div>
      )}

      {/* Likes tab content */}
      {tab === 'likes' && (
        <div>
          {likedItems.map((item) => (
            <RMHarkCard key={item.id} item={item} />
          ))}

          {loadingLiked && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
            </div>
          )}

          {!loadingLiked && likedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-lg font-medium text-site-text mb-1">{t('no-likes-yet', { defaultValue: 'No likes yet' })}</p>
              <p className="text-sm text-site-text-muted">
                {profile.isOwnProfile
                  ? t('no-likes-own', { defaultValue: "You haven't liked any posts yet." })
                  : t('no-likes-other', { handle: profile.handle, defaultValue: "@{{handle}} hasn't liked any posts yet." })}
              </p>
            </div>
          )}

          {!likedHasMore && likedItems.length > 0 && (
            <div className="py-8 text-center text-sm text-site-text-dim">
              {t('reached-the-end', { defaultValue: "You've reached the end" })}
            </div>
          )}

          <div ref={likedSentinelRef} className="h-1" />
        </div>
      )}

      {/* Tip dialog (non-owner) */}
      {profile && !profile.isOwnProfile && (
        <TipDialog
          open={tipOpen}
          onOpenChange={setTipOpen}
          recipientId={profile.id}
          recipientName={displayName ?? profile.name}
          entityType="profile"
          entityId={profile.id}
        />
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
            showLikes: profile.showLikes,
            dmPrivacy: profile.dmPrivacy,
            hasProfilePet: profile.hasProfilePet,
            showProfilePet: profile.showProfilePet,
            tipGoal: profile.tipGoal,
            tipGoalLabel: profile.tipGoalLabel,
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
                ...(data.image !== undefined ? { image: data.image, hasCustomAvatar: !!data.image?.startsWith('/api/profile/avatar/') } : {}),
                ...(data.handle !== undefined ? { handle: data.handle } : {}),
                ...(data.showProfilePet !== undefined ? { showProfilePet: data.showProfilePet } : {}),
                bio: data.bio,
                location: data.location,
                website: data.website,
                showLikes: data.showLikes,
                dmPrivacy: data.dmPrivacy,
                profileSongSpotifyId: data.profileSongSpotifyId,
                profileSongTitle: data.profileSongTitle,
                profileSongArtist: data.profileSongArtist,
                profileSongPreviewUrl: data.profileSongPreviewUrl,
                profileSongAlbumArt: data.profileSongAlbumArt,
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
