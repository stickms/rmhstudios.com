'use client';

import { type ReactNode } from 'react';

/**
 * Classic Touhou-style double-bordered ornamental frame.
 * Used as the wrapper for all Dream Rift overlay screens.
 */
export function TouhouFrame({
  children,
  className = '',
  fullscreen = false,
}: {
  children: ReactNode;
  className?: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={`relative ${fullscreen ? 'w-full h-full' : ''} ${className}`}
      style={{ fontFamily: "'Georgia', 'Palatino Linotype', 'Times New Roman', serif" }}
    >
      {/* Outer ornamental border */}
      <div className="relative border border-amber-400/50 p-[3px] h-full">
        {/* Corner decorations */}
        <CornerDeco position="top-left" />
        <CornerDeco position="top-right" />
        <CornerDeco position="bottom-left" />
        <CornerDeco position="bottom-right" />

        {/* Inner border + content */}
        <div className="border border-amber-400/25 bg-[#0a0a1a]/97 h-full">
          {children}
        </div>
      </div>
    </div>
  );
}

function CornerDeco({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const posClass =
    position === 'top-left' ? '-top-[3px] -left-[3px]' :
    position === 'top-right' ? '-top-[3px] -right-[3px]' :
    position === 'bottom-left' ? '-bottom-[3px] -left-[3px]' :
    '-bottom-[3px] -right-[3px]';

  return (
    <div
      className={`absolute ${posClass} w-3 h-3 z-10`}
      style={{
        borderTop: position.includes('top') ? '2px solid #d4a44a' : 'none',
        borderBottom: position.includes('bottom') ? '2px solid #d4a44a' : 'none',
        borderLeft: position.includes('left') ? '2px solid #d4a44a' : 'none',
        borderRight: position.includes('right') ? '2px solid #d4a44a' : 'none',
      }}
    />
  );
}

/** Decorative horizontal rule with diamond center */
export function TouhouDivider() {
  return (
    <div className="flex items-center gap-2 my-2">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
      <div className="w-1.5 h-1.5 rotate-45 bg-amber-400/50" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
    </div>
  );
}

/** Touhou-style menu button with arrow indicator on hover */
export function TouhouMenuButton({
  children,
  onClick,
  disabled = false,
  variant = 'default',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'accent' | 'muted';
}) {
  const colors =
    variant === 'accent'
      ? 'text-amber-300 hover:text-amber-100 hover:bg-amber-400/10'
      : variant === 'muted'
      ? 'text-zinc-600 cursor-not-allowed'
      : 'text-zinc-300 hover:text-white hover:bg-white/5';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative w-full py-1.5 px-6 text-sm tracking-wider transition-all text-center ${colors} ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`}
      style={{ fontFamily: "'Georgia', 'Palatino Linotype', serif" }}
    >
      {!disabled && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-400/0 group-hover:text-amber-400/80 transition-all text-xs">
          ▸
        </span>
      )}
      {children}
    </button>
  );
}
