"use client";
import { useEffect } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';

export function OverlayFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const close = () => useCookgameStore.getState().setActiveOverlay(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="app-safe-pad absolute inset-0 z-30 flex items-center-safe justify-center-safe bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-[min(640px,calc(100%-2rem))] max-h-[min(80dvh,calc(100%-2rem))] overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-white sm:p-6"
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-mono tracking-widest text-lime-400">{title}</h2>
          <button
            type="button"
            onClick={close}
            className="text-neutral-400 hover:text-white text-sm px-2 py-1 pointer-coarse:min-h-11"
          >
            Close ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
