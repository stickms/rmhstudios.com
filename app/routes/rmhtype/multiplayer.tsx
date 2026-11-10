/**
 * RMH Type Multiplayer Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import RmhTypeMultiplayerPage from '@/components/rmhtype/RmhTypeMultiplayerPage';

export const Route = createFileRoute('/rmhtype/multiplayer')({
  head: () => noindexHead('Typing Multiplayer'),
  component: RmhTypeMultiplayerPage,
});
