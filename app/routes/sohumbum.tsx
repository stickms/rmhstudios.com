/**
 * /sohumbum — the pledge review.
 *
 * Top level rather than under `_site/` on purpose: the page carries its own
 * fixed palette instead of the `--site-*` tokens, so it wants the full-screen
 * tier and no radial shell. `noIndex` keeps it out of the index while still
 * emitting a title and canonical — it is linked from a profile, not from search.
 */

import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { SohumBumPage } from '@/components/sohumbum/SohumBumPage';
import sohumbumCss from '@/components/sohumbum/sohumbum.css?url';

const head = definePage({
  path: '/sohumbum',
  title: 'Is Sohum Joshi A Bum Yet? | RMH Studios',
  description:
    'A standing review of the four terms Sohum Joshi set himself, and the time remaining to meet them. Countdown to January 1st, 2030.',
  noIndex: true,
});

export const Route = createFileRoute('/sohumbum')({
  head: (ctx) => {
    const base = head(ctx);
    // The page's stylesheet rides alongside the canonical rather than being
    // imported from the component: a top-level route has no shell to hang it
    // off, and `?url` + a head link keeps it out of the shared CSS bundle.
    return { ...base, links: [...base.links, { rel: 'stylesheet', href: sohumbumCss }] };
  },
  component: SohumBumPage,
});
