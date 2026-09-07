'use client';

/**
 * A capacity meter, drawn as rack units.
 *
 * A rack is a column of U, so "20 of 24 lit" and "84% committed" are one
 * picture rather than a percentage beside a bar.
 *
 * Two different things can be worth a warning, and they are NOT the same
 * control:
 *
 *  - **`pressure`** — the last units of a *filling* bar. Committed capacity
 *    past 80% is a hall scheduled for expansion rather than sold, and the
 *    warning belongs on the units that took it there.
 *  - **`tone`** — the whole reading is the concerning one. An efficiency bar
 *    runs the other way (fuller is better), so a `pressure` mark there would
 *    put the warning on the BEST campuses, which is the opposite of the truth.
 *    A campus over its PUE target lights its whole run in warning instead.
 *
 * Colour is `--site-accent` / `--site-warning`, so it means the same thing here
 * as on every other surface of the site and re-themes with them. The figure is
 * always rendered as text beside the bar, because a meter is a picture and a
 * picture is not a number.
 */

import { meterUnits, METER_UNITS } from '@/lib/datacenter/campuses';

interface CapacityMeterProps {
  label: string;
  /** The figure, already formatted for display. */
  value: string;
  /** 0…1. */
  ratio: number;
  /** Fraction past which a lit unit is drawn in the warning token. */
  pressure?: number;
  /** Paint the whole lit run: the reading itself is the warning. */
  tone?: 'accent' | 'warning';
  units?: number;
}

export function CapacityMeter({
  label,
  value,
  ratio,
  pressure,
  tone = 'accent',
  units = METER_UNITS,
}: CapacityMeterProps) {
  const lit = meterUnits(ratio, units);
  const hotFrom =
    tone === 'warning' ? 0 : pressure === undefined ? units : meterUnits(pressure, units);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium tracking-wide text-site-text-dim uppercase">
          {label}
        </span>
        <span className="font-display text-sm font-semibold text-site-text">{value}</span>
      </div>
      <div className="flex h-3 gap-[3px] overflow-hidden rounded-site-sm" aria-hidden>
        {Array.from({ length: units }, (_, i) => (
          <span
            key={i}
            className={
              i >= lit
                ? 'flex-1 rounded-none bg-site-border'
                : i >= hotFrom
                  ? 'flex-1 rounded-none bg-site-warning'
                  : 'flex-1 rounded-none bg-site-accent'
            }
          />
        ))}
      </div>
    </div>
  );
}
