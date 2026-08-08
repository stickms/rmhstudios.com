/**
 * `/admin/library-storage` → the Storage health tab of `/admin/library`.
 * See the sibling `library-quota.tsx` for why these stay as redirects.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/admin/library-storage')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/library', search: { tab: 'storage' }, replace: true });
  },
});
