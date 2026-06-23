'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('feed');
  const [imgError, setImgError] = useState(false);

  if (!user) return null;

  const imgSrc = imgError ? DEFAULT_AVATAR : user.image;
  const showImg = !!imgSrc;
  const frame = user.cosmetics?.avatarFrame;

  const inner = (
    <div className={`${sizeClasses[size]} rounded-full bg-white/10 flex items-center justify-center text-site-text font-bold shrink-0`}>
      {showImg ? (
        <img
          src={imgSrc}
          alt={user.name || t('user-avatar-alt', { defaultValue: 'User' })}
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

  // Equipped avatar frame (cosmetic): a thin gradient/solid ring around the avatar.
  const avatar = frame ? (
    <div className="rounded-full p-0.5 shrink-0" style={{ background: frame.gradient ?? frame.color }}>
      {inner}
    </div>
  ) : (
    inner
  );

  if (linkToProfile) {
    return <Link to={userProfileHref(user)}>{avatar}</Link>;
  }

  return avatar;
}
