"use client";
import { useEffect, useState } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';
import { OverlayFrame } from '@/components/cookgame/ui/OverlayFrame';

export function MenuOverlay() {
  const activeOverlay = useCookgameStore((s) => s.activeOverlay);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const current = useCookgameStore.getState().activeOverlay;
      if (current === null) useCookgameStore.getState().setActiveOverlay('menu');
      else if (current === 'menu') useCookgameStore.getState().setActiveOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (activeOverlay !== 'menu') return null;

  const handleSave = () => {
    useCookgameStore.getState().saveNow();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    if (window.confirm('Reset all progress?')) {
      useCookgameStore.getState().resetGame();
      useCookgameStore.getState().setActiveOverlay(null);
    }
  };

  const handleResume = () => useCookgameStore.getState().setActiveOverlay(null);

  const btn =
    'w-full rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-left font-mono text-sm text-neutral-200 hover:bg-neutral-700';

  return (
    <OverlayFrame title="Menu">
      <div className="flex flex-col gap-3">
        <button onClick={handleSave} className={btn}>
          Save
        </button>
        {saved && <span className="font-mono text-xs text-lime-400">Saved!</span>}
        <button onClick={handleReset} className={btn}>
          Reset
        </button>
        <button onClick={handleResume} className={btn}>
          Resume
        </button>
      </div>
    </OverlayFrame>
  );
}
