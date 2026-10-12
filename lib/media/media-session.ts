/**
 * Media Session glue — lock-screen, media-key and OS "Now Playing" controls.
 *
 * Without this the OS shows a blank "rmhstudios.com" tile for RMHMusic and
 * RMHTube, and keyboard media keys / AirPods taps do nothing. With it, the
 * same handlers the in-page buttons use are reachable from the OS.
 *
 * Deliberately small and framework-free:
 *  - Position state is pushed on discrete events only (play, pause, seek,
 *    duration/rate change). The OS interpolates the scrubber itself, so
 *    pushing on `timeupdate` would be work with no visible effect.
 *  - Every handler is optional. An action left out is explicitly nulled so a
 *    stale handler from a previous binding can never fire (e.g. a room member
 *    who is not the leader must not be able to seek the room from a headset).
 */

export interface MediaMeta {
  title: string;
  artist?: string;
  album?: string;
  /** Absolute or root-relative image URL. */
  artwork?: string | null;
}

export interface MediaHandlers {
  play?: () => void;
  pause?: () => void;
  /** Absolute position in seconds. */
  seekTo?: (seconds: number) => void;
  /** Relative jump in seconds (negative = back). */
  seekBy?: (deltaSeconds: number) => void;
  next?: () => void;
  previous?: () => void;
}

const ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'seekto',
  'seekbackward',
  'seekforward',
  'nexttrack',
  'previoustrack',
];

const SEEK_STEP_S = 10;

export function hasMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

function setHandler(action: MediaSessionAction, fn: MediaSessionActionHandler | null): void {
  try {
    navigator.mediaSession.setActionHandler(action, fn);
  } catch {
    // Older engines throw for actions they do not know (e.g. `seekto`).
  }
}

/** Set (or clear, with `null`) the OS-visible metadata. */
export function setMediaMeta(meta: MediaMeta | null): void {
  if (!hasMediaSession() || typeof MediaMetadata === 'undefined') return;
  if (!meta) {
    navigator.mediaSession.metadata = null;
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist ?? '',
    album: meta.album ?? '',
    artwork: meta.artwork
      ? [96, 256, 512].map((size) => ({ src: meta.artwork!, sizes: `${size}x${size}` }))
      : [],
  });
}

/** Replace every action handler. Actions not provided are cleared. */
export function setMediaHandlers(handlers: MediaHandlers): void {
  if (!hasMediaSession()) return;
  const map: Record<string, MediaSessionActionHandler | null> = {
    play: handlers.play ? () => handlers.play!() : null,
    pause: handlers.pause ? () => handlers.pause!() : null,
    seekto: handlers.seekTo
      ? (d) => {
          if (typeof d.seekTime === 'number') handlers.seekTo!(d.seekTime);
        }
      : null,
    seekbackward: handlers.seekBy ? (d) => handlers.seekBy!(-(d.seekOffset ?? SEEK_STEP_S)) : null,
    seekforward: handlers.seekBy ? (d) => handlers.seekBy!(d.seekOffset ?? SEEK_STEP_S) : null,
    nexttrack: handlers.next ? () => handlers.next!() : null,
    previoustrack: handlers.previous ? () => handlers.previous!() : null,
  };
  for (const action of ACTIONS) setHandler(action, map[action] ?? null);
}

export function setMediaPlaybackState(playing: boolean | null): void {
  if (!hasMediaSession()) return;
  navigator.mediaSession.playbackState = playing === null ? 'none' : playing ? 'playing' : 'paused';
}

/** Push the scrubber state. Ignores non-finite durations (live streams). */
export function setMediaPosition(position: number, duration: number, rate = 1): void {
  if (!hasMediaSession() || typeof navigator.mediaSession.setPositionState !== 'function') return;
  try {
    if (!Number.isFinite(duration) || duration <= 0) {
      navigator.mediaSession.setPositionState();
      return;
    }
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: rate > 0 ? rate : 1,
      position: Math.min(Math.max(0, position), duration),
    });
  } catch {
    // Throws if position > duration mid-transition; the next event corrects it.
  }
}

/**
 * Bind an `HTMLMediaElement` so playback state and the scrubber follow it.
 * Returns an unbind. Metadata and handlers are set separately because the
 * caller (not the element) knows what is playing and who may control it.
 */
export function bindMediaElement(el: HTMLMediaElement): () => void {
  if (!hasMediaSession()) return () => {};
  const syncPosition = () => setMediaPosition(el.currentTime, el.duration, el.playbackRate);
  const onPlay = () => {
    setMediaPlaybackState(true);
    syncPosition();
  };
  const onPause = () => {
    setMediaPlaybackState(false);
    syncPosition();
  };
  const events: Array<[string, () => void]> = [
    ['play', onPlay],
    ['pause', onPause],
    ['ended', onPause],
    ['seeked', syncPosition],
    ['durationchange', syncPosition],
    ['ratechange', syncPosition],
  ];
  for (const [name, fn] of events) el.addEventListener(name, fn);
  return () => {
    for (const [name, fn] of events) el.removeEventListener(name, fn);
  };
}

/** Clear everything — call when the player goes away. */
export function clearMediaSession(): void {
  if (!hasMediaSession()) return;
  setMediaHandlers({});
  setMediaMeta(null);
  setMediaPlaybackState(null);
}
