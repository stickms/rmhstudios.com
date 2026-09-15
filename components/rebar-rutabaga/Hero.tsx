'use client';

/**
 * The frontispiece.
 *
 * The brief for this page was Scandinavian minimalism, and the temptation with
 * that brief is to make a sparse version of a normal hero — same furniture,
 * more padding. This is the other reading, the one the actual tradition takes:
 * the subject of the composition is the LIGHT, and the type is what the light
 * falls on. So there is no image, no card, no button, and no colour. There is a
 * wall, a window, a name, and one line.
 *
 * Three decisions worth keeping:
 *
 * 1. **The light is a real gradient, not a texture.** One wide, very soft
 *    radial from the upper left — a north-facing window at midday — over a
 *    barely-there vertical fall. Both are mixed from the page's own plaster
 *    tokens, so in evening service the window dims with the room instead of
 *    staying a bright patch on a dark wall.
 * 2. **The name breaks across two lines with the ampersand leading the second.**
 *    That is a typographic convention from printed menus, and it buys the thing
 *    the layout needs most: a ragged left edge on line two that stops the block
 *    reading as a logo.
 * 3. **The meta row is data, not decoration.** Stars, nights, price. A reader
 *    deciding whether to keep scrolling wants exactly those three, and putting
 *    them in mono at annotation size says "facts" without a heading.
 *
 * Motion here is on mount rather than on scroll — it is above the fold, so
 * there is no scroll to trigger on — and it is the same rise-and-settle as
 * every reveal further down, just sequenced.
 */

import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MENU_PRICE_SEK } from '@/lib/rebar-rutabaga/menu';

/** The page's curve, matching `--rebar-ease`. See `Reveal.tsx`. */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Rise-and-settle, sequenced by `delay`. */
function rise(delay: number) {
  return {
    initial: { opacity: 0, y: 26 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.78, ease: EASE, delay },
  };
}

export function Hero() {
  const { t, i18n } = useTranslation('c-rebar-rutabaga');

  const price = new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(MENU_PRICE_SEK);

  const meta = [
    t('hero.stars', { defaultValue: 'Two stars' }),
    t('hero.nights', { defaultValue: 'Wed – Sat' }),
    price,
  ];

  return (
    <section className="relative overflow-hidden">
      {/* The window. Two stacked gradients, both mixed from the room's own
          plaster so the light tracks the hour rather than sitting on top of it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 86% at 16% -8%, color-mix(in oklab, var(--rebar-paper-raised) 92%, transparent) 0%, transparent 58%),' +
            'linear-gradient(to bottom, transparent 55%, color-mix(in oklab, var(--rebar-paper-sunk) 70%, transparent) 100%)',
        }}
      />

      <div className="relative mx-auto flex min-h-[86svh] max-w-[86rem] flex-col justify-center px-6 py-24 sm:px-10 sm:py-32">
        <motion.p
          {...rise(0.05)}
          className="font-mono text-[0.7rem] uppercase tracking-[0.26em] text-rebar-ink-faint"
        >
          {t('hero.eyebrow', {
            defaultValue: 'Molecular gastronomy · Verkstadsgatan 4',
          })}
        </motion.p>

        <h1 className="mt-8 font-display font-light leading-[0.86] tracking-[-0.045em] text-rebar-ink">
          <motion.span
            {...rise(0.14)}
            className="block text-[clamp(3.2rem,12vw,9.5rem)]"
          >
            {t('hero.name1', { defaultValue: 'Rebar' })}
          </motion.span>
          <motion.span
            {...rise(0.22)}
            className="mt-1 block text-[clamp(3.2rem,12vw,9.5rem)]"
          >
            <span className="text-rebar-ink-faint">&amp;</span>{' '}
            {t('hero.name2', { defaultValue: 'Rutabaga' })}
          </motion.span>
        </h1>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.42 }}
          aria-hidden
          className="mt-12 h-px w-full max-w-[40rem] origin-left bg-rebar-line-strong"
        />

        <motion.p
          {...rise(0.5)}
          className="mt-8 max-w-[34rem] text-lg leading-relaxed text-rebar-ink-soft sm:text-xl"
        >
          {t('hero.lede', {
            defaultValue:
              'Nine courses, every one of them a sphere, in a foundry hall that bent reinforcing steel for thirty-five years.',
          })}
        </motion.p>

        <motion.ul
          {...rise(0.6)}
          className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-3 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-rebar-ink-soft"
        >
          {meta.map((item, i) => (
            <li key={item} className="flex items-center gap-8">
              {/* Hidden at phone width: the row wraps there, and a separator
                  that starts a wrapped line reads as a stray tally mark. The
                  gap alone is enough to keep three short facts apart. */}
              {i > 0 ? (
                <span aria-hidden className="hidden h-3 w-px bg-rebar-line sm:block" />
              ) : null}
              {item}
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
