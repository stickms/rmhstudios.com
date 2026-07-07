'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  PROPERTY_TYPES,
  type PropertyType,
  type SearchFilters,
  type SortOrder,
} from '@/lib/homes/types';
import { propertyTypeLabel } from '@/lib/homes/format';

interface FiltersBarProps {
  filters: SearchFilters;
  onChange: (patch: Partial<SearchFilters>) => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  relevance: 'Best match',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  newest: 'Newest',
};

const BED_OPTIONS = [0, 1, 2, 3, 4];

/**
 * The quick-filter row (listing type, beds, sort) plus an expandable advanced
 * panel (price, baths, property types, pets, radius). Emits partial patches;
 * the page owns the canonical filter state and re-runs the search.
 */
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

  return (
    <div className="rounded-xl border border-site-border bg-site-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Rent / Buy */}
        <div className="inline-flex rounded-lg border border-site-border p-0.5">
          {(['rent', 'sale', 'any'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ listingType: t })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                filters.listingType === t
                  ? 'bg-site-accent text-white'
                  : 'text-site-text-dim hover:text-site-text'
              }`}
            >
              {t === 'sale' ? 'Buy' : t}
            </button>
          ))}
        </div>

        {/* Beds */}
        <select
          value={filters.minBeds ?? ''}
          onChange={(e) =>
            onChange({ minBeds: e.target.value === '' ? undefined : Number(e.target.value) })
          }
          className="rounded-lg border border-site-border bg-site-surface px-3 py-1.5 text-sm text-site-text"
          aria-label="Minimum bedrooms"
        >
          <option value="">Any beds</option>
          {BED_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b === 0 ? 'Studio+' : `${b}+ beds`}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as SortOrder })}
          className="rounded-lg border border-site-border bg-site-surface px-3 py-1.5 text-sm text-site-text"
          aria-label="Sort order"
        >
          {(Object.keys(SORT_LABELS) as SortOrder[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
            advanced
              ? 'border-site-accent text-site-accent'
              : 'border-site-border text-site-text-dim hover:text-site-text'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>
      </div>

      {advanced && (
        <div className="mt-3 grid gap-4 border-t border-site-border pt-3 sm:grid-cols-2">
          {/* Price range */}
          <div>
            <label className="mb-1 block text-xs font-medium text-site-text-muted">
              Price ({filters.listingType === 'sale' ? 'total' : 'per month'})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                placeholder="Min"
                value={filters.minPrice ?? ''}
                onChange={(e) =>
                  onChange({ minPrice: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="w-full rounded-lg border border-site-border bg-site-surface px-2.5 py-1.5 text-sm text-site-text"
              />
              <span className="text-site-text-muted">–</span>
              <input
                type="number"
                min={0}
                placeholder="Max"
                value={filters.maxPrice ?? ''}
                onChange={(e) =>
                  onChange({ maxPrice: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="w-full rounded-lg border border-site-border bg-site-surface px-2.5 py-1.5 text-sm text-site-text"
              />
            </div>
          </div>

          {/* Baths + radius */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-xs font-medium text-site-text-muted">
                Min baths
              </span>
              <select
                value={filters.minBaths ?? ''}
                onChange={(e) =>
                  onChange({ minBaths: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="w-full rounded-lg border border-site-border bg-site-surface px-2.5 py-1.5 text-sm text-site-text"
              >
                <option value="">Any</option>
                {[1, 2, 3].map((b) => (
                  <option key={b} value={b}>
                    {b}+
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-site-text-muted">
                Radius: {filters.radiusKm ?? 25} km
              </label>
              <input
                type="range"
                min={2}
                max={100}
                step={1}
                value={filters.radiusKm ?? 25}
                onChange={(e) => onChange({ radiusKm: Number(e.target.value) })}
                className="mt-2 w-full accent-site-accent"
              />
            </div>
          </div>

          {/* Property types */}
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-site-text-muted">
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
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? 'border-site-accent bg-site-accent/10 text-site-accent'
                        : 'border-site-border text-site-text-dim hover:text-site-text'
                    }`}
                  >
                    {propertyTypeLabel(t)}
                    {active && <X className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pets */}
          <label className="flex items-center gap-2 text-sm text-site-text sm:col-span-2">
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
