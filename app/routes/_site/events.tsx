/**
 * Events Route
 *
 * The standalone Events page has been merged into `/communities` as a tab. This
 * route redirects so old links and the former nav entry land on the events tab.
 * The events UI now lives in `components/events/EventsColumn.tsx`.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/events')({
  beforeLoad: () => {
    throw redirect({ to: '/communities', search: { tab: 'events' } });
  },
});
