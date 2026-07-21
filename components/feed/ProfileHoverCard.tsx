'use client';

/**
 * Hover profile card: wrap any username/avatar with <ProfileHoverCard userId>
 * and a rich preview (avatar, bio, follower counts, online dot, follow button)
 * appears on hover/focus. Profile data is fetched lazily on first open and
 * cached for the component's lifetime.
 */

import { useCallback, useState } from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { AnimatedCount } from '@/components/ui/AnimatedCount';

interface HoverProfile {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  bio: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
  isOnline?: boolean;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
}

export function ProfileHoverCard({
  userId,
  children,
}: {
  /** User id or handle — anything /api/profile/$id resolves. */
  userId: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [profile, setProfile] = useState<HoverProfile | null>(null);
  const { run: runFollow, pending: followBusy } = useOptimisticAction();

  const load = useCallback(
    async (open: boolean) => {
      if (!open || profile) return;
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(userId)}`, {
          credentials: 'include',
        });
        if (res.ok) setProfile(await res.json());
      } catch {
        // Hover preview is best-effort.
      }
    },
    [userId, profile]
  );

  const toggleFollow = () => {
    if (!profile) return;
    if (!session?.user) {
      navigate({ to: '/login', search: { callbackURL: undefined } });
      return;
    }
    const wasFollowing = profile.isFollowing;
    const followId = profile.id;
    runFollow({
      apply: () =>
        setProfile((p) =>
          p
            ? { ...p, isFollowing: !wasFollowing, followerCount: p.followerCount + (wasFollowing ? -1 : 1) }
            : p
        ),
      rollback: () =>
        setProfile((p) =>
          p
            ? { ...p, isFollowing: wasFollowing, followerCount: p.followerCount + (wasFollowing ? 1 : -1) }
            : p
        ),
      commit: () =>
        fetch(`/api/profile/${encodeURIComponent(followId)}/follow`, {
          method: 'POST',
          credentials: 'include',
        }),
    });
  };

  const profileHref = `/u/${profile?.handle || userId}`;

  return (
    <HoverCard.Root openDelay={450} closeDelay={150} onOpenChange={load}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-[80] w-72 p-4 glass-overlay outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {!profile ? (
            <div className="flex animate-pulse items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-site-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-site-surface" />
                <div className="h-3 w-1/3 rounded bg-site-surface" />
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-start justify-between gap-2">
                <Link to={profileHref}>
                  <span className="relative inline-block">
                    <UserAvatar src={profile.image} alt={profile.name ?? 'User'} size={48} fallbackName={profile.name ?? undefined} />
                    {profile.isOnline && (
                      <span
                        title={t('online-now', { defaultValue: 'Online now' })}
                        className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-site-bg bg-site-success"
                      />
                    )}
                  </span>
                </Link>
                {!profile.isOwnProfile && (
                  <Button
                    size="sm"
                    variant={profile.isFollowing ? 'outline' : 'accent'}
                    disabled={followBusy}
                    onClick={toggleFollow}
                    className="rounded-full"
                  >
                    {profile.isFollowing
                      ? t('following', { defaultValue: 'Following' })
                      : t('follow', { defaultValue: 'Follow' })}
                  </Button>
                )}
              </div>
              <Link to={profileHref} className="group block">
                <p className="flex items-center gap-1 font-bold text-site-text group-hover:underline">
                  <span className="truncate">{profile.name || t('unknown-user', { defaultValue: 'Unknown' })}</span>
                  {profile.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-site-success" aria-hidden />}
                  {profile.isAdmin && <ShieldCheck className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />}
                </p>
                {profile.handle && <p className="text-sm text-site-text-dim">@{profile.handle}</p>}
              </Link>
              {profile.bio && (
                <p className="mt-2 line-clamp-3 text-sm text-site-text-muted">{profile.bio}</p>
              )}
              <div className="mt-2 flex gap-4 text-sm">
                <span>
                  <AnimatedCount value={profile.followingCount} format={(n) => n.toLocaleString()} className="font-bold text-site-text" />{' '}
                  <span className="text-site-text-dim">{t('following-label', { defaultValue: 'Following' })}</span>
                </span>
                <span>
                  <AnimatedCount value={profile.followerCount} format={(n) => n.toLocaleString()} className="font-bold text-site-text" />{' '}
                  <span className="text-site-text-dim">{t('followers-label', { defaultValue: 'Followers' })}</span>
                </span>
              </div>
            </>
          )}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
