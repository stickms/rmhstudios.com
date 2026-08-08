/**
 * `/homes/watches` → the Alerts tab of `/homes/manage`.
 * See that route's docblock for why the three shelves merged.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/homes/watches')({
  beforeLoad: () => {
    throw redirect({ to: '/homes/manage', search: { tab: 'alerts' }, replace: true });
  },
});
