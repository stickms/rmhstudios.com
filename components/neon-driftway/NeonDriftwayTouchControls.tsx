'use client';

import type { MutableRefObject } from 'react';
import type { InputState } from '@/lib/neon-driftway/types';

interface Props {
  inputRef: MutableRefObject<InputState>;
  onPause: () => void;
  visible: boolean;
}

export function NeonDriftwayTouchControls({ inputRef, onPause, visible }: Props) {
  if (!visible) return null;

  const bind = (key: keyof InputState) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation();
      inputRef.current[key] = true;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation();
      inputRef.current[key] = false;
    },
    onTouchCancel: (e: React.TouchEvent) => {
      e.stopPropagation();
      inputRef.current[key] = false;
    },
  });

  const btnBase =
    'select-none rounded-full flex items-center justify-center transition-colors';

  return (
    <>
      {/* Pause button — top right, below the back button area */}
      <button
        className={`fixed top-14 right-3 z-40 w-11 h-11 ${btnBase} bg-black/50 border border-white/20 active:bg-white/20 backdrop-blur-sm`}
        onTouchStart={(e) => {
          e.stopPropagation();
          onPause();
        }}
        style={{ touchAction: 'none' }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white/70" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      </button>

      {/* Bottom controls overlay */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-none"
        style={{ touchAction: 'none', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-between items-end px-4 pb-4">
          {/* Left: steering */}
          <div className="pointer-events-auto flex gap-3 items-center">
            <button
              className={`w-17 h-17 ${btnBase} bg-white/10 border border-white/20 active:bg-white/25`}
              {...bind('left')}
              style={{ touchAction: 'none' }}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-white/70" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <button
              className={`w-17 h-17 ${btnBase} bg-white/10 border border-white/20 active:bg-white/25`}
              {...bind('right')}
              style={{ touchAction: 'none' }}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-white/70" fill="currentColor">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          </div>

          {/* Center: boost */}
          <div className="pointer-events-auto mb-5">
            <button
              className={`w-15 h-15 ${btnBase} bg-orange-500/20 border border-orange-400/35 active:bg-orange-500/40`}
              {...bind('boost')}
              style={{ touchAction: 'none' }}
            >
              <span className="text-orange-300 font-black text-[11px] tracking-wider">NOS</span>
            </button>
          </div>

          {/* Right: gas + brake */}
          <div className="pointer-events-auto flex flex-col gap-3">
            <button
              className={`w-17 h-17 ${btnBase} bg-green-500/15 border border-green-400/25 active:bg-green-500/30`}
              {...bind('up')}
              style={{ touchAction: 'none' }}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-green-300/70" fill="currentColor">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
              </svg>
            </button>
            <button
              className={`w-17 h-17 ${btnBase} bg-red-500/15 border border-red-400/25 active:bg-red-500/30`}
              {...bind('down')}
              style={{ touchAction: 'none' }}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-red-300/70" fill="currentColor">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
