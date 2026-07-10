"use client";
import React, { Suspense } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

const CookGameGame = React.lazy(() =>
  import('./CookGameGame').then((m) => ({ default: m.CookGameGame })),
);

export function GameShell({ userName }: { userName?: string | null }) {
  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-neutral-800/50 z-20">
        <Link to="/builds" className="flex items-center gap-2 text-neutral-500 hover:text-neutral-300 text-sm">
          <ArrowLeft className="w-4 h-4" />
          <span className="font-mono tracking-widest text-xs">RMH STUDIOS</span>
        </Link>
        <span className="text-neutral-600 text-[10px] font-mono tracking-wide hidden sm:block">
          WASD Move • Shift Sprint • E Interact • M Menu
        </span>
        {userName && <span className="text-neutral-600 text-xs font-mono">{userName}</span>}
      </div>
      <div className="flex-1 min-h-0 bg-black">
        <Suspense fallback={<div className="flex items-center justify-center w-full h-full text-neutral-600 text-sm font-mono tracking-widest animate-pulse">LOADING...</div>}>
          <CookGameGame />
        </Suspense>
      </div>
    </div>
  );
}
