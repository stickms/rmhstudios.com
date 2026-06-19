/**
 * /user-builds — redirects to the unified /builds bookshelf.
 *
 * The old standalone User Builds listing has been replaced by /builds, which
 * toggles between Curated/Official and User builds. Submit/manage routes remain
 * under /user-builds/*.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/user-builds/')({
  beforeLoad: () => {
    throw redirect({ to: '/builds' });
  },
});
