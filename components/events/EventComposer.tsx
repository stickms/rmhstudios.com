import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { EventDTO, EventVenueKindValue } from '@/lib/events.server';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { createEventApi, updateEventApi } from '@/lib/events.contract';
import {
  NO_RECURRENCE,
  RecurrenceFields,
  buildRecurrence,
  type RecurrenceDraft,
} from '@/components/calendar/RecurrenceFields';

interface EventComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the event is scoped to this community (host must be a mod/owner). */
  communityId?: string | null;
  onCreated?: (event: EventDTO) => void;
  /**
   * Edit mode (the host, or an accepted co-host): the composer opens on this event, saves it with a PATCH and
   * answers `onUpdated`. Mount it only while editing, so its fields start from the event as it is then.
   * The repeat rule is not editable here, and a repeating event's time is not either (it is the series').
   */
  event?: EventDTO | null;
  onUpdated?: (event: EventDTO) => void;
}

/** An ISO instant as the wall-clock string a `datetime-local` field takes. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function EventComposer({ open, onOpenChange, communityId, onCreated, event, onUpdated }: EventComposerProps) {
  const { t } = useTranslation('site');
  const { t: te } = useTranslation('event-cohosts');
  const editing = !!event;
  const seriesTime = !!event?.recurrence;
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(event?.endsAt ?? null));
  const [venueKind, setVenueKind] = useState<EventVenueKindValue>(event?.venueKind ?? 'IRL');
  const [venueRef, setVenueRef] = useState(event?.venueRef ?? '');
  const [capacity, setCapacity] = useState(event?.capacity != null ? String(event.capacity) : '');
  const [recurrence, setRecurrence] = useState<RecurrenceDraft>(NO_RECURRENCE);
  const [submitting, setSubmitting] = useState(false);

  const venue = VENUE_KINDS.find((v) => v.value === venueKind)!;
  const valid = title.trim().length >= 3 && startsAt.length > 0 && (venueKind !== 'URL' || venueRef.trim().length > 0);

  const reset = () => {
    setTitle('');
    setDescription('');
    setStartsAt('');
    setEndsAt('');
    setVenueKind('IRL');
    setVenueRef('');
    setCapacity('');
    setRecurrence(NO_RECURRENCE);
  };

  const submit = async () => {
    if (!valid) return;
    // `datetime-local` yields a wall-clock string with no zone — convert through
    // Date so it's sent as a UTC ISO instant.
    const startIso = new Date(startsAt).toISOString();
    const endIso = endsAt ? new Date(endsAt).toISOString() : undefined;
    setSubmitting(true);
    try {
      if (event) {
        const saved = await api(updateEventApi, {
          params: { id: event.id },
          body: {
            title: title.trim(),
            description: description.trim(),
            // A repeating event's time is the series', which this form does not move.
            ...(seriesTime ? {} : { startsAt: startIso, endsAt: endIso ?? null }),
            venueKind,
            venueRef: venueRef.trim() || null,
            capacity: capacity ? Number(capacity) : null,
          },
        });
        toast.success(te('event-saved', { defaultValue: 'Event saved.' }));
        onUpdated?.(saved.event);
        onOpenChange(false);
        return;
      }
      const data = await api(createEventApi, {
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          communityId: communityId ?? undefined,
          startsAt: startIso,
          endsAt: endIso,
          venueKind,
          venueRef: venueRef.trim() || undefined,
          capacity: capacity ? Number(capacity) : undefined,
          recurrence: buildRecurrence(recurrence),
        },
      });
      toast.success(
        t('event-created', {
          defaultValue: 'Event created!',
        }),
      );
      onCreated?.(data.event);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        serverError(e) ||
          (editing
            ? te('event-save-error', { defaultValue: 'Could not save the event.' })
            : t('event-create-error', {
                defaultValue: 'Could not create event',
              })),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? te('edit-event-title', { defaultValue: 'Edit event' })
              : t('create-event-title', {
                  defaultValue: 'Create an event',
                })}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? te('edit-event-desc', { defaultValue: 'Change the details. Guests see them straight away.' })
              : t('create-event-desc', {
                  defaultValue: 'Schedule something and let people RSVP.',
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            aria-label={t('event-title-placeholder', {
              defaultValue: 'Title',
            })}
            placeholder={t('event-title-placeholder', {
              defaultValue: 'Title',
            })}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            aria-label={t('event-description-placeholder', {
              defaultValue: 'Description (optional)',
            })}
            placeholder={t('event-description-placeholder', {
              defaultValue: 'Description (optional)',
            })}
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {!seriesTime && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium text-site-text-muted">
                {t('event-starts', {
                  defaultValue: 'Starts',
                })}
                <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium text-site-text-muted">
                {t('event-ends', {
                  defaultValue: 'Ends (optional)',
                })}
                <Input
                  type="datetime-local"
                  value={endsAt}
                  min={startsAt || undefined}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-medium text-site-text-muted">
              {t('event-venue-kind', {
                defaultValue: 'Venue',
              })}
              <Select
                controlSize="sm"
                containerClassName="w-full"
                value={venueKind}
                onChange={(e) => setVenueKind(e.target.value as EventVenueKindValue)}
              >
                {VENUE_KINDS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {t(v.labelKey, {
                      defaultValue: v.label,
                    })}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium text-site-text-muted">
              {t('event-capacity', {
                defaultValue: 'Capacity (optional)',
              })}
              <Input
                type="number"
                min={1}
                placeholder={t('event-capacity-placeholder', {
                  defaultValue: 'No limit',
                })}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-xs font-medium text-site-text-muted">
            {
              {
                IRL: t('event-venue-ref-irl', { defaultValue: 'Location' }),
                URL: t('event-venue-url', { defaultValue: 'URL' }),
                SPACE: t('event-venue-ref-space', { defaultValue: 'Space ID' }),
                TOURNAMENT: t('event-venue-ref-tournament', { defaultValue: 'Tournament ID' }),
                GAME: t('event-venue-ref-game', { defaultValue: 'Game' }),
              }[venue.value]
            }
            <Input
              type={venueKind === 'URL' ? 'url' : 'text'}
              placeholder={venue.refPlaceholder}
              value={venueRef}
              maxLength={191}
              onChange={(e) => setVenueRef(e.target.value)}
            />
          </label>

          {!editing && <RecurrenceFields value={recurrence} onChange={setRecurrence} />}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel-button', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button variant="default" onClick={submit} disabled={!valid} loading={submitting}>
            {editing
              ? te('save-event', { defaultValue: 'Save' })
              : t('create-button', {
                  defaultValue: 'Create',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
