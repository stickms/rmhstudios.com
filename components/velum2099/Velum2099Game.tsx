'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportsWebGL } from '@/lib/shared/platform';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { ContractDock } from './ContractDock';
import './velum2099-global.css';
import './velum2099-terminal.css';

interface VelumApp {
  destroy: () => void;
  openLobbyWithInvite: (code: string) => void;
}

export function Velum2099Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<VelumApp | null>(null);
  const [appReady, setAppReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation('c-game');

  // An invite link. The game is plain DOM below this line, so the code is
  // handed to it once it exists and the overlay does the joining.
  useLobbyInviteJoin(appReady, (code) => appRef.current?.openLobbyWithInvite(code.toUpperCase()));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || appRef.current) return;

    let destroyed = false;

    const init = async () => {
      if (!supportsWebGL()) {
        setFailed(true);
        return;
      }
      // OpenCV.js (used only by the opt-in data-collection mode) is now
      // loaded lazily by the Segmenter on first use, not on page load.

      // Dynamically import the game engine (avoid SSR)
      const { App } = await import('./game/main');
      if (destroyed) return;

      const app = new App(container) as unknown as VelumApp;
      appRef.current = app;
      setAppReady(true);
    };

    // A failed chunk load or WebGL context would otherwise leave a blank
    // screen with no way forward.
    init().catch((err) => {
      console.error('[velum2099] failed to start', err);
      if (!destroyed) setFailed(true);
    });

    return () => {
      destroyed = true;
      setAppReady(false);
      if (appRef.current) {
        appRef.current.destroy();
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="velum2099-root fixed inset-0">
      <div id="terminal-screen" />
      <canvas id="game-canvas" data-jelly-zone="playfield" style={{ display: 'none' }} />
      <div id="vhs-timestamp" style={{ display: 'none' }} />
      <div id="hex-hud" data-jelly-zone="hud" style={{ display: 'none' }}>
        <canvas id="hex-tl" className="hex-corner" style={{ top: 0, left: 0 }} />
        <canvas id="hex-tr" className="hex-corner" style={{ top: 0, right: 0 }} />
        <canvas id="hex-bl" className="hex-corner" style={{ bottom: 0, left: 0 }} />
        <canvas id="hex-br" className="hex-corner" style={{ bottom: 0, right: 0 }} />
      </div>
      <ContractDock />
      {failed && (
        <div
          role="alert"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center font-mono text-[#c9a227]"
        >
          <p className="max-w-sm text-base">
            {t('velum-start-failed', {
              defaultValue:
                'Velum 2099 could not start. It needs WebGL — enable hardware acceleration or try another browser.',
            })}
          </p>
          <button
            type="button"
            className="min-h-11 rounded border border-[#c9a227]/60 px-5 py-2"
            onClick={() => window.location.reload()}
          >
            {t('velum-retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      )}
    </div>
  );
}
