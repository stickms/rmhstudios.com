'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, BellOff, Loader2, MapPin, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { propertyTypeLabel } from '@/lib/homes/format';
import type { Watch } from '@/lib/homes/types';

/** One-line summary of a watch's criteria. */
function summarize(w: Watch): string {
  const parts: string[] = [];
  parts.push(w.listingType === 'RENT' ? 'For rent' : w.listingType === 'SALE' ? 'For sale' : 'Any');
  if (w.propertyTypes.length) parts.push(w.propertyTypes.map(propertyTypeLabel).join(', '));
  if (w.minPrice != null || w.maxPrice != null) {
    parts.push(`$${w.minPrice?.toLocaleString() ?? '0'}–${w.maxPrice?.toLocaleString() ?? '∞'}`);
  }
  if (w.minBeds != null) parts.push(`${w.minBeds}+ bd`);
  if (w.petsRequired) parts.push('Pets');
  return parts.join(' · ');
}

export function WatchManager() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/homes/watches');
      const data = res.ok ? await res.json() : { watches: [] };
      setWatches(data.watches ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(w: Watch) {
    const next = !w.active;
    setWatches((prev) => prev.map((x) => (x.id === w.id ? { ...x, active: next } : x)));
    const res = await fetch('/api/homes/watches', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, active: next }),
    });
    if (!res.ok) {
      toast.error('Could not update alert');
      load();
    } else {
      toast.success(next ? 'Alert on' : 'Alert paused');
    }
  }

  async function remove(id: string) {
    setWatches((prev) => prev.filter((x) => x.id !== id));
    const res = await fetch(`/api/homes/watches?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('Could not delete alert');
      load();
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-site-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (watches.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No alerts yet"
        description="Run a search on Browse and tap “Watch” to get notified when a new matching listing is posted."
        action={
          <Link to="/homes">
            <Button variant="outline" size="sm">
              <Search className="h-4 w-4" /> Browse listings
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {watches.map((w) => (
        <div
          key={w.id}
          className={`flex items-center justify-between gap-3 rounded-site border border-site-border bg-site-surface/80 p-3 transition-colors ${
            w.active ? '' : 'opacity-60'
          }`}
        >
          <div className="min-w-0">
            <div className="truncate font-medium text-site-text">{w.label}</div>
            <div className="truncate text-xs text-site-text-muted">{summarize(w)}</div>
            {w.locationLabel && (
              <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-site-text-dim">
                <MapPin className="h-3 w-3" />
                <span className="truncate">
                  {w.locationLabel.split(',')[0]}
                  {w.radiusKm ? ` · ${w.radiusKm} km` : ''}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => toggle(w)}
              aria-label={w.active ? 'Pause alert' : 'Resume alert'}
              className={`grid h-9 w-9 place-items-center rounded-site-sm transition-colors ${
                w.active ? 'text-site-accent' : 'text-site-text-muted hover:text-site-text'
              }`}
            >
              {w.active ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => remove(w.id)}
              aria-label="Delete alert"
              className="grid h-9 w-9 place-items-center rounded-site-sm text-site-text-muted transition-colors hover:text-site-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
