'use client';

import { useState } from 'react';
import { Star, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LocationSearch, type SavedPlaceOption } from './LocationSearch';
import type { RidePlace } from '@/lib/rideshare/geo';

interface SavedPlacesProps {
  places: SavedPlaceOption[];
  onChanged: () => void;
}

export function SavedPlaces({ places, onChanged }: SavedPlacesProps) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState<RidePlace | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim() || !place) {
      toast.error('Pick a location and give it a name.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rideshare/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), address: place.label, lat: place.lat, lng: place.lng }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not save place.');
        return;
      }
      toast.success('Place saved.');
      setAdding(false);
      setLabel('');
      setPlace(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/rideshare/places/${id}`, { method: 'DELETE' });
    if (res.ok) {
      onChanged();
    } else {
      toast.error('Could not remove place.');
    }
  }

  return (
    <div className="rounded-2xl border border-site-border bg-site-surface/80 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-site-text">
          <Star className="h-4 w-4 text-amber-400" /> Saved places
        </h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-medium text-site-accent hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {places.length === 0 && !adding && (
        <p className="text-sm text-site-text-muted">
          Save Home, Work, or anywhere you go often for one-tap pickup and drop-off.
        </p>
      )}

      {places.length > 0 && (
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-site-border bg-site-surface px-3 py-2">
              <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-site-text">{p.savedLabel}</div>
                <div className="truncate text-xs text-site-text-muted" title={p.label}>{p.label}</div>
              </div>
              <button
                onClick={() => remove(p.id)}
                className="shrink-0 rounded-md p-1 text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-red-400"
                aria-label={`Remove ${p.savedLabel}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 space-y-3 rounded-lg border border-site-border bg-site-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-site-text">New place</span>
            <button
              onClick={() => { setAdding(false); setPlace(null); setLabel(''); }}
              className="rounded-md p-1 text-site-text-muted hover:text-site-text"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-site-text-muted">Name</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder="Home"
              className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2.5 text-base text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60 sm:py-2 sm:text-sm"
            />
          </div>
          <LocationSearch label="Location" value={place} onSelect={setPlace} placeholder="Search for the address" allowCurrentLocation />
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-site-accent px-4 py-2 text-sm font-semibold text-(--site-accent-fg) transition-colors hover:bg-(--site-accent-hover) disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save place
          </button>
        </div>
      )}
    </div>
  );
}
