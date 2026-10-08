/**
 * GlobeSet in the room, on a phone that has no WebXR.
 *
 * `GlobeSetXr` is the real thing: an `immersive-ar` session, 6DoF, the globe
 * anchored to a point on your floor. It needs `navigator.xr`, and **no browser
 * on iOS has it** — every browser on iPhone and iPad is WebKit underneath, and
 * WebKit ships no WebXR. So on the most common phone in the world that mode
 * can never open, and `arSupported()` correctly hides its button.
 *
 * This is the consolation prize, and it is deliberately a different thing
 * rather than a fake of the same thing:
 *
 * | | `GlobeSetXr` (WebXR) | this (camera + gyroscope) |
 * | --- | --- | --- |
 * | camera feed | composited by the XR runtime | a `<video>` we draw ourselves |
 * | tracking | 6DoF — position AND orientation | **3DoF — orientation only** |
 * | walk around it | the back of the globe comes into view | nothing happens |
 * | turn on the spot | the globe stays put | the globe stays put |
 * | permission | `xr-spatial-tracking` | `camera` |
 *
 * The honest sentence is: **it knows which way you are pointing, not where you
 * are standing.** Turning your body works and feels right. Walking does not —
 * there is no world tracking, so the globe travels with you. That limit is
 * structural, not a to-do: closing it on iOS needs markerless SLAM in
 * JavaScript, which today means a commercial SDK (8th Wall, Variant Launch),
 * not a patch to this file.
 *
 * ## Why this earns the `camera` permission and WebXR did not
 *
 * `deploy/apache/rmhstudios.conf` kept `camera=()` — denied to every origin
 * including ours — on the stated grounds that GlobeSet's room view only
 * *looked* like it needed a camera: WebXR passthrough is composited by the XR
 * runtime and the page never receives a single camera pixel, so the feature
 * that gates it is `xr-spatial-tracking`. That was true and is still true of
 * `GlobeSetXr`. It stops being the whole story here, because this mode really
 * does read the camera into a `<video>` element, and `getUserMedia({ video })`
 * against `camera=()` rejects with the same `NotAllowedError` the user would
 * produce by tapping "Don't Allow" — indistinguishable, and unfixable from
 * script. `lib/__tests__/permissions-policy.test.ts` is what forces that
 * header and this file to agree.
 */

/**
 * What to ask the camera for.
 *
 * `environment` as `ideal` rather than `exact`: a tablet or laptop with only a
 * front camera should still get a picture rather than an `OverconstrainedError`
 * — a mirror of the room is a worse experience than the back camera and a much
 * better one than a dead screen. 720p because this is a full-bleed background
 * behind a globe, not a video call; asking for more costs battery and thermal
 * headroom on exactly the devices this mode exists for.
 */
export const ROOM_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

interface MediaCapableNavigator {
  mediaDevices?: { getUserMedia?: unknown };
}

/**
 * Whether the browser could hand over a camera stream at all.
 *
 * A capability probe: it reads a property and asks the user for nothing, which
 * is what lets it run on mount to decide whether to render the button.
 */
export function hasCamera(): boolean {
  if (typeof navigator === 'undefined') return false;
  const media = (navigator as MediaCapableNavigator).mediaDevices;
  return typeof media?.getUserMedia === 'function';
}

/**
 * Whether this is a device you would physically point at a room.
 *
 * `maxTouchPoints` rather than a user-agent sniff, and it is also how you catch
 * an iPad: iPadOS reports itself as a Mac in every string it exposes, and the
 * touch count is the one thing it does not lie about.
 */
export function isHandheld(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0;
}

/**
 * Whether to offer the camera room view.
 *
 * The secure-context check is not belt-and-braces: `getUserMedia` is undefined
 * on an insecure origin in some browsers and rejects in others, and offering a
 * button that cannot work is the thing this whole module is arranged to avoid.
 * Callers add the one condition that is not about the device — that real WebXR
 * is unavailable — because where `GlobeSetXr` can run, it is strictly better.
 */
export function roomModeSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext && hasCamera() && isHandheld();
}

/** Why the camera could not be opened, in terms the UI can speak to. */
export type RoomCameraError = 'denied' | 'unavailable' | 'in-use';

export type RoomCameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: RoomCameraError };

/**
 * Open the rear camera.
 *
 * Never throws: every failure comes back as a reason, because the call sites
 * are all "show a message and go back to the page" and a rejected promise
 * crossing a React event handler is an unhandled rejection, not a message.
 *
 * The `DOMException.name` mapping matters for what we can say afterwards:
 * `NotAllowedError` means the person (or the Permissions-Policy) said no and a
 * retry will fail the same way, while `NotReadableError` means another app has
 * the camera and closing it would fix things.
 */
export async function openRoomCamera(): Promise<RoomCameraResult> {
  if (!hasCamera()) return { ok: false, reason: 'unavailable' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: ROOM_VIDEO_CONSTRAINTS,
      audio: false,
    });
    return { ok: true, stream };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return { ok: false, reason: 'denied' };
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      return { ok: false, reason: 'in-use' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Stop every track on a stream.
 *
 * Dropping the reference is NOT enough: until each track is stopped the camera
 * stays powered and the platform's recording indicator stays lit, which reads
 * as the site spying long after the player left the mode. Written to tolerate
 * a null stream so teardown paths can call it unconditionally.
 */
export function closeRoomCamera(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* already ended — nothing left to release */
    }
  }
}
