/**
 * Photo mode (plan U14) — the contract between the shared PhotoMode panel
 * (`components/games/PhotoMode.tsx`) and a game's renderer.
 *
 * A renderer that supports it exposes `setPhotoCamera` (applied on top of its
 * normal camera every frame while set; `null` hands control back) and
 * `capturePhoto` (one frame at up to 2× resolution, through a 2D canvas so a
 * CSS filter "look" can be baked in without a shader pass). The sim is paused
 * for the whole session, so none of this costs anything during play.
 */

export interface PhotoCamera {
  /** Degrees, relative to the game's own camera orientation. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Metres up from the default eye position. */
  rise: number;
  /** Metres back from the default eye position. */
  back: number;
}

export const DEFAULT_PHOTO_CAMERA: PhotoCamera = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  fov: 62,
  rise: 0,
  back: 0,
};

/** Bounds a renderer can rely on (the panel's sliders use the same). */
export const PHOTO_LIMITS = {
  yaw: [-180, 180],
  pitch: [-45, 45],
  roll: [-30, 30],
  fov: [25, 100],
  rise: [0, 3],
  back: [0, 4],
} as const satisfies Record<keyof PhotoCamera, readonly [number, number]>;

export const PHOTO_LOOKS = {
  none: 'none',
  noir: 'grayscale(1) contrast(1.25)',
  warm: 'sepia(0.35) saturate(1.2) brightness(1.05)',
  vivid: 'saturate(1.6) contrast(1.1)',
} as const;
export type PhotoLook = keyof typeof PHOTO_LOOKS;

export interface PhotoModeAdapter {
  setPhotoCamera(camera: PhotoCamera | null): void;
  capturePhoto(filter: string): Promise<Blob | null>;
}

/** Largest dimension a capture may reach — GPU texture limits are 4096+ almost everywhere. */
export const PHOTO_MAX_EDGE = 4096;

/** Pixel ratio for a capture: up to 2× the live ratio, never past {@link PHOTO_MAX_EDGE}. */
export function photoPixelRatio(liveRatio: number, cssWidth: number, cssHeight: number): number {
  const edge = Math.max(cssWidth, cssHeight, 1);
  return Math.max(1, Math.min(liveRatio * 2, PHOTO_MAX_EDGE / edge));
}
