'use client';

import type { MutableRefObject } from 'react';
import type { InputState } from '@/lib/void-breaker/types';

interface Props {
  inputRef: MutableRefObject<InputState>;
  onPause: () => void;
  visible: boolean;
}

export function VoidBreakerTouchControls({ inputRef, onPause, visible }: Props) {
  if (!visible) return null;

  const bind = (key: 'up' | 'down' | 'left' | 'right' | 'detonate' | 'dash' | 'focus') => ({
    onTouchStart: (e: React.TouchEvent) => { e.stopPropagation(); inputRef.current[key] = true; },
    onTouchEnd: (e: React.TouchEvent) => { e.stopPropagation(); inputRef.current[key] = false; },
    onTouchCancel: (e: React.TouchEvent) => { e.stopPropagation(); inputRef.current[key] = false; },
  });

  const btn = 'select-none rounded-full flex items-center justify-center transition-colors';

  return (
    <>
      <button
        className={`fixed top-14 right-3 z-40 w-11 h-11 ${btn} bg-[#1a1a24] border border-[#c9a227]/30 active:bg-[#252530]`}
        onTouchStart={(e) => { e.stopPropagation(); onPause(); }}
        style={{ touchAction: 'none' }}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#d4af37]/70" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      </button>

      <div
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-none"
        style={{ touchAction: 'none', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-between items-end px-4 pb-4">
          {/* D-pad */}
          <div className="pointer-events-auto grid grid-cols-3 gap-1">
            <div />
            <button className={`w-14 h-14 ${btn} bg-[#1a1a24]/80 border border-[#c9a227]/25 active:bg-[#252530]`}
              {...bind('up')} style={{ touchAction: 'none' }}>
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#d4af37]/70" fill="currentColor">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
              </svg>
            </button>
            <div />
            <button className={`w-14 h-14 ${btn} bg-[#1a1a24]/80 border border-[#c9a227]/25 active:bg-[#252530]`}
              {...bind('left')} style={{ touchAction: 'none' }}>
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#d4af37]/70" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <div />
            <button className={`w-14 h-14 ${btn} bg-[#1a1a24]/80 border border-[#c9a227]/25 active:bg-[#252530]`}
              {...bind('right')} style={{ touchAction: 'none' }}>
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#d4af37]/70" fill="currentColor">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
            <div />
            <button className={`w-14 h-14 ${btn} bg-[#1a1a24]/80 border border-[#c9a227]/25 active:bg-[#252530]`}
              {...bind('down')} style={{ touchAction: 'none' }}>
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#d4af37]/70" fill="currentColor">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>
            <div />
          </div>

          {/* Action buttons */}
          <div className="pointer-events-auto flex flex-col gap-2 items-center">
            <button
              className={`w-12 h-12 ${btn} bg-[#1a1a24]/80 border border-[#c9a227]/40 active:bg-[#252530]`}
              {...bind('focus')} style={{ touchAction: 'none' }}
            >
              <span className="text-[#d4af37]/80 font-black text-[8px] tracking-wider">FOCUS</span>
            </button>
            <button
              className={`w-14 h-14 ${btn} bg-[#1a1a24]/80 border border-[#c9a227]/40 active:bg-[#252530]`}
              {...bind('dash')} style={{ touchAction: 'none' }}
            >
              <span className="text-[#d4af37]/80 font-black text-[9px] tracking-wider">SHIFT</span>
            </button>
            <button
              className={`w-18 h-18 ${btn} bg-[#1a1a24]/80 border-2 border-[#c9a227]/50 active:bg-[#252530]`}
              {...bind('detonate')} style={{ touchAction: 'none' }}
            >
              <span className="text-[#d4af37]/80 font-black text-[9px] tracking-wider leading-tight text-center">
                VOID<br />BURST
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
