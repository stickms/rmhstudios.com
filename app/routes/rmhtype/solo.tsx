/**
 * RMH Type Solo Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhTypeSoloPage from '@/components/rmhtype/RmhTypeSoloPage';

export const Route = createFileRoute('/rmhtype/solo')({
  component: RmhTypeSoloPage,
});
