/**
 * RMH Music Player Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhMusicPlayerPage from '@/components/rmhmusic/RmhMusicPlayerPage';

export const Route = createFileRoute('/rmhmusic/player')({
  component: RmhMusicPlayerPage,
});
