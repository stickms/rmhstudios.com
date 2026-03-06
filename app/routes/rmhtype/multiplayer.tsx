/**
 * RMH Type Multiplayer Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTypeMultiplayerPage from '@/components/rmhtype/RmhTypeMultiplayerPage';

export const Route = createFileRoute('/rmhtype/multiplayer')({
  component: RmhTypeMultiplayerPage,
});
