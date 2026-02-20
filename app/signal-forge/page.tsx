import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { SignalForgeGame } from '@/components/signal-forge/SignalForgeGame';

export default function SignalForgePage() {
  return (
    <main className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      {/* Top bar: back button | title | (pause button rendered by SignalForgeUI) */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0 relative z-60">
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
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black rainbow-text tracking-tighter italic glitch-text leading-none absolute left-1/2 -translate-x-1/2">
          SIGNAL FORGE
        </h1>
        {/* Right side spacer — pause button is rendered by SignalForgeUI */}
        <div className="w-20" />
      </div>

      {/* Game area — fills remaining space */}
      <div className="grow relative min-h-0 overflow-hidden">
        <SignalForgeGame />
      </div>
    </main>
  );
}
