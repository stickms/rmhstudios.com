/**
 * /create/earnings — the creator dashboard and earnings breakdown.
 *
 * Was `/create?tab=earnings`. `noindex` because every figure on it is the
 * viewer's own: there is nothing here for an anonymous crawler to rank, and the
 * page would otherwise be indexed as an empty signed-out shell.
 */

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { StudioDashboard } from '@/components/creator-studio/StudioDashboard';
import { EarningsTab } from '@/components/creator-studio/EarningsTab';

export const Route = createFileRoute('/_site/create/earnings')({
  head: () => ({
    meta: [
      ...buildMeta({
        title: 'Earnings | RMH Studios',
        description: 'Your creator dashboard — views, coins earned, and payouts.',
        path: '/create/earnings',
      }),
      { name: 'robots', content: 'noindex' },
    ],
    links: [buildCanonical('/create/earnings')],
  }),
  component: CreateEarningsTab,
});

function CreateEarningsTab() {
  return (
    <div className="cstudio-body">
      <StudioDashboard />
      <EarningsTab />
    </div>
  );
}
