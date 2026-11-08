/**
 * Microphone input: opens the mic, polls the time-domain signal every 25 ms,
 * runs YIN, and feeds the result through the segmenter so the rest of the app
 * sees ordinary note on/off events. Thin on purpose — every decision (when a
 * note starts or ends) lives in `mic-segmenter.ts`. Client-only: browser APIs
 * are touched inside `start()`, never at module load, so SSR is safe.
 *
 * The three audio-processing constraints are switched off because echo
 * cancellation, noise suppression and auto-gain all distort the pitch and
 * level of a sustained instrument tone.
 */
import { getAudioContext } from '@/lib/shared/platform';
import { freqToMidi } from '../pitch/notes';
import { DEFAULT_MIN_RMS, detectPitch } from '../pitch/yin';
import type { InputAdapter, NoteEvent, NoteListener } from './events';
import { createDeviceRunner } from './device-runner';
import { createSegmenter, type Segmenter } from './mic-segmenter';

/** Analysis rate. A timer, not requestAnimationFrame: the repo gates rAF loops. */
const POLL_MS = 25;
/** YIN needs two periods of the lowest pitch (60 Hz); 2048 covers that at 48 kHz. */
const FFT_SIZE = 2048;

export function createMicInput(opts: { onLevel?: (rms: number) => void } = {}): InputAdapter {
  const listeners = new Set<NoteListener>();
  const emit = (e: NoteEvent) => {
    for (const l of [...listeners]) l(e);
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let segmenter: Segmenter | null = null;

  const teardown = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    stream?.getTracks().forEach((t) => t.stop());
    source?.disconnect();
    analyser?.disconnect();
    stream = null;
    source = null;
    analyser = null;
  };

  /** Acquire the mic for one run of the lifecycle; `wanted()` turns false when a stop() arrives. */
  const open = async (wanted: () => boolean): Promise<void> => {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('Web Audio is not available in this browser.');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not available in this browser.');
    }
    // iOS Safari starts suspended; start() runs from a user click, which is
    // what allows the resume. Do it before the (possibly slow) permission prompt.
    if (ctx.state === 'suspended') await ctx.resume();
    if (!wanted()) return;

    // Rejections keep their original `name` (NotAllowedError, NotFoundError).
    const media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    // stop() arrived while the permission prompt was open: release what we
    // were just handed rather than leave the mic recording.
    if (!wanted()) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }

    stream = media;
    // From here a failure must not leave the mic open.
    try {
      source = ctx.createMediaStreamSource(media);
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser);
      segmenter = createSegmenter();

      const node = analyser;
      const seg = segmenter;
      const rate = ctx.sampleRate;
      // Reused every poll: the frame buffer and the one pitch frame handed to the segmenter.
      const buf = new Float32Array(node.fftSize);
      const frame = { midi: 0, cents: 0 };
      timer = setInterval(() => {
        node.getFloatTimeDomainData(buf);
        const now = performance.now();

        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
        const rms = Math.sqrt(sumSq / buf.length);
        opts.onLevel?.(rms);

        // Silence (most frames) skips the detector entirely; a NaN level fails this test too.
        let pitched = false;
        if (rms >= DEFAULT_MIN_RMS) {
          // detectPitch only ever returns a finite, positive freq (or null).
          const pitch = detectPitch(buf, rate);
          if (pitch) {
            const exact = freqToMidi(pitch.freq);
            frame.midi = Math.round(exact);
            frame.cents = (exact - frame.midi) * 100;
            pitched = true;
          }
        }
        const events = seg.push(pitched ? frame : null, now);
        for (let i = 0; i < events.length; i++) emit(events[i]);
      }, POLL_MS);
    } catch (err) {
      teardown();
      segmenter = null;
      throw err;
    }
  };

  // Start/stop/cancel is the shared device lifecycle; this adapter only says how to open and release the mic.
  const life = createDeviceRunner({
    launch: (_run, wanted) => open(wanted),
    stopDevice() {
      teardown();
      // Release the sounding note, if the mic was running.
      if (segmenter) for (const e of segmenter.flush(performance.now())) emit(e);
      segmenter = null;
    },
  });

  const adapter: InputAdapter = {
    source: 'mic',
    start: () => life.start(),
    stop: () => life.stop(),

    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
  return adapter;
}
