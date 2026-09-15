'use client';

/**
 * Booking, prices and the house rules — the page's last quiet room.
 *
 * The prices are formatted through `Intl.NumberFormat` on the active locale
 * rather than written into the string: SEK is grouped with a space in Swedish
 * and a comma in English, and a hardcoded "1 450" is wrong in fifteen of the
 * sixteen shipped locales. The currency itself does not move — the restaurant
 * charges in kronor wherever you are reading from.
 *
 * Two redesign notes:
 *
 * **The price is set like a headline, because it is one.** At this end of the
 * page the reader has one question left, and answering it in 14px inside a card
 * was the old layout being polite about the thing it exists to say.
 *
 * **The call to action is a ruled link, not a filled button.** A pill of accent
 * colour would be the single loudest object on a page built entirely from
 * hairlines, and it would be loud in service of an email address. A generous
 * underline that thickens on hover is the same affordance at the page's own
 * volume — and it is a real `<a href="mailto:">`, so it keeps every behaviour a
 * link has that a styled button does not.
 */

import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { policyText } from './copy';
import { Reveal, DrawnRule, stagger } from './Reveal';
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
    [
      t('book.nights', { defaultValue: 'Nights' }),
      t('book.nightsValue', { defaultValue: 'Wednesday – Saturday' }),
    ],
    [t('book.seatings', { defaultValue: 'Seatings' }), '17:30 · 20:45'],
    [
      t('book.atTable', { defaultValue: 'At table' }),
      t('book.atTableValue', { defaultValue: '2 h 50 min' }),
    ],
    [t('book.wine', { defaultValue: 'Wine pairing' }), money(WINE_PAIRING_SEK)],
    [t('book.juice', { defaultValue: 'Juice pairing' }), money(JUICE_PAIRING_SEK)],
    [t('book.telephone', { defaultValue: 'Telephone' }), '+46 31 18 14 63'],
  ];

  return (
    <section
      aria-labelledby="rr-book"
      className="border-t border-rebar-line bg-rebar-paper-sunk"
    >
      <div className="mx-auto max-w-[86rem] px-6 py-24 sm:px-10 sm:py-32">
        <Reveal>
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.26em] text-rebar-ink-faint">
            {t('book.eyebrow', { defaultValue: 'Reservations' })}
          </p>
        </Reveal>

        <div className="mt-6 grid gap-14 lg:grid-cols-2 lg:items-start lg:gap-20">
          <div>
            <Reveal delay={0.05}>
              <h2
                id="rr-book"
                className="font-display text-[clamp(3rem,9vw,6.5rem)] font-light leading-[0.9] tracking-[-0.045em] tabular-nums text-rebar-ink"
              >
                {money(MENU_PRICE_SEK)}
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-4 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-rebar-ink-faint">
                {t('book.perGuest', { defaultValue: 'Per guest · nine courses' })}
              </p>
            </Reveal>

            <Reveal delay={0.16}>
              <div className="mt-12">
                <a
                  href="mailto:bord@rebarochrutabaga.se"
                  className="group inline-flex items-baseline gap-3 border-b border-rebar-line-strong pb-2 font-display text-xl font-light tracking-[-0.02em] text-rebar-ink transition-colors duration-[var(--rebar-dur-quick)] hover:text-rebar-ink-soft"
                >
                  {t('book.cta', { defaultValue: 'Request a table' })}
                  <ArrowUpRight
                    className="size-4 shrink-0 transition-transform duration-[var(--rebar-dur-quick)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-5 max-w-[30rem] text-sm leading-relaxed text-rebar-ink-soft">
                {t('book.opens', {
                  defaultValue:
                    'Bookings open on the first of each month at 09:00 CET, for the month after next.',
                })}
              </p>
            </Reveal>

            <DrawnRule className="mt-14" />
            <dl className="mt-1">
              {facts.map(([label, value], i) => (
                <Reveal key={label} delay={stagger(i, 0.045)}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-6 border-b border-rebar-line py-3.5">
                    <dt className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-rebar-ink-faint">
                      {label}
                    </dt>
                    <dd className="text-right font-mono text-sm tabular-nums text-rebar-ink">
                      {value}
                    </dd>
                  </div>
                </Reveal>
              ))}
            </dl>
          </div>

          <div className="lg:pt-6">
            <Reveal>
              <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.26em] text-rebar-ink-faint">
                {t('book.house', { defaultValue: 'The house' })}
              </h3>
            </Reveal>
            <DrawnRule className="mt-5" />
            <div className="mt-1">
              {POLICY_IDS.map((id, i) => {
                const p = policyText(id, t);
                return (
                  <Reveal key={id} delay={stagger(i, 0.05)}>
                    <div className="border-b border-rebar-line py-6">
                      <h4 className="font-display text-base font-normal tracking-[-0.01em] text-rebar-ink">
                        {p.title}
                      </h4>
                      <p className="mt-2 max-w-prose text-sm leading-relaxed text-rebar-ink-soft">
                        {p.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
