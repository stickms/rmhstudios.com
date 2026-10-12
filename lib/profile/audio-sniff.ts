/**
 * Identify an audio container from its first bytes (client-safe, no deps).
 *
 * The pronunciation clip arrives as a `MediaRecorder` blob whose declared type
 * is whatever the browser (or a script) put in the multipart header. Nothing
 * downstream should trust that: the stored extension and the `Content-Type` the
 * clip is later served with both come from THESE bytes, so a renamed HTML or SVG
 * file can never be stored — or served back — as audio.
 */

export type AudioContainer = 'webm' | 'ogg' | 'mp4' | 'aac';

export const AUDIO_CONTAINER_TYPE: Record<AudioContainer, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
};

export const AUDIO_CONTAINER_EXT: Record<AudioContainer, string> = {
  webm: 'webm',
  ogg: 'ogg',
  mp4: 'm4a',
  aac: 'aac',
};

export function sniffAudioContainer(bytes: Uint8Array): AudioContainer | null {
  if (bytes.length < 12) return null;
  // EBML header — WebM (Chrome, Firefox, Edge).
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'webm';
  // "OggS" — Ogg/Opus (Firefox).
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53)
    return 'ogg';
  // "ftyp" at offset 4 — ISO BMFF, i.e. MP4/M4A (Safari).
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)
    return 'mp4';
  // ADTS sync word — raw AAC.
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'aac';
  return null;
}
