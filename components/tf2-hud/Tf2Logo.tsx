/**
 * The Team Fortress 2 logo, drawn from the game's own material
 * (`materials/logo/tf2_logo.vmt` → its VTF) through the same loader the preview
 * uses. Until that texture is in the base pack the wordmark is plain text in the
 * TF2 display face — never the logo *font*, whose glyphs are not the logo.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageStore } from '@/lib/tf2-hud/assets/images';
import { browserLoader } from '@/lib/tf2-hud/project/base';
import { cn } from '@/lib/utils';

const LOGO = 'materials/logo/tf2_logo';
const cache = new Map<string, Uint8Array>();

async function ensure(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (p) => {
      if (cache.has(p)) return;
      // The loader asks the synced copy first, then the one shipped with the site, so the logo
      // appears as soon as a sync has published it. The sync stores paths lower case, while the
      // material names its texture `logo\TF2_Logo`.
      try {
        cache.set(p, await browserLoader.file(p.toLowerCase()));
      } catch {
        /* not published yet: the text wordmark stays */
      }
    }),
  );
}

export default function Tf2Logo({ className, label }: { className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    const store = new ImageStore(
      () => undefined,
      () => {
        if (!alive) return;
        const tex = store.get(LOGO);
        const canvas = ref.current;
        if (tex === undefined) return;
        if (tex === null || !canvas) {
          setState('missing');
          return;
        }
        canvas.width = tex.width;
        canvas.height = tex.height;
        canvas.getContext('2d')?.drawImage(tex.bitmap, 0, 0);
        setState('ready');
      },
      ensure,
    );
    store.setLookup((p) => cache.get(p));
    store.get(LOGO);
    return () => {
      alive = false;
      store.dispose();
    };
  }, []);

  return (
    <>
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        className={cn('h-auto max-w-full object-contain', className, state !== 'ready' && 'hidden')}
      />
      {state === 'ready' ? null : (
        <p className="tf2hud-title text-2xl text-(--app-accent-text)" aria-label={label}>
          {label}
        </p>
      )}
    </>
  );
}
