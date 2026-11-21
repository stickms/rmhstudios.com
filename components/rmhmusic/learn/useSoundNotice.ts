/**
 * The lessons' two sound notices, shared so every lesson says them the same way:
 *
 * - `useSoundStatus()`: the live `soundStatus()` (re-rendered when it changes), for a lesson that
 *   shows "Loading sound…" while its sound session is still deciding (notes asked for meanwhile are
 *   dropped by `voice.ts`, never played on the synth).
 * - `useFallbackNotice(position)`: the sound the lesson fell back from, once its session settled on
 *   the simple tone (the samples failed or were not ready in time). It is said ONCE: at the place
 *   in the lesson (`position`) where the lesson first saw it, and not again after the learner moves
 *   on (plan §3.4).
 */
import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { sessionFallback } from '@/lib/rmhmusic/learn/audio/instruments/engine';
import type { InstrumentId } from '@/lib/rmhmusic/learn/audio/instruments/types';
import { onSoundChange, soundStatus, type SoundStatus } from '@/lib/rmhmusic/learn/audio/voice';
import { soundName } from './SoundDialog';

export function useSoundStatus(): SoundStatus {
  const [status, setStatus] = useState<SoundStatus>(soundStatus);
  useEffect(() => {
    const read = () => setStatus(soundStatus());
    read();
    return onSoundChange(read);
  }, []);
  return status;
}

export function useFallbackNotice(position: string): InstrumentId | null {
  const [notice, setNotice] = useState<{
    id: InstrumentId;
    at: string;
  } | null>(null);
  const where = useRef(position);
  useEffect(() => {
    where.current = position;
  });
  useEffect(() => {
    let said = false;
    const check = () => {
      if (said) return;
      const id = sessionFallback();
      if (!id) return;
      said = true;
      setNotice({
        id,
        at: where.current,
      });
    };
    check();
    return onSoundChange(check);
  }, []);
  return notice && notice.at === position ? notice.id : null;
}

/** "Couldn't load the piano sound. Playing a simple tone." */
export function fallbackLine(t: TFunction<'c-rmhmusic'>, id: InstrumentId): string {
  return t('sound-fallback-tone', {
    instrument: soundName(t, id),
    defaultValue: "Couldn't load the {{instrument}} sound. Playing a simple tone.",
  });
}
