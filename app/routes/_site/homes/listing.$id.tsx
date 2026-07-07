/**
 * RMHHomes — listing detail (/homes/listing/$id)
 *
 * Thin route shell; the UI lives in `ListingDetailView` (a non-route component)
 * so the design-system primitives it uses stay out of the route's code-split
 * chunk. See the delegation pattern used by explore/pricing/shop.
 */
import { createFileRoute } from '@tanstack/react-router';
import { ListingDetailView } from '@/components/homes/ListingDetailView';

export const Route = createFileRoute('/_site/homes/listing/$id')({
  component: ListingDetailRoute,
});

function ListingDetailRoute() {
  const { id } = Route.useParams();
  return <ListingDetailView id={id} />;
}
