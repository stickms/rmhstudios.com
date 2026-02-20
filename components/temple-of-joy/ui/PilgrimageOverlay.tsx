'use client';
import { useEffect, useRef, useState } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';

export default function PilgrimageOverlay() {
  const pilgrimageActive = useTempleStore((s) => s.pilgrimageActive);
  const pilgrimageTimer = useTempleStore((s) => s.pilgrimageTimer);
  const theme = useTempleStore((s) => s.theme);

  const [returnFlash, setReturnFlash] = useState(false);
  const prevActive = useRef(false);

  const dark = theme === 'dark';

  // Detect when pilgrimage completes (active → inactive transition)
  useEffect(() => {
    if (prevActive.current && !pilgrimageActive) {
      setReturnFlash(true);
      const id = setTimeout(() => setReturnFlash(false), 3000);
      return () => clearTimeout(id);
    }
    prevActive.current = pilgrimageActive;
  }, [pilgrimageActive]);

  const progress = Math.min(1, Math.max(0, (120 - pilgrimageTimer) / 120));

  if (!pilgrimageActive && !returnFlash) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        background: dark ? '#2c1d12ee' : '#ede7d9ee',
        borderTop: `2px solid ${dark ? '#6b4c2a' : '#c4a97a'}`,
        color: dark ? '#e8d5b0' : '#3d2c1e',
      }}
    >
      {returnFlash ? (
        <div
          className="flex items-center justify-center py-3 text-sm font-semibold animate-pulse"
          style={{ color: dark ? '#d4a847' : '#8b6914' }}
        >
          ✨ The pilgrim returns! HPS burst active for 5 minutes!
        </div>
      ) : (
        <div className="px-4 py-2">
          <div className="flex items-center justify-between mb-1.5 text-sm">
            <span className="font-semibold">
              <span
                style={{
                  display: 'inline-block',
                  animation: 'templeCandle 2.4s ease-in-out infinite',
                  marginRight: 4,
                }}
              >
                🕯️
              </span>
              Pilgrimage in progress —{' '}
              <span
                className="font-mono tabular-nums"
                style={{ color: dark ? '#d4a847' : '#8b6914' }}
              >
                {Math.ceil(pilgrimageTimer)}s
              </span>{' '}
              remaining
              <span
                style={{
                  display: 'inline-block',
                  animation: 'templeCandle 3.1s ease-in-out infinite 0.5s',
                  marginLeft: 6,
                  fontSize: '0.75em',
                }}
              >
                🕯️
              </span>
            </span>
            <span className="text-xs opacity-60">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: dark ? '#1a120b' : '#f5f0e8' }}
          >
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progress * 100}%`,
                background: dark ? '#d4a847' : '#8b6914',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}


