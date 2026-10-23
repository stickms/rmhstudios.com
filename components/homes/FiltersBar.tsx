'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  PROPERTY_TYPES,
  type ListingType,
  type PropertyType,
  type SearchFilters,
  type SortOrder,
} from '@/lib/homes/types';
import { propertyTypeLabel } from '@/lib/homes/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

interface FiltersBarProps {
  filters: SearchFilters;
  onChange: (patch: Partial<SearchFilters>) => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};

const BED_OPTIONS = [0, 1, 2, 3, 4];
const LISTING_TABS: { id: ListingType | 'any'; label: string }[] = [
  { id: 'any', label: 'All' },
  { id: 'RENT', label: 'Rent' },
  { id: 'SALE', label: 'Buy' },
];

const SOURCE_LABELS: Record<SearchFilters['source'], string> = {
  any: 'All sources',
  community: 'Member posts',
  external: 'Aggregated',
};

export function FiltersBar({ filters, onChange }: FiltersBarProps) {
  const [advanced, setAdvanced] = useState(false);

  function togglePropertyType(t: PropertyType) {
    const has = filters.propertyTypes.includes(t);
    onChange({
      propertyTypes: has
        ? filters.propertyTypes.filter((p) => p !== t)
        : [...filters.propertyTypes, t],
    });
  }

  const activeAdvanced =
    (filters.minPrice != null ? 1 : 0) +
    (filters.maxPrice != null ? 1 : 0) +
    (filters.minBaths != null ? 1 : 0) +
    filters.propertyTypes.length +
    (filters.petsAllowed ? 1 : 0);

  return (
    <div className="glass-fill rounded-site p-4">
      <div className="flex flex-wrap items-center gap-2">
        <LiquidTabs
          size="sm"
          tabs={LISTING_TABS}
          value={filters.listingType}
          onChange={(id) => onChange({ listingType: id as ListingType | 'any' })}
          aria-label="Listing type"
          className="w-auto"
        />

        <Select
          value={filters.minBeds ?? ''}
          onChange={(e) =>
            onChange({ minBeds: e.target.value === '' ? undefined : Number(e.target.value) })
          }
          aria-label="Minimum bedrooms"
          className="w-auto min-w-32"
        >
          <option value="">Any beds</option>
          {BED_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b === 0 ? 'Studio+' : `${b}+ beds`}
            </option>
          ))}
        </Select>

        <Select
          value={filters.source}
          onChange={(e) => onChange({ source: e.target.value as SearchFilters['source'] })}
          aria-label="Listing source"
          className="w-auto min-w-40"
        >
          {(Object.keys(SOURCE_LABELS) as SearchFilters['source'][]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </Select>

        <Select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as SortOrder })}
          aria-label="Sort order"
          className="w-auto min-w-44"
        >
          {(Object.keys(SORT_LABELS) as SortOrder[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </Select>

        <Button
          type="button"
          variant={advanced ? 'accent-outline' : 'outline'}
          size="sm"
          onClick={() => setAdvanced((v) => !v)}
          className="ml-auto"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeAdvanced > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-site-accent px-1 text-xs font-semibold text-site-accent-fg">
              {activeAdvanced}
            </span>
          )}
        </Button>
      </div>

      {advanced && (
        <div className="mt-4 grid gap-4 border-t border-site-border pt-4 sm:grid-cols-2">
          <div>
            <span className="mb-2 block text-xs font-medium text-site-text-muted">
              Price ({filters.listingType === 'SALE' ? 'total' : 'per month'})
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Min"
                value={filters.minPrice ?? ''}
                onChange={(e) =>
                  onChange({ minPrice: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                              />
              <span className="text-site-text-dim">–</span>
              <Input
                type="number"
                min={0}
                placeholder="Max"
                value={filters.maxPrice ?? ''}
                onChange={(e) =>
                  onChange({ maxPrice: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-2 block text-xs font-medium text-site-text-muted">
                Min baths
              </span>
              <Select
                value={filters.minBaths ?? ''}
                onChange={(e) =>
                  onChange({ minBaths: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                                aria-label="Minimum bathrooms"
              >
                <option value="">Any</option>
                {[1, 2, 3].map((b) => (
                  <option key={b} value={b}>
                    {b}+
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <span className="mb-2 block text-xs font-medium text-site-text-muted">
                Radius: {filters.radiusKm} km
              </span>
              <div className="flex h-11 items-center">
                <Slider
                  min={2}
                  max={200}
                  step={1}
                  value={[filters.radiusKm]}
                  onValueChange={([v]) => onChange({ radiusKm: v })}
                  aria-label="Search radius"
                />
              </div>
            </div>
          </div>

          <div className="sm:col-span-2">
            <span className="mb-2 block text-xs font-medium text-site-text-muted">
              Property type
            </span>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((t) => {
                const active = filters.propertyTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => togglePropertyType(t)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'border-site-accent bg-site-accent-dim text-site-accent'
                        : 'border-site-border text-site-text-muted hover:text-site-text'
                    }`}
                  >
                    {propertyTypeLabel(t)}
                    {active && <X className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-site-text sm:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(filters.petsAllowed)}
              onChange={(e) => onChange({ petsAllowed: e.target.checked ? true : undefined })}
              className="h-4 w-4 accent-site-accent"
            />
            Pet-friendly only
          </label>
        </div>
      )}
    </div>
  );
}
