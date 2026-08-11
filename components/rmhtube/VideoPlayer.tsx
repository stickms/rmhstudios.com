/**
 * VideoPlayer — the room's playhead.
 *
 * One fixed tick samples the player, decides at most one correction, and
 * applies it. Nothing here reacts to a media event, because the media events
 * cannot be trusted: react-player v3 backs each provider with a custom element,
 * and `youtube-video-element` *synthesises* `seeking`/`seeked` from a 50 ms
 * poll whenever the position moves more than 0.1 s between samples — which
 * untouched playback does the moment a timer is throttled, and does constantly
 * above 2× speed.
 *
 * The previous version corrected from exactly those events, and the loop it
 * made is what "it constantly buffers for everyone else" was:
 *
 *     seeked → handleSeek → correct(force) → player.currentTime = target
 *            → seeked → …
 *
 * Every pass through that loop dropped the buffer and re-stalled the player,
 * and on YouTube the first `seeked` did not even need a user to produce it.
 *
 * So: intent is inferred from the position itself (`observePosition`), which no
 * provider can fake; corrections are planned by a pure function (`planSync`);
 * and every seek opens a cooldown during which nothing is measured or issued.
 *
 * Live sources are mirrored, not synchronised. A broadcast's position is a
 * sliding DVR window that means something different on every viewer's machine,
 * so a room watching one shares play/pause and nothing else.
 */
'use client';

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
  lazy,
  Suspense,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Radio } from 'lucide-react';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { emit, syncClock } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import {
  HOST_STATE_INTERVAL_MS,
  SYNC_TICK_INTERVAL_MS,
  SEEK_COOLDOWN_MS,
  POSITION_JUMP_TOLERANCE_S,
  STALL_REPORT_TICKS,
  MIN_BUFFER_AHEAD_S,
  SYNC_HARD_TOLERANCE_S,
} from '@/lib/rmhtube/constants';
import { planSync, observePosition, type PlayerSample, type PositionObservation } from '@/lib/rmhtube/sync-plan';
import { extrapolate } from '@/lib/rmhtube/sync-math';
import { getServerNow, hasClockSync } from '@/lib/rmhtube/clock';
import { toast } from '@/lib/rmhtube/toast-store';
import type { ClientQueueItem, VideoState } from '@/lib/rmhtube/types';

const ReactPlayer = lazy(() => import('react-player'));

/** Providers with continuous playback rates, where a ±5% nudge is invisible. */
const CONTINUOUS_RATE_PROVIDERS = new Set(['direct', 'vimeo']);

/** A rejected `play()` is not retried faster than this. */
const PLAY_RETRY_MS = 1_000;

/**
 * A tick this much later than scheduled means the page was throttled or frozen.
 * The position difference across such a gap says nothing about intent, so the
 * observation is thrown away rather than read as a seek.
 */
const MAX_TRUSTED_TICK_GAP_MS = SYNC_TICK_INTERVAL_MS * 4;

interface VideoPlayerProps {
  item: ClientQueueItem | null;
  isLeader: boolean;
  onEnded?: () => void;
}

export interface VideoPlayerHandle {
  togglePiP: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
}

type Sample = PlayerSample & { duration: number; bufferAhead: number | null };

/** What one tick reads off the media element. */
function readSample(el: HTMLVideoElement): Sample {
  const position = Number.isFinite(el.currentTime) ? el.currentTime : 0;
  return {
    position,
    paused: el.paused,
    ended: el.ended ?? false,
    // 1 = HAVE_METADATA. Below that a seek is a request the player drops.
    ready: (el.readyState ?? 0) >= 1,
    // 2 = HAVE_CURRENT_DATA: "this frame and no more".
    buffering: (el.readyState ?? 0) === 2,
    rate: el.playbackRate || 1,
    seekableStart: rangeEdge(el.seekable, 'start'),
    seekableEnd: rangeEdge(el.seekable, 'end'),
    duration: el.duration,
    bufferAhead: bufferedAhead(el, position),
  };
}

/** `TimeRanges` is optional on the provider elements, and throws when empty. */
function rangeEdge(ranges: TimeRanges | undefined, edge: 'start' | 'end'): number | null {
  try {
    if (!ranges || ranges.length === 0) return null;
    const value = edge === 'start' ? ranges.start(0) : ranges.end(ranges.length - 1);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function bufferedAhead(el: HTMLVideoElement, position: number): number | null {
  const end = rangeEdge(el.buffered, 'end');
  return end == null ? null : Math.max(0, end - position);
}

/**
 * Is this source live?
 *
 * A VOD's duration is fixed once metadata loads; a broadcast's advances in real
 * time. That growth is the one signal every provider agrees on — YouTube
 * reports a finite, growing duration for a live stream, while HLS and Twitch
 * report `Infinity` — so it is what decides, with the URL's hint standing in
 * until the player has been watched long enough to say.
 */
function detectLive(duration: number, probe: LiveProbeRef, now: number, hint: boolean): boolean {
  if (duration === Infinity) return true;

  const previous = probe.current;
  // No usable duration yet — hold the last answer rather than falling back to
  // the hint, which would undo a detection we already made.
  if (!Number.isFinite(duration) || duration <= 0) return previous?.decided ?? hint;

  if (!previous) {
    probe.current = { duration, at: now, decided: hint };
    return hint;
  }

  const elapsedS = (now - previous.at) / 1000;
  // Between probes the answer stands. Returning the hint here instead made a
  // detected livestream flap true/false every two seconds, and each flip flipped
  // the whole room between position sync and mirroring.
  if (elapsedS < 2) return previous.decided;

  const growth = (duration - previous.duration) / elapsedS;
  // Half real-time growth is well clear of the rounding a duration getter does,
  // and nothing but a live edge produces it.
  const decided = growth > 0.5;
  probe.current = { duration, at: now, decided };
  return decided;
}

type LiveProbeRef = { current: { duration: number; at: number; decided: boolean } | null };

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  { item, isLeader, onEnded },
  ref,
) {
  const { t } = useTranslation('c-rmhtube');
  const playerRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const url = item?.url ?? null;
  const masterVolume = useRmhTubeStore((s) => s.settings.masterVolume);
  const muted = useRmhTubeStore((s) => s.settings.muted);
  const captionsEnabled = useRmhTubeStore((s) => s.settings.captionsEnabled);
  const updateSettings = useRmhTubeStore((s) => s.updateSettings);
  const roomRate = useRmhTubeStore((s) => s.room?.videoState.playbackRate ?? 1);
  const isLive = useRmhTubeStore((s) => s.room?.videoState.mode === 'live');

  const [ready, setReady] = useState(false);
  /** The environment paused us and only a gesture can resume. */
  const [needsGesture, setNeedsGesture] = useState(false);
  /** The rate actually applied to the element — the room's, or a nudge of it. */
  const [appliedRate, setAppliedRate] = useState(roomRate);

  // ─── Tick state (refs: high frequency, must not re-render) ──────
  const isLeaderRef = useRef(isLeader);
  isLeaderRef.current = isLeader;
  const itemRef = useRef(item);
  itemRef.current = item;
  const needsGestureRef = useRef(needsGesture);
  needsGestureRef.current = needsGesture;

  const lastSampleRef = useRef<{ position: number; at: number } | null>(null);
  /** Nothing is measured or issued before this instant (see SEEK_COOLDOWN_MS). */
  const suppressUntilRef = useRef(0);
  const hiddenRef = useRef(false);
  const forceResyncRef = useRef(false);
  const lastHostReportRef = useRef(0);
  const lastPlayAttemptRef = useRef(0);
  const lastControlToastRef = useRef(0);
  const stallTicksRef = useRef(0);
  const reportedStallRef = useRef(false);
  /** True while the element was playing on the previous tick. */
  const wasPlayingRef = useRef(false);
  /** We issued the pause, so it is not the viewer walking away. */
  const selfPausedRef = useRef(false);
  const userPausedRef = useRef(false);
  /** Last room revision this player acted on — see `runLeaderTick`. */
  const lastAppliedRevRef = useRef(-1);
  const durationProbeRef = useRef<{ duration: number; at: number; decided: boolean } | null>(null);
  const reportedMetaRef = useRef<{ itemId: string; duration: number | null; live: boolean } | null>(null);

  // ─── Reset per item ────────────────────────────────────────────
  useEffect(() => {
    setReady(false);
    setNeedsGesture(false);
    lastSampleRef.current = null;
    durationProbeRef.current = null;
    reportedMetaRef.current = null;
    stallTicksRef.current = 0;
    wasPlayingRef.current = false;
    userPausedRef.current = false;
    selfPausedRef.current = false;
    forceResyncRef.current = true;
    lastHostReportRef.current = 0;
    lastAppliedRevRef.current = -1;
    if (reportedStallRef.current) {
      reportedStallRef.current = false;
      emit(C2S.SYNC_STALL, { stalled: false });
    }
  }, [item?.id]);

  // ─── Volume: element ⇄ store ───────────────────────────────────
  //
  // react-player writes `volume` onto the element on every render, so the
  // element and the store have to converge rather than argue. The element's own
  // setter early-returns on an equal value, so once the store matches what the
  // user dragged, the per-render write is a no-op.
  const volumeCommitRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(volumeCommitRef.current), []);

  useEffect(() => {
    if (!ready) return;
    const el = playerRef.current;
    if (!el) return;

    const onVolumeChange = () => {
      const volume = el.volume;
      const isMuted = el.muted;
      const settings = useRmhTubeStore.getState().settings;
      if (Math.abs(volume - settings.masterVolume) < 0.01 && isMuted === settings.muted) return;
      clearTimeout(volumeCommitRef.current);
      volumeCommitRef.current = setTimeout(() => {
        updateSettings({ masterVolume: volume, muted: isMuted });
      }, 200);
    };

    el.addEventListener('volumechange', onVolumeChange);
    return () => el.removeEventListener('volumechange', onVolumeChange);
  }, [ready, updateSettings]);

  // ─── Captions ──────────────────────────────────────────────────
  //
  // `cc_load_policy` is read once when the iframe is built and the element does
  // not reload on a config change, so the text-track API is the only toggle
  // that works after load. `youtube-video-element` mirrors the provider's
  // caption list onto a real `textTracks` list for exactly this.
  useEffect(() => {
    if (!ready) return;
    const tracks = playerRef.current?.textTracks;
    if (!tracks) return;
    for (const track of Array.from(tracks)) {
      track.mode = captionsEnabled ? 'showing' : 'disabled';
    }
  }, [captionsEnabled, ready]);

  useEffect(() => {
    if (!ready) return;
    const tracks = playerRef.current?.textTracks;
    if (!tracks) return;
    const onTrackChange = () => {
      const active = Array.from(tracks).some((track) => track.mode === 'showing');
      if (active !== useRmhTubeStore.getState().settings.captionsEnabled) {
        updateSettings({ captionsEnabled: active });
      }
    };
    tracks.addEventListener('change', onTrackChange);
    return () => tracks.removeEventListener('change', onTrackChange);
  }, [ready, updateSettings]);

  // ─── Imperative handle (PiP / fullscreen) ──────────────────────
  useImperativeHandle(ref, () => ({
    togglePiP: async () => {
      const el = playerRef.current;
      // The iframe-backed providers have no video element to hand the browser.
      if (!el || typeof el.requestPictureInPicture !== 'function') return;
      try {
        if (document.pictureInPictureElement === el) await document.exitPictureInPicture();
        else await el.requestPictureInPicture();
      } catch {
        // Needs a gesture, or the provider disallows it.
      }
    },
    toggleFullscreen: async () => {
      const el = containerRef.current;
      if (!el) return;
      try {
        if (document.fullscreenElement === el) await document.exitFullscreen();
        else await el.requestFullscreen();
      } catch {
        // Fullscreen may not be available.
      }
    },
  }), []);

  const controlToast = useCallback(() => {
    const now = Date.now();
    if (now - lastControlToastRef.current < 4_000) return;
    lastControlToastRef.current = now;
    toast.info(t('only-leader-can-control', { defaultValue: 'Only the leader can control playback' }));
  }, [t]);

  // ─── The tick ──────────────────────────────────────────────────
  //
  // Held in a ref and reassigned each render so the interval below is created
  // once per source and never runs a stale closure.
  const tickRef = useRef<() => void>(() => {});

  tickRef.current = () => {
    const el = playerRef.current;
    const room = useRmhTubeStore.getState().room;
    if (!el || !room) return;

    const state = room.videoState;
    const now = Date.now();
    const sample = readSample(el);
    const previous = lastSampleRef.current;
    lastSampleRef.current = { position: sample.position, at: now };
    const suppressed = now < suppressUntilRef.current;

    // A tick that arrived far late spans a throttle or a freeze; the position
    // difference across it is not evidence of anything.
    const gap = previous ? now - previous.at : 0;
    const observation: PositionObservation | null =
      previous && gap <= MAX_TRUSTED_TICK_GAP_MS
        ? observePosition(
            previous.position,
            sample.position,
            gap,
            sample.rate,
            !sample.paused,
            POSITION_JUMP_TOLERANCE_S,
          )
        : null;

    const live = detectLive(sample.duration, durationProbeRef, now, itemRef.current?.live ?? false);

    if (isLeaderRef.current) {
      runLeaderTick(el, sample, observation, state, now, suppressed, live);
    } else {
      runViewerTick(el, sample, observation, state, now, suppressed);
    }

    wasPlayingRef.current = !sample.paused;
  };

  /** The leader reports; it is never corrected. */
  function runLeaderTick(
    el: HTMLVideoElement,
    sample: Sample,
    observation: PositionObservation | null,
    state: VideoState,
    now: number,
    suppressed: boolean,
    live: boolean,
  ) {
    const currentItem = itemRef.current;

    if (currentItem && sample.ready) {
      const duration = !live && Number.isFinite(sample.duration) && sample.duration > 0
        ? Math.round(sample.duration)
        : null;
      const previous = reportedMetaRef.current;
      if (!previous || previous.itemId !== currentItem.id || previous.live !== live || previous.duration !== duration) {
        reportedMetaRef.current = { itemId: currentItem.id, duration, live };
        emit(C2S.QUEUE_META, { itemId: currentItem.id, duration, live });
      }
    }

    const playing = !sample.paused && !sample.ended;
    const stalled = !!observation?.stalled;

    // Did the ROOM change, or did the element? `rev` advances only on a
    // deliberate change (the app's own controls, a keyboard shortcut, a chat
    // timestamp jump, a peer wait), never on a routine re-anchor — so it is
    // what tells the leader whether to follow or to report.
    const roomChanged = state.rev !== lastAppliedRevRef.current;
    lastAppliedRevRef.current = state.rev;

    if (sample.ready && roomChanged) {
      // Something moved the room. The leader's player is the source of truth
      // for what it is doing, but not for what it was asked to do — the app's
      // play button, ←/→, and a chat timestamp all speak through the room, and
      // without this the element never heard them: it kept reporting the old
      // state and the tick below dutifully undid the request.
      if (playing !== state.playing) {
        if (state.playing) {
          void Promise.resolve(el.play()).catch(() => undefined);
        } else {
          el.pause();
        }
        return;
      }
      if (!live) {
        const target = extrapolate(state, getServerNow());
        if (Math.abs(target - sample.position) > SYNC_HARD_TOLERANCE_S) {
          suppressUntilRef.current = now + SEEK_COOLDOWN_MS;
          lastSampleRef.current = null;
          try {
            el.currentTime = Math.max(0, target);
          } catch {
            // Some providers reject a seek before the source is attached.
          }
          return;
        }
      }
    }

    // Playback edges, detected from the position and the paused flag — never
    // from `seeked`, which the providers invent (see the module comment).
    if (sample.ready && playing !== state.playing && !suppressed) {
      emit(playing ? C2S.SYNC_PLAY : C2S.SYNC_PAUSE, {});
      // Reflect it locally at once so the controls answer the click rather than
      // the round trip. The bumped `rev` is consumed by the branch above on the
      // next tick, where the element already agrees, so it is a no-op there.
      lastAppliedRevRef.current = state.rev + 1;
      useRmhTubeStore.getState().setVideoState({
        ...state,
        playing,
        currentTime: sample.position,
        updatedAt: getServerNow(),
        stalled,
        rev: state.rev + 1,
      });
    } else if (!live && observation?.jumped && !observation.stalled && !suppressed) {
      emit(C2S.SYNC_SEEK, { time: sample.position });
      suppressUntilRef.current = now + SEEK_COOLDOWN_MS;
    }

    // The leader changed speed through the provider's own menu.
    if (sample.ready && !suppressed && Math.abs(sample.rate - state.playbackRate) > 0.01) {
      emit(C2S.SYNC_SET_SPEED, { speed: sample.rate });
    }

    if (now - lastHostReportRef.current >= HOST_STATE_INTERVAL_MS) {
      lastHostReportRef.current = now;
      emit(C2S.SYNC_HOST_STATE, {
        playing,
        currentTime: sample.position,
        playbackRate: sample.rate,
        // Stamped on the shared clock: the server anchors on this rather than
        // the arrival time, which keeps one-way latency out of the timeline.
        timestamp: getServerNow(),
        stalled,
        live,
      });
    }
  }

  /** A viewer follows the room. */
  function runViewerTick(
    el: HTMLVideoElement,
    sample: Sample,
    observation: PositionObservation | null,
    state: VideoState,
    now: number,
    suppressed: boolean,
  ) {
    // ── Did the viewer (or their OS) pause us? ──
    // Only a playing→paused transition counts. Testing the steady paused state
    // instead would flag the very first tick, when we are still trying to start
    // playback, and then refuse to try again.
    if (state.playing && sample.paused && wasPlayingRef.current && !selfPausedRef.current) {
      userPausedRef.current = true;
      setNeedsGesture(true);
    }
    if (!state.playing) {
      selfPausedRef.current = false;
      userPausedRef.current = false;
    }

    // ── Mirror play / pause ──
    if (state.playing && sample.paused && !sample.ended) {
      if (!userPausedRef.current && now - lastPlayAttemptRef.current >= PLAY_RETRY_MS) {
        lastPlayAttemptRef.current = now;
        selfPausedRef.current = false;
        void Promise.resolve(el.play()).catch(() => {
          // Autoplay policy: only a gesture can start this, so ask for one
          // rather than retrying forever.
          setNeedsGesture(true);
        });
      }
    } else if (!state.playing && !sample.paused) {
      selfPausedRef.current = true;
      el.pause();
    } else if (state.playing && !sample.paused) {
      userPausedRef.current = false;
      if (needsGestureRef.current) setNeedsGesture(false);
    }

    // ── Unauthorised scrubbing ──
    // Native controls stay available (volume, quality, fullscreen), so a viewer
    // can still drag the scrubber. One correction puts them back, and the
    // cooldown that correction opens is what stops it becoming a loop.
    if (state.mode === 'vod' && observation?.jumped && !observation.stalled && !suppressed) {
      controlToast();
      forceResyncRef.current = true;
    }

    updateStallReport(sample, observation);

    // ── Correction ──
    const plan = planSync({
      state,
      serverNow: getServerNow(),
      sample,
      // An uncalibrated clock would seek everyone by the size of their own
      // clock offset — the exact bug the ping/pong handshake exists to remove.
      canCorrect: !suppressed && !hiddenRef.current && hasClockSync(),
      canNudge: CONTINUOUS_RATE_PROVIDERS.has(itemRef.current?.mediaType ?? 'direct'),
      force: forceResyncRef.current,
    });

    switch (plan.action) {
      case 'seek':
        forceResyncRef.current = false;
        suppressUntilRef.current = now + SEEK_COOLDOWN_MS;
        lastSampleRef.current = null;
        try {
          el.currentTime = Math.max(0, plan.to);
        } catch {
          // Some providers reject a seek before the source is attached.
        }
        break;
      case 'settled':
        forceResyncRef.current = false;
        setAppliedRate(plan.rate);
        break;
      case 'rate':
        setAppliedRate(plan.rate);
        break;
      case 'hold':
        break;
    }
  }

  /**
   * Tell the room when this viewer is starved of data, and when it is back.
   *
   * Recovery is measured in buffered-ahead seconds rather than "is the playhead
   * moving": while the room is paused waiting for us our player is paused too,
   * so a playhead test would report recovery instantly and start the cycle over.
   */
  function updateStallReport(sample: Sample, observation: PositionObservation | null) {
    // A backgrounded tab always looks stalled; the room must not pause for it.
    if (hiddenRef.current) {
      if (reportedStallRef.current) {
        reportedStallRef.current = false;
        emit(C2S.SYNC_STALL, { stalled: false });
      }
      stallTicksRef.current = 0;
      return;
    }

    if (reportedStallRef.current) {
      const recovered = sample.bufferAhead == null
        ? !sample.buffering && !observation?.stalled
        : sample.bufferAhead >= MIN_BUFFER_AHEAD_S;
      if (recovered) {
        reportedStallRef.current = false;
        stallTicksRef.current = 0;
        emit(C2S.SYNC_STALL, { stalled: false });
      }
      return;
    }

    const stalling = sample.buffering || !!observation?.stalled;
    stallTicksRef.current = stalling ? stallTicksRef.current + 1 : 0;
    if (stallTicksRef.current >= STALL_REPORT_TICKS) {
      reportedStallRef.current = true;
      emit(C2S.SYNC_STALL, { stalled: true });
    }
  }

  useEffect(() => {
    if (!url) return;
    const interval = setInterval(() => tickRef.current(), SYNC_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [url]);

  // ─── Visibility ────────────────────────────────────────────────
  useEffect(() => {
    function onVisibility() {
      const hidden = document.visibilityState === 'hidden';
      hiddenRef.current = hidden;
      if (hidden) return;

      // The network that just came back is not the one we calibrated against,
      // and the sample we hold predates the gap.
      syncClock();
      lastSampleRef.current = null;
      if (isLeaderRef.current) {
        lastHostReportRef.current = 0; // report on the next tick
      } else {
        emit(C2S.SYNC_REQUEST, {});
        forceResyncRef.current = true;
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Clear the stall if we unmount mid-buffer, so the room is not left waiting
  // for a viewer who has gone.
  useEffect(() => () => {
    if (reportedStallRef.current) {
      reportedStallRef.current = false;
      emit(C2S.SYNC_STALL, { stalled: false });
    }
  }, []);

  // The room's rate is the baseline the tick nudges around.
  useEffect(() => { setAppliedRate(roomRate); }, [roomRate]);

  const handleReady = useCallback(() => setReady(true), []);
  const handleEnded = useCallback(() => onEnded?.(), [onEnded]);

  const handleGestureTap = useCallback(() => {
    setNeedsGesture(false);
    userPausedRef.current = false;
    emit(C2S.SYNC_REQUEST, {});
    forceResyncRef.current = true;
    // Inside a user gesture, so resuming is permitted even on mobile.
    const el = playerRef.current;
    if (el) void Promise.resolve(el.play()).catch(() => undefined);
  }, []);

  if (!url) {
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-(--app-surface) flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-(--app-text-muted)">
            {t('no-video-playing', { defaultValue: 'No video playing' })}
          </p>
          <p className="text-sm text-(--app-text-dim) mt-1">
            {isLeader
              ? t('add-video-to-queue', { defaultValue: 'Add a video to the queue to get started' })
              : t('waiting-for-host-video', { defaultValue: 'Waiting for the host to play a video' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      <Suspense fallback={null}>
        <ReactPlayer
          ref={playerRef}
          src={url}
          // `playing` is deliberately NOT passed. react-player calls
          // `play()`/`pause()` from it on every render (its effect has no
          // dependency array), so the leader's own heartbeat echo un-paused the
          // leader, and a viewer who paused was force-played two seconds later
          // with no explanation. The tick drives both instead.
          playbackRate={appliedRate}
          controls
          volume={masterVolume}
          muted={muted}
          playsInline
          width="100%"
          height="100%"
          onReady={handleReady}
          onEnded={handleEnded}
          config={{ youtube: { rel: 0, cc_load_policy: captionsEnabled ? 1 : 0 } }}
        />
      </Suspense>

      {isLive && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-(--app-text)">
          <Radio className="h-3 w-3 text-(--app-danger)" aria-hidden />
          {t('live', { defaultValue: 'Live' })}
        </div>
      )}

      {/* The environment paused this viewer while the room plays on. We cannot
          resume without a gesture, so we ask for one. */}
      {needsGesture && !isLeader && (
        <button
          onClick={handleGestureTap}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60 text-(--app-text) backdrop-blur-sm"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-(--app-accent)">
            <Play className="h-7 w-7 text-(--app-accent-fg)" aria-hidden />
          </span>
          <span className="text-sm font-medium">
            {t('paused-tap-to-resync', { defaultValue: 'Paused — tap to resync' })}
          </span>
        </button>
      )}
    </div>
  );
});

export default VideoPlayer;
