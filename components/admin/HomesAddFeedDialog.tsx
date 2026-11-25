import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/contract/client';
import { addAdminHomeRssApi } from '@/lib/admin/homes.contract';
import { homesGeocodeApi } from '@/lib/homes/homes.contract';
import { checkFeedUrl, type AdminHomeSource, type HomeListingTypeName } from '@/lib/admin/homes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new source once it is stored; the dialog does not close itself. */
  onAdded: (source: AdminHomeSource) => void;
}

interface Coordinates {
  lat: number;
  lng: number;
  label: string;
}

function AddFeedForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: Props['onAdded'] }) {
  const { t } = useTranslation('admin-homes');
  const refusalText = useRefusalText();
  const ids = useId();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [listingType, setListingType] = useState<HomeListingTypeName>('RENT');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [place, setPlace] = useState<Coordinates | null>(null);
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearPlace = () => {
    setPlace(null);
    setError(null);
  };

  // The existing geocode endpoint: the city and state the admin typed, the first place it finds.
  const findPlace = async () => {
    const q = [city.trim(), state.trim()].filter(Boolean).join(', ');
    if (q.length < 3) {
      setError(t('place-needed', { defaultValue: 'Enter a city and state to find its coordinates.' }));
      return;
    }
    setFinding(true);
    setError(null);
    try {
      const { results } = await api(homesGeocodeApi, { query: { q } });
      const first = results[0];
      if (!first) setError(t('place-none', { defaultValue: 'No place found. Check the city and state.' }));
      else setPlace({ lat: first.lat, lng: first.lng, label: first.label });
    } catch {
      setError(t('place-failed', { defaultValue: 'The place search is unavailable. Try again.' }));
    } finally {
      setFinding(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (label.trim() === '') {
      setError(t('label-required', { defaultValue: 'Enter a name for the feed.' }));
      return;
    }
    if (!checkFeedUrl(url).ok) {
      setError(t('url-invalid', { defaultValue: 'Use a public https address for the feed' }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const out = await api(addAdminHomeRssApi, {
        body: {
          label: label.trim(),
          url: url.trim(),
          listingType,
          ...(city.trim() ? { defaultCity: city.trim() } : {}),
          ...(state.trim() ? { defaultState: state.trim() } : {}),
          ...(place ? { defaultLat: place.lat, defaultLng: place.lng } : {}),
        },
      });
      onAdded(out.source);
    } catch (e) {
      setError(refusalText.maybe(e) ?? t('add-failed', { defaultValue: 'The feed did not save. Try again.' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{t('add-title', { defaultValue: 'Add an RSS feed' })}</DialogTitle>
        <DialogDescription>
          {t('add-description', {
            defaultValue: 'A public https feed of listings. Craigslist regions are set in code, not here.',
          })}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-label`}>{t('add-label', { defaultValue: 'Name' })}</Label>
        <Input
          id={`${ids}-label`}
          value={label}
          maxLength={120}
          autoComplete="off"
          dir="auto"
          onChange={(e) => {
            setLabel(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-url`}>{t('add-url', { defaultValue: 'Feed address' })}</Label>
        <Input
          id={`${ids}-url`}
          type="url"
          inputMode="url"
          value={url}
          maxLength={1000}
          autoComplete="off"
          dir="ltr"
          placeholder="https://"
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${ids}-type`}>{t('add-type', { defaultValue: 'Listings are' })}</Label>
        <Select
          id={`${ids}-type`}
          value={listingType}
          onChange={(e) => setListingType(e.target.value === 'SALE' ? 'SALE' : 'RENT')}
        >
          <option value="RENT">{t('type-rent', { defaultValue: 'For rent' })}</option>
          <option value="SALE">{t('type-sale', { defaultValue: 'For sale' })}</option>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-city`}>{t('add-city', { defaultValue: 'Default city' })}</Label>
          <Input
            id={`${ids}-city`}
            value={city}
            maxLength={120}
            autoComplete="off"
            dir="auto"
            onChange={(e) => {
              setCity(e.target.value);
              clearPlace();
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-state`}>{t('add-state', { defaultValue: 'Default state' })}</Label>
          <Input
            id={`${ids}-state`}
            value={state}
            maxLength={64}
            autoComplete="off"
            dir="auto"
            onChange={(e) => {
              setState(e.target.value);
              clearPlace();
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="default" loading={finding} onClick={() => void findPlace()}>
          {t('find-place', { defaultValue: 'Find coordinates' })}
        </Button>
        <p className="t-meta min-w-0 break-words text-site-text-muted" dir="auto">
          {place
            ? t('place-found', {
                defaultValue: 'Using {{lat}}, {{lng}}',
                lat: place.lat.toFixed(4),
                lng: place.lng.toFixed(4),
              })
            : t('place-unset', { defaultValue: 'No coordinates set.' })}
        </p>
      </div>
      {error ? (
        <p role="alert" className="t-meta text-site-danger">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="default" onClick={onCancel}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {t('add-submit', { defaultValue: 'Add feed' })}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The add-feed form in a dialog. It mounts fresh each time it opens, so a cancelled form never leaks into the next. */
export function HomesAddFeedDialog({ open, onOpenChange, onAdded }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <AddFeedForm onCancel={() => onOpenChange(false)} onAdded={onAdded} />
      </DialogContent>
    </Dialog>
  );
}
