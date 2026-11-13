import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PROFILE_BANNER_ASPECT } from '@/lib/profile/banner';

/**
 * The profile banner's box: a picture at `PROFILE_BANNER_ASPECT`, as wide as its container.
 *
 * The profile header, the editor's cover field and the editor's preview all draw the banner
 * with this one component, and the crop frame uses the same constant, so the height follows
 * the width everywhere and what the owner frames is what is shown. Never give it a height or
 * a `max-*` clamp: to make it shorter, make its container narrower. A `span`, because the
 * editor draws it inside a button.
 */
export function ProfileBanner({
  src,
  className,
  children,
}: {
  src: string | null | undefined;
  className?: string;
  /** Shown when there is no picture (the editor's placeholder). */
  children?: ReactNode;
}) {
  return (
    <span
      data-slot="profile-banner"
      className={cn(
        'relative block w-full overflow-hidden rounded-site border border-site-border bg-site-bg-subtle',
        className,
      )}
      style={{ aspectRatio: PROFILE_BANNER_ASPECT }}
    >
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        children
      )}
    </span>
  );
}
