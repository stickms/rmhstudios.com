/**
 * RMH Music Player Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhMusicPlayerPage from '@/app/rmhmusic/player/page';

export const Route = createFileRoute('/rmhmusic/player')({
  component: RmhMusicPlayerPage,
});
