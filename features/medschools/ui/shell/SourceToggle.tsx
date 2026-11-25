import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuItem, MenuLabel } from '@/components/ui/menu';
import { SOURCE_PREFS, type SourcePref } from '../../engine/source-pref';
import { SourceGlyph } from '../sources/SourceGlyph';
import { useSourcePref } from '../useSourcePref';

/** The sources' names: proper nouns, the same in every language (`SOURCE_NAMES`). */
export const SOURCE_PREF_NAMES: Record<SourcePref, string> = { cycletrack: 'CycleTrack', admit: 'Admit.org' };

/**
 * The option a key moves the radio group to (and checks), as a native radio group: Down and Up step, Right and Left
 * step in the reading direction (reversed in RTL), both wrap; Home and End jump to the ends. `null`: not ours.
 */
export function sourceOnKey(from: SourcePref, key: string, rtl = false): SourcePref | null {
  const n = SOURCE_PREFS.length;
  const i = SOURCE_PREFS.indexOf(from);
  const steps: Record<string, number> = {
    ArrowDown: 1,
    ArrowUp: -1,
    ArrowRight: rtl ? -1 : 1,
    ArrowLeft: rtl ? 1 : -1,
  };
  if (key === 'Home') return SOURCE_PREFS[0]!;
  if (key === 'End') return SOURCE_PREFS[n - 1]!;
  const step = steps[key];
  return step === undefined ? null : SOURCE_PREFS[(i + step + n) % n]!;
}

/**
 * The header's source choice (owner 2026-11-24): a segmented radio group of the two sources' favicons. One tab stop
 * (roving tabindex on the checked option); the arrow keys move and choose, Home and End jump to the ends, as a native
 * radio group does (left and right follow the reading direction). Each option is named and titled by its source; the
 * checked one takes the segmented control's pressed style (the paper fill and a border), never colour alone.
 *
 * Shown from 600px (CSS): a phone's top bar has no room beside its four round buttons, so there the same choice is in
 * the member's menu (`SourceMenuRows`).
 */
export function SourceToggle() {
  const { t } = useTranslation('medschools');
  const { value, choose } = useSourcePref();
  const refs = useRef<Record<SourcePref, HTMLButtonElement | null>>({ cycletrack: null, admit: null });
  const label = t('source-toggle-label', { defaultValue: 'Figures from' });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, option: SourcePref) => {
    const next = sourceOnKey(option, e.key, getComputedStyle(e.currentTarget).direction === 'rtl');
    if (!next) return;
    e.preventDefault();
    choose(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="medapp-chips medapp-srctoggle">
      {SOURCE_PREFS.map((option) => {
        const checked = option === value;
        const name = SOURCE_PREF_NAMES[option];
        return (
          <button
            key={option}
            ref={(el) => {
              refs.current[option] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={name}
            title={t('source-toggle-option', { defaultValue: 'Figures from {{source}}', source: name })}
            tabIndex={checked ? 0 : -1}
            className="medapp-chip medapp-srctoggle__opt"
            onClick={() => choose(option)}
            onKeyDown={(e) => onKeyDown(e, option)}
          >
            <SourceGlyph source={option} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The same choice as menu rows, for a phone's member menu (under 600px, where the toggle does not fit): a heading and
 * two `menuitemradio` rows with the favicons, the checked one marked. Choosing closes the menu.
 */
export function SourceMenuRows({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('medschools');
  const { value, choose } = useSourcePref();
  return (
    <div role="group" aria-label={t('source-toggle-label', { defaultValue: 'Figures from' })}>
      <MenuLabel>{t('source-toggle-label', { defaultValue: 'Figures from' })}</MenuLabel>
      {SOURCE_PREFS.map((option) => (
        <MenuItem
          key={option}
          checked={option === value}
          onSelect={() => {
            choose(option);
            onDone();
          }}
        >
          <span className="medapp-srcmenu">
            <SourceGlyph source={option} size={16} />
            {SOURCE_PREF_NAMES[option]}
          </span>
        </MenuItem>
      ))}
    </div>
  );
}
