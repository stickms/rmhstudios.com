'use client';

import dynamic from 'next/dynamic';

const VersecraftGame = dynamic(
  () => import('@/components/rmhpoetry/VersecraftGame').then(m => ({ default: m.VersecraftGame })),
  { ssr: false }
);

export default function VersecraftPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1520' }}>
      <VersecraftGame />
    </div>
  );
}
