/**
 * Audio preparation for the beatmap analyser.
 *
 * Two jobs, both about making the rest of the pipeline cheap enough to run
 * inside an upload request: fold to mono, and decimate to the analysis rate.
 */

/**
 * The subset of Web Audio's `AudioBuffer` the analyser needs.
 *
 * Declared structurally so the same code accepts a real `AudioBuffer` in a tab
 * and the plain object the upload route builds around `@audio/decode`'s output.
 */
export interface AudioLike {
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/**
 * Analysis sample rate.
 *
 * 22.05 kHz keeps everything up to 11 kHz, which covers every band that
 * carries rhythmic information — kick, snare, hats, transient attack noise.
 * Halving the rate halves the STFT cost, and the cost is the reason a
 * 15-minute upload is feasible at all.
 */
export const ANALYSIS_SAMPLE_RATE = 22050;

/** Fold every channel down to one, averaging. */
export function toMono(audio: AudioLike): Float32Array {
  const channels = Math.max(1, audio.numberOfChannels);
  const first = audio.getChannelData(0);
  if (channels === 1) return first;

  const out = new Float32Array(first.length);
  out.set(first);
  let used = 1;
  for (let c = 1; c < channels; c++) {
    let data: Float32Array;
    try {
      data = audio.getChannelData(c);
    } catch {
      // A buffer that lies about its channel count is not worth failing an
      // upload over — analyse what we could actually read.
      break;
    }
    const n = Math.min(out.length, data.length);
    for (let i = 0; i < n; i++) out[i] += data[i];
    used++;
  }
  if (used > 1) {
    for (let i = 0; i < out.length; i++) out[i] /= used;
  }
  return out;
}

/**
 * Decimate to {@link ANALYSIS_SAMPLE_RATE}.
 *
 * The box filter ahead of the decimation is a crude anti-alias — a windowed
 * sinc would be cleaner — but the consumer is a magnitude spectrum summed into
 * ~80 log-spaced bands, where the residual aliasing is far below the band
 * energy it would have to perturb to move an onset. Dropping samples with *no*
 * filter, on the other hand, folds hi-hat energy straight down onto the snare
 * band and does move onsets.
 */
export function resampleMono(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate <= toRate || !Number.isFinite(fromRate) || fromRate <= 0) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  const width = Math.max(1, Math.floor(ratio));

  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    let sum = 0;
    let count = 0;
    for (let j = 0; j < width && start + j < input.length; j++) {
      sum += input[start + j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

export interface PreparedAudio {
  samples: Float32Array;
  sampleRate: number;
  /** Seconds, from the *original* buffer — decimation rounds. */
  duration: number;
}

/** Mono + decimated + duration, ready for the STFT. */
export function prepareAudio(audio: AudioLike): PreparedAudio {
  const mono = toMono(audio);
  const sourceRate = audio.sampleRate > 0 ? audio.sampleRate : 44100;
  const duration = mono.length / sourceRate;
  const samples = resampleMono(mono, sourceRate, ANALYSIS_SAMPLE_RATE);
  return {
    samples,
    sampleRate: Math.min(sourceRate, ANALYSIS_SAMPLE_RATE),
    duration,
  };
}
