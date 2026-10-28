/**
 * The animation index the asset sync publishes (`anims.json`): which clips each class body has, and the
 * clip each taunt item plays. One fetch per page load, shared by every viewer.
 */
'use client';

import { useEffect, useState } from 'react';
import { request } from '@/lib/tf2-hud/api';
import { modelUrl } from './use-models';
import { MODEL_BUILDER_VERSION } from './model-sync';

export interface AnimIndex {
  /** The clip baked into the class body GLB, played whenever nothing else is. */
  idle: string;
  /** Clip names per class, lower case. */
  clips: Record<string, string[]>;
  /** Taunt item defindex → class → clip name. */
  taunts: Record<string, Record<string, string>>;
}

let pending: Promise<AnimIndex | null> | null = null;

function loadAnimIndex(): Promise<AnimIndex | null> {
  // Not published yet (an older sync) is not an error: the player simply stands still.
  pending ??= request<AnimIndex>(
    `/api/tf2-loadout/models/anims.json?v=${MODEL_BUILDER_VERSION}`,
  ).catch(() => null);
  return pending;
}

export const animUrl = (cls: string, clip: string): string => modelUrl(`anim_${cls}_${clip}`);

/** The clip the taunt item plays for `cls`, if the sync resolved one. */
export function tauntClip(index: AnimIndex | null, itemId: number, cls: string): string | null {
  const clip = index?.taunts[String(itemId)]?.[cls];
  return clip && index?.clips[cls]?.includes(clip) ? clip : null;
}

/** Every clip published for `cls` (taunts first, then the rest, each alphabetical); empty when none. */
export function classClips(index: AnimIndex | null, cls: string): string[] {
  const all = [...(index?.clips[cls] ?? [])];
  const rank = (c: string) => (/(^|_)taunt/.test(c) ? 0 : 1);
  return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** A clip id (`taunt_rps_start`) as a name to show (`Taunt rps start`). */
export const clipLabel = (clip: string): string => {
  const words = clip.replace(/_+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** `null` while loading or when no animations have been published. */
export function useAnimIndex(): AnimIndex | null {
  const [index, setIndex] = useState<AnimIndex | null>(null);
  useEffect(() => {
    let alive = true;
    void loadAnimIndex().then((i) => alive && setIndex(i));
    return () => {
      alive = false;
    };
  }, []);
  return index;
}
