/**
 * RMH Eats Route
 */

import { createFileRoute } from '@tanstack/react-router';
import RMHEatsApp from '@/components/rmh-eats/RMHEatsApp';

export const Route = createFileRoute('/secret/eats')({
  head: () => ({
    meta: [{ title: 'RMH Eats | Food Delivery Simulator' }],
  }),
  component: EatsPage,
});

function EatsPage() {
  return <RMHEatsApp />;
}
