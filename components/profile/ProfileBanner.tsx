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
 *
 * `backdrop` is an equipped point-shop cosmetic (a BANNER, or a THEME's backdrop): a CSS
 * background from the shop catalog, drawn as the box's picture when there is no uploaded image.
 * It is a gradient, and this box is the one place on the site tier where a purchased gradient
 * is drawn (R1 is about page chrome; this is the content of a picture). It comes from the
 * item's data as an inline style, never from a class, and it goes nowhere else.
 */
export function ProfileBanner({
  src,
  backdrop,
  strip,
  className,
  children,
}: {
  src: string | null | undefined;
  backdrop?: string | null | undefined;
  /**
   * An equipped theme's gradient, drawn as a thin band along the bottom edge of an uploaded picture.
   * The picture wins the box (an upload is a deliberate choice), so without this a themed profile
   * with a banner would show no sign of its theme. Ignored when there is no picture: `backdrop`
   * already fills the box then. Same rules as `backdrop`: inline from item data, inside this box only.
   */
  strip?: string | null | undefined;
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
      style={{
        aspectRatio: PROFILE_BANNER_ASPECT,
        ...(!src && backdrop ? { background: backdrop } : {}),
      }}
    >
      {src ? (
        <>
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
          {strip ? (
            <span
              data-slot="profile-banner-strip"
              aria-hidden
              className="absolute inset-x-0 bottom-0 top-[calc(100%-4px)] block"
              style={{ background: strip }}
            />
          ) : null}
        </>
      ) : (
        children
      )}
    </span>
  );
}
