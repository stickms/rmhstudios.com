/**
 * Z1 seasonal accents + Z8 April Fools class — client-safe, no imports.
 *
 * Both are a class on <html> set before first paint (`delightStep`, lib/prepaint/delight.ts,
 * the pre-paint twin of `seasonForDate`); the look lives in app/globals.css. No season →
 * no class → nothing else runs. Windows are month*100+day, inclusive, local time.
 */

export interface SeasonWindow {
  name: string;
  from: number;
  to: number;
  label: string;
}

export const SEASONS: readonly SeasonWindow[] =
  [
    {
      name: 'valentines',
      from: 210,
      to: 214,
      label:
        "Valentine's Day",
    },
    {
      name: 'earthday',
      from: 420,
      to: 422,
      label:
        'Earth Day',
    },
    {
      name: 'halloween',
      from: 1024,
      to: 1031,
      label:
        'Halloween',
    },
    {
      name: 'winter',
      from: 1218,
      to: 102,
      label:
        'the winter holidays',
    },
  ];

export function seasonForDate(
  d: Date = new Date(),
): SeasonWindow | null {
  const k =
    (d.getMonth() +
      1) *
      100 +
    d.getDate();
  for (const s of SEASONS) {
    const hit =
      s.from <=
      s.to
        ? k >=
            s.from &&
          k <=
            s.to
        : k >=
            s.from ||
          k <=
            s.to;
    if (
      hit
    )
      return s;
  }
  return null;
}

/** `rmh-fools` caches the admin flag ("1"); `rmh-fools-off` is the member's own off switch. */
export const FOOLS_FLAG_KEY =
  'rmh-fools';
export const FOOLS_OFF_KEY =
  'rmh-fools-off';
