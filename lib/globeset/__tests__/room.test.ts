/**
 * The camera room view's edges.
 *
 * Narrow on purpose. Per `docs/testing.md` this suite is for what breaks money,
 * user data, privacy, auth or a deploy — and exactly one thing here qualifies
 * on its own: **releasing the camera.** A stream whose tracks are not stopped
 * leaves the hardware powered and the platform's recording indicator lit after
 * the player has walked away, which is indistinguishable from a site that kept
 * watching them. `closeRoomCamera` runs on every teardown path, so it has to
 * hold when a track is already dead, when there is no stream at all, and when
 * one track throws on the way out and the rest still have to be stopped.
 *
 * The rest is here because it decides what we SAY after a refusal, and
 * `getUserMedia`'s rejections are the one place a policy mistake is invisible:
 * `camera=()` in the Permissions-Policy rejects with the very same
 * `NotAllowedError` as a person tapping "Don't Allow".
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  ROOM_VIDEO_CONSTRAINTS,
  closeRoomCamera,
  hasCamera,
  isHandheld,
  openRoomCamera,
  roomModeSupported,
} from '../room';

/** A MediaStream stand-in: vitest's jsdom has no camera and no MediaStream. */
function fakeStream(tracks: { stop: () => void }[]): MediaStream {
  return { getTracks: () => tracks } as unknown as MediaStream;
}

function withNavigator(value: unknown): void {
  vi.stubGlobal('navigator', value);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('closeRoomCamera — the camera actually goes off', () => {
  it('stops every track', () => {
    const stops = [vi.fn(), vi.fn(), vi.fn()];
    closeRoomCamera(fakeStream(stops.map((stop) => ({ stop }))));
    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one track throws, so the others still release', () => {
    const after = vi.fn();
    const stream = fakeStream([
      {
        stop: () => {
          throw new Error('already ended');
        },
      },
      { stop: after },
    ]);
    expect(() => closeRoomCamera(stream)).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('tolerates no stream at all, because teardown calls it unconditionally', () => {
    expect(() => closeRoomCamera(null)).not.toThrow();
    expect(() => closeRoomCamera(undefined)).not.toThrow();
  });
});

describe('openRoomCamera', () => {
  it('asks for video and explicitly declines audio', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream([]));
    withNavigator({ mediaDevices: { getUserMedia } });

    const result = await openRoomCamera();

    expect(result.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: ROOM_VIDEO_CONSTRAINTS,
      audio: false,
    });
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'in-use'],
    ['NotFoundError', 'unavailable'],
    ['OverconstrainedError', 'unavailable'],
  ])('reports %s as %s', async (name, reason) => {
    withNavigator({
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('', name)) },
    });
    const result = await openRoomCamera();
    expect(result).toEqual({ ok: false, reason });
  });

  it('never rejects, whatever the platform throws', async () => {
    withNavigator({
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue('a string, because platforms do this'),
      },
    });
    await expect(openRoomCamera()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('refuses before calling anything when there is no camera API', async () => {
    withNavigator({});
    await expect(openRoomCamera()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('roomModeSupported — offer it only where it can work', () => {
  const secure = (isSecureContext: boolean) => vi.stubGlobal('window', { isSecureContext });

  it('is true on a handheld with a camera on a secure origin', () => {
    secure(true);
    withNavigator({ maxTouchPoints: 5, mediaDevices: { getUserMedia: () => {} } });
    expect(roomModeSupported()).toBe(true);
  });

  it('is false on an insecure origin, where getUserMedia cannot work anyway', () => {
    secure(false);
    withNavigator({ maxTouchPoints: 5, mediaDevices: { getUserMedia: () => {} } });
    expect(roomModeSupported()).toBe(false);
  });

  it('is false on a desktop, where pointing the machine at the room is absurd', () => {
    secure(true);
    withNavigator({ maxTouchPoints: 0, mediaDevices: { getUserMedia: () => {} } });
    expect(roomModeSupported()).toBe(false);
  });

  it('is false where the browser exposes no camera API', () => {
    secure(true);
    withNavigator({ maxTouchPoints: 5 });
    expect(roomModeSupported()).toBe(false);
  });

  it('counts an iPad, which claims to be a Mac in every string it exposes', () => {
    // The touch count is the one thing iPadOS does not lie about, which is why
    // `isHandheld` reads that rather than the user agent.
    withNavigator({ maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' });
    expect(isHandheld()).toBe(true);
  });
});

describe('the constraints', () => {
  it('prefer the rear camera without demanding it', () => {
    // `ideal`, not `exact`: a front-camera-only tablet should still get a
    // picture rather than an OverconstrainedError and a dead screen.
    expect(ROOM_VIDEO_CONSTRAINTS.facingMode).toEqual({ ideal: 'environment' });
  });

  it('ask for a backdrop, not a video call', () => {
    expect(ROOM_VIDEO_CONSTRAINTS.width).toEqual({ ideal: 1280 });
    expect(ROOM_VIDEO_CONSTRAINTS.height).toEqual({ ideal: 720 });
  });
});

describe('hasCamera', () => {
  it('is a property read, not a permission prompt', () => {
    const getUserMedia = vi.fn();
    withNavigator({ mediaDevices: { getUserMedia } });
    expect(hasCamera()).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('is false where mediaDevices exists but the method does not', () => {
    withNavigator({ mediaDevices: {} });
    expect(hasCamera()).toBe(false);
  });
});
