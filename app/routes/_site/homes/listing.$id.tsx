/**
 * RMHHomes — listing detail (/homes/listing/$id)
 *
 * Thin route shell; the UI lives in `ListingDetailView` (a non-route component)
 * so the design-system primitives it uses stay out of the route's code-split
 * chunk. See the delegation pattern used by explore/pricing/shop.
 */
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ListingDetailView } from '@/components/homes/ListingDetailView';
import { getListing } from '@/lib/homes/listings.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

/**
 * A meta-only loader. `ListingDetailView` still fetches the listing itself
 * client-side; this exists because the route had no `head()` at all, so a
 * shared listing link unfurled as the bare site default and search saw nothing
 * about the property.
 *
 * `countView` is false: a crawler or an unfurl is not a viewing.
 */
const fetchListingMeta = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const listing = await getListing(id, null, false).catch(() => null);
    if (!listing) return null;
    return {
      title: listing.title,
      description: listing.description,
      city: listing.city,
      state: listing.state,
      price: listing.price,
      beds: listing.beds,
      baths: listing.baths,
      listingType: listing.listingType,
      status: listing.status,
      image: listing.images[0] ?? null,
    };
  });

export const Route = createFileRoute('/_site/homes/listing/$id')({
  loader: ({ params }) => fetchListingMeta({ data: params.id }),
  head: ({ loaderData, params }) => {
    const path = `/homes/listing/${params.id}`;
    if (!loaderData) {
      return {
        meta: [{ title: 'Listing | RMHHomes' }, { name: 'robots', content: 'noindex, follow' }],
      };
    }
    const { title, city, state, price, beds, baths, listingType, status } = loaderData;
    const rent = listingType === 'RENT' ? '/mo' : '';
    const summary = `${beds} bed · ${baths} bath · $${price.toLocaleString()}${rent} · ${city}, ${state}.`;
    const body = loaderData.description.replace(/\s+/g, ' ').trim();
    return {
      meta: [
        ...buildMeta({
          title: `${title} — ${city}, ${state} | RMHHomes`,
          description: body ? `${summary} ${body}`.slice(0, 300) : summary,
          path,
          image: loaderData.image || undefined,
          imageAlt: loaderData.image ? `${title} in ${city}, ${state}.` : undefined,
          imageSize: loaderData.image ? null : undefined,
        }),
        // A filled or expired listing is still worth serving to anyone holding
        // the link, but it should stop competing in search — the sitemap lists
        // active ones only, for the same reason.
        ...(status === 'ACTIVE' ? [] : [{ name: 'robots', content: 'noindex, follow' }]),
      ],
      links: [buildCanonical(path)],
    };
  },
  component: ListingDetailRoute,
});

function ListingDetailRoute() {
  const { id } = Route.useParams();
  return <ListingDetailView id={id} />;
}
