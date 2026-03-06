/**
 * RMH Study Room Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhStudyRoomPage from '@/app/rmhstudy/[roomId]/page';

export const Route = createFileRoute('/rmhstudy/$roomId')({
  component: function RmhStudyRoom() {
    const { roomId } = Route.useParams();
    // The original component uses useParams() from next/navigation internally.
    // We pass roomId as a prop or rely on the component reading from TanStack router.
    // Since the original uses useParams, we need to wrap it.
    return <RmhStudyRoomPage />;
  },
});
