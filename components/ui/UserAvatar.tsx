'use client';

import { useState } from 'react';
import { OptimizedImage } from './OptimizedImage';

interface UserAvatarProps {
 src: string | null | undefined;
 alt: string;
 /** Display size in pixels (default 32) */
 size?: number;
 className?: string;
 fallbackName?: string;
}

const DEFAULT_AVATAR = '/images/social/default_avatar.png';

/**
 * Optimized user avatar component.
 * Proxies external avatar URLs through the image optimizer for WebP conversion
 * and proper sizing. Falls back to initials or default avatar.
 *
 * `data-slot="avatar"` gives it the tier-L jelly rim (a 1px lit ring, app/jelly-coverage.css §7):
 * no haze over faces, and no press of its own — when the avatar is a control, the button or link
 * around it is the soft body.
 */
export function UserAvatar({ src, alt, size = 32, className = '', fallbackName }: UserAvatarProps) {
 // When the (possibly proxied) avatar fails to load — e.g. a 502 from the
 // image proxy or a dead remote avatar — fall back to the default avatar.
 const [imgError, setImgError] = useState(false);

 // The two `<img>` branches carry the same `object-cover` + inline box as the
 // proxied one below. `width`/`height` attributes alone do not survive the
 // `img { height: auto }` in the base reset, so a non-square source rendered at
 // its own aspect ratio — a 40px circle came out a 40×21 lozenge — and an
 // avatar is a circle at every call site.
 if (!src || imgError) {
 return (
 <img
 src={DEFAULT_AVATAR}
 alt={alt}
 width={size}
 height={size}
 data-slot="avatar"
 className={`rounded-full shrink-0 object-cover ${className}`}
 style={{ width: size, height: size }}
 />
 );
 }

 // Local images (default avatar) don't need proxy
 if (src.startsWith('/')) {
 return (
 <img
 src={src}
 alt={alt}
 width={size}
 height={size}
 data-slot="avatar"
 className={`rounded-full shrink-0 object-cover ${className}`}
 style={{ width: size, height: size }}
 onError={() => setImgError(true)}
 />
 );
 }

 return (
 <OptimizedImage
 src={src}
 alt={alt}
 width={size * 2}
 height={size * 2}
 quality={75}
 data-slot="avatar"
 className={`rounded-full shrink-0 object-cover ${className}`}
 style={{ width: size, height: size }}
 onError={() => setImgError(true)}
 />
 );
}
