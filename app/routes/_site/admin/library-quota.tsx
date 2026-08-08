/**
 * `/admin/library-quota` → the Upload appeals tab of `/admin/library`.
 *
 * Kept as a redirect rather than deleted: it was linked from the admin hub for
 * long enough to be bookmarked, and an admin following a stale link should land
 * on the queue, not a 404.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/admin/library-quota')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/library', search: { tab: 'appeals' }, replace: true });
  },
});
