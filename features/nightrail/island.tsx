/**
 * Nightrail's island entry (redesign audit B1): the client entry
 * `vite.islands.config.ts` builds for this feature, mounted by the bare document
 * `app/routes/nightrail.tsx` serves. It is the page the route component used to
 * render, without the site's router, shell or providers.
 *
 * The chase camera fills the viewport at every aspect ratio — the renderer
 * widens its field of view on portrait rather than letterboxing, so a phone held
 * upright still sees the next bend. The loading colours are the night sky the
 * game opens on (the document's loading frame uses the same pair), so the game
 * arriving reads as the game appearing rather than as a flash.
 */
import './island.css';
import { Suspense } from 'react';
import { mountIsland } from '@/components/island/mount';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { NightrailGame } from './ui/NightrailGame';

mountIsland(
  <main
    className="fixed inset-0 bg-black flex flex-col overflow-hidden"
    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
  >
    <div className="grow relative overflow-hidden">
      <GameErrorBoundary gameName="Nightrail">
        <Suspense fallback={<GameLoadingFallback background="#0a0713" foreground="#f0abfc" />}>
          <NightrailGame />
        </Suspense>
      </GameErrorBoundary>
    </div>
  </main>,
);
