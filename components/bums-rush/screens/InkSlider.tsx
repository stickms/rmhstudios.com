'use client';

/**
 * A slider, drawn in biro.
 *
 * A native `<input type="range">` rather than the site's `<Slider>`: that one
 * paints from `--site-*` tokens, and the game route suppresses the site theme,
 * so it would render as a grey tube on cream paper. The native control also
 * arrives with keyboard support, a real value announcement, and a touch target
 * the platform already sized for a thumb — three things a div would have to
 * reimplement badly.
 *
 * `accent-color` is the whole restyle. It is one property, it is supported
 * everywhere this site runs, and it leaves the platform's own behaviour intact.
 */

import { useId } from 'react';

interface InkSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Shown to the right of the label — already formatted and localised. */
  display?: string;
  hint?: string;
}

export function InkSlider({ label, value, min, max, step, onChange, display, hint }: InkSliderProps) {
  const id = useId();
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-bum-ink">
          {label}
        </label>
        {display ? <span className="text-sm tabular-nums text-bum-graphite">{display}</span> : null}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="mt-1.5 h-6 w-full cursor-pointer"
        style={{ accentColor: 'var(--bum-ink)' }}
      />
      {hint ? <p className="text-xs text-bum-graphite">{hint}</p> : null}
    </div>
  );
}
