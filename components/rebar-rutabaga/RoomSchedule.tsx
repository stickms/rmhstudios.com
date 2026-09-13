'use client';

/**
 * The room, as a materials schedule.
 *
 * An architectural drawing lists what a building is made of in a numbered
 * schedule — ref, element, specification — and that is what this is, because the
 * room is a 1963 foundry hall that was kept rather than covered up. It is a
 * table because it is tabular: the reference numbers are real cross-references,
 * not decoration, and a reader scanning for "what are the chairs" should be able
 * to find the row.
 */

import { useTranslation } from 'react-i18next';
import { materialText } from './copy';

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
    <div className="glass-pane overflow-x-auto rounded-site p-4 sm:p-6">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <caption className="pb-4 text-left font-mono text-xs uppercase tracking-[0.09em] text-site-text-muted">
          {t('room.caption', {
            defaultValue: 'Materials schedule — foundry hall, rev. C',
          })}
        </caption>
        <thead>
          <tr className="border-b border-site-text">
            <th
              scope="col"
              className="py-3 pr-4 font-mono text-xs font-medium uppercase tracking-[0.09em] text-site-text-muted"
            >
              {t('room.ref', { defaultValue: 'Ref' })}
            </th>
            <th
              scope="col"
              className="py-3 pr-4 font-mono text-xs font-medium uppercase tracking-[0.09em] text-site-text-muted"
            >
              {t('room.element', { defaultValue: 'Element' })}
            </th>
            <th
              scope="col"
              className="py-3 font-mono text-xs font-medium uppercase tracking-[0.09em] text-site-text-muted"
            >
              {t('room.spec', { defaultValue: 'Specification' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {MATERIAL_REFS.map((ref) => {
            const m = materialText(ref, t);
            return (
              <tr key={ref} className="border-b border-site-border last:border-b-0">
                <td className="whitespace-nowrap py-3 pr-4 align-top font-mono text-xs tabular-nums text-site-accent">
                  {ref}
                </td>
                <td className="whitespace-nowrap py-3 pr-4 align-top font-display font-medium text-site-text">
                  {m.element}
                </td>
                <td className="py-3 align-top text-sm text-site-text-muted">{m.spec}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
