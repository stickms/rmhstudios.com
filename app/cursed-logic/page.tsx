import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CursedLogicGame } from '@/components/cursed-logic/CursedLogicGame';

export const metadata = {
  title: 'Cursed Logic | RMH Studios',
  description: 'A turn-based duel against an unstable Protocol.',
};

export default function CursedLogicPage() {
  return (
    <main className="fixed inset-0 bg-[#0a0a0f] flex flex-col overflow-hidden">
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

      <div className="text-center pt-3 pb-1 shrink-0">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-cyan-400">
          CURSED LOGIC
        </h1>
        <p className="text-white/50 text-sm mt-1">Duel the Protocol</p>
      </div>

      <div className="flex-grow relative overflow-auto">
        <CursedLogicGame />
      </div>
    </main>
  );
}
