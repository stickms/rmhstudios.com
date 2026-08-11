"use client";
import React, { Suspense } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';

const CookGameGame = React.lazy(() =>
  import('./CookGameGame').then((m) => ({ default: m.CookGameGame })),
);

export function GameShell({ userName }: { userName?: string | null }) {
  const goBack = useBackOrFallback();
  return (
    <div className="app-viewport bg-neutral-950 text-white" data-fluid-press-scope>
      <div className="app-safe-top app-safe-x shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-neutral-800/50 z-20">
        <Link to="/games" onClick={goBack} className="flex shrink-0 items-center gap-2 text-neutral-500 hover:text-neutral-300 text-sm">
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono tracking-widest text-xs">RMH STUDIOS</span>
        </Link>
        {/* `lg` rather than `sm`: at 640px this hint and the username together
            squeezed the back link's label to nothing. */}
        <span className="text-neutral-600 text-[10px] font-mono tracking-wide hidden lg:block">
          WASD Move • Shift Sprint • E Interact • M Menu
        </span>
        {userName && <span className="min-w-0 truncate text-neutral-600 text-xs font-mono">{userName}</span>}
      </div>
      <div className="flex-1 min-h-0 bg-black">
        <Suspense fallback={<div className="flex items-center justify-center w-full h-full text-neutral-600 text-sm font-mono tracking-widest animate-pulse">LOADING...</div>}>
          <CookGameGame />
        </Suspense>
      </div>
    </div>
  );
}
