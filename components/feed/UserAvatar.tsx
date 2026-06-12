'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
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

export function UserAvatar({ user, size = 'md', linkToProfile = true }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (!user) return null;

  const imgSrc = imgError ? DEFAULT_AVATAR : user.image;
  const showImg = !!imgSrc;

  const avatar = (
    <div className={`${sizeClasses[size]} rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold shrink-0`}>
      {showImg ? (
        <img
          src={imgSrc}
          alt={user.name || 'User'}
          loading="lazy"
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

  if (linkToProfile) {
    return <Link to={userProfileHref(user)}>{avatar}</Link>;
  }

  return avatar;
}
