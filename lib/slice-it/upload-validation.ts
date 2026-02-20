/**
 * Server-side validation for Slice It! uploads.
 * Validates by magic bytes (file signatures), not client-provided MIME or extension.
 */

import path from "path";

const COVER_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const AUDIO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// Magic bytes for allowed audio formats (from list of file signatures)
const AUDIO_SIGNATURES: { name: string; check: (buf: Buffer) => boolean }[] = [
  // MP3 with ID3 tag
  { name: "MP3 (ID3)", check: (buf) => buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33 },
  // MP3 frame sync (no ID3) - 0xFF 0xFB or 0xFF 0xFA or 0xFF 0xF3 etc (MPEG Audio frame sync)
  { name: "MP3", check: (buf) => buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 },
  // WAV: RIFF....WAVE
  { name: "WAV", check: (buf) => buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE" },
  // OGG
  { name: "OGG", check: (buf) => buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS" },
  // FLAC
  { name: "FLAC", check: (buf) => buf.length >= 4 && buf.toString("ascii", 0, 4) === "fLaC" },
];

const IMAGE_SIGNATURES: { name: string; check: (buf: Buffer) => boolean }[] = [
  { name: "PNG", check: (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 },
  { name: "JPEG", check: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  { name: "GIF", check: (buf) => buf.length >= 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a") },
  { name: "WebP", check: (buf) => buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" },
];

export function validateAudioBuffer(buffer: Buffer): { ok: true } | { ok: false; error: string } {
  if (buffer.length > AUDIO_MAX_BYTES) {
    return { ok: false, error: `Audio file too large. Maximum size is ${AUDIO_MAX_BYTES / 1024 / 1024} MB.` };
  }
  const valid = AUDIO_SIGNATURES.some((sig) => sig.check(buffer));
  if (!valid) {
    return { ok: false, error: "Invalid audio file. Only MP3, WAV, OGG, and FLAC are allowed. File content did not match a supported format." };
  }
  return { ok: true };
}

export function validateImageBuffer(buffer: Buffer): { ok: true } | { ok: false; error: string } {
  if (buffer.length > COVER_MAX_BYTES) {
    return { ok: false, error: `Cover image too large. Maximum size is ${COVER_MAX_BYTES / 1024 / 1024} MB.` };
  }
  const valid = IMAGE_SIGNATURES.some((sig) => sig.check(buffer));
  if (!valid) {
    return { ok: false, error: "Invalid image. Only PNG, JPEG, GIF, and WebP are allowed." };
  }
  return { ok: true };
}

export const LIMITS = { AUDIO_MAX_BYTES, COVER_MAX_BYTES } as const;

/**
 * Resolve path and ensure it stays under baseDir (no path traversal).
 * Returns null if the resolved path is outside baseDir.
 */
export function resolvePathUnder(baseDir: string, ...segments: string[]): string | null {
  const resolved = path.resolve(baseDir, ...segments);
  const base = path.resolve(baseDir);
  if (resolved === base || resolved.startsWith(base + path.sep)) {
    return resolved;
  }
  return null;
}
