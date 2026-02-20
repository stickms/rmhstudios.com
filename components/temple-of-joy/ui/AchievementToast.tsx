'use client';

import { useEffect, useRef, useState } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { ACHIEVEMENTS } from '@/lib/temple-of-joy/data/achievements';

interface Toast {
  id: number;
  achievementId: string;
}

let toastCounter = 0;

export default function AchievementToast() {
  const achievements     = useTempleStore(s => s.achievements);
  const gameInitialized  = useTempleStore(s => s.gameInitialized);
  const theme            = useTempleStore(s => s.theme);
  const prevRef          = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // Don't do anything until the game has loaded its save
    if (!gameInitialized) return;

    // First call after init: seed silently — no toasts for already-owned achievements
    if (prevRef.current === null) {
      prevRef.current = new Set(achievements);
      return;
    }

    const prev = prevRef.current;
    const newOnes = [...achievements].filter(id => !prev.has(id));
    prevRef.current = new Set(achievements);
    if (newOnes.length === 0) return;

    setToasts(prev => [
      ...prev,
      ...newOnes.map(id => ({ id: ++toastCounter, achievementId: id })),
    ]);
  }, [achievements, gameInitialized]);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;

  const dark = theme === 'dark';

  return (
    <div
      className="fixed top-16 right-3 z-[60] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Achievement notifications"
    >
      {toasts.map(toast => {
        const def = ACHIEVEMENTS.find(a => a.id === toast.achievementId);
        if (!def) return null;
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border"
            style={{
              background: dark ? '#2c1d12' : '#ede7d9',
              borderColor: dark ? '#d4a847' : '#8b6914',
              color: dark ? '#e8d5b0' : '#3d2c1e',
              // 4.5 s total: ~0.45s in, hold, ~0.9s out
              animation: 'templeToastFade 4.5s ease-in-out forwards',
              maxWidth: 280,
              minWidth: 200,
            }}
            onAnimationEnd={() => dismiss(toast.id)}
            onClick={() => dismiss(toast.id)}
            role="status"
          >
            <span className="text-xl shrink-0">🏆</span>
            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold uppercase tracking-widest leading-none mb-0.5"
                style={{ color: dark ? '#d4a847' : '#8b6914' }}
              >
                Achievement Unlocked
              </p>
              <p
                className="text-sm font-semibold leading-tight"
                style={{
                  fontFamily: 'var(--font-cormorant, Georgia, serif)',
                  color: dark ? '#e8d5b0' : '#3d2c1e',
                }}
              >
                {def.name}
              </p>
              {!def.hidden && (
                <p
                  className="text-[11px] leading-tight mt-0.5 opacity-70"
                  style={{ color: dark ? '#a88b63' : '#7c5c3e' }}
                >
                  {def.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
