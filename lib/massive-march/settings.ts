/**
 * Massive March — player options.
 *
 * §17 of the design is not a wishlist, it is a requirement: this game's puzzles
 * lean on hearing, speaking, reading, reaction time, fine motor control and
 * first-person motion, and a group is only as able to finish it as its least
 * accommodated member. So the options here are load-bearing, not garnish —
 * particularly `textOnly` (the whole campaign without a microphone, under
 * identical audibility rules) and `stableFrame` (a fixed reference that does not
 * move with the camera, which is what makes an hour of first-person walking
 * survivable for a lot of people).
 *
 * Persisted per browser, not per campaign: these describe the person, and they
 * should not have to set them again because a different friend is hosting.
 */

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MM_SETTINGS_KEY } from './constants';

export type CrosshairStyle = 'dot' | 'cross' | 'ring' | 'none';
export type HoldToggle = 'hold' | 'toggle';
export type MicMode = 'push' | 'toggle' | 'open' | 'off';

/** Every rebindable action, with the code it defaults to. */
export const DEFAULT_KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  run: 'ShiftLeft',
  crouch: 'ControlLeft',
  sit: 'KeyC',
  interact: 'KeyE',
  drop: 'KeyQ',
  throwItem: 'KeyF',
  use: 'KeyR',
  gestures: 'KeyG',
  chat: 'Enter',
  map: 'KeyM',
  talk: 'KeyV',
  inventory: 'Tab',
} as const;

export type ActionKey = keyof typeof DEFAULT_KEYS;

export interface MmSettings {
  /** 60–110. Wider helps motion sensitivity more than any overlay does. */
  fov: number;
  sensitivity: number;
  invertY: boolean;
  crosshair: CrosshairStyle;
  runMode: HoldToggle;
  crouchMode: HoldToggle;
  micMode: MicMode;
  /** Never asks for the microphone; text carries the same information (§8.2). */
  textOnly: boolean;
  voiceVolume: number;
  worldVolume: number;
  /**
   * A fixed nose-and-frame reference drawn over the view. Costs a little of the
   * screen and buys a stable point that does not move with head motion.
   */
  stableFrame: boolean;
  /** Draw a soft outline on anything you can interact with. */
  highlightInteractive: boolean;
  /** Larger HUD text throughout. */
  largeText: boolean;
  keys: Record<ActionKey, string>;
}

const DEFAULTS: MmSettings = {
  fov: 78,
  sensitivity: 1,
  invertY: false,
  crosshair: 'dot',
  runMode: 'hold',
  crouchMode: 'hold',
  micMode: 'push',
  textOnly: false,
  voiceVolume: 1,
  worldVolume: 0.7,
  stableFrame: false,
  highlightInteractive: true,
  largeText: false,
  keys: { ...DEFAULT_KEYS },
};

interface SettingsStore extends MmSettings {
  set<K extends keyof MmSettings>(key: K, value: MmSettings[K]): void;
  bind(action: ActionKey, code: string): void;
  reset(): void;
}

export const useMmSettings = create<SettingsStore>()(
  persist(
    (setState) => ({
      ...DEFAULTS,
      set: (key, value) => setState({ [key]: value } as Partial<MmSettings>),
      bind: (action, code) =>
        setState((state) => ({ keys: { ...state.keys, [action]: code } })),
      reset: () => setState({ ...DEFAULTS, keys: { ...DEFAULT_KEYS } }),
    }),
    {
      name: MM_SETTINGS_KEY,
      version: 1,
      // A stored blob written before an action existed would leave that action
      // unbound and the key silently dead, so defaults are always the base.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<MmSettings>;
        return {
          ...current,
          ...saved,
          keys: { ...DEFAULT_KEYS, ...(saved.keys ?? {}) },
        };
      },
    },
  ),
);

/** Read settings outside React (the controller runs in `useFrame`). */
export function settings(): MmSettings {
  return useMmSettings.getState();
}

/** Human-readable key name for the settings sheet. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  switch (code) {
    case 'Space':
      return 'Space';
    case 'ShiftLeft':
      return 'L Shift';
    case 'ShiftRight':
      return 'R Shift';
    case 'ControlLeft':
      return 'L Ctrl';
    case 'ControlRight':
      return 'R Ctrl';
    case 'Tab':
      return 'Tab';
    case 'Enter':
      return 'Enter';
    default:
      return code;
  }
}
