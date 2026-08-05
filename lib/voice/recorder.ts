'use client';

/**
 * `MediaRecorder` wrapper for DM voice notes.
 *
 * Three things it exists to get right, none of which belong in a component:
 *
 * 1. **The encoder settings come from the tier policy, not from here.**
 *    `recorderOptionsFor(tier)` (`lib/media/voice-policy.ts`) owns the bitrate
 *    and the duration cap, and the API route validates against the same numbers.
 *    If this file picked its own bitrate, a free user could record a minute the
 *    server would then reject for being too many bytes.
 * 2. **The waveform is captured while recording.** An `AnalyserNode` tap on the
 *    same stream yields an amplitude envelope for free; decoding the finished
 *    blob to get one instead would cost a second pass over the audio on the
 *    sender's phone and is impossible to show live.
 * 3. **The microphone is released.** Every track is stopped on every exit path —
 *    stop, cancel, error, and the auto-stop at the duration cap — because a live
 *    `MediaStreamTrack` keeps the browser's recording indicator lit, which reads
 *    to the user as "this site is still listening".
 */

import { getAudioContext } from '@/lib/shared/platform';
import { recorderOptionsFor, VOICE_CONTENT_TYPES } from '@/lib/media/voice-policy';
import type { Tier } from '@/lib/entitlements/tiers';
import { VOICE_PEAK_BUCKETS, downsamplePeaks, frameLevel } from '@/lib/voice/peaks';

/** How often the analyser is sampled while recording. */
const SAMPLE_INTERVAL_MS = 50;
/** Cap on retained envelope frames (10 min at 20 fps = 12k; this bounds memory). */
const MAX_FRAMES = 20_000;

export type RecorderFailure =
  /** No `getUserMedia` / `MediaRecorder` in this browser. */
  | 'unsupported'
  /** The user denied the microphone, or no device exists. */
  | 'denied'
  /** The encoder or the stream failed mid-recording. */
  | 'failed';

export class VoiceRecorderError extends Error {
  constructor(readonly reason: RecorderFailure) {
    super(reason);
    this.name = 'VoiceRecorderError';
  }
}

export interface RecordedClip {
  blob: Blob;
  /** The container MIME type actually produced (Safari will not give us Opus). */
  contentType: string;
  durationMs: number;
  /** {@link VOICE_PEAK_BUCKETS} values in `[0, 1]`. */
  peaks: number[];
}

export interface VoiceRecorderCallbacks {
  /** Live level in `[0, 1]` plus elapsed ms — for the recording UI. */
  onTick?: (level: number, elapsedMs: number) => void;
  /** Fired when the tier's duration cap stops the recording by itself. */
  onAutoStop?: () => void;
  onError?: (error: VoiceRecorderError) => void;
}

/** True when this browser can record at all. Cheap enough to call in render. */
export function canRecordVoice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * First supported container from the policy's list.
 *
 * Order matters: `VOICE_CONTENT_TYPES` lists Opus containers before the Safari
 * fallbacks, so a browser that can do Opus does, and only Safari lands on
 * `audio/mp4`. Returns `''` when nothing matches, which tells `MediaRecorder`
 * to pick its own default rather than throwing.
 */
export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of VOICE_CONTENT_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frames: number[] = [];
  private chunks: Blob[] = [];
  private startedAt = 0;
  private stoppedAt = 0;
  private cancelled = false;

  constructor(
    private readonly tier: Tier,
    private readonly callbacks: VoiceRecorderCallbacks = {},
  ) {}

  get maxDurationMs(): number {
    return recorderOptionsFor(this.tier).maxDurationMs;
  }

  /** Ask for the microphone and begin. Throws {@link VoiceRecorderError}. */
  async start(): Promise<void> {
    if (!canRecordVoice()) throw new VoiceRecorderError('unsupported');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Speech, not music: the browser's own processing is far better than
        // anything we could do after the fact, and it shrinks the encode too.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      throw new VoiceRecorderError('denied');
    }

    this.stream = stream;
    this.cancelled = false;
    this.frames = [];
    this.chunks = [];

    const { audioBitsPerSecond, maxDurationMs } = recorderOptionsFor(this.tier);
    const mimeType = pickRecorderMimeType();

    try {
      this.recorder = new MediaRecorder(stream, {
        audioBitsPerSecond,
        ...(mimeType ? { mimeType } : {}),
      });
    } catch {
      this.releaseStream();
      throw new VoiceRecorderError('failed');
    }

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.onerror = () => {
      this.callbacks.onError?.(new VoiceRecorderError('failed'));
      this.cancel();
    };

    this.attachAnalyser(stream);
    this.startedAt = Date.now();
    this.stoppedAt = 0;
    // One blob per second rather than one at the end: an interrupted tab still
    // leaves usable audio, and memory stays flat on a ten-minute recording.
    this.recorder.start(1000);

    this.timer = setInterval(() => {
      const elapsed = Date.now() - this.startedAt;
      const level = this.readLevel();
      if (this.frames.length < MAX_FRAMES) this.frames.push(level);
      this.callbacks.onTick?.(level, elapsed);
      if (elapsed >= maxDurationMs) {
        this.callbacks.onAutoStop?.();
        this.requestStop();
      }
    }, SAMPLE_INTERVAL_MS);
  }

  /** Stop and resolve the finished clip. Resolves `null` if it was cancelled. */
  async stop(): Promise<RecordedClip | null> {
    const recorder = this.recorder;
    if (!recorder) return null;

    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    this.requestStop();
    await finished;

    const durationMs = Math.max(0, (this.stoppedAt || Date.now()) - this.startedAt);
    const contentType = recorder.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type: contentType });
    const peaks = downsamplePeaks(this.frames, VOICE_PEAK_BUCKETS);
    this.teardown();

    if (this.cancelled || blob.size === 0) return null;
    return { blob, contentType, durationMs, peaks };
  }

  /** Abandon the recording and release the microphone immediately. */
  cancel(): void {
    this.cancelled = true;
    this.requestStop();
    this.teardown();
  }

  /** Elapsed recording time, for a component that re-reads it on demand. */
  elapsedMs(): number {
    if (!this.startedAt) return 0;
    return (this.stoppedAt || Date.now()) - this.startedAt;
  }

  private requestStop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.stoppedAt) this.stoppedAt = Date.now();
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      /* already stopped */
    }
  }

  private attachAnalyser(stream: MediaStream): void {
    // Always the shared context (lib/shared/platform) — a page that constructs
    // its own AudioContext per recording exhausts the browser's budget after a
    // handful and every later one silently fails to start.
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      this.source = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source.connect(this.analyser);
      // Deliberately NOT connected to `ctx.destination`: routing the microphone
      // to the speakers is a feedback loop.
    } catch {
      this.analyser = null;
      this.source = null;
    }
  }

  private readLevel(): number {
    if (!this.analyser) return 0;
    const buffer = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buffer);
    return frameLevel(buffer);
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private teardown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* nodes already detached */
    }
    this.source = null;
    this.analyser = null;
    this.releaseStream();
    this.recorder = null;
  }
}
