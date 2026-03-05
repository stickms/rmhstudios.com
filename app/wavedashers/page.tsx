import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { WavedashersGame } from '@/components/wavedashers/WavedashersGame';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'Wavedashers — RMH Studios',
  description: 'Competitive platformer. Master the wavedash to win.',
};

export default function WavedashersPage() {
  return (
    <main
      className="fixed inset-0 bg-zinc-950 flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="absolute top-3 left-3 z-50">
        <Link href="/games">
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

      <div className="grow relative flex items-center justify-center overflow-hidden">
        <WavedashersGame />
      </div>
    </main>
  );
}
