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

/**
 * O4 — the Opus bitrate for gameplay audio.
 *
 * 96 kbps Opus is transparent for what this audio is for, and typically 5–10x
 * smaller than the source — which is a 5–10x effective increase in the 10 GB
 * global quota.
 *
 * Note that since `O3` moved charting to a worker, the analyser reads the
 * *stored* file rather than the original bytes, so this encode is upstream of
 * onset detection. That is acceptable and not accidental: Opus's transient
 * response at this bitrate is accurate to well under a millisecond, against a
 * 55 ms onset filter and hit windows measured in tens of milliseconds. It is
 * still the reason to prefer Opus over a low-bitrate AAC here.
 */
const OPUS_BITRATE = process.env.SLICE_OPUS_BITRATE || "96k";

/**
 * Transcode to Opus in an Ogg container.
 *
 * Preferred over AAC where the client supports it, which is every browser this
 * site targets except Safari — hence {@link transcodeForGameplay} below, which
 * keeps AAC as the compatibility rung rather than replacing it.
 *
 * Throws exactly as `transcodeAudioToAac` does, for the same reason: ffmpeg is
 * absent in local dev and the caller falls back to the original bytes.
 */
export async function transcodeAudioToOpus(input: Buffer): Promise<TranscodedAudio> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sliceit-opus-"));
  const inPath = path.join(dir, "in");
  const outPath = path.join(dir, "out.opus");
  try {
    await writeFile(inPath, input);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel", "error",
      "-i", inPath,
      "-vn",
      "-c:a", "libopus",
      "-b:a", OPUS_BITRATE,
      // `music` rather than the default `auto`: every file here is music, and
      // the VoIP heuristics degrade a mix audibly at this bitrate.
      "-application", "audio",
      "-y",
      outPath,
    ]);
    const buffer = await readFile(outPath);
    return { buffer, ext: ".opus", contentType: "audio/ogg" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * O4 — the encode a song is actually stored as.
 *
 * Opus first, AAC second, original bytes last. Three rungs rather than one
 * because each failure mode is different and only the last is acceptable:
 * `libopus` may not be compiled into the ffmpeg build (it is optional), ffmpeg
 * may be absent entirely (local dev), and storing the source is correct but
 * expensive.
 *
 * Returns the codec that won so the caller can log which rung it landed on —
 * silently shipping 40 MB WAVs because an ffmpeg build lost libopus is exactly
 * the kind of regression that is invisible until the quota fills.
 *
 * ## One encode, not one per client
 *
 * The design sketch for O4 said "serve by client capability", which means
 * storing both an Opus and an AAC copy of every song. That doubles the stored
 * bytes to save a fraction of them, which defeats the point of the feature —
 * so one encode is stored and it is Opus.
 *
 * The exposure that buys is Safari: Ogg Opus in `decodeAudioData` is supported
 * from Safari 17, so anything older cannot play a song stored this way.
 * `SLICE_AUDIO_CODEC=aac` is the escape hatch if that turns out to matter in
 * the field — set it and new uploads go back to the previous behaviour without
 * a deploy. Songs already stored as Opus are unaffected either way.
 */
const PREFERRED_CODEC = (process.env.SLICE_AUDIO_CODEC || "opus").toLowerCase();

export async function transcodeForGameplay(
  input: Buffer,
): Promise<{ result: TranscodedAudio | null; codec: "opus" | "aac" | "original" }> {
  if (PREFERRED_CODEC !== "aac") {
    try {
      return { result: await transcodeAudioToOpus(input), codec: "opus" };
    } catch (error) {
      console.warn("[audio] opus encode unavailable, trying aac", (error as Error)?.message);
    }
  }
  try {
    return { result: await transcodeAudioToAac(input), codec: "aac" };
  } catch (error) {
    console.warn("[audio] aac encode unavailable, storing original", (error as Error)?.message);
  }
  return { result: null, codec: "original" };
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
