'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocationSearch, type SavedPlaceOption } from './LocationSearch';
import type { RidePlace } from '@/lib/rideshare/geo';

interface SavedPlacesProps {
  places: SavedPlaceOption[];
  onChanged: () => void;
}

export function SavedPlaces({ places, onChanged }: SavedPlacesProps) {
  const { t } = useTranslation("c-rideshare");
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState<RidePlace | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim() || !place) {
      toast.error(t("pick-location-and-name", { defaultValue: "Pick a location and give it a name." }));
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
        toast.error(data.error || t("could-not-save-place", { defaultValue: "Could not save place." }));
        return;
      }
      toast.success(t("place-saved", { defaultValue: "Place saved." }));
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
      toast.error(t("could-not-remove-place", { defaultValue: "Could not remove place." }));
    }
  }

  return (
    <div className="glass-fill rounded-site p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="site-section-label flex items-center gap-2">
          <Star className="h-4 w-4 text-site-warning" /> {t("saved-places", { defaultValue: "Saved places" })}
        </h2>
        {!adding && (
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> {t("add", { defaultValue: "Add" })}
          </Button>
        )}
      </div>

      {places.length === 0 && !adding && (
        <p className="text-sm text-site-text-muted">
          {t("saved-places-empty-hint", { defaultValue: "Save Home, Work, or anywhere you go often for one-tap pickup and drop-off." })}
        </p>
      )}

      {places.length > 0 && (
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.id} className="glass-inset flex items-center gap-2 rounded-site-sm px-3 py-2">
              <Star className="h-3.5 w-3.5 shrink-0 text-site-warning" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-site-text">{p.savedLabel}</div>
                <div className="truncate text-xs text-site-text-muted" title={p.label}>{p.label}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-site-text-muted hover:text-site-danger"
                onClick={() => remove(p.id)}
                aria-label={t("remove-place", { defaultValue: "Remove {{name}}", name: p.savedLabel })}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="glass-inset mt-3 space-y-3 rounded-site-sm p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-site-text">{t("new-place", { defaultValue: "New place" })}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => { setAdding(false); setPlace(null); setLabel(''); }}
              aria-label={t("cancel", { defaultValue: "Cancel" })}
            >
              <X aria-hidden />
            </Button>
          </div>
          <div>
            <label htmlFor="saved-place-name" className="mb-2 block text-sm font-medium text-site-text">{t("name-label", { defaultValue: "Name" })}</label>
            <Input
              id="saved-place-name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder={t("name-placeholder", { defaultValue: "Home" })}
            />
          </div>
          <LocationSearch label={t("location-label", { defaultValue: "Location" })} value={place} onSelect={setPlace} placeholder={t("location-placeholder", { defaultValue: "Search for the address" })} allowCurrentLocation />
          <Button type="button" className="w-full" onClick={save} loading={saving}>
            {!saving && <Plus aria-hidden />}
            {t("save-place", { defaultValue: "Save place" })}
          </Button>
        </div>
      )}
    </div>
  );
}
