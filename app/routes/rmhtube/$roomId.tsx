/**
 * RMH Tube Room Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import RmhTubeRoomPage from '@/components/rmhtube/RmhTubeRoomPage';

export const Route = createFileRoute('/rmhtube/$roomId')({
  head: () => noindexHead('Watch Room'),
  component: function RmhTubeRoom() {
    return <RmhTubeRoomPage />;
  },
});
