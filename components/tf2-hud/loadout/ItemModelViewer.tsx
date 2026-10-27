/**
 * A 3D view of one item, if it has a model. The viewer (three.js and the model)
 * loads only when the item has a GLB and the browser can do WebGL; otherwise a
 * short note says why there is nothing to turn around.
 */
'use client';

import { Box } from 'lucide-react';
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { supportsWebGL } from '@/lib/shared/platform';
import { modelUrl, pickModel, useModelIds } from '@/lib/tf2-loadout/use-models';
import { cn } from '@/lib/utils';
import type { EffectSpec } from './EffectParticles';

const Viewer3D = lazy(() => import('./Viewer3D'));

function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full min-h-40 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-(--app-text-dim)',
        className,
      )}
    >
      <Box className="size-6" aria-hidden />
      <p className="max-w-56">{children}</p>
    </div>
  );
}

export default function ItemModelViewer({
  itemId,
  cls,
  tint,
  effect,
  className,
}: {
  itemId: number;
  /** The class wearing it, to pick a per-class model. */
  cls?: string;
  /** Paint colour, `#rrggbb`. */
  tint?: string;
  /** An unusual effect to show around the model. */
  effect?: EffectSpec;
  className?: string;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const ids = useModelIds();
  const model = ids ? pickModel(ids, itemId, cls) : null;
  const webgl = useMemo(() => (typeof window === 'undefined' ? true : supportsWebGL()), []);

  const body = !webgl ? (
    <Note>{t('model-no-webgl', { defaultValue: 'Your browser cannot show 3D models.' })}</Note>
  ) : ids === null ? (
    <Note>{t('model-checking', { defaultValue: 'Checking for a 3D model…' })}</Note>
  ) : !model ? (
    <Note>{t('model-none', { defaultValue: 'No 3D model for this item yet.' })}</Note>
  ) : (
    <SilentErrorBoundary
      label="tf2-model"
      fallback={
        <Note>{t('model-failed', { defaultValue: 'This model could not be loaded.' })}</Note>
      }
    >
      <Suspense fallback={<Note>{t('model-loading', { defaultValue: 'Loading 3D model…' })}</Note>}>
        <Viewer3D url={modelUrl(model)} tint={tint} effect={effect} />
      </Suspense>
    </SilentErrorBoundary>
  );

  return (
    <div
      role="img"
      aria-label={t('model-view', { defaultValue: '3D model viewer' })}
      className={cn(
        'h-56 overflow-hidden rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg)',
        className,
      )}
    >
      {body}
    </div>
  );
}
