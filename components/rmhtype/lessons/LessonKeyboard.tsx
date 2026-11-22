/**
 * The on-screen keyboard: decoration that shows where the next key is.
 *
 * `aria-hidden` on purpose. What it shows is said in words by the runner (the key's
 * finger, and Shift when needed), so a screen reader loses nothing. The highlight is
 * one attribute (`data-next`) moved from key to key in an effect; no layout is read
 * and nothing animates. Colour is not the only cue: the lit key inverts to ink on the
 * accent and the runner prints the finger.
 */
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { baseKeyOf, fingerFor, KEYBOARD_LAYOUT, needsShift } from '@/lib/rmhtype/lessons';

const KEY_CLASS =
  'flex h-9 min-w-0 flex-1 items-center justify-center rounded-app-sm border border-app-border bg-app-bg font-mono text-sm text-app-text-muted data-[next]:border-app-accent data-[next]:bg-app-accent data-[next]:text-app-accent-fg';

/** Row indents, in key widths, so the rows stagger like a real board. */
const ROW_INDENT = ['', 'pl-[2%]', 'pl-[4%]', 'pl-[6%]'];

function LessonKeyboardView({ nextChar }: { nextChar: string | null }) {
  const { t } = useTranslation('rmhtype-lessons');
  const root = useRef<HTMLDivElement>(null);
  const shiftLabel = t('key-shift', {
    defaultValue: 'Shift',
  });

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    host.querySelectorAll('[data-next]').forEach((el) => el.removeAttribute('data-next'));
    if (!nextChar) return;
    const lit: string[] = [nextChar === ' ' ? 'space' : baseKeyOf(nextChar)];
    if (needsShift(nextChar)) {
      // Shift is held by the hand opposite the key being struck.
      lit.push(fingerFor(nextChar)?.startsWith('left') ? 'shift-right' : 'shift-left');
    }
    for (const key of lit) host.querySelector(`[data-key="${CSS.escape(key)}"]`)?.setAttribute('data-next', '');
  }, [nextChar]);

  return (
    <div ref={root} aria-hidden="true" className="mx-auto flex w-full max-w-xl select-none flex-col gap-1">
      {KEYBOARD_LAYOUT.map((row, i) => (
        <div key={row} className={`flex gap-1 ${ROW_INDENT[i] ?? ''}`}>
          {[...row].map((key) => (
            <span key={key} data-key={key} className={KEY_CLASS}>
              {key}
            </span>
          ))}
        </div>
      ))}
      <div className="flex gap-1">
        <span data-key="shift-left" className={`${KEY_CLASS} flex-[2]`}>
          {shiftLabel}
        </span>
        <span data-key="space" className={`${KEY_CLASS} flex-[6]`} />
        <span data-key="shift-right" className={`${KEY_CLASS} flex-[2]`}>
          {shiftLabel}
        </span>
      </div>
    </div>
  );
}

export const LessonKeyboard = memo(LessonKeyboardView);
