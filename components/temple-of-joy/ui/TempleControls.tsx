'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';

/**
 * Floating ritual / pilgrimage controls anchored above the tab bar. Mirrors the
 * old SmileButton's secondary actions (the primary click is now the 3D temple),
 * styled with the temple theme tokens.
 */
export default function TempleControls() {
  const { t } = useTranslation('c-temple-of-joy');
  const triggerPilgrimage = useTempleStore((s) => s.triggerPilgrimage);
  const [snap, setSnap] = useState({ pilgrimageActive: false, pilgrimageTimer: 0, pilgrimageCooldown: 0, ritualCooldown: 0 });

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useTempleStore.getState();
      setSnap({
        pilgrimageActive: s.pilgrimageActive,
        pilgrimageTimer: s.pilgrimageTimer,
        pilgrimageCooldown: s.pilgrimageCooldown,
        ritualCooldown: s.ritualCooldown,
      });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const onPilgrimage = snap.pilgrimageCooldown > 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex flex-col items-center gap-2 md:bottom-8">
      {/* Status pill */}
      {snap.pilgrimageActive ? (
        <div
          className="pointer-events-none rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
          style={{ background: 'var(--temple-surface)', border: '1px solid var(--temple-border)', color: 'var(--temple-accent)' }}
        >
          🕯️ {t('pilgrimage-label', { defaultValue: 'PILGRIMAGE' })} · {Math.ceil(snap.pilgrimageTimer)}s
        </div>
      ) : snap.ritualCooldown > 0 ? (
        <div
          className="pointer-events-none rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
          style={{ background: 'var(--temple-surface)', border: '1px solid var(--temple-border)', color: 'var(--temple-accent-bright, #f0c84a)' }}
        >
          ✨ {t('ritual-label', { defaultValue: 'RITUAL!' })} · {Math.ceil(snap.ritualCooldown)}s
        </div>
      ) : null}

      {/* Pilgrimage button */}
      {!snap.pilgrimageActive && (
        <button
          onClick={triggerPilgrimage}
          disabled={onPilgrimage}
          className="pointer-events-auto rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide transition-all"
          style={{
            background: onPilgrimage ? 'var(--temple-border)' : 'var(--temple-accent)',
            color: onPilgrimage ? 'var(--temple-text)' : '#fff',
            opacity: onPilgrimage ? 0.5 : 1,
            cursor: onPilgrimage ? 'not-allowed' : 'pointer',
            border: '1px solid var(--temple-border)',
            boxShadow: onPilgrimage ? 'none' : '0 4px 18px rgba(139,105,20,0.45)',
          }}
        >
          {onPilgrimage
            ? t('pilgrimage-cooldown', { defaultValue: 'Pilgrimage Cooldown ({{seconds}}s)', seconds: Math.ceil(snap.pilgrimageCooldown) })
            : t('make-pilgrimage', { defaultValue: '🕯️ Make Pilgrimage' })}
        </button>
      )}
    </div>
  );
}
