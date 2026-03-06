/**
 * RMH Tube Room Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTubeRoomPage from '@/app/rmhtube/[roomId]/page';

export const Route = createFileRoute('/rmhtube/$roomId')({
  component: function RmhTubeRoom() {
    return <RmhTubeRoomPage />;
  },
});
