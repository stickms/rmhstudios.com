'use client';

/**
 * Personalization — the Control Panel page for how Dunesday 7 looks and
 * behaves: desktop background, window colour and transparency, day / night,
 * screen saver, desktop icons, and Ease of Access (text size, high contrast,
 * reduced motion, sounds). Every change applies at once and is saved in this
 * browser.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDunesday } from '../../DunesdayProvider';
import { sfx } from '../../sound';
import type { AppProps } from '../apps';
import { useOs, type GlassColor, type Prefs, type Wallpaper } from '../store';

const WALLPAPERS: Wallpaper[] = ['meadow', 'arrakis', 'aurora', 'harmony'];
const GLASS: GlassColor[] = [
  'sky',
  'twilight',
  'seafoam',
  'leaf',
  'ruby',
  'gold',
  'slate',
  'violet',
];

/** A row of radio buttons — Windows 7 put these in a list, not a tab strip. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="ds-pz-choice">
      <legend>{label}</legend>
      {options.map((o) => (
        <label key={String(o.value)} className="ds-check">
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export default function PersonalizeApp(_: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const { state, actions, muted, toggleMuted } = useDunesday();
  const prefs = useOs((s) => s.prefs);
  const setPrefs = useOs((s) => s.setPrefs);
  const set = (p: Partial<Prefs>) => {
    sfx.tick();
    setPrefs(p);
  };

  const wallName = (w: Wallpaper) =>
    w === 'meadow'
      ? t('pz-wall-meadow', { defaultValue: 'Bliss Meadow' })
      : w === 'arrakis'
        ? t('pz-wall-arrakis', { defaultValue: 'Arrakis Dunes' })
        : w === 'aurora'
          ? t('pz-wall-aurora', { defaultValue: 'Aurora' })
          : t('pz-wall-harmony', { defaultValue: 'Harmony' });
  const glassName = (g: GlassColor) =>
    ({
      sky: t('pz-glass-sky', { defaultValue: 'Sky' }),
      twilight: t('pz-glass-twilight', { defaultValue: 'Twilight' }),
      seafoam: t('pz-glass-seafoam', { defaultValue: 'Sea foam' }),
      leaf: t('pz-glass-leaf', { defaultValue: 'Leaf' }),
      ruby: t('pz-glass-ruby', { defaultValue: 'Ruby' }),
      gold: t('pz-glass-gold', { defaultValue: 'Gold' }),
      slate: t('pz-glass-slate', { defaultValue: 'Slate' }),
      violet: t('pz-glass-violet', { defaultValue: 'Violet' }),
    })[g];

  return (
    <div className="ds-pz">
      <h1>{t('pz-heading', { defaultValue: 'Change the visuals and sounds on your computer' })}</h1>

      <section aria-labelledby="pz-bg">
        <h2 id="pz-bg">{t('pz-background', { defaultValue: 'Desktop Background' })}</h2>
        <div className="ds-pz-walls" role="radiogroup" aria-labelledby="pz-bg">
          {WALLPAPERS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={prefs.wallpaper === w}
              className={cn('ds-pz-wall', prefs.wallpaper === w && 'ds-pz-wall--on')}
              onClick={() => set({ wallpaper: w })}
            >
              <span className={cn('ds-pz-thumb', `ds-pz-thumb--${w}`)} aria-hidden="true" />
              <span>{wallName(w)}</span>
            </button>
          ))}
        </div>
        <label className="ds-check">
          <input
            type="checkbox"
            checked={state.night}
            onChange={(e) => actions.set('night', e.target.checked)}
          />
          {t('pz-night', { defaultValue: 'Night sky (dark mode)' })}
        </label>
      </section>

      <section aria-labelledby="pz-color">
        <h2 id="pz-color">{t('pz-window-color', { defaultValue: 'Window Color' })}</h2>
        <div className="ds-pz-swatches" role="radiogroup" aria-labelledby="pz-color">
          {GLASS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={prefs.glass === g}
              aria-label={glassName(g)}
              title={glassName(g)}
              className={cn(
                'ds-pz-swatch',
                `ds-pz-swatch--${g}`,
                prefs.glass === g && 'ds-pz-swatch--on',
              )}
              onClick={() => set({ glass: g })}
            />
          ))}
        </div>
        <label className="ds-check">
          <input
            type="checkbox"
            checked={prefs.transparency}
            onChange={(e) => set({ transparency: e.target.checked })}
          />
          {t('pz-transparency', { defaultValue: 'Enable transparency' })}
        </label>
      </section>

      <div className="ds-pz-cols">
        <section>
          <h2>{t('pz-desktop', { defaultValue: 'Desktop' })}</h2>
          <Choice
            label={t('pz-icon-size', { defaultValue: 'Icon size' })}
            value={prefs.iconSize}
            onChange={(iconSize) => set({ iconSize })}
            options={[
              { value: 'small', label: t('pz-small', { defaultValue: 'Small' }) },
              { value: 'medium', label: t('pz-medium', { defaultValue: 'Medium' }) },
              { value: 'large', label: t('pz-large', { defaultValue: 'Large' }) },
            ]}
          />
          <label className="ds-check">
            <input
              type="checkbox"
              checked={prefs.showGadgets}
              onChange={(e) => set({ showGadgets: e.target.checked })}
            />
            {t('pz-gadgets', { defaultValue: 'Show desktop gadgets' })}
          </label>
          <label className="ds-check">
            <input
              type="checkbox"
              checked={prefs.autoArrange}
              onChange={(e) => set({ autoArrange: e.target.checked })}
            />
            {t('pz-arrange', { defaultValue: 'Auto arrange icons' })}
          </label>
          <Choice
            label={t('pz-saver', { defaultValue: 'Screen saver (Bubbles)' })}
            value={prefs.screensaverMin}
            onChange={(screensaverMin) => set({ screensaverMin })}
            options={[
              { value: 0, label: t('pz-none', { defaultValue: 'None' }) },
              { value: 1, label: t('pz-1min', { defaultValue: 'After 1 minute' }) },
              { value: 5, label: t('pz-5min', { defaultValue: 'After 5 minutes' }) },
              { value: 15, label: t('pz-15min', { defaultValue: 'After 15 minutes' }) },
            ]}
          />
        </section>

        <section>
          <h2>{t('pz-ease', { defaultValue: 'Ease of Access' })}</h2>
          <Choice
            label={t('pz-text-size', { defaultValue: 'Text size' })}
            value={prefs.textScale}
            onChange={(textScale) => set({ textScale })}
            options={[
              { value: 1, label: t('pz-text-100', { defaultValue: 'Smaller – 100%' }) },
              { value: 1.25, label: t('pz-text-125', { defaultValue: 'Medium – 125%' }) },
              { value: 1.5, label: t('pz-text-150', { defaultValue: 'Larger – 150%' }) },
            ]}
          />
          <label className="ds-check">
            <input
              type="checkbox"
              checked={prefs.highContrast}
              onChange={(e) => set({ highContrast: e.target.checked })}
            />
            {t('pz-contrast', { defaultValue: 'High contrast' })}
          </label>
          <label className="ds-check">
            <input
              type="checkbox"
              checked={prefs.reduceMotion}
              onChange={(e) => set({ reduceMotion: e.target.checked })}
            />
            {t('pz-motion', { defaultValue: 'Turn off all unnecessary animations' })}
          </label>
          <label className="ds-check">
            <input type="checkbox" checked={!muted} onChange={toggleMuted} />
            {t('pz-sounds', { defaultValue: 'Play Dunesday 7 sounds' })}
          </label>
        </section>
      </div>
    </div>
  );
}
