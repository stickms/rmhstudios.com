/**
 * /lists — legacy redirect to the Lists tab of /saves.
 *
 * Still its own store (a list curates *accounts* and is read as its own
 * timeline, which a save is not) — but not its own destination. Individual
 * lists keep their own URL at /lists/$id.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/lists/')({
  beforeLoad: () => {
    throw redirect({ to: '/saves', search: { tab: 'lists' } });
  },
});
