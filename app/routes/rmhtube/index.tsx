/**
 * RMH Tube Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTubePage from '@/components/rmhtube/RmhTubeLanding';

export const Route = createFileRoute('/rmhtube/')({
  component: RmhTubePage,
});
