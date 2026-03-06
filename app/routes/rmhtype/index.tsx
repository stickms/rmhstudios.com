/**
 * RMH Type Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTypePage from '@/components/rmhtype/RmhTypeLanding';

export const Route = createFileRoute('/rmhtype/')({
  component: RmhTypePage,
});
