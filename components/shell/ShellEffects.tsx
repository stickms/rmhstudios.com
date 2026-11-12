import { useLayoutEffect, useRef } from 'react';
import { TabBadge } from '@/components/site/TabBadge';
import { useSession } from '@/components/Providers';
import {
  armEntranceGuard,
  commitPageTransition,
  finishEntranceAnimations,
  revealPageContent,
} from '@/lib/page-transition';
import { useInboxCount } from './use-inbox-count';
import { useRenderedHref } from './shell-router-state';

/**
 * The things the old shell did on every committed page that are not chrome. Renders nothing visible.
 *
 *  - Each committed page finishes the one-shot entrance animations it mounted with and ends the old page's leave dim
 *    (lib/page-transition). Steel M6 and M8 retire those entrances for good in a later phase; until then this keeps the
 *    pages that still carry them from painting a half-played one.
 *  - The unread total is mirrored onto the tab title, the favicon and the installed-app badge (TabBadge).
 */
export function ShellEffects() {
  const renderedHref = useRenderedHref();
  const { data: session } = useSession();
  const inbox = useInboxCount(Boolean(session));

  const committedOnce = useRef(false);
  useLayoutEffect(() => {
    if (!committedOnce.current) {
      committedOnce.current = true;
      return;
    }
    commitPageTransition();
    const column = document.querySelector('.page-root');
    if (!column) return;
    finishEntranceAnimations(column);
    revealPageContent(
      column,
      document.documentElement.dataset.navKind === 'sibling' ? 'sibling' : 'cross',
    );
    armEntranceGuard();
  }, [renderedHref]);

  return <TabBadge count={inbox} />;
}
