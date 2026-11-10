/**
 * RMH Type Solo Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import RmhTypeSoloPage from '@/components/rmhtype/RmhTypeSoloPage';

export const Route = createFileRoute('/rmhtype/solo')({
  head: () => noindexHead('Typing Practice'),
  component: RmhTypeSoloPage,
});
