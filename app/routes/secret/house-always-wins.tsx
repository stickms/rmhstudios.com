/**
 * House Always Wins Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { HouseAlwaysWinsGate } from '@/components/house-always-wins/HouseAlwaysWinsGate';

export const Route = createFileRoute('/secret/house-always-wins')({
  component: HouseAlwaysWinsPage,
});

function HouseAlwaysWinsPage() {
  return <HouseAlwaysWinsGate />;
}
