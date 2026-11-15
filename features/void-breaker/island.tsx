/**
 * Void Breaker's island entry (redesign audit B1): the client entry
 * `vite.islands.config.ts` builds for this feature, mounted by the bare document
 * `app/routes/void-breaker.tsx` serves. It is the page the route component used
 * to render, without the site's router, shell or providers.
 */
import './island.css';
import { mountIsland } from '@/components/island/mount';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { VoidBreakerGame } from './ui/VoidBreakerGame';
import { ArrivalSuspense } from '@/components/ui/arrive';

mountIsland(
  <main
    className="fixed inset-0 bg-black flex flex-col overflow-hidden"
    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
  >
    <div className="grow relative flex items-center justify-center overflow-hidden">
      <GameErrorBoundary gameName="Void Breaker">
        <ArrivalSuspense fallback={<GameLoadingFallback />}>
          <VoidBreakerGame />
        </ArrivalSuspense>
      </GameErrorBoundary>
    </div>
  </main>,
);
