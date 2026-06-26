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
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="w-[min(640px,92vw)] max-h-[80vh] overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono tracking-widest text-lime-400">{title}</h2>
          <button onClick={close} className="text-neutral-400 hover:text-white text-sm">
            Close ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
