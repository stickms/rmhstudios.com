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
 */
export function UserAvatar({ src, alt, size = 32, className = '', fallbackName }: UserAvatarProps) {
  if (!src) {
    if (fallbackName) {
      return (
        <div
          className={`rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold shrink-0 ${className}`}
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          {fallbackName[0]?.toUpperCase() || 'U'}
        </div>
      );
    }
    return (
      <img
        src={DEFAULT_AVATAR}
        alt={alt}
        width={size}
        height={size}
        className={`rounded-full shrink-0 ${className}`}
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
        className={`rounded-full shrink-0 ${className}`}
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
      className={`rounded-full shrink-0 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
