import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { noindexHead } from '@/lib/seo';
import { labAccessAllowed } from '@/components/radial/eversion/lab/access';
import { EversionLab } from '@/components/radial/eversion/lab/EversionLab';

/**
 * Globe-eversion harness (T26). Internal tooling: a top-level (full-screen)
 * route, `noindex`, absent from the sitemap and every nav, and admin-only — a
 * non-admin is redirected home before the page loads. See `labAccessAllowed`
 * for the one dev-only exception (the e2e).
 */
const checkLabAccess = createServerFn({ method: 'GET' }).handler(async () => {
  const allowed = labAccessAllowed({
    nodeEnv: process.env.NODE_ENV,
    openFlag: process.env.EVERSION_LAB_OPEN,
    // The session lookup is skipped (it needs the database) when the flag decides.
    isAdmin:
      process.env.NODE_ENV !== 'production' && process.env.EVERSION_LAB_OPEN === '1'
        ? false
        : Boolean(
            ((await getRequestSession())?.user as { isAdmin?: boolean } | undefined)?.isAdmin,
          ),
  });
  if (!allowed) throw redirect({ to: '/' });
  return null;
});

export const Route = createFileRoute('/eversion-lab')({
  beforeLoad: () => checkLabAccess(),
  head: () => noindexHead('Eversion lab'),
  component: EversionLab,
});
