import { createFileRoute, Outlet } from '@tanstack/react-router';
import { buildMeta } from '@/lib/seo';

/**
 * `/services` — the layout the Services section hangs off.
 *
 * Deliberately empty of chrome. The hub at `services/index.tsx` and each child
 * (Rebar & Rutabaga, and whatever follows) are ordinary `PageLayout` pages with
 * their own title, lede and `head()`; a shared header here would mean two title
 * blocks stacked on every child. This file exists only so the section HAS a
 * parent to nest under, which is the same shape `rmhladder` uses — the
 * difference being that RMHLadder's layout wraps its children in an app shell
 * and this one has nothing to wrap them in.
 *
 * The `validateSearch` and the canonical that used to live here moved to the
 * index with the hub they belong to. A layout's `head()` applies to every
 * descendant, and `links` are additive rather than overridden — so a
 * `buildCanonical('/services')` left here would have emitted a second, wrong
 * canonical on every child page. `rmhladder` splits it the same way: its layout
 * carries a stylesheet link, its index carries the canonical.
 *
 * What stays is a title, which children DO override (meta is deduped by name),
 * so it only ever shows for a descendant that forgot one.
 */
export const Route = createFileRoute('/_site/services')({
  head: () => ({
    meta: buildMeta({
      title: 'Services | RMH Studios',
      description: 'RMH Studios services.',
      path: '/services',
    }),
  }),
  component: () => <Outlet />,
});
