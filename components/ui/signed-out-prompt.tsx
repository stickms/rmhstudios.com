'use client';

/**
 * "Sign in to see this" — the one shape, for the one state.
 *
 * A signed-out page is a zero state with a known cause and a known remedy, and
 * it is the first thing a large share of visitors ever see of a given route. It
 * had **six** shapes across ~15 routes:
 *
 *   1. a centred line + `<Link><Button variant="accent">`  (analytics, progress,
 *      drafts, achievements, wrapped, groups/$id)
 *   2. the same with `py-16` and the nesting inverted, untranslated
 *      (trash, developer/index)
 *   3. an inline sentence with a text link (settings/index, profile, security,
 *      privacy, account-status)
 *   4. `max-w-md py-20` + a DEFAULT-variant Button, untranslated
 *      (homes/manage, homes/submit)
 *   5. an icon + `<h2>` + a raw `<a>` styled as a button, with a
 *      `transition-transform hover:scale-105` nothing else on the site does
 *      (rideshare/drive, rideshare/ride)
 *   6. a full-bleed `min-h-screen bg-site-bg` bordered card
 *      (user-builds/submit, user-builds/manage)
 *
 * Six paddings, three button treatments, two of them untranslated, and one that
 * painted an opaque slab over the ring backdrop.
 *
 * ## Built ON `EmptyState`, not beside it
 *
 * This is a zero state, so it takes the zero-state block — the etched glass
 * medallion, the `font-display` title, the `clamp(2.5rem, 7vw, 4rem)` rhythm —
 * rather than a second one calibrated by hand. The only thing this adds is the
 * part that is specific to being signed out: the destination, and the return
 * trip.
 *
 * ## Two required props, both deliberate
 *
 * `title` is required rather than defaulted. Every one of the fifteen call sites
 * already had its own specific, already-translated line — "Sign in to view your
 * analytics", "Sign in to see your drafts" — and a generic "Sign in to continue"
 * default would have been both a regression in specificity and a new key in all
 * 16 catalogs. The component unifies the SHAPE; the sentence stays the page's.
 * That is also why this mints no i18n keys at all: the only string it owns is
 * the button, and `common:sign-in` already exists.
 *
 * ## `callbackURL` is required, and that is the point
 *
 * Sending someone to `/login` and then dropping them on the feed is the failure
 * this shape exists to prevent, and three of the six above did exactly that.
 * Making the prop required means a caller has to decide where the visitor comes
 * back to.
 *
 * Routes with nothing at all to show signed out should keep redirecting in
 * `beforeLoad` instead (the eleven `rmhladder/*` routes do). This is for pages
 * whose chrome is still worth rendering.
 */

import type { LucideIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export interface SignedOutPromptProps {
  /** Optional glyph, rendered in `EmptyState`'s medallion. */
  icon?: LucideIcon;
  /**
   * What signing in gets them, in the page's own words. Required — see above.
   */
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Where to return after signing in. Required: the whole reason this is a
   * component rather than a snippet is that the return trip kept being dropped.
   */
  callbackURL: string;
  /** Override the button label — for "Sign in to continue" and similar. */
  actionLabel?: string;
  className?: string;
}

export function SignedOutPrompt({
  icon,
  title,
  description,
  callbackURL,
  actionLabel,
  className,
}: SignedOutPromptProps) {
  const { t } = useTranslation('common');

  return (
    <EmptyState
      className={className}
      icon={icon}
      title={title}
      description={description}
      action={
        <Link to="/login" search={{ callbackURL }}>
          <Button variant="accent">{actionLabel ?? t('sign-in', { defaultValue: 'Sign in' })}</Button>
        </Link>
      }
    />
  );
}
