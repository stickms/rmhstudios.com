/**
 * /pricing — legacy redirect.
 *
 * Membership is the "Membership" tab of /store, alongside Shop and Market.
 * This route redirects so old links — upgrade prompts, the developer keys
 * page, and anything handed to a payment processor or a partner — land there.
 *
 * Keeping it as a redirect rather than deleting it is the point: /pricing is
 * the URL most likely to exist outside this codebase. The page it used to
 * render was the same <MembershipPanel/> the tab renders, off the same tier
 * lookup, at a second indexable URL with its own canonical.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/pricing')({
  beforeLoad: () => {
    throw redirect({ to: '/store', search: { tab: 'membership' } });
  },
});
