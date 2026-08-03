/**
 * /profile/$id — legacy redirect to /u/$userid.
 *
 * The same page under two URLs. `/u/$userid` is the canonical one: it resolves
 * a handle *or* an id (with the legacy `@` prefix stripped), and it carries the
 * `rel=canonical`, the Person JSON-LD and the RSS autodiscovery link this route
 * never grew. Both were live and indexable and only one of them told a crawler
 * which was authoritative, so every profile on the site was a duplicate-content
 * pair whose winner was picked for us — roughly half the time landing on the
 * copy with no structured data.
 *
 * `/u/$userid` takes an id in the same slot, so the param passes straight
 * through and old links keep working.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/profile/$id')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/u/$userid', params: { userid: params.id } });
  },
});
