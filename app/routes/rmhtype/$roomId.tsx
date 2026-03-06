/**
 * RMH Type Room Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTypeRoomPage from '@/app/rmhtype/[roomId]/page';

export const Route = createFileRoute('/rmhtype/$roomId')({
  component: function RmhTypeRoom() {
    return <RmhTypeRoomPage />;
  },
});
