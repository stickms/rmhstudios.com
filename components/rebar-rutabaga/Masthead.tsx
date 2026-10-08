'use client';

/**
 * The restaurant's own chrome.
 *
 * A fine-dining room does not put a navigation bar above the door, so this is a
 * lintel rather than a nav: the name, where it is, and the one way back out.
 * It stays with the reader because the page is long and the only two things
 * they might want at any point are the telephone number and the exit.
 *
 * The material is the page's own plaster at 78% with a blur behind it — the
 * liquid-glass idiom the site uses for sticky chrome, but tinted from
 * `--rebar-paper` rather than `--site-surface`, so it stays part of this room.
 * `supports-[backdrop-filter]` keeps it honest where the blur is unavailable or
 * the reduce-transparency setting has switched it off: the fallback is the
 * opaque plaster, never a translucent sheet with nothing behind it.
 */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

export function Masthead() {
  const { t } = useTranslation('c-rebar-rutabaga');

  return (
    <header className="sticky top-0 z-30 border-b border-rebar-line bg-rebar-paper supports-[backdrop-filter]:bg-rebar-paper/78 supports-[backdrop-filter]:backdrop-blur-xl">
      <div className="mx-auto flex max-w-[86rem] items-center justify-between gap-6 px-6 py-4 sm:px-10">
        <Link
          to="/services"
          className="group inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-rebar-ink-faint transition-colors duration-[var(--rebar-dur-quick)] hover:text-rebar-ink focus-visible:text-rebar-ink"
        >
          <ArrowLeft
            className="size-3.5 transition-transform duration-[var(--rebar-dur-quick)] group-hover:-translate-x-0.5"
            aria-hidden
          />
          {t('page.back', { defaultValue: 'Services' })}
        </Link>

        {/* The name is the only thing set in the display face up here; everything
            else on this bar is annotation, and annotation is mono.
            `whitespace-nowrap` is load-bearing: at 390px the name wrapped to two
            lines and pushed the bar to double height, which on a sticky element
            means it eats the top of every section you scroll to. The tracking
            comes down with the size so it stays a lintel, not a logo. */}
        <p className="whitespace-nowrap font-display text-[0.72rem] font-medium uppercase tracking-[0.14em] text-rebar-ink sm:text-sm sm:tracking-[0.2em]">
          {t('mast.short', { defaultValue: 'Rebar & Rutabaga' })}
        </p>

        <p className="hidden font-mono text-[0.68rem] uppercase tracking-[0.18em] text-rebar-ink-faint sm:block">
          {t('mast.place', { defaultValue: 'Göteborg' })}
        </p>
        {/* Keeps the name optically centred on phones, where the place is hidden. */}
        <span aria-hidden className="w-[4.5rem] sm:hidden" />
      </div>
    </header>
  );
}
