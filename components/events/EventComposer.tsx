'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { EventDTO, EventVenueKindValue } from '@/lib/events.server';

interface EventComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the event is scoped to this community (host must be a mod/owner). */
  communityId?: string | null;
  onCreated?: (event: EventDTO) => void;
}

const VENUE_KINDS: {
  value: EventVenueKindValue;
  labelKey: string;
  label: string;
  refLabel: string;
  refPlaceholder: string;
}[] = [
  {
    value: 'IRL',
    labelKey: 'venue-irl',
    label: 'In person',
    refLabel: 'Location',
    refPlaceholder: 'Where is it?',
  },
  {
    value: 'URL',
    labelKey: 'venue-url',
    label: 'Online link',
    refLabel: 'URL',
    refPlaceholder: 'https://…',
  },
  {
    value: 'SPACE',
    labelKey: 'venue-space',
    label: 'Space',
    refLabel: 'Space ID',
    refPlaceholder: 'Space ID (optional)',
  },
  {
    value: 'TOURNAMENT',
    labelKey: 'venue-tournament',
    label: 'Tournament',
    refLabel: 'Tournament ID',
    refPlaceholder: 'Tournament ID (optional)',
  },
  {
    value: 'GAME',
    labelKey: 'venue-game',
    label: 'Game',
    refLabel: 'Game',
    refPlaceholder: 'Game id / room (optional)',
  },
];

const inputCls =
  'w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none';

export function EventComposer({ open, onOpenChange, communityId, onCreated }: EventComposerProps) {
  const { t } = useTranslation('site');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [venueKind, setVenueKind] = useState<EventVenueKindValue>('IRL');
  const [venueRef, setVenueRef] = useState('');
  const [capacity, setCapacity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const venue = VENUE_KINDS.find((v) => v.value === venueKind)!;
  const valid =
    title.trim().length >= 3 &&
    startsAt.length > 0 &&
    (venueKind !== 'URL' || venueRef.trim().length > 0);

  const reset = () => {
    setTitle('');
    setDescription('');
    setStartsAt('');
    setEndsAt('');
    setVenueKind('IRL');
    setVenueRef('');
    setCapacity('');
  };

  const submit = async () => {
    if (!valid) return;
    // `datetime-local` yields a wall-clock string with no zone — convert through
    // Date so it's sent as a UTC ISO instant.
    const startIso = new Date(startsAt).toISOString();
    const endIso = endsAt ? new Date(endsAt).toISOString() : undefined;
    setSubmitting(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          communityId: communityId ?? undefined,
          startsAt: startIso,
          endsAt: endIso,
          venueKind,
          venueRef: venueRef.trim() || undefined,
          capacity: capacity ? Number(capacity) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.event) {
        toast.success(t('event-created', { defaultValue: 'Event created!' }));
        onCreated?.(data.event as EventDTO);
        reset();
        onOpenChange(false);
      } else {
        toast.error(
          data.error || t('event-create-error', { defaultValue: 'Could not create event' }),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('create-event-title', { defaultValue: 'Create an event' })}</DialogTitle>
          <DialogDescription>
            {t('create-event-desc', { defaultValue: 'Schedule something and let people RSVP.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <input
            className={inputCls}
            placeholder={t('event-title-placeholder', { defaultValue: 'Title' })}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={inputCls}
            placeholder={t('event-description-placeholder', {
              defaultValue: 'Description (optional)',
            })}
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-site-text-muted">
              {t('event-starts', { defaultValue: 'Starts' })}
              <input
                type="datetime-local"
                className={inputCls}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-site-text-muted">
              {t('event-ends', { defaultValue: 'Ends (optional)' })}
              <input
                type="datetime-local"
                className={inputCls}
                value={endsAt}
                min={startsAt || undefined}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-site-text-muted">
              {t('event-venue-kind', { defaultValue: 'Venue' })}
              <Select
                controlSize="sm"
                containerClassName="w-full"
                value={venueKind}
                onChange={(e) => setVenueKind(e.target.value as EventVenueKindValue)}
              >
                {VENUE_KINDS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {t(v.labelKey, { defaultValue: v.label })}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-site-text-muted">
              {t('event-capacity', { defaultValue: 'Capacity (optional)' })}
              <input
                type="number"
                min={1}
                className={inputCls}
                placeholder={t('event-capacity-placeholder', { defaultValue: 'No limit' })}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-site-text-muted">
            {t(venue.refLabel === 'URL' ? 'event-venue-url' : 'event-venue-ref', {
              defaultValue: venue.refLabel,
            })}
            <input
              className={inputCls}
              type={venueKind === 'URL' ? 'url' : 'text'}
              placeholder={venue.refPlaceholder}
              value={venueRef}
              maxLength={191}
              onChange={(e) => setVenueRef(e.target.value)}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel-button', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="accent" onClick={submit} disabled={!valid} loading={submitting}>
            {t('create-button', { defaultValue: 'Create' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
