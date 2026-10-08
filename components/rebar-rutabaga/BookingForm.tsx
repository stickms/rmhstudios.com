'use client';

/**
 * The book — the form that replaced an email address (W1).
 *
 * ## Staying at the page's volume
 *
 * `Reservations.tsx` explains why the call to action here is a ruled link
 * rather than a filled button: a pill of accent colour would be the single
 * loudest object on a page built entirely from hairlines. A form is a much
 * bigger object than a link, so the same argument applies harder — this one is
 * built from the page's own parts (`--rebar-*` tokens, `DrawnRule`, the mono
 * eyebrow) and is closed until asked for. The reader who wants the price and
 * the house rules is not made to scroll past a form to get them.
 *
 * It deliberately does NOT use `components/ui/` primitives. Those carry the
 * `--site-*` contract, and dropping a `<Button>` in here would put the rest of
 * rmhstudios.com's material in the middle of a restaurant that has spent a
 * whole page establishing it does not share it.
 *
 * ## The mailto stays
 *
 * Above {@link MAX_PARTY_SIZE} the form hands the reader back to
 * `bord@rebarochrutabaga.se`, which was always the right path for a large
 * party: those bookings are a conversation about the room, not a row in a
 * table.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Reveal, DrawnRule } from './Reveal';
import { MAX_PARTY_SIZE, type Seating } from '@/lib/rebar-rutabaga/booking';

interface NightAvailability {
  date: string;
  seatings: { seating: Seating; seatsLeft: number }[];
}
interface Availability {
  month: string;
  covers: number;
  maxPartySize: number;
  nights: NightAvailability[];
}

/** A booked table, as the confirmation renders it. */
interface Booked {
  id: string;
  serviceDate: string;
  seating: string;
  partySize: number;
}

const FIELD =
  'w-full border-0 border-b border-rebar-line bg-transparent px-0 py-2.5 font-mono text-sm text-rebar-ink outline-none transition-colors duration-[var(--rebar-dur-quick)] placeholder:text-rebar-ink-faint focus-visible:border-rebar-line-strong';

export function BookingForm() {
  const { t, i18n } = useTranslation('c-rebar-rutabaga');

  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [date, setDate] = useState('');
  const [seating, setSeating] = useState<string>('');
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || availability) return;
    fetch('/api/services/rebar-reservations', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { availability: Availability } | null) => {
        if (!d) return;
        setAvailability(d.availability);
        const first = d.availability.nights[0];
        if (first) setDate(first.date);
      })
      .catch(() => setError(t('book.formError', { defaultValue: 'The book is not answering. Try the email below.' })));
  }, [open, availability, t]);

  const night = availability?.nights.find((n) => n.date === date) ?? null;

  // Keep the chosen seating valid as the night changes: a seating that was
  // available on Thursday may be full on Friday, and silently posting a full
  // one would be a refusal the reader could have been spared.
  useEffect(() => {
    if (!night) return;
    const usable = night.seatings.filter((s) => s.seatsLeft >= partySize);
    if (!usable.some((s) => s.seating === seating)) setSeating(usable[0]?.seating ?? '');
  }, [night, partySize, seating]);

  const longDate = useCallback(
    (iso: string) =>
      new Date(`${iso}T12:00:00Z`).toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [i18n.language],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/services/rebar-reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ serviceDate: date, seating, partySize, name, email, note: note || undefined }),
      });
      const body = (await res.json()) as Booked & { detail?: { reason?: string } };
      if (!res.ok) {
        setError(
          body.detail?.reason === 'already-booked'
            ? t('book.formDuplicate', { defaultValue: 'That email already holds a table for this service.' })
            : body.detail?.reason === 'full'
              ? t('book.formFull', { defaultValue: 'That seating filled while you were reading. Try the other one.' })
              : t('book.formError', { defaultValue: 'The book is not answering. Try the email below.' }),
        );
        return;
      }
      setBooked(body);
    } catch {
      setError(t('book.formError', { defaultValue: 'The book is not answering. Try the email below.' }));
    } finally {
      setSending(false);
    }
  }

  if (booked) {
    return (
      <Reveal>
        <div className="mt-10 border-t border-rebar-line-strong pt-6">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-rebar-ink-faint">
            {t('book.formDone', { defaultValue: 'The table is yours' })}
          </p>
          <p className="mt-3 font-display text-xl font-light tracking-[-0.02em] text-rebar-ink">
            {t('book.formDoneLine', {
              defaultValue: '{{party}} guests, {{date}}, {{seating}}',
              party: booked.partySize,
              date: longDate(booked.serviceDate),
              seating: booked.seating,
            })}
          </p>
          <p className="mt-3 max-w-[30rem] text-sm leading-relaxed text-rebar-ink-soft">
            {t('book.formDoneNote', {
              defaultValue: 'A confirmation is on its way. Tell us about allergies when you arrive, or reply to it.',
            })}
          </p>
        </div>
      </Reveal>
    );
  }

  if (!open) {
    return (
      <Reveal delay={0.16}>
        <div className="mt-12">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group inline-flex items-baseline gap-3 border-b border-rebar-line-strong pb-2 font-display text-xl font-light tracking-[-0.02em] text-rebar-ink transition-colors duration-[var(--rebar-dur-quick)] hover:text-rebar-ink-soft"
          >
            {t('book.cta', { defaultValue: 'Request a table' })}
            <span
              aria-hidden
              className="font-mono text-sm transition-transform duration-[var(--rebar-dur-quick)] group-hover:translate-x-0.5"
            >
              →
            </span>
          </button>
        </div>
      </Reveal>
    );
  }

  const usableSeatings = night?.seatings.filter((s) => s.seatsLeft >= partySize) ?? [];

  return (
    <Reveal>
      <form onSubmit={submit} className="mt-12">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-rebar-ink-faint">
          {availability
            ? t('book.formMonth', {
                defaultValue: 'Now taking {{month}}',
                month: new Date(`${availability.month}-01T12:00:00Z`).toLocaleDateString(i18n.language, {
                  month: 'long',
                  year: 'numeric',
                }),
              })
            : t('book.formLoading', { defaultValue: 'Opening the book…' })}
        </p>
        <DrawnRule className="mt-4" />

        <div className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
              {t('book.formDate', { defaultValue: 'Night' })}
            </span>
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
              required
            >
              {(availability?.nights ?? []).map((n) => (
                <option key={n.date} value={n.date}>
                  {longDate(n.date)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
              {t('book.formGuests', { defaultValue: 'Guests' })}
            </span>
            <select
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className={FIELD}
              required
            >
              {Array.from({ length: MAX_PARTY_SIZE }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
              {t('book.formSeating', { defaultValue: 'Seating' })}
            </legend>
            <div className="mt-2 flex flex-wrap gap-6">
              {(night?.seatings ?? []).map((s) => {
                const full = s.seatsLeft < partySize;
                return (
                  <label
                    key={s.seating}
                    className={`inline-flex items-baseline gap-2 font-mono text-sm ${
                      full ? 'text-rebar-ink-faint line-through' : 'text-rebar-ink'
                    }`}
                  >
                    <input
                      type="radio"
                      name="seating"
                      value={s.seating}
                      checked={seating === s.seating}
                      onChange={() => setSeating(s.seating)}
                      disabled={full}
                      className="accent-rebar-sulphur"
                    />
                    {s.seating}
                  </label>
                );
              })}
              {night && usableSeatings.length === 0 && (
                <span className="font-mono text-sm text-rebar-ink-faint">
                  {t('book.formNightFull', { defaultValue: 'Fully booked — try another night.' })}
                </span>
              )}
            </div>
          </fieldset>

          <label className="block">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
              {t('book.formName', { defaultValue: 'Name' })}
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} required maxLength={80} />
          </label>

          <label className="block">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
              {t('book.formEmail', { defaultValue: 'Email' })}
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
              required
              maxLength={160}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
              {t('book.formNote', { defaultValue: 'Allergies, or anything the kitchen should know' })}
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} maxLength={500} />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-6 max-w-[30rem] text-sm leading-relaxed text-rebar-ink">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={sending || !seating || !date}
          className="mt-8 inline-flex items-baseline gap-3 border-b border-rebar-line-strong pb-2 font-display text-xl font-light tracking-[-0.02em] text-rebar-ink transition-colors duration-[var(--rebar-dur-quick)] hover:text-rebar-ink-soft disabled:cursor-not-allowed disabled:text-rebar-ink-faint"
        >
          {sending
            ? t('book.formSending', { defaultValue: 'Writing you in…' })
            : t('book.formSubmit', { defaultValue: 'Take the table' })}
        </button>
      </form>
    </Reveal>
  );
}
