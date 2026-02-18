import { GameCanvas } from '@/components/game/GameCanvas';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function SliceItPage() {
  return (
    <main className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      {/* Back button */}
      <div className="absolute top-3 left-3 z-50">
        <Link href="/">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-zinc-800 text-xs sm:text-sm"
          >
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">RMH Studios</span>
          </Button>
        </Link>
      </div>

      {/* Title */}
      <div className="text-center pt-3 pb-1 shrink-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black rainbow-text tracking-tighter italic glitch-text leading-none">
          SLICE IT!
        </h1>
      </div>

      {/* Game area — fills remaining space */}
      <div className="flex-1 min-h-0 px-2 pb-2 sm:px-4 sm:pb-4">
        <div className="neon-border rounded-xl bg-black/50 border border-neon-purple shadow-lg backdrop-blur-sm w-full h-full overflow-hidden">
          <GameCanvas />
        </div>
      </div>

      {/* Instructions — compact, hidden on very small screens */}
      <div className="shrink-0 pb-2 text-center text-zinc-600 text-[10px] sm:text-xs font-mono hidden sm:block">
        Click/Tap top half → Top Lane &nbsp;·&nbsp; Click/Tap bottom half → Bottom Lane &nbsp;·&nbsp; [Esc] Pause
      </div>
    </main>
  );
}
