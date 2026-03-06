/**
 * RMH Tube Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTubePage from '@/app/rmhtube/page';

export const Route = createFileRoute('/rmhtube/')({
  component: RmhTubePage,
});
