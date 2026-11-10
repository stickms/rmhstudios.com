/**
 * RMH Type Room Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import RmhTypeRoomPage from '@/components/rmhtype/RmhTypeRoomPage';

export const Route = createFileRoute('/rmhtype/$roomId')({
  head: () => noindexHead('Typing Room'),
  component: function RmhTypeRoom() {
    return <RmhTypeRoomPage />;
  },
});
