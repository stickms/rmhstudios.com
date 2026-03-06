/**
 * RMH Type Multiplayer Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTypeMultiplayerPage from '@/app/rmhtype/multiplayer/page';

export const Route = createFileRoute('/rmhtype/multiplayer')({
  component: RmhTypeMultiplayerPage,
});
