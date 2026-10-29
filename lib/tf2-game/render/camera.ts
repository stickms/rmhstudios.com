/**
 * The game camera: Source position and angles, Source FOV semantics. The engine's
 * `fov` is a horizontal angle defined for a 4:3 screen and widened for wider screens
 * (SDK: ScaleFOVByWidthRatio), which keeps the vertical angle fixed at
 * 2·atan(tan(fov/2)·3/4) whatever the aspect — so three's vertical FOV is constant.
 */
import { PerspectiveCamera } from 'three';
import { SOURCE_UNIT, sourceAnglesToCameraQuaternion, srcToThree } from './coords';

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

/** SDK: ScaleFOVByWidthRatio — widens a 4:3 horizontal FOV for `ratio` = aspect / (4/3). */
export function scaleFovByWidthRatio(fovDegrees: number, ratio: number): number {
  const t = Math.tan(fovDegrees * 0.5 * D2R) * ratio;
  return Math.atan(t) * R2D * 2;
}

/** Horizontal FOV (degrees) the engine shows for a Source `fov` at `aspect` (width / height). */
export function sourceHorizontalFov(fovDegrees: number, aspect: number): number {
  return scaleFovByWidthRatio(fovDegrees, aspect / (4 / 3));
}

/** three.js vertical FOV (degrees) for a Source `fov` (any aspect). */
export function sourceFovToVertical(fovDegrees: number): number {
  return 2 * Math.atan(Math.tan(fovDegrees * 0.5 * D2R) * 0.75) * R2D;
}

/** r_nearz-like near plane (Source units) and the far plane used for the world pass. */
export const NEAR_UNITS = 4;
export const FAR_UNITS = 32768;

export interface SourceView {
  /** Eye position, Source units. */
  origin: { x: number; y: number; z: number };
  /** [pitch, yaw, roll] degrees. */
  angles: { x: number; y: number; z: number };
  /** Source FOV (4:3 horizontal), default 90. */
  fov?: number;
}

/**
 * A three PerspectiveCamera driven in Source terms. The camera's matrices are kept
 * up to date by `set()`; `origin` (Source units) is kept for PVS and fog lookups.
 */
export class SourceCamera {
  readonly camera: PerspectiveCamera;
  readonly origin = { x: 0, y: 0, z: 0 };
  readonly angles = { x: 0, y: 0, z: 0 };
  fov = 90;

  constructor(aspect = 16 / 9, near = NEAR_UNITS, far = FAR_UNITS) {
    this.camera = new PerspectiveCamera(
      sourceFovToVertical(90),
      aspect,
      near * SOURCE_UNIT,
      far * SOURCE_UNIT,
    );
  }

  set(view: SourceView): void {
    this.origin.x = view.origin.x;
    this.origin.y = view.origin.y;
    this.origin.z = view.origin.z;
    this.angles.x = view.angles.x;
    this.angles.y = view.angles.y;
    this.angles.z = view.angles.z;
    if (view.fov !== undefined) this.fov = view.fov;
    const c = this.camera;
    srcToThree(view.origin.x, view.origin.y, view.origin.z, c.position);
    sourceAnglesToCameraQuaternion(view.angles.x, view.angles.y, view.angles.z, c.quaternion);
    const vfov = sourceFovToVertical(this.fov);
    if (Math.abs(c.fov - vfov) > 1e-6) {
      c.fov = vfov;
      c.updateProjectionMatrix();
    }
    c.updateMatrixWorld(true);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
