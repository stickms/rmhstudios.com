/**
 * Massive March — the gesture wheel.
 *
 * Eight signals with no assigned meanings (§8.3). The game never tells you that
 * two waves means stop; a group decides that for itself in about ten seconds and
 * then uses it for eleven hours, and the fact that it was theirs is most of why
 * it sticks.
 *
 * Number keys fire the same gestures directly. The wheel is for people who would
 * rather point at a picture than remember which digit is "no", and for touch,
 * where there are no number keys at all.
 */

'use client';

import { useTranslation } from 'react-i18next';
import { GESTURE_WHEEL, type Gesture } from '@/lib/massive-march/gestures';
import { mm } from '@/lib/massive-march/net/client';
import { BOARD, INK, Panel } from '../ui';

const LABELS: Record<Gesture, string> = {
  none: '',
  point: 'Point',
  wave: 'Wave',
  nod: 'Nod',
  shake: 'Shake',
  cheer: 'Cheer',
  shrug: 'Shrug',
  beckon: 'Beckon',
};

const MARKS: Record<Gesture, string> = {
  none: '',
  point: '→',
  wave: '👋',
  nod: '↕',
  shake: '↔',
  cheer: '↑↑',
  shrug: '¯\\_',
  beckon: '↰',
};

export function GestureWheel({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation('c-massive-march');

  return (
    <Panel className="space-y-3">
      <h2 className="text-sm font-black tracking-[0.14em] uppercase">
        {t('gestures', { defaultValue: 'Signals' })}
      </h2>
      <ul className="grid grid-cols-4 gap-2">
        {GESTURE_WHEEL.map((gesture, index) => (
          <li key={gesture}>
            <button
              type="button"
              onClick={() => {
                mm.gesture(gesture);
                onPick();
              }}
              className="grid w-full cursor-pointer place-items-center gap-1 border-[3px] px-2 py-3 transition-colors duration-150 hover:brightness-95"
              style={{ borderColor: INK, background: BOARD, borderRadius: 3 }}
            >
              <span aria-hidden className="text-xl leading-none">
                {MARKS[gesture]}
              </span>
              <span className="text-[11px] font-bold">{LABELS[gesture]}</span>
              <span className="text-[10px] opacity-50">{index + 1}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-snug opacity-70">
        {t('gestures-note', {
          defaultValue:
            'None of these mean anything yet. Decide what they mean and then be consistent about it.',
        })}
      </p>
    </Panel>
  );
}
