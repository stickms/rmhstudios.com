'use client';

import { memo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buildOptimizedUrl } from '@/components/ui/OptimizedImage';
import type { FeedItemUser } from '@/lib/feed-types';

const DEFAULT_AVATAR = '/images/social/default_avatar.png';

interface UserAvatarProps {
  user: FeedItemUser | undefined | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  linkToProfile?: boolean;
}

const sizeClasses = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-sm',
};

const sizePx = { xs: 28, sm: 32, md: 40, lg: 48 };

function userProfileHref(user: FeedItemUser): string {
  return `/u/${user.handle || user.id}`;
}

function UserAvatarImpl({ user, size = 'md', linkToProfile = true }: UserAvatarProps) {
  const { t } = useTranslation('feed');
  const [imgError, setImgError] = useState(false);

  if (!user) return null;

  const rawSrc = imgError ? DEFAULT_AVATAR : user.image;
  const showImg = !!rawSrc;
  // Route the avatar through the optimizer at ~2x its display size instead of
  // pulling the full-resolution external CDN original — 20 feed cards would each
  // fetch a raw Discord/Google avatar otherwise. Local paths (the fallback) pass
  // through untouched.
  const imgSrc = showImg ? buildOptimizedUrl(rawSrc as string, sizePx[size] * 2, 80) : undefined;
  const frame = user.cosmetics?.avatarFrame;

  const inner = (
    <div className={`${sizeClasses[size]} rounded-full bg-white/10 flex items-center justify-center text-site-text font-bold shrink-0`}>
      {showImg ? (
        <img
          src={imgSrc}
          alt={user.name || t('user-avatar-alt', { defaultValue: 'User' })}
          loading="lazy"
          decoding="async"
          width={sizePx[size]}
          height={sizePx[size]}
          className="w-full h-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        (user.name?.[0] || 'U').toUpperCase()
      )}
    </div>
  );

  // Equipped avatar frame (cosmetic): a thin gradient/solid ring around the avatar.
  const avatar = frame ? (
    <div className="rounded-full p-0.5 shrink-0" style={{ background: frame.gradient ?? frame.color }}>
      {inner}
    </div>
  ) : (
    inner
  );

  if (linkToProfile) {
    // §16.3.7 micro-interactivity: a profile-linking avatar is clickable, so it
    // must respond — a subtle hover dim + press scale + focus ring (reduced motion
    // collapses the transform via the global reset). It was a bare, inert <Link>.
    return (
      <Link
        to={userProfileHref(user)}
        className="block shrink-0 rounded-full transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50"
      >
        {avatar}
      </Link>
    );
  }

  return avatar;
}

/**
 * Memoized: avatars render in long feed/message/leaderboard lists, so skipping
 * re-renders when the `user`/`size` props are unchanged avoids wasted work.
 */
export const UserAvatar = memo(UserAvatarImpl);
