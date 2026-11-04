import { useTranslation } from 'react-i18next';

/**
 * Versecraft's dusk, shared by the main menu and the save/load screen: a gradient
 * from deep violet down to amber, a pale moon, a few cherry petals drifting down,
 * two silhouettes on a hill, a paper grain, and lines of verse that fade in and
 * out (one full fade per 18 s, well under 0.5 Hz).
 *
 * Everything is decoration (`aria-hidden`, pointer-events off) and animated with
 * CSS `transform` / `opacity` only. VersecraftMenu.css stops it all when the
 * game's own reduced-motion setting is on (`data-reduced-motion`) or the OS asks
 * for reduced motion.
 */

type Petal = { x: number; size: number; dur: number; delay: number; drift: number; rest: number; hue: number };

// Fixed, hand-placed values: SSR and client render the same markup.
const PETALS: Petal[] = [
  { x: 6, size: 14, dur: 26, delay: -4, drift: 60, rest: 18, hue: 0 },
  { x: 17, size: 10, dur: 31, delay: -19, drift: -40, rest: 62, hue: 1 },
  { x: 29, size: 16, dur: 28, delay: -11, drift: 80, rest: 36, hue: 0 },
  { x: 41, size: 9, dur: 34, delay: -26, drift: -55, rest: 78, hue: 2 },
  { x: 53, size: 13, dur: 27, delay: -8, drift: 50, rest: 24, hue: 1 },
  { x: 64, size: 11, dur: 33, delay: -22, drift: -70, rest: 55, hue: 0 },
  { x: 74, size: 15, dur: 29, delay: -15, drift: 45, rest: 70, hue: 2 },
  { x: 83, size: 10, dur: 35, delay: -30, drift: -35, rest: 12, hue: 1 },
  { x: 92, size: 13, dur: 30, delay: -2, drift: -60, rest: 44, hue: 0 },
  { x: 47, size: 12, dur: 32, delay: -17, drift: 70, rest: 88, hue: 2 },
];

export function DuskBackdrop({ verses = true }: { verses?: boolean }) {
  const { t } = useTranslation('c-versecraft');
  return (
    <div className="vc-backdrop" aria-hidden="true">
      <div className="vc-backdrop__stars" />
      <div className="vc-moon" />

      <div className="vc-petals">
        {PETALS.map((p, i) => (
          <span
            key={i}
            className={`vc-petal vc-petal--${p.hue}`}
            style={
              {
                left: `${p.x}%`,
                width: p.size,
                height: p.size * 1.25,
                '--dur': `${p.dur}s`,
                '--delay': `${p.delay}s`,
                '--drift': `${p.drift}px`,
                '--rest': `${p.rest}vh`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {verses && (
        <>
          <p className="vc-verse vc-verse--a">{t('verse-poem-for-you', { defaultValue: 'a poem for you' })}</p>
          <p className="vc-verse vc-verse--b">{t('verse-once-upon-a-spring', { defaultValue: 'once upon a spring' })}</p>
          <p className="vc-verse vc-verse--c">{t('verse-the-page-remembers', { defaultValue: 'the page remembers' })}</p>
        </>
      )}

      <svg className="vc-hill" viewBox="0 0 400 120" preserveAspectRatio="xMaxYMax slice" focusable="false">
        <path d="M0 120V84C40 74 78 70 118 76C150 81 168 72 200 66C236 60 268 70 306 78C342 86 372 78 400 70V120Z" />
        <g className="vc-figures">
          {/* taller figure: a coat, standing close */}
          <g transform="translate(290 17)">
            <circle cx="0" cy="0" r="5.4" />
            <path d="M-9 9.5Q0 5.500 9 9.500L10.500 38H-10.500Z" />
            <path d="M-8.500 38H-0.800V62H-7ZM0.800 38H8.500L7 62H0.800Z" />
            <path d="M9 12L17 29" className="vc-arm" />
          </g>
          {/* shorter figure: long hair and a dress, leaning toward the first */}
          <g transform="translate(309 24)">
            <circle cx="0" cy="0" r="4.900" />
            <path d="M-5.500 -1Q-8.500 12 -5.500 21H5.500Q8.500 12 5.500 -1Z" />
            <path d="M-6 8.500Q0 5 6 8.500L13 46H-13Z" />
            <path d="M-4 46H-1.500V56H-4ZM1.500 46H4V56H1.500Z" />
            <path d="M-6 12L-14 28" className="vc-arm" />
          </g>
        </g>
      </svg>

      <div className="vc-grain" />
      <div className="vc-backdrop__vignette" />
    </div>
  );
}
