'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';

/**
 * Floating happiness read-out over the 3D scene. Reads live values on a light
 * 100ms interval (instead of subscribing per-frame) so the big numbers stay
 * smooth without re-rendering React on every animation frame.
 */
export default function HUD() {
  const { t } = useTranslation('c-temple-of-joy');
  const numberFormat = useTempleStore((s) => s.numberFormat);
  const [snap, setSnap] = useState({ happiness: 0, hps: 0, hpc: 0 });

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useTempleStore.getState();
      setSnap({ happiness: s.happiness, hps: s.getHPS(), hpc: s.getHPC() });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-20 flex -translate-x-1/2 flex-col items-center gap-1 text-center md:top-28">
      <div
        className="text-4xl font-bold tabular-nums md:text-5xl"
        style={{
          color: 'var(--temple-accent-bright, #f0c84a)',
          fontFamily: 'var(--font-cormorant, Georgia, serif)',
          textShadow: '0 0 18px rgba(255,200,80,0.55), 0 2px 6px rgba(0,0,0,0.6)',
        }}
      >
        {fmt(snap.happiness, numberFormat)}
      </div>
      <div
        className="text-xs font-semibold uppercase tracking-[0.25em]"
        style={{ color: 'var(--temple-text)', opacity: 0.7 }}
      >
        {t('happiness', { defaultValue: 'Happiness' })}
      </div>
      <div className="mt-1 text-sm font-medium tabular-nums" style={{ color: 'var(--temple-text)', opacity: 0.85 }}>
        {fmt(snap.hps, numberFormat)}{' '}
        <span style={{ opacity: 0.6 }}>{t('happiness-per-sec', { defaultValue: 'happiness/sec' })}</span>
      </div>
    </div>
  );
}
