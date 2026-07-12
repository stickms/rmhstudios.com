'use client';

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { AMENITY_OPTIONS, propertyTypeLabel } from '@/lib/homes/format';
import {
  PROPERTY_TYPES,
  type Listing,
  type ListingType,
  type PropertyType,
} from '@/lib/homes/types';
import { LocationSearch, type HomesPlace } from './LocationSearch';
import { ImageUploader } from './ImageUploader';

interface ListingFormProps {
  /** When set, the form edits this listing instead of creating a new one. */
  listing?: Listing;
}

/** Best-effort city/state from a Nominatim display label. */
function parseCityState(label: string): { city: string; state: string } {
  const tokens = label
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !/^(united states|usa)$/i.test(t))
    .filter((t) => !/^\d{4,}$/.test(t)); // drop ZIP
  if (tokens.length === 0) return { city: '', state: '' };
  const state = tokens[tokens.length - 1] ?? '';
  const city = /^\d/.test(tokens[0]) ? (tokens[1] ?? '') : tokens[0];
  return { city, state };
}

export function ListingForm({ listing }: ListingFormProps) {
  const navigate = useNavigate();
  const isEditing = Boolean(listing);

  const [listingType, setListingType] = useState<ListingType>(listing?.listingType ?? 'RENT');
  const [propertyType, setPropertyType] = useState<PropertyType>(
    listing?.propertyType ?? 'APARTMENT',
  );
  const [title, setTitle] = useState(listing?.title ?? '');
  const [description, setDescription] = useState(listing?.description ?? '');
  const [price, setPrice] = useState(listing ? String(listing.price) : '');
  const [beds, setBeds] = useState(listing ? String(listing.beds) : '1');
  const [baths, setBaths] = useState(listing ? String(listing.baths) : '1');
  const [sqft, setSqft] = useState(listing?.sqft ? String(listing.sqft) : '');

  const [addressQuery, setAddressQuery] = useState(listing?.address ?? '');
  const [city, setCity] = useState(listing?.city ?? '');
  const [state, setState] = useState(listing?.state ?? '');
  const [postalCode, setPostalCode] = useState(listing?.postalCode ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    listing ? { lat: listing.lat, lng: listing.lng } : null,
  );

  const [amenities, setAmenities] = useState<string[]>(listing?.amenities ?? []);
  const [petsAllowed, setPetsAllowed] = useState(listing?.petsAllowed ?? false);
  const [availableFrom, setAvailableFrom] = useState(
    listing?.availableFrom ? listing.availableFrom.slice(0, 10) : '',
  );
  const [images, setImages] = useState<string[]>(listing?.images ?? []);
  const [aiImages, setAiImages] = useState<string[]>(listing?.aiImages ?? []);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPickPlace(place: HomesPlace) {
    setAddressQuery(place.label);
    setCoords({ lat: place.lat, lng: place.lng });
    const parsed = parseCityState(place.label);
    if (parsed.city && !city) setCity(parsed.city);
    if (parsed.state && !state) setState(parsed.state);
  }

  function toggleAmenity(a: string) {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceNum = Number(price);
    if (title.trim().length < 3) return setError('Give your listing a title.');
    if (description.trim().length < 10) return setError('Add a short description.');
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setError('Enter a valid price.');
    if (!city.trim() || !state.trim()) return setError('City and state are required.');
    if (images.length === 0) return setError('Add at least one photo.');

    const body = {
      listingType,
      propertyType,
      title: title.trim(),
      description: description.trim(),
      price: priceNum,
      beds: Number(beds) || 0,
      baths: Number(baths) || 0,
      sqft: sqft ? Number(sqft) : null,
      address: addressQuery.trim() || null,
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim() || null,
      lat: coords?.lat,
      lng: coords?.lng,
      amenities,
      petsAllowed,
      availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
      images,
      aiImages,
    };

    setSubmitting(true);
    try {
      const res = await fetch(
        isEditing ? `/api/homes/listings/${listing!.id}` : '/api/homes/listings',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save listing');
      toast.success(isEditing ? 'Listing updated' : 'Listing posted');
      const id = isEditing ? listing!.id : data.id;
      navigate({ to: '/homes/listing/$id', params: { id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const priceLabel = listingType === 'RENT' ? 'Monthly rent (USD)' : 'Sale price (USD)';

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error && (
        <div className="rounded-site border border-site-danger/40 bg-site-danger/10 px-3 py-2 text-sm text-site-danger">
          {error}
        </div>
      )}

      {/* Type + property */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-site-sm border border-site-border p-0.5">
          {(['RENT', 'SALE'] as ListingType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setListingType(t)}
              className={`rounded-[6px] px-4 py-1.5 text-sm font-medium transition-colors ${
                listingType === t
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'text-site-text-muted hover:text-site-text'
              }`}
            >
              {t === 'RENT' ? 'For rent' : 'For sale'}
            </button>
          ))}
        </div>
        <Select
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value as PropertyType)}
          aria-label="Property type"
          className="w-auto min-w-[10rem]"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {propertyTypeLabel(t)}
            </option>
          ))}
        </Select>
      </div>

      {/* Title */}
      <Field label="Title" htmlFor="title">
        <Input
          id="title"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sunny 2-bed near downtown"
          required
        />
      </Field>

      {/* Description */}
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          value={description}
          maxLength={4000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the place, the neighborhood, lease terms, what's included…"
          className="min-h-32"
          required
        />
      </Field>

      {/* Price / beds / baths / sqft */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={priceLabel} htmlFor="price">
          <Input
            id="price"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={listingType === 'RENT' ? '1800' : '350000'}
            required
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Beds" htmlFor="beds">
            <Select id="beds" value={beds} onChange={(e) => setBeds(e.target.value)}>
              {[0, 1, 2, 3, 4, 5, 6].map((b) => (
                <option key={b} value={b}>
                  {b === 0 ? 'Studio' : b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Baths" htmlFor="baths">
            <Select id="baths" value={baths} onChange={(e) => setBaths(e.target.value)}>
              {['1', '1.5', '2', '2.5', '3', '3.5', '4'].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sqft" htmlFor="sqft">
            <Input
              id="sqft"
              type="number"
              min={0}
              value={sqft}
              onChange={(e) => setSqft(e.target.value)}
              placeholder="—"
            />
          </Field>
        </div>
      </div>

      {/* Location */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-site-text">Location</span>
        <LocationSearch
          value={addressQuery}
          onQueryChange={(q) => {
            setAddressQuery(q);
            setCoords(null);
          }}
          onSelect={onPickPlace}
          placeholder="Search an address or neighborhood"
        />
        <p className="mt-1 text-xs text-site-text-muted">
          Pick a suggestion to set the map location. Exact address is optional — city &amp; state
          are used publicly.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="City" htmlFor="city">
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} required />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" value={state} onChange={(e) => setState(e.target.value)} required />
          </Field>
          <Field label="ZIP" htmlFor="zip">
            <Input id="zip" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Photos */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-site-text">Photos</span>
        <ImageUploader
          value={images}
          aiImages={aiImages}
          onChange={(imgs, ai) => {
            setImages(imgs);
            setAiImages(ai);
          }}
          max={8}
        />
      </div>

      {/* Amenities */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-site-text">Amenities</span>
        <div className="flex flex-wrap gap-2">
          {AMENITY_OPTIONS.map((a) => {
            const on = amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAmenity(a)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? 'border-site-accent bg-site-accent-dim text-site-accent'
                    : 'border-site-border text-site-text-muted hover:text-site-text'
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pets + availability */}
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-site-text">
          <input
            type="checkbox"
            checked={petsAllowed}
            onChange={(e) => setPetsAllowed(e.target.checked)}
            className="h-4 w-4 accent-site-accent"
          />
          Pet-friendly
        </label>
        <Field label="Available from" htmlFor="avail" inline>
          <Input
            id="avail"
            type="date"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
            className="w-auto"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" loading={submitting}>
          {isEditing ? 'Save changes' : 'Post listing'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate({ to: isEditing ? '/homes/manage' : '/homes' })}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  inline,
  children,
}: {
  label: string;
  htmlFor: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={inline ? 'flex items-center gap-2' : ''}>
      <label
        htmlFor={htmlFor}
        className={`text-sm font-medium text-site-text ${inline ? '' : 'mb-1.5 block'}`}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
