import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { NeonDriftwayGame } from '@/components/neon-driftway/NeonDriftwayGame';
// TODO: Metadata/Viewport removed — use TanStack Start route meta instead
import { Link } from '@tanstack/react-router';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata = {
  title: 'Neon Driftway — RMH Studios',
};

export default function NeonDriftwayPage() {
  return (
    <main
      className="fixed inset-0 bg-black flex flex-col overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="absolute top-3 left-3 z-50">
        <Link to="/builds">
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
        <NeonDriftwayGame />
      </div>
    </main>
  );
}
