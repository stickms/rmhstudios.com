/**
 * RMH Type Room Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTypeRoomPage from '@/components/rmhtype/RmhTypeRoomPage';

export const Route = createFileRoute('/rmhtype/$roomId')({
  component: function RmhTypeRoom() {
    return <RmhTypeRoomPage />;
  },
});
