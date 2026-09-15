'use client';

/**
 * The room, as a materials schedule.
 *
 * An architectural drawing lists what a building is made of in a numbered
 * schedule — ref, element, specification — and that is still what this is,
 * because the room is a 1963 foundry hall that was kept rather than covered up.
 * The reference numbers are real cross-references, not decoration.
 *
 * The redesign moved it off a glass panel and out of a `<table>` border box,
 * but it is still tabular data and still a `<table>`: nine rows that a reader
 * scans down one column looking for "what are the chairs" is the exact case
 * `<table>` exists for, and no amount of Scandinavian restraint makes a
 * definition list better at it. What changed is that the structure is now drawn
 * with hairlines and margin-set labels, the way a real schedule is printed —
 * and the reference column is set in the ink rather than an accent, because on
 * this page the accent means "signature dish", not "here is a number".
 *
 * Rows reveal in sequence as the schedule scrolls in, capped by `stagger()` so
 * a fast scroll does not leave the reader waiting on row nine.
 */

import { useTranslation } from 'react-i18next';
import { materialText } from './copy';
import { Reveal, DrawnRule, stagger } from './Reveal';

/** The drawing references, in schedule order. The words are in `copy.ts`. */
const MATERIAL_REFS = [
  'M-01',
  'M-02',
  'M-03',
  'M-04',
  'M-05',
  'M-06',
  'M-07',
  'M-08',
  'M-09',
] as const;

export function RoomSchedule() {
  const { t } = useTranslation('c-rebar-rutabaga');

  return (
    <section aria-labelledby="rr-room" className="border-t border-rebar-line bg-rebar-paper">
      <div className="mx-auto max-w-[86rem] px-6 py-24 sm:px-10 sm:py-32">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.26em] text-rebar-ink-faint">
                {t('room.caption', {
                  defaultValue: 'Materials schedule — foundry hall, rev. C',
                })}
              </p>
            </Reveal>
            <Reveal delay={0.06}>
              <h2
                id="rr-room"
                className="mt-6 font-display text-[clamp(2.2rem,5vw,3.5rem)] font-light leading-[0.98] tracking-[-0.035em] text-rebar-ink"
              >
                {t('room.title', { defaultValue: 'The room, scheduled.' })}
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 max-w-prose leading-relaxed text-rebar-ink-soft">
                {t('room.lede', {
                  defaultValue:
                    'Everything in the hall was either here in 1963 or chosen to admit that it was not. Nothing is distressed and nothing pretends.',
                })}
              </p>
            </Reveal>
          </div>

          <div className="min-w-0 overflow-x-auto">
            <DrawnRule />
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <caption className="sr-only">
                {t('room.caption', {
                  defaultValue: 'Materials schedule — foundry hall, rev. C',
                })}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-20 py-4 pr-5 font-mono text-[0.64rem] font-normal uppercase tracking-[0.16em] text-rebar-ink-faint"
                  >
                    {t('room.ref', { defaultValue: 'Ref' })}
                  </th>
                  <th
                    scope="col"
                    className="w-[13rem] py-4 pr-5 font-mono text-[0.64rem] font-normal uppercase tracking-[0.16em] text-rebar-ink-faint"
                  >
                    {t('room.element', { defaultValue: 'Element' })}
                  </th>
                  <th
                    scope="col"
                    className="py-4 font-mono text-[0.64rem] font-normal uppercase tracking-[0.16em] text-rebar-ink-faint"
                  >
                    {t('room.spec', { defaultValue: 'Specification' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {MATERIAL_REFS.map((ref, i) => {
                  const m = materialText(ref, t);
                  return (
                    <Reveal as="tr" key={ref} delay={stagger(i)} className="border-t border-rebar-line">
                      <td className="whitespace-nowrap py-5 pr-5 align-top font-mono text-xs tabular-nums text-rebar-ink-faint">
                        {ref}
                      </td>
                      <td className="py-5 pr-5 align-top font-display text-base font-normal text-rebar-ink">
                        {m.element}
                      </td>
                      <td className="py-5 align-top text-sm leading-relaxed text-rebar-ink-soft">
                        {m.spec}
                      </td>
                    </Reveal>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
