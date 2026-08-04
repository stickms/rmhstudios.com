import { describe, expect, it } from 'vitest';
import {
  VOICE_PEAK_BUCKETS,
  downsamplePeaks,
  formatDuration,
  frameLevel,
  normalizeForDisplay,
  normalizePeaks,
} from '@/lib/voice/peaks';
import {
  VOICE_PREFIX,
  parseVoiceFilename,
  voiceContentTypeForFilename,
  voiceExtForContentType,
  voiceFilename,
  voiceFilenameFromUrl,
  voiceObjectKey,
  voicePlaybackUrl,
} from '@/lib/voice/keys';
import { limitsFor, validateVoiceUpload } from '@/lib/media/voice-policy';

/**
 * H2 — voice messages.
 *
 * The waveform maths and the key/URL scheme are the two pure pieces, and they
 * are the two that would fail silently: a bad downsample draws a plausible-
 * looking wrong picture, and a bad filename parse turns an authorization check
 * into a 404 (or, worse, doesn't).
 */

describe('peak downsampling', () => {
  it('always produces exactly the stored bucket count', () => {
    expect(downsamplePeaks(new Array(1000).fill(0.5))).toHaveLength(VOICE_PEAK_BUCKETS);
    expect(downsamplePeaks([0.5], 12)).toHaveLength(12);
    expect(downsamplePeaks([], 12)).toHaveLength(12);
  });

  it('takes the MAX of each window, not the mean', () => {
    // Speech is mostly silence with syllables on top. A mean flattens it into a
    // straight line; the max keeps the syllables, which is the entire point of
    // drawing a waveform rather than a bar.
    const samples = [0, 0, 0, 1, 0, 0, 0, 1];
    expect(downsamplePeaks(samples, 2)).toEqual([1, 1]);
  });

  it('stretches a clip shorter than the bucket count instead of leaving gaps', () => {
    const out = downsamplePeaks([1, 0.5], 6);
    expect(out).toHaveLength(6);
    expect(out.every((v) => v > 0)).toBe(true);
    expect(out[0]).toBe(1);
    expect(out[5]).toBe(0.5);
  });

  it('clamps out-of-range and non-finite input to [0, 1]', () => {
    expect(downsamplePeaks([5, -3, Number.NaN, Infinity], 4)).toEqual([1, 1, 0, 1]);
  });

  it('uses absolute value, so a signed waveform is not half-empty', () => {
    expect(downsamplePeaks([-0.8, 0.2], 2)).toEqual([0.8, 0.2]);
  });

  it('rounds to two decimals so the stored Float[] stays small', () => {
    expect(downsamplePeaks([0.123456], 1)).toEqual([0.12]);
  });

  it('returns a flat line for an empty envelope rather than throwing', () => {
    expect(downsamplePeaks([], 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('peak sanitation at the door', () => {
  it('accepts a well-formed array unchanged', () => {
    const peaks = new Array(VOICE_PEAK_BUCKETS).fill(0.4);
    expect(normalizePeaks(peaks)).toEqual(peaks);
  });

  it('resamples a client that sent the wrong length', () => {
    expect(normalizePeaks(new Array(500).fill(0.3))).toHaveLength(VOICE_PEAK_BUCKETS);
    expect(normalizePeaks([1, 0])).toHaveLength(VOICE_PEAK_BUCKETS);
  });

  it('refuses to let a hostile payload grow the column', () => {
    const huge = new Array(100_000).fill(1);
    expect(normalizePeaks(huge)).toHaveLength(VOICE_PEAK_BUCKETS);
  });

  it('turns garbage into a flat line instead of failing the upload', () => {
    expect(normalizePeaks(null)).toHaveLength(VOICE_PEAK_BUCKETS);
    expect(normalizePeaks('0.5,0.5')).toEqual(new Array(VOICE_PEAK_BUCKETS).fill(0));
    expect(normalizePeaks([{ x: 1 }, 'a'], 2)).toEqual([0, 0]);
  });

  it('clamps negatives and NaN', () => {
    expect(normalizePeaks([-1, Number.NaN, 2], 3)).toEqual([0, 0, 1]);
  });
});

describe('display normalisation', () => {
  it('scales a quiet recording up so it is still readable', () => {
    expect(normalizeForDisplay([0.1, 0.2, 0.4])).toEqual([0.25, 0.5, 1]);
  });

  it('leaves an already-loud recording alone', () => {
    const loud = [0.5, 1];
    expect(normalizeForDisplay(loud)).toBe(loud);
  });

  it('does not amplify silence into noise', () => {
    expect(normalizeForDisplay([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('analyser frame level', () => {
  it('reads centred silence as zero', () => {
    // getByteTimeDomainData centres silence at 128.
    expect(frameLevel(new Uint8Array(32).fill(128))).toBe(0);
  });

  it('reads a full-scale square wave as one', () => {
    expect(frameLevel(new Uint8Array(32).fill(255))).toBeCloseTo(0.992, 2);
  });

  it('is RMS, so a single click does not define the frame', () => {
    const frame = new Uint8Array(16).fill(128);
    frame[0] = 255;
    expect(frameLevel(frame)).toBeLessThan(0.3);
  });

  it('handles an empty buffer', () => {
    expect(frameLevel(new Uint8Array(0))).toBe(0);
  });
});

describe('duration formatting', () => {
  it('formats as m:ss with a padded seconds field', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5_400)).toBe('0:05');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('never renders a negative clock', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

describe('voice object keys', () => {
  it('round-trips a filename through the parser', () => {
    const name = voiceFilename('clh3k9v2x0000qwer1234abcd', '1754308800000-42', 'webm');
    expect(parseVoiceFilename(name)).toEqual({
      conversationId: 'clh3k9v2x0000qwer1234abcd',
      unique: '1754308800000-42',
      ext: 'webm',
    });
  });

  it('carries the conversation id, which is what makes authorization one lookup', () => {
    const name = voiceFilename('conv123', '9-9', 'ogg');
    expect(parseVoiceFilename(name)?.conversationId).toBe('conv123');
  });

  it('rejects anything that is not one of ours', () => {
    expect(parseVoiceFilename('../../etc/passwd')).toBeNull();
    expect(parseVoiceFilename('noseparator.webm')).toBeNull();
    expect(parseVoiceFilename('conv_9.exe')).toBeNull();
    expect(parseVoiceFilename('conv_9')).toBeNull();
    // A path separator smuggled into the unique half must not parse.
    expect(parseVoiceFilename('conv_9/../x.webm')).toBeNull();
  });

  it('builds a same-origin playback URL, never a CDN one', () => {
    const name = voiceFilename('conv1', '7', 'webm');
    const url = voicePlaybackUrl(name);
    expect(url.startsWith('/api/messages/voice/')).toBe(true);
    expect(url).not.toContain('http');
    expect(voiceFilenameFromUrl(url)).toBe(name);
  });

  it('does not recover a filename from a foreign URL', () => {
    expect(voiceFilenameFromUrl('https://cdn.example.com/dm-voice/conv1_7.webm')).toBeNull();
    expect(voiceFilenameFromUrl('/api/feed/image/x.webp')).toBeNull();
    expect(voiceFilenameFromUrl(null)).toBeNull();
  });

  it('namespaces objects away from feed images', () => {
    expect(voiceObjectKey('conv1_7.webm')).toBe(`${VOICE_PREFIX}conv1_7.webm`);
    expect(VOICE_PREFIX).not.toBe('rmharks/');
  });

  it('maps recorder MIME types to containers, ignoring codec parameters', () => {
    expect(voiceExtForContentType('audio/webm;codecs=opus')).toBe('webm');
    expect(voiceExtForContentType('audio/ogg')).toBe('ogg');
    // Safari, which will not give us Opus.
    expect(voiceExtForContentType('audio/mp4')).toBe('m4a');
    expect(voiceExtForContentType('video/mp4')).toBeNull();
  });

  it('serves a stored object with the type its extension implies', () => {
    expect(voiceContentTypeForFilename('conv1_7.webm')).toBe('audio/webm');
    expect(voiceContentTypeForFilename('conv1_7.m4a')).toBe('audio/mp4');
    expect(voiceContentTypeForFilename('conv1_7.txt')).toBe('application/octet-stream');
  });
});

describe('policy integration', () => {
  it('accepts an honest free-tier minute and rejects a minute and a second', () => {
    const free = limitsFor('free');
    const bytes = Math.round((free.maxDurationMs / 1000) * (free.bitrate / 8));
    expect(
      validateVoiceUpload({
        bytes,
        durationMs: free.maxDurationMs,
        contentType: 'audio/webm;codecs=opus',
        tier: 'free',
      }).ok,
    ).toBe(true);
    expect(
      validateVoiceUpload({
        bytes,
        durationMs: free.maxDurationMs + 1_000,
        contentType: 'audio/webm',
        tier: 'free',
      }),
    ).toMatchObject({ ok: false, reason: 'too-long' });
  });

  it('rejects the container types the recorder is not allowed to produce', () => {
    expect(
      validateVoiceUpload({
        bytes: 1_000,
        durationMs: 1_000,
        contentType: 'application/octet-stream',
        tier: 'pro',
      }),
    ).toMatchObject({ ok: false, reason: 'unsupported-type' });
  });

  it('is the source the recorder and the route share — no second set of numbers', () => {
    // If this ever needs updating because the API route hardcoded its own
    // ceiling, the ceiling is in the wrong place.
    for (const tier of ['free', 'starter', 'pro', 'enterprise'] as const) {
      const limits = limitsFor(tier);
      expect(limits.maxDurationMs).toBeGreaterThan(0);
      expect(limits.maxBytes).toBeGreaterThan(0);
      expect(limits.bitrate).toBeGreaterThan(0);
    }
  });
});
