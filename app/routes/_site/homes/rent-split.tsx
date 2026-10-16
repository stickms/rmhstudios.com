/**
 * RMHHomes — fair rent split (/homes/rent-split)
 *
 * A thin shell: the calculator lives in `RentSplitCalculator`. The rent, shared
 * share and rooms ride in the URL (`?rent=&shared=&rooms=`) so a split can be
 * sent to the people paying it; nothing is stored.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RentSplitPage } from '@/components/homes/RentSplitPage';
import type { RentSplitSearch } from '@/lib/homes/rent-split-url';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/homes/rent-split')({
  validateSearch: (s: Record<string, unknown>): RentSplitSearch => ({
    rent: typeof s.rent === 'string' || typeof s.rent === 'number' ? String(s.rent) : undefined,
    shared:
      typeof s.shared === 'string' || typeof s.shared === 'number' ? String(s.shared) : undefined,
    rooms: typeof s.rooms === 'string' ? s.rooms.slice(0, 600) : undefined,
  }),
  head: () => ({
    meta: buildMeta({
      title: 'Fair Rent Split Calculator | RMHHomes',
      description:
        'Split rent between roommates by room size and features, with every number explained and a link you can share.',
      path: '/homes/rent-split',
    }),
    links: [buildCanonical('/homes/rent-split')],
  }),
  component: RentSplitRoute,
});

function RentSplitRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/homes/rent-split' });
  return (
    <RentSplitPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true, resetScroll: false })}
    />
  );
}
