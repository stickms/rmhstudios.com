import { Suspense } from 'react';
import { GameCanvas } from '@/components/game/GameCanvas';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DarkModeWrapper } from './DarkModeWrapper';

export default function SliceItPage() {
  return (
    <DarkModeWrapper>
      <main className="fixed inset-0 slice-theme overflow-hidden flex flex-col bg-slice-bg transition-colors duration-300">
        {/* Header */}
        <div className="p-3 shrink-0 flex items-center gap-3 shadow-sm z-10 bg-slice-bg border-b border-slice-shadow-dark/30 transition-colors duration-300">
          <Link href="/games">
            <Button
              variant="ghost"
              size="sm"
              className="text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark/20 transition-all rounded-lg text-xs"
            >
              <ArrowLeft className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline font-bold">Back to Games</span>
            </Button>
          </Link>
          <span className="text-xs font-black text-slice-text-light uppercase tracking-widest hidden sm:inline">|</span>
          <span className="text-sm font-black text-slice-text uppercase tracking-widest hidden sm:inline">Slice-It</span>
        </div>

        {/* Game Canvas — occupies remaining space */}
        <div className="flex-1 min-h-0 w-full relative">
          <Suspense fallback={<div className="w-full h-full bg-slice-bg" />}>
            <GameCanvas />
          </Suspense>
        </div>
      </main>
    </DarkModeWrapper>
  );
}
