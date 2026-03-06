/**
 * RMH Type Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTypePage from '@/app/rmhtype/page';

export const Route = createFileRoute('/rmhtype/')({
  component: RmhTypePage,
});
