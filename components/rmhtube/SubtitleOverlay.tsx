/**
 * SubtitleOverlay — the active subtitle cue over the player (sprint 11 16).
 *
 * It sits above the player inside the stage (an embed cannot be injected into), for every media type. The cue is a React
 * text child, never `dangerouslySetInnerHTML`, `innerHTML` or a `<track>`, so nothing in a cue can become markup. The
 * lookup runs when the player's existing tick publishes a position (`PositionBus`); there is no timer or frame loop here,
 * and nothing animates: a cue appears and disappears at its times.
 */

import { useSyncExternalStore } from 'react';
import { activeCueAt, type SubtitleCue, type SubtitleSize } from '@/lib/rmhtube/subtitles';
import type { PositionBus } from '@/lib/rmhtube/subtitle-prefs';

const SIZE_CLASS: Record<SubtitleSize, string> = {
  small: 'text-sm',
  medium: 'text-lg',
  large: 'text-2xl',
};

/** The caption itself: RMHTube's own style, the chosen size, direction from the text. Pure markup, no state. */
export function SubtitleCueText({ cue, size }: { cue: SubtitleCue | null; size: SubtitleSize }) {
  if (!cue) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4"
      data-testid="subtitle-cue"
    >
      <p
        dir="auto"
        className={`max-w-[90%] whitespace-pre-line rounded-app-sm bg-black px-3 py-1.5 text-center font-medium leading-snug text-white ${SIZE_CLASS[size]}`}
      >
        {cue.text}
      </p>
    </div>
  );
}

export default function SubtitleOverlay({
  cues,
  bus,
  size,
}: {
  cues: readonly SubtitleCue[] | null;
  bus: PositionBus;
  size: SubtitleSize;
}) {
  // The snapshot is the cue object itself (stable identity), so this re-renders only when the cue changes.
  const cue = useSyncExternalStore(
    bus.subscribe,
    () => (cues ? activeCueAt(cues, bus.get()) : null),
    () => null,
  );
  return <SubtitleCueText cue={cue} size={size} />;
}
