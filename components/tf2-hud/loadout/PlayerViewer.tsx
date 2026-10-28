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
import { merge } from '@/lib/tf2-loadout/bodygroups';
import type { Bodygroups, HeldStance } from '@/lib/tf2-loadout/catalog-types';
import { supportsWebGL } from '@/lib/shared/platform';
import {
  animUrl,
  classClips,
  clipLabel,
  stanceClipFor,
  tauntClip,
  useAnimIndex,
} from '@/lib/tf2-loadout/use-anims';
import { classModel, modelUrl, pickModel, useModelIds } from '@/lib/tf2-loadout/use-models';
import { cn } from '@/lib/utils';
import type { EffectSpec } from './EffectParticles';
import type { WarPaint } from './model-utils';
import type { PlayerPart } from './PlayerScene';
import { SearchSelect } from '../ui';

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
  /** For the held weapon: the pose the player stands in (`stand_<stance>`). */
  stance?: HeldStance;
  /** The chosen item style. */
  style?: number;
  /** The class-body groups this cosmetic switches (the hat it replaces, …). */
  bodygroups?: Bodygroups;
  /** Paint colour, `#rrggbb`. */
  tint?: string;
  effect?: EffectSpec;
  /** War paint on the held weapon. */
  paint?: WarPaint;
  festive?: boolean;
}

export default function PlayerViewer({
  cls,
  worn,
  tauntEffect,
  taunt,
  animation,
  onAnimationChange,
  className,
}: {
  cls: string;
  /** The cosmetics currently equipped, plus the weapon the player holds. */
  worn: readonly WornItem[];
  /** The equipped taunt item: its animation plays, looped, on the player. */
  taunt?: number;
  /** The equipped taunt's unusual effect, if any: it surrounds the whole player. */
  tauntEffect?: EffectSpec;
  /** An animation picked from the list: it plays instead of the taunt. */
  animation?: string | null;
  onAnimationChange?: (clip: string | null) => void;
  className?: string;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const ids = useModelIds();
  const anims = useAnimIndex();
  const clips = useMemo(() => classClips(anims, cls), [anims, cls]);
  const picked = animation && clips.includes(animation) ? animation : null;
  const tauntPlaying = taunt !== undefined ? tauntClip(anims, taunt, cls) : null;
  // The body's own idle is the class's loadout-screen pose, which holds its usual weapon. Holding
  // another kind (a melee, a secondary) needs that kind's standing animation, where the class has one.
  const stance = worn.find((w) => w.stance)?.stance;
  const stanceClip = stanceClipFor(clips, cls, stance);
  const clip = picked ?? tauntPlaying ?? stanceClip;
  const options = useMemo(() => clips.map((c, id) => ({ id, label: clipLabel(c) })), [clips]);
  const webgl = useMemo(() => (typeof window === 'undefined' ? true : supportsWebGL()), []);
  const body = ids ? classModel(ids, cls) : null;

  const bodygroups = useMemo(() => merge(worn.map((w) => w.bodygroups)), [worn]);

  const parts = useMemo<PlayerPart[]>(() => {
    if (!ids) return [];
    const out: PlayerPart[] = [];
    for (const w of worn) {
      const name = pickModel(ids, w.itemId, cls, w.style);
      if (name) {
        out.push({
          key: `${w.slotKey}:${name}`,
          url: modelUrl(name),
          tint: w.tint,
          effect: w.effect,
          paint: w.paint,
          festive: w.festive,
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
          bodygroups={bodygroups}
          parts={parts}
          bodyEffect={tauntEffect}
          tauntUrl={clip ? animUrl(cls, clip) : undefined}
        />
      </Suspense>
    </SilentErrorBoundary>
  );

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        role="img"
        aria-label={t('model-view', { defaultValue: '3D model viewer' })}
        className={cn(
          'h-72 overflow-hidden rounded-(--app-radius) border border-(--app-border) bg-(--app-bg) sm:h-80 lg:h-[clamp(13rem,34dvh,20rem)]',
        )}
      >
        {content}
      </div>
      {onAnimationChange && options.length ? (
        <SearchSelect
          value={picked ? clips.indexOf(picked) : undefined}
          options={options}
          onChange={(id) => onAnimationChange(id === undefined ? null : clips[id])}
          noneLabel={t('animation-auto', { defaultValue: 'Animation: automatic' })}
          placeholder={t('animation-search', { defaultValue: 'Search animations' })}
          label={t('animation-pick', { defaultValue: 'Animation' })}
        />
      ) : null}
    </div>
  );
}
