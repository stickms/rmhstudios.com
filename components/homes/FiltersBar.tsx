/**
 * The Homes search controls: what kind of listing, where, and how the results are narrowed and ordered.
 *
 * Laid out the way every tabbed page is (page-consistency.md): the tab strip on its own line under the
 * title, its rule running the width of the column; the search field under it (the `search` slot); then one
 * row of controls. In that row the two narrowing selects sit at the start at one width, and the sort and the
 * Filters button sit together at the end, so the row wraps as two groups and never strands one control.
 * On a phone the row is a two-column grid: the selects side by side, then sort and Filters side by side,
 * all four the same width. Every control is the same height (36px, 44px on touch) and radius.
 *
 * This used to be one wrapping flex row inside a padded box: the tab strip shared the line with the
 * selects, so its rule stopped mid-row; each select was `w-auto` with a different `min-w`, so no two were
 * the same width; and whichever control did not fit wrapped alone onto a second line, with Filters pushed
 * to the far end of it.
 */
import { useState, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { PageTabs } from '@/components/feed/PageTabs';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

interface FiltersBarProps {
  filters: SearchFilters;
  onChange: (patch: Partial<SearchFilters>) => void;
  /** The location search, placed under the tab strip. */
  search?: ReactNode;
}

const BED_OPTIONS = [0, 1, 2, 3, 4];
const SORT_ORDERS: SortOrder[] = ['newest', 'price_asc', 'price_desc'];
const SOURCES: SearchFilters['source'][] = ['any', 'community', 'external'];

export function FiltersBar({ filters, onChange, search }: FiltersBarProps) {
  const { t } = useTranslation('site');
  const [advanced, setAdvanced] = useState(false);

  const sortLabels: Record<SortOrder, string> = {
    newest: t('homes-sort-newest', { defaultValue: 'Newest' }),
    price_asc: t('homes-sort-price-asc', { defaultValue: 'Price: low to high' }),
    price_desc: t('homes-sort-price-desc', { defaultValue: 'Price: high to low' }),
  };
  const sourceLabels: Record<SearchFilters['source'], string> = {
    any: t('homes-source-any', { defaultValue: 'All sources' }),
    community: t('homes-source-community', { defaultValue: 'Member posts' }),
    external: t('homes-source-external', { defaultValue: 'Aggregated' }),
  };
  const bedsLabel = t('homes-filter-beds', { defaultValue: 'Bedrooms' });
  const sourceLabel = t('homes-filter-source', { defaultValue: 'Source' });
  const sortLabel = t('homes-filter-sort', { defaultValue: 'Sort' });

  function togglePropertyType(type: PropertyType) {
    const has = filters.propertyTypes.includes(type);
    onChange({
      propertyTypes: has
        ? filters.propertyTypes.filter((p) => p !== type)
        : [...filters.propertyTypes, type],
    });
  }

  const activeAdvanced =
    (filters.minPrice != null ? 1 : 0) +
    (filters.maxPrice != null ? 1 : 0) +
    (filters.minBaths != null ? 1 : 0) +
    filters.propertyTypes.length +
    (filters.petsAllowed ? 1 : 0);

  return (
    <div data-slot="homes-filters">
      <PageTabs
        tabs={[
          { id: 'any', label: t('homes-type-all', { defaultValue: 'All' }) },
          { id: 'RENT', label: t('homes-type-rent', { defaultValue: 'Rent' }) },
          { id: 'SALE', label: t('homes-type-buy', { defaultValue: 'Buy' }) },
        ]}
        value={filters.listingType}
        onChange={(id) => onChange({ listingType: id as ListingType | 'any' })}
        aria-label={t('homes-type-label', { defaultValue: 'Listing type' })}
        search={search}
      />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select
          controlSize="sm"
          value={filters.minBeds ?? ''}
          onChange={(e) =>
            onChange({ minBeds: e.target.value === '' ? undefined : Number(e.target.value) })
          }
          aria-label={bedsLabel}
          containerClassName="min-w-0 sm:w-40"
        >
          <option value="">{t('homes-beds-any', { defaultValue: 'Any beds' })}</option>
          {BED_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b === 0
                ? t('homes-beds-studio', { defaultValue: 'Studio+' })
                : t('homes-beds-min', { defaultValue: '{{n}}+ beds', n: b })}
            </option>
          ))}
        </Select>

        <Select
          controlSize="sm"
          value={filters.source}
          onChange={(e) => onChange({ source: e.target.value as SearchFilters['source'] })}
          aria-label={sourceLabel}
          containerClassName="min-w-0 sm:w-40"
        >
          {SOURCES.map((source) => (
            <option key={source} value={source}>
              {sourceLabels[source]}
            </option>
          ))}
        </Select>

        <label className="flex min-w-0 items-center gap-2 sm:ms-auto">
          <span className="t-body hidden text-site-text-muted sm:inline">{sortLabel}</span>
          <Select
            controlSize="sm"
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as SortOrder })}
            aria-label={sortLabel}
            containerClassName="min-w-0 flex-1 sm:w-48 sm:flex-none"
          >
            {SORT_ORDERS.map((order) => (
              <option key={order} value={order}>
                {sortLabels[order]}
              </option>
            ))}
          </Select>
        </label>

        <Button
          type="button"
          variant="default"
          aria-expanded={advanced}
          aria-controls="homes-more-filters"
          onClick={() => setAdvanced((v) => !v)}
        >
          <SlidersHorizontal aria-hidden />
          {t('homes-filters', { defaultValue: 'Filters' })}
          {activeAdvanced > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-site-accent px-1 text-xs font-semibold text-site-accent-fg">
              {activeAdvanced}
            </span>
          )}
        </Button>
      </div>

      {advanced && (
        <div
          id="homes-more-filters"
          className="mt-3 grid gap-4 border-t border-site-border pt-4 sm:grid-cols-2"
        >
          <div>
            <span className="t-label mb-2 block">
              {filters.listingType === 'SALE'
                ? t('homes-price-total', { defaultValue: 'Price (total)' })
                : t('homes-price-month', { defaultValue: 'Price (per month)' })}
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder={t('homes-price-min', { defaultValue: 'Min' })}
                aria-label={t('homes-price-min-label', { defaultValue: 'Minimum price' })}
                value={filters.minPrice ?? ''}
                onChange={(e) =>
                  onChange({ minPrice: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
              <span className="text-site-text-muted">–</span>
              <Input
                type="number"
                min={0}
                placeholder={t('homes-price-max', { defaultValue: 'Max' })}
                aria-label={t('homes-price-max-label', { defaultValue: 'Maximum price' })}
                value={filters.maxPrice ?? ''}
                onChange={(e) =>
                  onChange({ maxPrice: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="t-label mb-2 block">
                {t('homes-baths-min', { defaultValue: 'Min baths' })}
              </span>
              <Select
                value={filters.minBaths ?? ''}
                onChange={(e) =>
                  onChange({ minBaths: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                aria-label={t('homes-baths-min-label', { defaultValue: 'Minimum bathrooms' })}
              >
                <option value="">{t('homes-any', { defaultValue: 'Any' })}</option>
                {[1, 2, 3].map((b) => (
                  <option key={b} value={b}>
                    {b}+
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <span className="t-label mb-2 block">
                {t('homes-radius', { defaultValue: 'Radius: {{km}} km', km: filters.radiusKm })}
              </span>
              <div className="flex h-10 items-center">
                <Slider
                  min={2}
                  max={200}
                  step={1}
                  value={[filters.radiusKm]}
                  onValueChange={([v]) => onChange({ radiusKm: v })}
                  aria-label={t('homes-radius-label', { defaultValue: 'Search radius' })}
                />
              </div>
            </div>
          </div>

          <div className="sm:col-span-2">
            <span className="t-label mb-2 block">
              {t('homes-property-type', { defaultValue: 'Property type' })}
            </span>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((type) => {
                const active = filters.propertyTypes.includes(type);
                return (
                  <Button
                    key={type}
                    type="button"
                    variant="default"
                    aria-pressed={active}
                    onClick={() => togglePropertyType(type)}
                    className={
                      active ? 'border-site-text bg-site-bg-subtle' : 'text-site-text-muted'
                    }
                  >
                    {propertyTypeLabel(type)}
                    {active && <X aria-hidden />}
                  </Button>
                );
              })}
            </div>
          </div>

          <label className="t-body flex min-h-11 cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(filters.petsAllowed)}
              onChange={(e) => onChange({ petsAllowed: e.target.checked ? true : undefined })}
              className="h-4 w-4 accent-site-accent"
            />
            {t('homes-pets-only', { defaultValue: 'Pet-friendly only' })}
          </label>
        </div>
      )}
    </div>
  );
}
