/**
 * RMH Study Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhStudyLanding from '@/components/rmhstudy/RmhStudyLanding';

export const Route = createFileRoute('/rmhstudy/')({
  component: RmhStudyLanding,
});
