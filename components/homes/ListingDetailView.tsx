'use client';

/**
 * RMHHomes — listing detail view.
 *
 * The full detail UI lives here (a non-route component) so the route file can
 * stay a thin shell. This also keeps `@/components/ui/*` primitives (Badge,
 * Select) out of the route's code-split chunk, which the production bundler
 * only resolves for primitives already shared across many routes.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarClock,
  ExternalLink,
  Eye,
  Globe,
  Home,
  Loader2,
  MapPin,
  MessageCircle,
  PawPrint,
  Pencil,
  Ruler,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ListingsMap } from '@/components/homes/ListingsMap';
import { FavoriteButton } from '@/components/homes/FavoriteButton';
import type { Listing, ListingStatus } from '@/lib/homes/types';
import {
  formatAvailable,
  formatBaths,
  formatBeds,
  formatLocation,
  formatPostedAt,
  formatPrice,
  formatSqft,
  listingTypeLabel,
  propertyTypeLabel,
  statusLabel,
} from '@/lib/homes/format';

export function ListingDetailView({ id }: { id: string }) {
  const { data: session } = useSession();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [messaging, setMessaging] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const res = await fetch(`/api/homes/listings/${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (res.status === 404) return setNotFound(true);
        if (!res.ok) throw new Error('Failed to load listing');
        const data = await res.json();
        setListing(data.listing);
        setActiveImage(0);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const messagePoster = useCallback(async () => {
    if (!listing || !listing.author) return;
    if (!session) {
      navigate({ to: '/login', search: { callbackURL: `/homes/listing/${listing.id}` } });
      return;
    }
    setMessaging(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: listing.author.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open conversation');
      navigate({
        to: '/messages/$conversationId',
        params: { conversationId: data.conversationId },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not message the poster');
    } finally {
      setMessaging(false);
    }
  }, [listing, session, navigate]);

  const changeStatus = useCallback(
    async (status: ListingStatus) => {
      if (!listing) return;
      setSavingStatus(true);
      try {
        const res = await fetch(`/api/homes/listings/${listing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error('Could not update status');
        setListing({ ...listing, status });
        toast.success(`Marked ${statusLabel(status).toLowerCase()}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update status');
      } finally {
        setSavingStatus(false);
      }
    },
    [listing],
  );

  const remove = useCallback(async () => {
    if (!listing) return;
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/homes/listings/${listing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete');
      toast.success('Listing deleted');
      navigate({ to: '/homes/manage' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete listing');
    }
  }, [listing, navigate]);

  if (loading) {
    return (
      <PageLayout title="Listing" backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (notFound || !listing) {
    return (
      <PageLayout title="Listing" backTo="/homes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-site-text-dim">
          <Home className="mx-auto mb-3 h-10 w-10 text-site-text-muted" />
          <p className="mb-4">This listing is no longer available.</p>
          <Link to="/homes">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back to browse
            </Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  const images = listing.images;
  const location = formatLocation(listing);
  const sqft = formatSqft(listing.sqft);
  const posted = formatPostedAt(listing.createdAt, Date.now());
  const available = formatAvailable(listing.availableFrom);
  const isExternal = listing.source === 'EXTERNAL';
  const authorName = listing.author?.name || listing.author?.handle || 'RMH member';

  return (
    <PageLayout title={listing.title} backTo="/homes" backLabel="Back to browse" wide>
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4 md:px-6">
        {/* Owner controls */}
        {listing.isOwner && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-site border border-site-border bg-site-surface/80 p-3">
            <span className="text-sm text-site-text-dim">You posted this ·</span>
            <Select
              value={listing.status}
              disabled={savingStatus}
              onChange={(e) => changeStatus(e.target.value as ListingStatus)}
              className="h-8 w-auto"
              aria-label="Listing status"
            >
              <option value="ACTIVE">Active</option>
              <option value="RENTED">Rented</option>
              <option value="SOLD">Sold</option>
              <option value="REMOVED">Hidden</option>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Link to="/homes/submit" search={{ edit: listing.id }}>
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={remove} className="text-site-danger">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </div>
        )}

        {/* Gallery */}
        {images.length > 0 && (
          <div className="mb-5">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-site border border-site-border bg-site-bg">
              <img
                src={images[activeImage]}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute left-3 top-3 flex gap-1">
                <Badge variant={listing.listingType === 'RENT' ? 'accent' : 'solid'}>
                  {listingTypeLabel(listing.listingType)}
                </Badge>
                {listing.status !== 'ACTIVE' && (
                  <Badge variant="warning">{statusLabel(listing.status)}</Badge>
                )}
              </div>
              {listing.aiImages.includes(images[activeImage]) && (
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" /> Generated by AI
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-site-sm border transition-colors ${
                      i === activeImage
                        ? 'border-site-accent'
                        : 'border-site-border hover:border-site-border-bright'
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                    {listing.aiImages.includes(img) && (
                      <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/65 text-white">
                        <Sparkles className="h-2.5 w-2.5" />
                      </span>
                    )}
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
            <h1 className="mt-1 text-lg font-semibold text-site-text">{listing.title}</h1>
            <div className="mt-1 flex items-center gap-1.5 text-site-text-dim">
              <MapPin className="h-4 w-4" />
              <span>{listing.address || location}</span>
            </div>
          </div>
          {!listing.isOwner && (
            <FavoriteButton
              listingId={listing.id}
              favorited={listing.favorited}
              onChange={(f) => setListing({ ...listing, favorited: f })}
            />
          )}
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
          {posted && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-4 w-4" /> Posted {posted}
            </span>
          )}
          {available && <span>{available}</span>}
          <span className="inline-flex items-center gap-1">
            <Eye className="h-4 w-4" /> {listing.viewsCount} views
          </span>
          {listing.petsAllowed && (
            <span className="inline-flex items-center gap-1 text-site-success">
              <PawPrint className="h-4 w-4" /> Pet-friendly
            </span>
          )}
        </div>

        {/* Poster / source card */}
        {isExternal ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-site border border-site-border bg-site-surface/80 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-site-accent/15 text-site-accent">
              <Globe className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-site-text-muted">Aggregated from</div>
              <div className="truncate font-medium text-site-text">
                {listing.sourceName ?? 'the web'}
              </div>
            </div>
            {listing.externalUrl && (
              <a
                href={listing.externalUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="ml-auto"
              >
                <Button>
                  <ExternalLink className="h-4 w-4" />
                  View original
                </Button>
              </a>
            )}
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-site border border-site-border bg-site-surface/80 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-site-accent/15 text-site-accent">
              {listing.author?.image ? (
                <img src={listing.author.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-semibold">
                  {authorName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <div className="text-xs text-site-text-muted">Posted by</div>
              <div className="truncate font-medium text-site-text">{authorName}</div>
            </div>
            {!listing.isOwner && (
              <Button onClick={messagePoster} disabled={messaging} className="ml-auto">
                {messaging ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                Message
              </Button>
            )}
          </div>
        )}

        {/* Aggregation disclaimer for third-party listings */}
        {isExternal && (
          <p className="mt-3 text-xs text-site-text-muted">
            This is a third-party listing aggregated from {listing.sourceName ?? 'a public feed'}.
            Details may be out of date — always confirm on the original posting. RMHHomes isn’t
            affiliated with the source and can’t verify it.
          </p>
        )}

        {/* Description */}
        <div className="mt-5">
          <h2
            className="mb-2 text-lg font-semibold text-site-text"
            style={{ fontFamily: 'var(--site-font-display)' }}
          >
            About this place
          </h2>
          <p className="whitespace-pre-wrap text-site-text-dim">{listing.description}</p>
        </div>

        {/* Amenities */}
        {listing.amenities.length > 0 && (
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
