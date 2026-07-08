'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/components/Providers';
import { propertyTypeLabel } from '@/lib/homes/format';
import type { SearchCenter, SearchFilters, WatchInput } from '@/lib/homes/types';

interface WatchButtonProps {
  filters: SearchFilters;
  center: SearchCenter | null;
}

/** Human summary of the criteria this watch will alert on. */
function summarize(filters: SearchFilters, center: SearchCenter | null): string[] {
  const parts: string[] = [];
  parts.push(
    filters.listingType === 'any'
      ? 'Rentals & homes for sale'
      : filters.listingType === 'RENT'
        ? 'For rent'
        : 'For sale',
  );
  if (filters.propertyTypes.length) {
    parts.push(filters.propertyTypes.map(propertyTypeLabel).join(', '));
  }
  if (center) parts.push(`Within ${filters.radiusKm} km of ${center.label.split(',')[0]}`);
  if (filters.minPrice != null || filters.maxPrice != null) {
    parts.push(
      `$${filters.minPrice?.toLocaleString() ?? '0'}–${filters.maxPrice?.toLocaleString() ?? '∞'}`,
    );
  }
  if (filters.minBeds != null) parts.push(`${filters.minBeds}+ beds`);
  if (filters.minBaths != null) parts.push(`${filters.minBaths}+ baths`);
  if (filters.petsAllowed) parts.push('Pet-friendly');
  return parts;
}

/**
 * Creates a saved-search "watch" from the current browse filters. When a new
 * listing matches, the owner gets a notification. Opens a small modal to name
 * the alert and confirm.
 */
export function WatchButton({ filters, center }: WatchButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultLabel = center ? `Homes near ${center.label.split(',')[0]}` : 'New listings';
  const criteria = summarize(filters, center);

  async function create() {
    setSaving(true);
    try {
      const input: WatchInput = {
        label: (label.trim() || defaultLabel).slice(0, 120),
        listingType: filters.listingType === 'any' ? null : filters.listingType,
        propertyTypes: filters.propertyTypes,
        locationLabel: center?.label ?? (filters.location || null),
        lat: center?.lat ?? null,
        lng: center?.lng ?? null,
        radiusKm: center ? filters.radiusKm : null,
        minPrice: filters.minPrice ?? null,
        maxPrice: filters.maxPrice ?? null,
        minBeds: filters.minBeds ?? null,
        minBaths: filters.minBaths ?? null,
        petsRequired: Boolean(filters.petsAllowed),
      };
      const res = await fetch('/api/homes/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create alert');
      toast.success('Alert created — we’ll notify you on new matches');
      setOpen(false);
      setLabel('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create alert');
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Watch</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-t-2xl border border-site-border bg-site-surface p-5 shadow-site sm:rounded-site"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3
                className="text-lg font-semibold text-site-text"
                style={{ fontFamily: 'var(--site-font-display)' }}
              >
                Create an alert
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-site-text-muted hover:text-site-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-site-text-muted">
              We’ll notify you when a new listing matches this search.
            </p>

            <label
              htmlFor="watch-label"
              className="mb-1.5 block text-sm font-medium text-site-text"
            >
              Name
            </label>
            <Input
              id="watch-label"
              value={label}
              maxLength={120}
              placeholder={defaultLabel}
              onChange={(e) => setLabel(e.target.value)}
            />

            <div className="mt-3 flex flex-wrap gap-1.5">
              {criteria.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-site-border bg-site-bg px-2.5 py-1 text-xs text-site-text-dim"
                >
                  {c}
                </span>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <Button onClick={create} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                Create alert
              </Button>
              <Link
                to="/homes/watches"
                className="text-sm text-site-text-muted hover:text-site-text"
              >
                Manage alerts
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
