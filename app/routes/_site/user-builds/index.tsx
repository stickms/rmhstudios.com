/**
 * /user-builds — redirects to the games catalog.
 *
 * The old standalone User Builds listing was folded into /builds, and the
 * catalogs then moved out to their own pages — so this forwards straight to
 * /games rather than through /builds, which is itself a redirect now. The
 * community half lives at /create/builds. Submit/manage routes remain under
 * /user-builds/*.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/user-builds/')({
  beforeLoad: () => {
    throw redirect({ to: '/games' });
  },
});
