/**
 * `/homes/saved` → the Saved tab of `/homes/manage`.
 * See that route's docblock for why the three shelves merged.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/homes/saved')({
  beforeLoad: () => {
    throw redirect({ to: '/homes/manage', search: { tab: 'saved' }, replace: true });
  },
});
