'use client';

import { lazy, Suspense } from 'react';

const VersecraftGame = lazy(
  () => import('@/components/versecraft/VersecraftGame').then(m => ({ default: m.VersecraftGame })),
);

export function VersecraftClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#1a1520' }}>
        <p style={{ color: '#a89888', fontFamily: 'serif' }}>Loading...</p>
      </div>
    }>
      <VersecraftGame isLoggedIn={isLoggedIn} />
    </Suspense>
  );
}
