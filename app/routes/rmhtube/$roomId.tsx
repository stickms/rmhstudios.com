/**
 * RMH Tube Room Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTubeRoomPage from '@/components/rmhtube/RmhTubeRoomPage';

export const Route = createFileRoute('/rmhtube/$roomId')({
  component: function RmhTubeRoom() {
    return <RmhTubeRoomPage />;
  },
});
