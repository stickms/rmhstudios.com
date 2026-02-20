import { Suspense } from 'react';
import { GameCanvas } from '@/components/game/GameCanvas';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function SliceItPage() {
  return (
    <main className="fixed inset-0 slice-theme overflow-hidden">
      {/* Back button */}
      <div className="absolute top-2 left-2 z-50">
        <Link href="/games">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-800 hover:bg-white/50 transition-all rounded-lg text-xs"
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            <span className="hidden sm:inline font-bold">Back</span>
          </Button>
        </Link>
      </div>

      {/* Game Canvas — full screen */}
      <div className="w-full h-full bg-slate-900">
        <Suspense fallback={<div className="w-full h-full bg-[#e0e5ec]" />}>
          <GameCanvas />
        </Suspense>
      </div>
    </main>
  );
}
