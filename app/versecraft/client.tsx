'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const VersecraftGame = dynamic(
  () => import('@/components/versecraft/VersecraftGame').then(m => ({ default: m.VersecraftGame })),
  { ssr: false }
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
