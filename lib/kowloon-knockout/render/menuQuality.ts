// ============================================================
// Quality of the menu's 3D duel (MenuFighters3D) — one pure decision.
//
// The user picks `menuFighters` in Graphics; 'auto' reads the device. Everything the canvas
// needs follows from the result, so there is exactly one place that says what "smooth" or
// "pixel" costs:
//   smooth  full-resolution render with MSAA — the models read crisp over the pixel street
//   pixel   half-resolution, no AA, scaled up pixelated — matches the street's pixel art
//   off     no 3D layer at all (the pixel street stays; nothing renders on the GPU)
// ============================================================
import type { TierPreference } from './graphicsStore';
import { clamp } from '@/lib/core/math';

export type MenuFightersSetting =
  | 'auto'
  | 'smooth'
  | 'pixel'
  | 'off';
export const MENU_FIGHTERS_SETTINGS: readonly MenuFightersSetting[] =
  [
    'auto',
    'smooth',
    'pixel',
    'off',
  ];

export interface MenuQualityInput {
  setting: MenuFightersSetting;
  /** The Graphics quality preset ('auto' = adaptive). */
  preference: TierPreference;
  isMobile: boolean;
  devicePixelRatio: number;
  /** Reported device memory in GB, when the browser says (Chromium); undefined otherwise. */
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export interface MenuQuality {
  mode:
    | 'smooth'
    | 'pixel'
    | 'off';
  /** Canvas resolution scale (R3F `dpr`). */
  dpr: number;
  antialias: boolean;
  /** Render cap; the duel is slow choreography, so 30 is smooth enough and halves the cost. */
  fps: number;
  /** Point lights to keep (the rim lights read most; fill drops first on weak GPUs). */
  lights:
    | 1
    | 2
    | 3;
}

/** A weak device: a phone, the Low preset, or a machine that says it has little memory or few cores. */
export function isWeakDevice(
  i: MenuQualityInput,
): boolean {
  return (
    i.isMobile ||
    i.preference ===
      'low' ||
    (i.deviceMemory !==
      undefined &&
      i.deviceMemory <=
        2) ||
    (i.hardwareConcurrency !==
      undefined &&
      i.hardwareConcurrency <=
        2)
  );
}

export function resolveMenuQuality(
  i: MenuQualityInput,
): MenuQuality {
  const weak =
    isWeakDevice(
      i,
    );
  let mode: MenuQuality['mode'];
  if (
    i.setting ===
    'off'
  )
    mode =
      'off';
  else if (
    i.setting ===
      'smooth' ||
    i.setting ===
      'pixel'
  )
    mode =
      i.setting;
  else
    mode =
      weak ||
      i.preference ===
        'medium'
        ? 'pixel'
        : 'smooth';

  if (
    mode ===
    'off'
  )
    return {
      mode,
      dpr: 0.5,
      antialias: false,
      fps: 30,
      lights: 1,
    };
  if (
    mode ===
    'pixel'
  ) {
    return {
      mode,
      dpr: weak
        ? 0.4
        : 0.5,
      antialias: false,
      fps: weak
        ? 24
        : 30,
      lights:
        weak
          ? 2
          : 3,
    };
  }
  // smooth: never above 1.5x (a 3x retina canvas is what makes a menu burn battery), MSAA only where it is cheap.
  const dpr =
    clamp(
      i.devicePixelRatio ||
        1,
      1,
      weak
        ? 1
        : 1.5,
    );
  return {
    mode,
    dpr,
    antialias: true,
    fps: weak
      ? 30
      : 30,
    lights:
      weak
        ? 2
        : 3,
  };
}
