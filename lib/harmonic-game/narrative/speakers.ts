/**
 * The cast as data. `name` is the English display name (the HUD translates it through
 * `harmonic:speaker_<id>`; this is the fallback). Colours are CSS tokens in `harmonic.css`
 * (`--harmonic-speaker-<id>`): one neutral per speaker, never amber (amber means "in phase").
 */
import type { DialogueLine, SpeakerId } from './types';

export const SPEAKERS: Record<SpeakerId, { name: string }> = {
  ines: { name: 'Ines' },
  odile: { name: 'Odile' },
  sana: { name: 'Sana' },
  voss: { name: 'Voss' },
  lind: { name: 'Lind' },
  pavel: { name: 'Pavel' },
};

export const speakerName = (id: SpeakerId): string => SPEAKERS[id]?.name ?? id;

export function isSpeakerId(v: unknown): v is SpeakerId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SPEAKERS, v);
}

/** Script-file builder: a line said in the room. */
export const say = (
  speaker: SpeakerId,
  key: string,
  defaultValue: string,
  durationMs?: number,
): DialogueLine => ({ speaker, key, defaultValue, durationMs });

/** Script-file builder: a line heard through the radio. */
export const radio = (
  speaker: SpeakerId,
  key: string,
  defaultValue: string,
  durationMs?: number,
): DialogueLine => ({ speaker, key, defaultValue, durationMs, channel: 'radio' });
