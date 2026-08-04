/**
 * Size and duration ceilings for voice messages, by membership tier.
 *
 * Voice is the one upload on the site that is deliberately **lossy**: it
 * arrives already Opus-encoded by the browser's `MediaRecorder`, and the
 * storage-side compressor leaves audio alone precisely because re-compressing
 * an Opus stream costs CPU and returns nothing. All of the size control
 * therefore has to happen at capture time and at the door.
 *
 * ## Why two ceilings and not one
 *
 * A duration cap alone is not a size cap: a client can encode 60 seconds at
 * 128 kbps and hand us a megabyte of mono speech that Opus would have carried
 * in a tenth of that. A byte cap alone gives no useful feedback while
 * recording. So the recorder is told a bitrate and a duration, and the server
 * enforces bytes — with enough headroom for container overhead that an honest
 * client is never rejected, and little enough that a dishonest one is.
 *
 * ## Client-safe
 *
 * No `.server` suffix: the recorder UI imports these to configure
 * `MediaRecorder` and to draw the remaining-time ring, and the API route
 * imports the same numbers to reject. One source, so the two cannot drift.
 */

import type { Tier } from '@/lib/entitlements/tiers';

export interface VoiceLimits {
  /** Hard ceiling on the stored object. */
  maxBytes: number;
  /** Recording stops itself here. */
  maxDurationMs: number;
  /**
   * Target encoder bitrate, in bits per second. Opus is transparent for speech
   * far below music rates; 24 kbps mono is comfortably intelligible and 32 kbps
   * is generous. Raising this for paid tiers buys audible quality, not length.
   */
  bitrate: number;
}

/**
 * Per-tier ceilings.
 *
 * Free is deliberately usable rather than punitive — a 60-second note covers
 * the overwhelming majority of real messages — and paid tiers get both longer
 * and better rather than one or the other.
 *
 * The byte ceilings are ~35% above what the bitrate × duration product needs
 * (`expectedBytes` below), which absorbs the WebM/Ogg container, an encoder
 * that overshoots on transients, and a browser that rounds bitrate up.
 */
export const VOICE_LIMITS: Record<Tier, VoiceLimits> = {
  free: {
    maxDurationMs: 60_000, // 1 minute
    bitrate: 24_000,
    maxBytes: 256 * 1024, // 256 KB
  },
  starter: {
    maxDurationMs: 180_000, // 3 minutes
    bitrate: 32_000,
    maxBytes: 1024 * 1024, // 1 MB
  },
  pro: {
    maxDurationMs: 300_000, // 5 minutes
    bitrate: 40_000,
    maxBytes: 2 * 1024 * 1024, // 2 MB
  },
  enterprise: {
    maxDurationMs: 600_000, // 10 minutes
    bitrate: 48_000,
    // 10 min at 48 kbps is ~3.6 MB before the container, so 4 MB left an honest
    // full-length recording within a rounding error of rejection. The headroom
    // assertion in the test file caught it.
    maxBytes: 6 * 1024 * 1024, // 6 MB
  },
};

/** The ceiling any tier could hit — the pre-auth guard on request body size. */
export const VOICE_ABSOLUTE_MAX_BYTES = Math.max(
  ...Object.values(VOICE_LIMITS).map((l) => l.maxBytes),
);

export const VOICE_ABSOLUTE_MAX_DURATION_MS = Math.max(
  ...Object.values(VOICE_LIMITS).map((l) => l.maxDurationMs),
);

/** Container types a browser `MediaRecorder` can produce for Opus/AAC audio. */
export const VOICE_CONTENT_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  // Safari, which will not give us Opus.
  'audio/mp4',
  'audio/aac',
] as const;

export function limitsFor(tier: Tier): VoiceLimits {
  return VOICE_LIMITS[tier] ?? VOICE_LIMITS.free;
}

/** What a well-behaved encoder should produce for a clip of this length. */
export function expectedBytes(durationMs: number, bitrate: number): number {
  return Math.ceil((durationMs / 1000) * (bitrate / 8));
}

export type VoiceRejection =
  | 'too-large'
  | 'too-long'
  | 'empty'
  | 'unsupported-type'
  | 'implausible-bitrate';

export interface VoiceValidation {
  ok: boolean;
  reason?: VoiceRejection;
  /** The ceiling that was applied, for the error message the user sees. */
  limits: VoiceLimits;
}

/**
 * Validate a recorded clip against a tier's ceilings.
 *
 * The `implausible-bitrate` check is the interesting one: a clip whose byte
 * count is wildly higher than its claimed duration implies either a client
 * ignoring the bitrate we asked for, or a `durationMs` that has been understated
 * to slip a large object past the duration cap. Either way we don't want it.
 * The multiplier is loose (4×) so that a genuinely bursty encoder, a
 * variable-bitrate container, or a very short clip dominated by header bytes is
 * never caught — this is a lie detector, not a size optimiser.
 */
export function validateVoiceUpload(args: {
  bytes: number;
  durationMs: number;
  contentType: string;
  tier: Tier;
}): VoiceValidation {
  const limits = limitsFor(args.tier);

  if (args.bytes <= 0 || args.durationMs <= 0) return { ok: false, reason: 'empty', limits };

  const baseType = args.contentType.toLowerCase().split(';')[0].trim();
  const allowed = VOICE_CONTENT_TYPES.some((t) => t.split(';')[0] === baseType);
  if (!allowed) return { ok: false, reason: 'unsupported-type', limits };

  if (args.durationMs > limits.maxDurationMs) return { ok: false, reason: 'too-long', limits };
  if (args.bytes > limits.maxBytes) return { ok: false, reason: 'too-large', limits };

  // Short clips are mostly container; don't hold them to a bitrate.
  if (args.durationMs >= 3000) {
    const budget = expectedBytes(args.durationMs, limits.bitrate) * 4;
    if (args.bytes > budget) return { ok: false, reason: 'implausible-bitrate', limits };
  }

  return { ok: true, limits };
}

/**
 * `MediaRecorder` options for a tier. Kept here so the recorder cannot pick a
 * bitrate the server would then reject.
 */
export function recorderOptionsFor(tier: Tier): {
  audioBitsPerSecond: number;
  maxDurationMs: number;
} {
  const limits = limitsFor(tier);
  return { audioBitsPerSecond: limits.bitrate, maxDurationMs: limits.maxDurationMs };
}
