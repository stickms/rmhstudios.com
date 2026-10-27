/**
 * The builder's 3D player: the selected class with its equipped cosmetics, shown under the class
 * bar. The viewer (three.js, the class model and each cosmetic) loads lazily, and only on a
 * browser that can do WebGL; otherwise — or before the game files have been synced — a short note
 * says why there is nothing to turn around. The slots below remain the way to pick items.
 */
'use client';

import { Box } from 'lucide-react';
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { supportsWebGL } from '@/lib/shared/platform';
import { animUrl, tauntClip, useAnimIndex } from '@/lib/tf2-loadout/use-anims';
import { classModel, modelUrl, pickModel, useModelIds } from '@/lib/tf2-loadout/use-models';
import { cn } from '@/lib/utils';
import type { EffectSpec } from './EffectParticles';
import type { PlayerPart } from './PlayerScene';

const PlayerScene = lazy(() => import('./PlayerScene'));

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-(--app-text-dim)">
      <Box className="size-6" aria-hidden />
      <p className="max-w-64">{children}</p>
    </div>
  );
}

export interface WornItem {
  slotKey: string;
  itemId: number;
  /** Paint colour, `#rrggbb`. */
  tint?: string;
  effect?: EffectSpec;
}

export default function PlayerViewer({
  cls,
  worn,
  tauntEffect,
  taunt,
  className,
}: {
  cls: string;
  /** The cosmetics currently equipped, plus the weapon the player holds. */
  worn: readonly WornItem[];
  /** The equipped taunt item: its animation plays, looped, on the player. */
  taunt?: number;
  /** The equipped taunt's unusual effect, if any: it surrounds the whole player. */
  tauntEffect?: EffectSpec;
  className?: string;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const ids = useModelIds();
  const anims = useAnimIndex();
  const clip = taunt !== undefined ? tauntClip(anims, taunt, cls) : null;
  const webgl = useMemo(() => (typeof window === 'undefined' ? true : supportsWebGL()), []);
  const body = ids ? classModel(ids, cls) : null;

  const parts = useMemo<PlayerPart[]>(() => {
    if (!ids) return [];
    const out: PlayerPart[] = [];
    for (const w of worn) {
      const name = pickModel(ids, w.itemId, cls);
      if (name) {
        out.push({
          key: `${w.slotKey}:${name}`,
          url: modelUrl(name),
          tint: w.tint,
          effect: w.effect,
        });
      }
    }
    return out;
  }, [ids, worn, cls]);

  const content = !webgl ? (
    <Note>{t('model-no-webgl', { defaultValue: 'Your browser cannot show 3D models.' })}</Note>
  ) : ids === null ? (
    <Note>{t('model-checking', { defaultValue: 'Checking for a 3D model…' })}</Note>
  ) : !body ? (
    <Note>{t('player-unavailable', { defaultValue: 'The 3D player is not available yet.' })}</Note>
  ) : (
    <SilentErrorBoundary
      key={cls}
      label="tf2-player"
      fallback={
        <Note>{t('model-failed', { defaultValue: 'This model could not be loaded.' })}</Note>
      }
    >
      <Suspense fallback={<Note>{t('model-loading', { defaultValue: 'Loading 3D model…' })}</Note>}>
        <PlayerScene
          body={modelUrl(body)}
          parts={parts}
          bodyEffect={tauntEffect}
          tauntUrl={clip ? animUrl(cls, clip) : undefined}
        />
      </Suspense>
    </SilentErrorBoundary>
  );

  const caption =
    taunt === undefined || anims === null
      ? null
      : clip
        ? t('taunt-playing', { defaultValue: 'Playing the taunt on a loop.' })
        : t('taunt-no-animation', {
            defaultValue: 'No animation is available for this taunt yet.',
          });

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        role="img"
        aria-label={t('model-view', { defaultValue: '3D model viewer' })}
        className={cn(
          'h-72 overflow-hidden rounded-(--app-radius) border border-(--app-border) bg-(--app-bg) sm:h-80',
        )}
      >
        {content}
      </div>
      {caption ? (
        <p aria-live="polite" className="text-center text-xs text-(--app-text-dim)">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
