/**
 * Server-side audio transcoding via ffmpeg.
 *
 * slice-it stores user-uploaded songs in object storage / on disk; raw uploads
 * (especially WAV/FLAC) are large. We re-encode to AAC in an MP4 container at a
 * sane bitrate — broadly playable (Chrome/Firefox/Safari), much smaller than
 * lossless, and `+faststart` keeps the moov atom up front so HTTP range requests
 * (audio seeking) still work.
 *
 * ffmpeg is installed in the production runtime image. In local dev without
 * ffmpeg, `transcodeAudioToAac` throws and callers fall back to the original
 * bytes — so uploads still work, just uncompressed.
 *
 * Server-only.
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const AUDIO_BITRATE = process.env.SLICE_AUDIO_BITRATE || "128k";

export type TranscodedAudio = {
  buffer: Buffer;
  /** File extension including the dot, e.g. ".m4a". */
  ext: string;
  contentType: string;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      // Keep only the tail — ffmpeg is chatty.
      stderr = (stderr + d.toString()).slice(-2000);
    });
    proc.on("error", reject); // e.g. ENOENT when ffmpeg isn't installed (dev)
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

/**
 * Transcode an arbitrary audio buffer to AAC/.m4a. Throws if ffmpeg is missing
 * or the encode fails — callers should fall back to the original bytes.
 */
export async function transcodeAudioToAac(input: Buffer): Promise<TranscodedAudio> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sliceit-"));
  const inPath = path.join(dir, "in");
  const outPath = path.join(dir, "out.m4a");
  try {
    await writeFile(inPath, input);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel", "error",
      "-i", inPath,
      "-vn", // drop any embedded cover art / video stream
      "-c:a", "aac",
      "-b:a", AUDIO_BITRATE,
      "-movflags", "+faststart",
      "-y",
      outPath,
    ]);
    const buffer = await readFile(outPath);
    return { buffer, ext: ".m4a", contentType: "audio/mp4" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".webm": "audio/webm",
};

/** Best-effort audio content type from a filename, defaulting to audio/mpeg. */
export function audioContentTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return AUDIO_CONTENT_TYPES[ext] ?? "audio/mpeg";
}
