/**
 * RMH Study Landing Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RmhStudyLanding from '@/app/rmhstudy/page';

export const Route = createFileRoute('/rmhstudy/')({
  component: RmhStudyLanding,
});
