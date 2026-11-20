import {
  lazy,
  Suspense,
  useState,
  type CSSProperties,
} from 'react';
import { Link } from '@tanstack/react-router';
import { PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { useArrival } from '@/components/ui/arrive';
import { WRITE_HREF } from '@/components/shell/sections';
import { cn } from '@/lib/utils';

/** The composer dialog, in its own chunk: only needed once the button is pressed (the sidebar loads it the same way). */
const ComposeModal =
  lazy(
    () =>
      import('@/components/feed/ComposeModal').then(
        (
          m,
        ) => ({
          default:
            m.ComposeModal,
        }),
      ),
  );

/**
 * The phone's "Write a post" button: a disc at the right end of the bottom-right lane (owner exception to L1,
 * 2026-11-20; plan section 9, L1a). On desktop the sidebar's "Write a post" does this job, so the disc is phone-only
 * (`lg:hidden`). Signed in it opens the composer in place, as the sidebar does; a modified click still follows the
 * link to `/share`. Signed out it is not rendered: the composer row at the top of the feed is the sign-in prompt.
 *
 * It is the overlay surface, not ink, so it never competes with the view's one primary (R4). `data-floating='compose'`
 * makes back-to-top step left to sit beside it (`.floating-fab-lane`, comfort-suite.css), and the inline
 * `--float-fab-lane: 0px` keeps this disc itself at the right edge.
 */
export function ComposeFab() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const {
    data: session,
    isPending,
  } =
    useSession();
  // Steel M9: it appears once the session resolves on the client, so it fades in.
  const arrival =
    useArrival(
      !isPending,
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );

  if (
    !session
  )
    return null;

  const label =
    t(
      'shell-write-post',
      {
        defaultValue:
          'Write a post',
      },
    );

  return (
    <>
      <Link
        to={
          WRITE_HREF
        }
        data-floating="compose"
        aria-label={
          label
        }
        title={
          label
        }
        style={
          {
            '--float-fab-lane':
              '0px',
          } as CSSProperties
        }
        onClick={(
          e,
        ) => {
          if (
            e.button !==
              0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
          )
            return;
          e.preventDefault();
          setOpen(
            true,
          );
        }}
        className={cn(
          'floating-fab-lane fixed z-40 lg:hidden',
          'flex size-11 items-center justify-center rounded-full',
          'surface-overlay text-site-text hover:border-site-accent',
          arrival,
        )}
      >
        <PenLine
          className="h-5 w-5"
          aria-hidden
        />
      </Link>
      {open && (
        <Suspense
          fallback={
            null
          }
        >
          <ComposeModal
            open
            onClose={() =>
              setOpen(
                false,
              )
            }
          />
        </Suspense>
      )}
    </>
  );
}
