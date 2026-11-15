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
  MapPin,
  MessageCircle,
  PawPrint,
  Pencil,
  Ruler,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ListingsMap } from '@/components/homes/ListingsMap';
import { FavoriteButton } from '@/components/homes/FavoriteButton';
import { RentSplitPanel } from '@/components/homes/RentSplitPanel';
import { RoommateMatch } from '@/components/homes/RoommateMatch';
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
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { sendMessageApi } from '@/lib/messages/messages.contract';
import {
  deleteHomeListingApi,
  getHomeListingApi,
  setHomeListingStatusApi,
} from '@/lib/homes/homes.contract';

export function ListingDetailView({ id }: { id: string }) {
  const goBack = useBackOrFallback();
  const { data: session } = useSession();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [messaging, setMessaging] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const arrival = useArrival(!loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const data = await api(getHomeListingApi, { params: { id }, retries: 0 });
        if (cancelled) return;
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
      const data = await api(sendMessageApi, { body: { recipientId: listing.author.id } });
      navigate({
        to: '/messages/$conversationId',
        params: { conversationId: data.conversationId },
      });
    } catch (err) {
      toast.error(
        serverError(err) ??
          (err instanceof HttpError
            ? 'Could not open conversation'
            : err instanceof Error
              ? err.message
              : 'Could not message the poster'),
      );
    } finally {
      setMessaging(false);
    }
  }, [listing, session, navigate]);

  const changeStatus = useCallback(
    async (status: ListingStatus) => {
      if (!listing) return;
      setSavingStatus(true);
      try {
        await api(setHomeListingStatusApi, { params: { id: listing.id }, body: { status } });
        setListing({ ...listing, status });
        toast.success(`Marked ${statusLabel(status).toLowerCase()}`);
      } catch (err) {
        toast.error(serverError(err) ?? 'Could not update status');
      } finally {
        setSavingStatus(false);
      }
    },
    [listing],
  );

  const remove = useCallback(async () => {
    if (!listing) return;
    if (!(await confirm({ title: 'Delete this listing? This cannot be undone.', danger: true })))
      return;
    try {
      await api(deleteHomeListingApi, { params: { id: listing.id } });
      toast.success('Listing deleted');
      navigate({ to: '/homes/manage' });
    } catch (err) {
      toast.error(
        err instanceof HttpError
          ? 'Could not delete'
          : err instanceof Error
            ? err.message
            : 'Could not delete listing',
      );
    }
  }, [listing, navigate, confirm]);

  if (loading) {
    return (
      <PageLayout title="Listing" backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Spinner size={32} className="text-site-text-muted" />
        </div>
      </PageLayout>
    );
  }

  if (notFound || !listing) {
    return (
      <PageLayout title="Listing" backTo="/homes" wide>
        <EmptyState
          className={arrival}
          icon={Home}
          title="This listing is no longer available."
          action={
            <Button asChild variant="default">
              <Link to="/homes" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back to browse
              </Link>
            </Button>
          }
        />
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
      <div data-slot="homes-detail" className={cn('w-full max-w-4xl', arrival)}>
        {/* Owner controls */}
        {listing.isOwner && (
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-site-border pb-3">
            <span className="t-body text-site-text-muted">You posted this</span>
            <Select
              value={listing.status}
              disabled={savingStatus}
              onChange={(e) => changeStatus(e.target.value as ListingStatus)}
              controlSize="sm"
              containerClassName="w-36"
              aria-label="Listing status"
            >
              <option value="ACTIVE">Active</option>
              <option value="RENTED">Rented</option>
              <option value="SOLD">Sold</option>
              <option value="REMOVED">Hidden</option>
            </Select>
            <div className="ms-auto flex items-center gap-2">
              <Button asChild variant="default">
                <Link to="/homes/submit" search={{ edit: listing.id }}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
              <Button variant="default" onClick={remove} className="text-site-danger">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </div>
        )}

        {/* Gallery */}
        {images.length > 0 && (
          <div className="mb-4">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
              <img
                src={images[activeImage]}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
              {listing.aiImages.includes(images[activeImage]) && (
                <span className="absolute end-3 bottom-3 inline-flex items-center gap-1 rounded-site-sm bg-site-media-scrim-strong px-2 py-1 text-xs font-medium text-site-media-ink">
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
                    aria-pressed={i === activeImage}
                    className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-site-sm border bg-site-bg-subtle transition-colors duration-(--m1) ${
                      i === activeImage
                        ? 'border-site-text'
                        : 'border-site-border hover:border-site-text'
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                    {listing.aiImages.includes(img) && (
                      <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-site-media-scrim-strong text-site-media-ink">
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
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="t-heading whitespace-nowrap">
                {formatPrice(listing.price, listing.listingType)}
              </span>
              <span className="t-meta whitespace-nowrap">
                {listingTypeLabel(listing.listingType)}
              </span>
              {listing.status !== 'ACTIVE' && (
                <Badge variant="warning">{statusLabel(listing.status)}</Badge>
              )}
            </div>
            <div className="t-body mt-1 flex items-center gap-1.5 text-site-text-muted">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{listing.address || location}</span>
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
        <div className="mt-4 grid grid-cols-2 gap-x-4 border-y border-site-border sm:grid-cols-4">
          <Spec icon={BedDouble} label={formatBeds(listing.beds)} sub="Bedrooms" />
          <Spec icon={Bath} label={formatBaths(listing.baths)} sub="Bathrooms" />
          <Spec icon={Ruler} label={sqft || '—'} sub="Size" />
          <Spec icon={Home} label={propertyTypeLabel(listing.propertyType)} sub="Type" />
        </div>

        {/* Meta row */}
        <div className="t-body mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-site-text-muted">
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
          <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-site-border py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-site-border bg-site-bg-subtle text-site-text">
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
                className="ms-auto"
              >
                <Button>
                  <ExternalLink className="h-4 w-4" />
                  View original
                </Button>
              </a>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-site-border py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-site-border bg-site-bg-subtle text-site-text">
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
              <Button
                variant="primary"
                onClick={messagePoster}
                loading={messaging}
                className="ms-auto"
              >
                {!messaging && <MessageCircle className="h-4 w-4" />}
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
        <div className="mt-4">
          <h2 className="mb-2 site-section-label">About this place</h2>
          <p className="t-prose max-w-[640px] whitespace-pre-wrap break-words">
            {listing.description}
          </p>
        </div>

        {/* Amenities */}
        {listing.amenities.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-2 site-section-label">Amenities</h2>
            <div className="flex flex-wrap gap-2">
              {listing.amenities.map((a) => (
                <Badge key={a} variant="default">
                  {a}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Roommate-wanted rooms: lifestyle match with the poster (F9). */}
        {listing.listingType === 'RENT' &&
          listing.propertyType === 'ROOM' &&
          !listing.isOwner &&
          !isExternal && (
            <RoommateMatch listingId={listing.id} isSignedIn={Boolean(session?.user)} />
          )}

        {/* Multi-bedroom rentals: split the rent fairly between rooms (F10). */}
        {listing.listingType === 'RENT' && listing.propertyType !== 'ROOM' && listing.beds >= 2 && (
          <RentSplitPanel rent={listing.price} beds={listing.beds} sqft={listing.sqft} />
        )}

        {/* Map */}
        <div className="mt-4">
          <h2 className="mb-2 site-section-label">Location</h2>
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
    <div className="flex items-center gap-2.5 py-3">
      <Icon className="size-5 shrink-0 text-site-text-muted" aria-hidden />
      <div className="min-w-0">
        <div className="t-body font-medium whitespace-nowrap text-site-text">{label}</div>
        <div className="t-meta">{sub}</div>
      </div>
    </div>
  );
}
