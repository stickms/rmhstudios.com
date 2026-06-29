/**
 * Server-side video compression via ffmpeg (album uploads).
 *
 * Admin-uploaded clips are re-encoded to H.264/AAC in an MP4 container, scaled
 * down to a sane max dimension, with `+faststart` so the moov atom is up front
 * (progressive playback / seeking over HTTP). A poster frame is grabbed for the
 * <video> poster + nav-strip thumbnail. The compressed bytes are stored in
 * object storage — keeping heavy originals out of the repo and the build image.
 *
 * ffmpeg is installed in the production runtime image (see Dockerfile). In local
 * dev without ffmpeg, `compressVideo` throws (ENOENT) and the upload endpoint
 * falls back to storing the original bytes.
 *
 * Server-only.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const VIDEO_CRF = process.env.ALBUM_VIDEO_CRF || '28';
const VIDEO_MAX_DIM = parseInt(process.env.ALBUM_VIDEO_MAX_DIM || '1280', 10);
const VIDEO_AUDIO_BITRATE = process.env.ALBUM_VIDEO_AUDIO_BITRATE || '128k';

export type CompressedVideo = {
  /** Compressed MP4 bytes. */
  buffer: Buffer;
  /** File extension including the dot. */
  ext: string;
  contentType: string;
  /** Raw poster frame (JPEG bytes) for thumbnail generation, or null. */
  poster: Buffer | null;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-2000); // ffmpeg is chatty — keep the tail
    });
    proc.on('error', reject); // e.g. ENOENT when ffmpeg isn't installed (dev)
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

/**
 * Compress an arbitrary video buffer to H.264/AAC MP4 + grab a poster frame.
 * Throws if ffmpeg is missing or the encode fails — callers should fall back to
 * the original bytes.
 */
export async function compressVideo(input: Buffer): Promise<CompressedVideo> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'album-vid-'));
  const inPath = path.join(dir, 'in');
  const outPath = path.join(dir, 'out.mp4');
  const posterPath = path.join(dir, 'poster.jpg');
  try {
    await writeFile(inPath, input);
    // Fit within a VIDEO_MAX_DIM box, preserve aspect, keep dims even (H.264).
    const scale = `scale=w=${VIDEO_MAX_DIM}:h=${VIDEO_MAX_DIM}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
    await runFfmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inPath,
      '-vf', scale,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', VIDEO_CRF,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', VIDEO_AUDIO_BITRATE,
      '-movflags', '+faststart',
      '-y',
      outPath,
    ]);
    const buffer = await readFile(outPath);

    // Best-effort poster frame from ~1s in (or the first frame for short clips).
    let poster: Buffer | null = null;
    try {
      await runFfmpeg([
        '-hide_banner',
        '-loglevel', 'error',
        '-ss', '1',
        '-i', outPath,
        '-frames:v', '1',
        '-q:v', '3',
        '-y',
        posterPath,
      ]);
      poster = await readFile(posterPath);
    } catch {
      try {
        await runFfmpeg([
          '-hide_banner', '-loglevel', 'error',
          '-i', outPath, '-frames:v', '1', '-q:v', '3', '-y', posterPath,
        ]);
        poster = await readFile(posterPath);
      } catch {
        poster = null;
      }
    }

    return { buffer, ext: '.mp4', contentType: 'video/mp4', poster };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
