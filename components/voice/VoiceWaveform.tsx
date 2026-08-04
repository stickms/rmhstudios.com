'use client';

import { cn } from '@/lib/utils';
import { normalizeForDisplay, VOICE_PEAK_BUCKETS } from '@/lib/voice/peaks';

/**
 * The bars a voice note draws.
 *
 * Shared by the recorder (live envelope) and the player (stored peaks) so a
 * recording looks like the bubble it becomes. Colour comes from `currentColor`
 * rather than a token class because this renders **inside a message bubble**,
 * whose foreground flips between the self and other bubble fills — inheriting is
 * the only way one component is correct in both without knowing which it is in.
 *
 * Decorative by construction: `aria-hidden`, no interactivity, no animation.
 * Anything that needs to be operable (seeking) overlays its own control.
 */
export function VoiceWaveform({
  peaks,
  /** 0–1. Bars up to this point render at full strength. */
  progress = 0,
  className,
}: {
  peaks: number[];
  progress?: number;
  className?: string;
}) {
  const bars =
    peaks.length > 0 ? normalizeForDisplay(peaks) : new Array(VOICE_PEAK_BUCKETS).fill(0);
  const filled = Math.round(bars.length * Math.min(Math.max(progress, 0), 1));

  return (
    <div aria-hidden="true" className={cn('flex h-8 w-full items-center gap-[2px]', className)}>
      {bars.map((peak, i) => (
        <span
          key={i}
          className={cn(
            'min-w-[2px] flex-1 rounded-full bg-current',
            i < filled ? 'opacity-95' : 'opacity-40',
          )}
          // Height is data, not design: a token cannot express "this bar is
          // 0.62 loud". Floored at 12% so silence is still a visible line
          // rather than a gap the eye reads as the end of the clip.
          style={{ height: `${Math.max(12, Math.round(peak * 100))}%` }}
        />
      ))}
    </div>
  );
}
