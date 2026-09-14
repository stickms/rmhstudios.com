'use client';

/**
 * Booking, prices and the house rules.
 *
 * The prices are formatted through `Intl.NumberFormat` on the active locale
 * rather than written into the string: SEK is grouped with a space in Swedish
 * and a comma in English, and a hardcoded "1 450" is wrong in fifteen of the
 * sixteen shipped locales. The currency itself does not move — the restaurant
 * charges in kronor wherever you are reading from.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { policyText } from './copy';
import {
  JUICE_PAIRING_SEK,
  MENU_PRICE_SEK,
  WINE_PAIRING_SEK,
} from '@/lib/rebar-rutabaga/menu';

/** House rules, in the order they are worth reading. Words are in `copy.ts`. */
const POLICY_IDS = ['allergies', 'lateness', 'children', 'photographs', 'floor'] as const;

export function Reservations() {
  const { t, i18n } = useTranslation('c-rebar-rutabaga');

  const money = (amount: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'SEK',
      maximumFractionDigits: 0,
    }).format(amount);

  const facts: [string, string][] = [
    [t('book.nights', { defaultValue: 'Nights' }), t('book.nightsValue', { defaultValue: 'Wednesday – Saturday' })],
    [t('book.seatings', { defaultValue: 'Seatings' }), '17:30 · 20:45'],
    [t('book.atTable', { defaultValue: 'At table' }), t('book.atTableValue', { defaultValue: '2 h 50 min' })],
    [t('book.wine', { defaultValue: 'Wine pairing' }), money(WINE_PAIRING_SEK)],
    [t('book.juice', { defaultValue: 'Juice pairing' }), money(JUICE_PAIRING_SEK)],
    [t('book.telephone', { defaultValue: 'Telephone' }), '+46 31 18 14 63'],
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <div className="glass-pane rounded-site p-6">
        <p className="font-display text-4xl font-semibold tracking-[-0.03em] text-site-text sm:text-5xl">
          {money(MENU_PRICE_SEK)}
        </p>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.09em] text-site-text-muted">
          {t('book.perGuest', { defaultValue: 'Per guest · nine courses' })}
        </p>

        <dl className="mt-6 flex flex-col">
          {facts.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-site-border py-3 last:border-b-0"
            >
              <dt className="font-mono text-xs uppercase tracking-[0.09em] text-site-text-muted">
                {label}
              </dt>
              <dd className="text-right font-mono text-sm tabular-nums text-site-text">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <Button asChild variant="accent">
            <a href="mailto:bord@rebarochrutabaga.se">
              {t('book.cta', { defaultValue: 'Request a table' })}
            </a>
          </Button>
        </div>
        <p className="mt-3 text-xs text-site-text-muted">
          {t('book.opens', {
            defaultValue:
              'Bookings open on the first of each month at 09:00 CET, for the month after next.',
          })}
        </p>
      </div>

      <div className="flex flex-col">
        {POLICY_IDS.map((id) => {
          const p = policyText(id, t);
          return (
            <div key={id} className="border-b border-site-border py-4 first:pt-0 last:border-b-0">
              <h3 className="font-display text-xs font-semibold uppercase tracking-[0.1em] text-site-text">
                {p.title}
              </h3>
              <p className="mt-1.5 max-w-prose text-sm text-site-text-muted">{p.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
