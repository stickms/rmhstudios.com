'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';

/**
 * Slide-in drawer that floats the (still 2D) data panels over the 3D temple.
 * On mobile it rises from the bottom; on desktop it docks to the right. Styled
 * with the temple theme tokens and a slight translucency so the world shows
 * through behind it.
 */
export default function PanelOverlay({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation('c-temple-of-joy');
  const setActiveTab = useTempleStore((s) => s.setActiveTab);

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col justify-end md:items-end md:justify-stretch"
      style={{ pointerEvents: 'none' }}
    >
      {/* Tap-to-dismiss scrim */}
      <button
        aria-label={t('close', { defaultValue: 'Close' })}
        onClick={() => setActiveTab('temple')}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.35)', pointerEvents: 'auto' }}
      />

      <section
        className="temple-panel-overlay relative flex max-h-[78%] w-full flex-col md:max-h-none md:h-full md:w-[440px] md:max-w-[90vw]"
        style={{
          background: 'color-mix(in srgb, var(--temple-bg) 92%, transparent)',
          borderTop: '1px solid var(--temple-border)',
          borderLeft: '1px solid var(--temple-border)',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--temple-border)' }}
        >
          <h2
            className="text-lg font-bold tracking-wide"
            style={{ color: 'var(--temple-accent)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            {title}
          </h2>
          <button
            onClick={() => setActiveTab('temple')}
            aria-label={t('close', { defaultValue: 'Close' })}
            className="rounded-full px-3 py-1 text-sm font-bold transition-opacity hover:opacity-100"
            style={{ color: 'var(--temple-text)', opacity: 0.7, border: '1px solid var(--temple-border)' }}
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:pb-4">{children}</div>
      </section>
    </div>
  );
}
