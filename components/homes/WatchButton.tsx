'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11">
          <Bell className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Watch</span>
          <span className="sr-only sm:hidden">Watch</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an alert</DialogTitle>
          <DialogDescription>
            We’ll notify you when a new listing matches this search.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="watch-label">Name</Label>
            <Input
              id="watch-label"
              value={label}
              maxLength={120}
              placeholder={defaultLabel}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {criteria.map((c) => (
              <Badge key={c} variant="outline" size="default">
                {c}
              </Badge>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Link
            to="/homes/manage"
            search={{ tab: 'alerts' }}
            className="inline-flex min-h-11 items-center text-sm text-site-text-muted hover:text-site-text sm:mr-auto"
          >
            Manage alerts
          </Link>
          <Button onClick={create} loading={saving}>
            {!saving && <Bell className="h-4 w-4" aria-hidden />}
            Create alert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
