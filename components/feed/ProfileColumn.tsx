'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { MapPin, Link as LinkIcon, Calendar, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { RMHeetCard } from './RMHeetCard';
import { ProfileEditModal } from './ProfileEditModal';
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
  followerCount: number;
  followingCount: number;
  rmheetCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
}

export function ProfileColumn({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // RMHeet list state
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);

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

  // Fetch RMHeets
  const fetchRMHeets = useCallback(async () => {
    if (loadingItems) return;
    setLoadingItems(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/profile/${encodeURIComponent(userId)}/rmheets?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Fetch rmheets error:', error);
    } finally {
      setLoadingItems(false);
    }
  }, [userId, cursor, loadingItems]);

  // Initial fetch
  useEffect(() => {
    if (!initialFetched.current && !loading && profile) {
      initialFetched.current = true;
      fetchRMHeets();
    }
  }, [loading, profile, fetchRMHeets]);

  // Infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingItems) {
        fetchRMHeets();
      }
    },
    [hasMore, loadingItems, fetchRMHeets]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerCallback]);

  // Follow toggle
  const handleFollowToggle = async () => {
    if (!profile || !session) return;
    const wasFollowing = profile.isFollowing;

    // Optimistic update
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
        // Rollback
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
            <p className="text-xs text-site-text-dim">{profile.rmheetCount} RMHeets</p>
          </div>
        </div>
      </div>

      {/* Profile header */}
      <div className="px-4 pt-6 pb-4 border-b border-site-border">
        <div className="flex items-start justify-between mb-4">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-2xl ring-4 ring-site-bg shrink-0">
            {profile.image ? (
              <img src={profile.image} alt={profile.name || 'User'} className="w-full h-full rounded-full object-cover" />
            ) : (
              (profile.name?.[0] || 'U').toUpperCase()
            )}
          </div>

          {/* Action button */}
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

        {/* Name + username */}
        <div className="mb-3">
          <h2 className="font-bold text-xl text-site-text">{profile.name || 'Unknown'}</h2>
          {profile.username && (
            <p className="text-sm text-site-text-dim">@{profile.username}</p>
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-site-text text-[15px] whitespace-pre-wrap break-words mb-3">
            {profile.bio}
          </p>
        )}

        {/* Meta info */}
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

        {/* Follow counts */}
        <div className="flex items-center gap-4 text-sm">
          <span>
            <span className="font-bold text-site-text">{profile.followingCount}</span>{' '}
            <span className="text-site-text-dim">Following</span>
          </span>
          <span>
            <span className="font-bold text-site-text">{profile.followerCount}</span>{' '}
            <span className="text-site-text-dim">Followers</span>
          </span>
        </div>
      </div>

      {/* RMHeets tab header */}
      <div className="border-b border-site-border">
        <div className="flex">
          <div className="flex-1 py-3 text-center text-sm font-bold text-site-accent border-b-2 border-site-accent">
            RMHeets
          </div>
        </div>
      </div>

      {/* User's RMHeets */}
      <div>
        {items.map((item) => (
          <RMHeetCard key={item.id} item={item} />
        ))}

        {loadingItems && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
          </div>
        )}

        {!loadingItems && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-lg font-medium text-site-text mb-1">No RMHeets yet</p>
            <p className="text-sm text-site-text-muted">
              {profile.isOwnProfile
                ? "You haven't posted any RMHeets yet."
                : `@${profile.username} hasn't posted any RMHeets yet.`}
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

      {/* Edit modal */}
      {showEdit && (
        <ProfileEditModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          initial={{
            bio: profile.bio,
            location: profile.location,
            website: profile.website,
          }}
          onSaved={(data) => {
            setProfile((prev) =>
              prev ? { ...prev, ...data } : prev
            );
          }}
        />
      )}
    </div>
  );
}
