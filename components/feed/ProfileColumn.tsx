'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { MapPin, Link as LinkIcon, Calendar, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { RMHarkCard } from './RMHarkCard';
import { ProfileEditModal } from './ProfileEditModal';
import { SocialListModal } from './SocialListModal';
import { VinylRecord } from './VinylRecord';
import Link from 'next/link';
import type { FeedItem } from '@/lib/feed-types';

interface ProfileData {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  createdAt: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  showLikes: boolean;
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
}

type ProfileTab = 'rmharks' | 'likes';

export function ProfileColumn({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('rmharks');
  const [socialModal, setSocialModal] = useState<'followers' | 'following' | null>(null);

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

  const { data: session } = authClient.useSession();

  // Fetch profile
  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetch(`/api/profile/${encodeURIComponent(userId)}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setProfile(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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
        { uri: `spotify:track:${spotifyId}`, width: 1, height: 1 },
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

    // If the API is already loaded on the window, use it directly
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
    controllerRef.current?.togglePlay();
  }, []);

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
        <p className="text-lg font-medium text-site-text mb-1">User not found</p>
        <p className="text-sm text-site-text-muted mb-4">
          This user doesn&apos;t exist.
        </p>
        <Link href="/">
          <Button variant="accent" size="sm">Go Home</Button>
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
          <Link href="/" className="p-1.5 -ml-1.5 rounded-lg hover:bg-site-surface transition-colors">
            <ArrowLeft className="w-5 h-5 text-site-text" />
          </Link>
          <div>
            <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
              {profile.name || profile.username || 'User'}
            </h1>
            <p className="text-xs text-site-text-dim">{profile.rmharkCount} RMHarks</p>
          </div>
        </div>
      </div>

      {/* Profile header */}
      <div className="px-4 pt-6 pb-4 border-b border-site-border">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-2xl ring-4 ring-site-bg shrink-0">
              {profile.image ? (
                <img src={profile.image} alt={profile.name || 'User'} className="w-full h-full rounded-full object-cover" />
              ) : (
                (profile.name?.[0] || 'U').toUpperCase()
              )}
            </div>

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

          <div className="mt-2">
            {profile.isOwnProfile ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEdit(true)}
                className="rounded-full border-site-border text-site-text hover:bg-site-surface"
              >
                Edit Profile
              </Button>
            ) : session ? (
              <Button
                variant={profile.isFollowing ? 'outline' : 'accent'}
                size="sm"
                onClick={handleFollowToggle}
                className={`rounded-full ${profile.isFollowing ? 'border-site-border text-site-text hover:border-site-danger hover:text-site-danger hover:bg-site-danger/10' : ''}`}
              >
                {profile.isFollowing ? 'Following' : 'Follow'}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mb-3">
          <h2 className="font-bold text-xl text-site-text">{profile.name || 'Unknown'}</h2>
          {profile.username && (
            <p className="text-sm text-site-text-dim">@{profile.username}</p>
          )}
        </div>

        {profile.bio && (
          <p className="text-site-text text-[15px] whitespace-pre-wrap break-words mb-3">
            {profile.bio}
          </p>
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
            Joined {formatDate(profile.createdAt)}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={() => setSocialModal('following')}
            className="hover:underline text-left"
          >
            <span className="font-bold text-site-text">{profile.followingCount}</span>{' '}
            <span className="text-site-text-dim">Following</span>
          </button>
          <button
            onClick={() => setSocialModal('followers')}
            className="hover:underline text-left"
          >
            <span className="font-bold text-site-text">{profile.followerCount}</span>{' '}
            <span className="text-site-text-dim">Followers</span>
          </button>
        </div>

        {/* Hidden Spotify embed container (IFrame API injects here) */}
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
              Likes
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
              <p className="text-lg font-medium text-site-text mb-1">No RMHarks yet</p>
              <p className="text-sm text-site-text-muted">
                {profile.isOwnProfile
                  ? "You haven't posted any RMHarks yet."
                  : `@${profile.username} hasn't posted any RMHarks yet.`}
              </p>
            </div>
          )}

          {!hasMore && items.length > 0 && (
            <div className="py-8 text-center text-sm text-site-text-dim">
              You&apos;ve reached the end
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
              <p className="text-lg font-medium text-site-text mb-1">No likes yet</p>
              <p className="text-sm text-site-text-muted">
                {profile.isOwnProfile
                  ? "You haven't liked any posts yet."
                  : `@${profile.username} hasn't liked any posts yet.`}
              </p>
            </div>
          )}

          {!likedHasMore && likedItems.length > 0 && (
            <div className="py-8 text-center text-sm text-site-text-dim">
              You&apos;ve reached the end
            </div>
          )}

          <div ref={likedSentinelRef} className="h-1" />
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <ProfileEditModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          initial={{
            name: profile.name,
            image: profile.image,
            bio: profile.bio,
            location: profile.location,
            website: profile.website,
            showLikes: profile.showLikes,
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
                ...(data.image !== undefined ? { image: data.image } : {}),
                bio: data.bio,
                location: data.location,
                website: data.website,
                showLikes: data.showLikes,
                profileSongSpotifyId: data.profileSongSpotifyId,
                profileSongTitle: data.profileSongTitle,
                profileSongArtist: data.profileSongArtist,
                profileSongPreviewUrl: data.profileSongPreviewUrl,
                profileSongAlbumArt: data.profileSongAlbumArt,
              };
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
