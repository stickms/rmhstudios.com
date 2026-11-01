'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportsWebGL } from '@/lib/shared/platform';

/**
 * Whether this browser can create a WebGL context. Optimistic on the server and
 * first client render (so hydration matches), then probes once on mount.
 */
export function useWebGLSupport(): boolean {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(supportsWebGL()), []);
  return ok;
}

/**
 * Friendly full-area message for 3D games when WebGL cannot start (driver
 * blocklist, hardware acceleration off, exhausted context budget). Without it
 * an R3F `<Canvas>` simply stays black and the game looks frozen.
 */
export function WebGLUnavailable({ gameName }: { gameName: string }) {
  const { t } = useTranslation('shared');
  return (
    <div
      role="alert"
      className="app-safe-pad flex h-full w-full items-center-safe justify-center-safe overflow-y-auto bg-black px-6 text-center"
    >
      <div className="max-w-sm space-y-3">
        <h2 className="text-xl font-bold text-white">
          {t('webgl-unavailable-title', { defaultValue: '3D graphics are not available' })}
        </h2>
        <p className="text-sm text-white/60">
          {t('webgl-unavailable-body', {
            gameName,
            defaultValue:
              '{{gameName}} needs WebGL, and this browser could not start it. Try another browser, or turn on hardware acceleration in your browser settings.',
          })}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-site-sm bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          {t('webgl-unavailable-retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    </div>
  );
}
