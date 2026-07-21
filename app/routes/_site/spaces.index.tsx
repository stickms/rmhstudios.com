/**
 * Spaces Index Route
 *
 * The live-Spaces directory has been merged into `/communities` as a tab. This
 * route redirects so old links and the former nav entry land on the spaces tab.
 * The directory UI now lives in `components/spaces/SpacesColumn.tsx`.
 *
 * Only the INDEX moved — the live room at `/spaces/$id` (spaces.$id.tsx) is
 * untouched and keeps working.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/spaces/')({
  beforeLoad: () => {
    throw redirect({ to: '/communities', search: { tab: 'spaces' } });
  },
});
