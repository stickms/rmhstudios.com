/**
 * Turning a finished take into the document: one new MIDI clip on each armed track, added as ONE history step so a
 * single undo removes the whole take. Existing clips are never touched (no merge, no replace).
 */
import { buildTake, type RecordEvent, type TakeOptions } from '@/lib/studio/record';
import { useStudioStore } from '@/lib/studio/store';
import type { MidiClipData, Track } from '@/lib/studio/types';

/** One clip per track that has a take; none when no note was played. */
export function takeClips(
  tracks: readonly Pick<Track, 'id' | 'color'>[],
  events: readonly RecordEvent[],
  options: TakeOptions,
  clipName: string,
): MidiClipData[] {
  const clips: MidiClipData[] = [];
  for (const track of tracks) {
    const take = buildTake(events, options);
    if (!take) continue;
    clips.push({
      id: options.newId(),
      trackId: track.id,
      type: 'midi',
      name: clipName,
      startBeat: take.startBeat,
      durationBeats: take.durationBeats,
      color: track.color,
      notes: take.notes,
    });
  }
  return clips;
}

/** Add the clips to the project as the step "Record take". Returns false when there was nothing to add. */
export function commitTakeClips(clips: readonly MidiClipData[]): boolean {
  if (clips.length === 0) return false;
  const s = useStudioStore.getState();
  s.runStep('record-take', () => {
    for (const clip of clips) s.addClip(clip);
  });
  return true;
}
