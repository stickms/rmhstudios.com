import { IconButton } from '@/components/ui/icon-button';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell, BellOff, MapPin, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { propertyTypeLabel } from '@/lib/homes/format';
import type { Watch } from '@/lib/homes/types';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/contract/client';
import {
  deleteHomeWatchApi,
  listHomeWatchesApi,
  setHomeWatchActiveApi,
} from '@/lib/homes/homes.contract';

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
  const { t } = useTranslation('site');
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(listHomeWatchesApi, { retries: 0 }).catch(() => ({
        watches: [] as Watch[],
      }));
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
    try {
      await api(setHomeWatchActiveApi, { body: { id: w.id, active: next } });
      toast.success(next ? 'Alert on' : 'Alert paused');
    } catch {
      toast.error('Could not update alert');
      load();
    }
  }

  async function remove(id: string) {
    setWatches((prev) => prev.filter((x) => x.id !== id));
    try {
      await api(deleteHomeWatchApi, { query: { id } });
    } catch {
      toast.error('Could not delete alert');
      load();
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20 text-site-text-muted">
        <Spinner size={32} className="text-site-text-muted" />
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
          <Button asChild variant="default" size="sm">
            <Link to="/homes">
              <Search className="h-4 w-4" /> Browse listings
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="border-t border-site-border">
      {watches.map((w) => (
        <div
          key={w.id}
          className="flex items-center justify-between gap-3 border-b border-site-border py-3.5"
        >
          <div className="min-w-0">
            <div className="t-body truncate font-medium text-site-text">
              {w.label}
              {!w.active && (
                <span className="t-meta ms-2">
                  {t('homes-alert-paused', { defaultValue: 'Paused' })}
                </span>
              )}
            </div>
            <div className="t-body truncate text-site-text-muted">{summarize(w)}</div>
            {w.locationLabel && (
              <div className="t-meta mt-0.5 flex min-w-0 items-center gap-1">
                <MapPin className="size-3 shrink-0" aria-hidden />
                <span className="truncate">
                  {w.locationLabel.split(',')[0]}
                  {w.radiusKm ? ` · ${w.radiusKm} km` : ''}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              icon={w.active ? Bell : BellOff}
              label={w.active ? 'Pause alert' : 'Resume alert'}
              aria-pressed={w.active}
              onClick={() => toggle(w)}
            />
            <IconButton icon={Trash2} label="Delete alert" onClick={() => remove(w.id)} />
          </div>
        </div>
      ))}
    </div>
  );
}
