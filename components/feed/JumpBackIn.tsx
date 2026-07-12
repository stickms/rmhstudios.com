'use client';

/**
 * "Jump back in" — a horizontal rail of the games/apps this device recently
 * opened, shown at the top of the home feed so returning users have a resume
 * path instead of re-hunting through ~20 games and the app catalog.
 */

import { Link } from '@tanstack/react-router';
import { Clock, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRecents } from '@/hooks/useRecents';
import { openCommandPalette } from '@/components/site/CommandPalette';

export function JumpBackIn() {
  const { t } = useTranslation('feed');
  const recents = useRecents();

  if (recents.length === 0) return null;

  return (
    <section
      aria-label={t('jump-back-in', { defaultValue: 'Jump back in' })}
      className="border-b border-site-border px-4 py-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-4 w-4 text-site-accent" aria-hidden />
        <h2 className="text-sm font-bold text-site-text">
          {t('jump-back-in', { defaultValue: 'Jump back in' })}
        </h2>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {recents.map((r) => (
          <Link
            key={r.href}
            to={r.href}
            title={r.title}
            className="group relative flex h-16 w-32 shrink-0 flex-col justify-end overflow-hidden rounded-site border border-site-border p-2"
          >
            {/* Prefer the game/app's own thumbnail; fall back to its gradient. */}
            {r.image ? (
              <img
                src={r.image}
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <span
                aria-hidden
                className={`absolute inset-0 bg-linear-to-br ${r.gradient} opacity-80 transition-opacity group-hover:opacity-100`}
              />
            )}
            {/* Darken so the title stays legible over any thumbnail. */}
            <span className="absolute inset-0 bg-black/35" aria-hidden />
            <span className="relative truncate text-xs font-semibold text-white drop-shadow">
              {r.title}
            </span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => openCommandPalette()}
          aria-label={t('jump-back-all', { defaultValue: 'Browse all games and apps' })}
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-site border border-dashed border-site-border text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          <span className="text-[10px] font-medium">
            {t('jump-back-all-label', { defaultValue: 'All' })}
          </span>
        </button>
      </div>
    </section>
  );
}
