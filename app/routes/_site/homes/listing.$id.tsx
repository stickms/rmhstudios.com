/**
 * RMHHomes — listing detail (/homes/listing/$id)
 *
 * Resolves a single listing from the search cache / saved snapshot and shows
 * the full record: gallery, specs, description, amenities, a map, a link to the
 * original source, and a save toggle.
 */
import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  BedDouble,
  Bath,
  Ruler,
  MapPin,
  ExternalLink,
  PawPrint,
  CalendarClock,
  Loader2,
  Home,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListingsMap } from '@/components/homes/ListingsMap';
import { SaveButton } from '@/components/homes/SaveButton';
import { SourceBadge } from '@/components/homes/SourceBadge';
import type { Listing } from '@/lib/homes/types';
import {
  formatBaths,
  formatBeds,
  formatLocation,
  formatPostedAt,
  formatPrice,
  formatSqft,
  propertyTypeLabel,
  sourceLabel,
} from '@/lib/homes/format';

export const Route = createFileRoute('/_site/homes/listing/$id')({
  component: ListingDetailPage,
});

function ListingDetailPage() {
  const { id } = Route.useParams();
  const { data: session, isPending } = useSession();

  const [listing, setListing] = useState<Listing | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const res = await fetch(`/api/homes/listing/${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to load listing');
        const data = await res.json();
        setListing(data.listing);
        setSaved(Boolean(data.saved));
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, session]);

  if (isPending || (loading && session)) {
    return (
      <PageLayout title="Listing" backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="Listing" backTo="/homes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-site-text-dim">
          <p className="mb-4">Sign in to view this listing.</p>
          <Link to="/login" search={{ callbackURL: '/homes' }}>
            <Button>Sign in</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  if (notFound || !listing) {
    return (
      <PageLayout title="Listing" backTo="/homes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-site-text-dim">
          <Home className="mx-auto mb-3 h-10 w-10 text-site-text-muted" />
          <p className="mb-4">
            This listing is no longer available. It may have expired or been removed by the source.
          </p>
          <Link to="/homes">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back to search
            </Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  const images = listing.images?.length
    ? listing.images
    : listing.imageUrl
      ? [listing.imageUrl]
      : [];
  const location = formatLocation(listing);
  const sqft = formatSqft(listing.sqft);
  const posted = formatPostedAt(listing.postedAt, Date.now());

  return (
    <PageLayout title={listing.title} backTo="/homes" backLabel="Back to search" wide>
      <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6">
        {/* Gallery */}
        {images.length > 0 && (
          <div className="mb-5">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-site border border-site-border bg-site-bg">
              <img
                src={images[activeImage]}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute left-3 top-3">
                <SourceBadge source={listing.source} />
              </div>
            </div>
            {images.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`h-16 w-24 shrink-0 overflow-hidden rounded-site-sm border transition-colors ${
                      i === activeImage
                        ? 'border-site-accent'
                        : 'border-site-border hover:border-site-border-bright'
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div
              className="text-3xl font-bold text-site-text"
              style={{ fontFamily: 'var(--site-font-display)' }}
            >
              {formatPrice(listing.price, listing.listingType)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-site-text-dim">
              <MapPin className="h-4 w-4" />
              <span>{listing.address || location || 'Location approximate'}</span>
            </div>
          </div>
          <SaveButton listing={listing} saved={saved} onChange={setSaved} />
        </div>

        {/* Specs */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Spec icon={BedDouble} label={formatBeds(listing.beds)} sub="Bedrooms" />
          <Spec icon={Bath} label={formatBaths(listing.baths)} sub="Bathrooms" />
          <Spec icon={Ruler} label={sqft || '—'} sub="Size" />
          <Spec icon={Home} label={propertyTypeLabel(listing.propertyType)} sub="Type" />
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-site-text-muted">
          <span>Listed on {sourceLabel(listing.source)}</span>
          {posted && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-4 w-4" /> Posted {posted}
            </span>
          )}
          {listing.petsAllowed === true && (
            <span className="inline-flex items-center gap-1 text-site-success">
              <PawPrint className="h-4 w-4" /> Pet-friendly
            </span>
          )}
        </div>

        {/* Description */}
        {listing.description && (
          <div className="mt-5">
            <h2
              className="mb-2 text-lg font-semibold text-site-text"
              style={{ fontFamily: 'var(--site-font-display)' }}
            >
              About this place
            </h2>
            <p className="whitespace-pre-wrap text-site-text-dim">{listing.description}</p>
          </div>
        )}

        {/* Amenities */}
        {listing.amenities && listing.amenities.length > 0 && (
          <div className="mt-5">
            <h2
              className="mb-2 text-lg font-semibold text-site-text"
              style={{ fontFamily: 'var(--site-font-display)' }}
            >
              Amenities
            </h2>
            <div className="flex flex-wrap gap-2">
              {listing.amenities.map((a) => (
                <Badge key={a} variant="outline" size="lg">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Map */}
        {listing.lat != null && listing.lng != null && (
          <div className="mt-5">
            <h2
              className="mb-2 text-lg font-semibold text-site-text"
              style={{ fontFamily: 'var(--site-font-display)' }}
            >
              Location
            </h2>
            <ListingsMap
              listings={[listing]}
              center={{ lat: listing.lat, lng: listing.lng, label: location }}
              activeId={listing.id}
              onActive={() => {}}
              className="h-72"
            />
          </div>
        )}

        {/* Source link */}
        {listing.url && (
          <div className="mt-6">
            <Button asChild size="lg">
              <a href={listing.url} target="_blank" rel="noopener noreferrer nofollow">
                View original listing <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <p className="mt-2 text-xs text-site-text-muted">
              Opens the original post on {sourceLabel(listing.source)}. RMHHomes aggregates public
              listings and is not the lister — always verify details with the source.
            </p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function Spec({ icon: Icon, label, sub }: { icon: typeof Home; label: string; sub: string }) {
  return (
    <div className="rounded-site border border-site-border bg-site-surface/80 p-3">
      <Icon className="mb-1 h-5 w-5 text-site-accent" />
      <div className="font-semibold text-site-text">{label}</div>
      <div className="text-xs text-site-text-muted">{sub}</div>
    </div>
  );
}
