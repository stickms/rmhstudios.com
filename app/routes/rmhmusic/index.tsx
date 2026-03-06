/**
 * RMH Music Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhMusicPage from '@/app/rmhmusic/page';

export const Route = createFileRoute('/rmhmusic/')({
  component: RmhMusicPage,
});
