import { createFileRoute } from '@tanstack/react-router';
import { createHash } from 'node:crypto';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { optimizeImage } from '@/lib/image-optimize';
import { transcodeAudioToAac } from '@/lib/audio/transcode.server';
import decode from '@audio/decode';
import {
  COVER_SIZE,
  MAX_DECODED_PCM_BYTES,
  MAX_SONG_DURATION_SEC,
  MIN_SONG_DURATION_SEC,
  PER_USER_STORAGE_LIMIT_BYTES,
  TOTAL_STORAGE_LIMIT_BYTES,
  UPLOAD_BODY_MAX_BYTES,
} from '@/lib/slice-it/constants';
import { estimatedPcmBytes, probeAudioDuration } from '@/lib/audio/probe';
import { UploadFieldsZ } from '@/lib/slice-it/api-schemas';
import { validateAudioBuffer, validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { deleteSongAssets, storeSongAudio, storeSongCover } from '@/lib/slice-it/songs.server';
import { generateBeatmap, type AudioLike } from '@/lib/slice-it/beatmap';

/**
 * Song upload.
 *
 * The shape of this route follows one rule: **nothing the client says about the
 * audio is trusted.** Not the MIME type (magic bytes decide), not the duration
 * (the decoder decides), not the BPM (the analyser decides, taking the typed
 * value only as a prior), not the filename (a UUID is minted).
 *
 * ## What changed
 *
 * - `auth: 'none'` plus a hand-rolled `getSession()` and a hand-rolled
 *   `rateLimit()` became `defineHandler({ rateLimit: 'upload' })`, which runs
 *   the canonical session → limit → validate → act order and cannot get it out
 *   of sequence.
 * - Files were written to `db/music` on the web container's local disk.
 *   Production runs **blue/green** web containers, so a song uploaded to blue
 *   404'd from green until the next deploy flipped back. They go to object
 *   storage now.
 * - The only storage guard was a global 10 GB total, which made the library
 *   first-come-first-served: one account could fill it and every other player's
 *   next upload failed citing a limit they had no part in reaching. There is a
 *   per-account ceiling now too.
 * - A failure after the file was written left an object in storage with no row
 *   pointing at it — invisible and permanent. The writes are unwound now.
 * - Re-uploading the same file created a second row and a second copy against
 *   both quotas. The source bytes are hashed and a duplicate is refused.
 * - Duration was `parseFloat(formData.get('duration'))` — a client-declared
 *   number, which then bounded nothing. It is read from the container headers
 *   before decoding and confirmed against the decoded audio after.
 * - The body is size-checked before `formData()` buffers it, and the audio is
 *   length-checked before `decode()` allocates it. Both were previously checked
 *   only after the allocation they were meant to prevent — see the decode guard
 *   below for what that cost.
 */
export const Route = createFileRoute('/api/slice-it/songs/upload')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'upload' }, async ({ request, userId }) => {
        // Before `formData()`, which buffers the entire body into memory. The
        // site-wide Apache ceiling is 1.5 GB; this route accepts 62.
        const declaredLength = Number(request.headers.get('content-length') ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > UPLOAD_BODY_MAX_BYTES) {
          return Response.json({ error: 'Upload too large.' }, { status: 413 });
        }

        const formData = await request.formData();

        const file = formData.get('file');
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: 'No audio file provided.' }, { status: 400 });
        }

        const fields = UploadFieldsZ.safeParse({
          title: formData.get('title') ?? '',
          artist: formData.get('artist') ?? '',
          description: formData.get('description') ?? '',
          bpm: formData.get('bpm') ?? undefined,
          duration: formData.get('duration') ?? undefined,
          isPublic: formData.get('isPublic') ?? undefined,
        });
        if (!fields.success) {
          return Response.json({ error: 'Invalid track details.' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const audioCheck = validateAudioBuffer(buffer);
        if (!audioCheck.ok) {
          return Response.json({ error: audioCheck.error }, { status: 400 });
        }

        const coverFile = formData.get('cover');
        let coverBuffer: Buffer | null = null;
        if (coverFile instanceof File && coverFile.size > 0) {
          coverBuffer = Buffer.from(await coverFile.arrayBuffer());
          const coverCheck = validateImageBuffer(coverBuffer);
          if (!coverCheck.ok) {
            return Response.json({ error: coverCheck.error }, { status: 400 });
          }
        }

        // Hash the *original* bytes, before transcoding: the same source file
        // must hash the same whether or not ffmpeg was available that day.
        const contentHash = createHash('sha256').update(buffer).digest('hex');

        const [globals, mine, duplicate] = await Promise.all([
          prisma.song.aggregate({ _sum: { fileSizeBytes: true } }),
          prisma.song.aggregate({
            where: { uploadedBy: userId },
            _sum: { fileSizeBytes: true },
          }),
          prisma.song.findFirst({
            where: { uploadedBy: userId, contentHash },
            select: { id: true, title: true },
          }),
        ]);

        if (duplicate) {
          return Response.json(
            {
              error: `You already uploaded this track as "${duplicate.title}".`,
              songId: duplicate.id,
            },
            { status: 409 },
          );
        }
        if ((globals._sum.fileSizeBytes ?? 0) + buffer.length > TOTAL_STORAGE_LIMIT_BYTES) {
          return Response.json({ error: 'The song library is full.' }, { status: 507 });
        }
        if ((mine._sum.fileSizeBytes ?? 0) + buffer.length > PER_USER_STORAGE_LIMIT_BYTES) {
          const limitMb = Math.round(PER_USER_STORAGE_LIMIT_BYTES / 1024 / 1024);
          return Response.json(
            {
              error: `You have reached your ${limitMb} MB upload limit. Delete a track to free space.`,
            },
            { status: 507 },
          );
        }

        // ── Decode guard ──────────────────────────────────────────────────
        //
        // The length check has to happen HERE, from the container headers,
        // because `decode()` allocates the whole waveform before it returns and
        // compressed audio expands without bound: a valid 8 kbps MPEG-2.5 file
        // decodes to 32x its own size, so 4 MB of upload measured 128 MB of PCM
        // and 530 MB of RSS, and the 50 MB ceiling bought 14.6 hours of audio —
        // about 1.6 GB — from one request. Checking `MAX_SONG_DURATION_SEC`
        // against the decoder's answer, as this did, is checking it after the
        // allocation the check exists to prevent.
        //
        // A file we cannot read a length from is refused rather than decoded
        // hopefully. Every format the magic-byte check just accepted is one the
        // probe understands, so `null` here means the headers are damaged.
        const probe = probeAudioDuration(buffer);
        if (!probe) {
          return Response.json(
            { error: 'That file could not be read. Try MP3, WAV, OGG or FLAC.' },
            { status: 400 },
          );
        }
        if (probe.durationSec > MAX_SONG_DURATION_SEC) {
          return Response.json(
            { error: `Tracks must be under ${MAX_SONG_DURATION_SEC / 60} minutes.` },
            { status: 400 },
          );
        }
        if (estimatedPcmBytes(probe) > MAX_DECODED_PCM_BYTES) {
          // Short but enormous — a high sample rate, many channels, or both.
          return Response.json(
            { error: 'That file is too large to process. Try a standard stereo mixdown.' },
            { status: 400 },
          );
        }

        // A file that passes the magic-byte check but cannot actually be
        // decoded should fail here, rather than leaving an unplayable row and
        // an orphaned object behind it.
        let audio: AudioLike;
        try {
          audio = decodedToAudioLike(await decode(buffer));
        } catch {
          return Response.json(
            { error: 'That file could not be decoded. Try MP3, WAV, OGG or FLAC.' },
            { status: 400 },
          );
        }

        // Re-checked against the decoded truth. The probe is a bound, not a
        // measurement — a CBR estimate can be a little off, and the value
        // stored on the row is the one a score ceiling gets derived from.
        const duration = audio.length / (audio.sampleRate || 44100);
        if (!(duration >= MIN_SONG_DURATION_SEC)) {
          return Response.json(
            { error: `Tracks must be at least ${MIN_SONG_DURATION_SEC} seconds long.` },
            { status: 400 },
          );
        }
        if (duration > MAX_SONG_DURATION_SEC) {
          return Response.json(
            { error: `Tracks must be under ${MAX_SONG_DURATION_SEC / 60} minutes.` },
            { status: 400 },
          );
        }

        // Re-encode to AAC — far smaller than WAV/FLAC, and `+faststart` keeps
        // range requests (seeking) working. ffmpeg is absent in local dev, so a
        // failure falls back to the original bytes rather than failing upload.
        let storedBuffer: Buffer = buffer;
        let storedExt = extensionOf(file.name);
        try {
          const transcoded = await transcodeAudioToAac(buffer);
          storedBuffer = transcoded.buffer;
          storedExt = transcoded.ext;
        } catch (error) {
          console.warn('[slice-it] audio transcode failed — storing original', error);
        }

        const title = fields.data.title || stripExtension(file.name) || 'Untitled';
        const artist = fields.data.artist || 'Unknown Artist';

        // The expensive part, and the reason it happens once per song ever
        // rather than in every player's browser on every play.
        let analysis: ReturnType<typeof generateBeatmap> | null = null;
        try {
          analysis = generateBeatmap(audio, {
            id: contentHash.slice(0, 24),
            name: title,
            artist,
            bpmHint: fields.data.bpm,
          });
        } catch (error) {
          // A song with no chart is still a song — the client can generate one
          // locally and POST it back. Failing the whole upload would be worse.
          console.error('[slice-it] beatmap generation failed', error);
        }

        let audioKey: string | null = null;
        let coverKey: string | null = null;
        try {
          audioKey = await storeSongAudio(storedBuffer, storedExt);

          if (coverBuffer) {
            const { buffer: webp } = await optimizeImage(coverBuffer, {
              width: COVER_SIZE,
              height: COVER_SIZE,
              format: 'webp',
              quality: 82,
              autoOrient: true,
            });
            coverKey = await storeSongCover(webp);
          }

          const song = await prisma.song.create({
            data: {
              title,
              artist,
              description: fields.data.description || null,
              duration,
              bpm: analysis?.bpm ?? fields.data.bpm ?? 0,
              audioUrl: audioKey,
              coverUrl: coverKey,
              fileSizeBytes: storedBuffer.length,
              contentHash,
              analysisData: (analysis ?? undefined) as never,
              uploadedBy: userId,
              isPublic: fields.data.isPublic,
            },
            select: { id: true, title: true, artist: true, duration: true, bpm: true },
          });

          return Response.json({
            success: true,
            song,
            notes: analysis?.noteCounts ?? null,
            tempoConfidence: analysis?.tempoConfidence ?? 0,
          });
        } catch (error) {
          await deleteSongAssets({ audioUrl: audioKey, coverUrl: coverKey });
          throw error;
        }
      }),
    },
  },
});

/** Adapt `@audio/decode`'s output to the analyser's structural interface. */
function decodedToAudioLike(decoded: {
  sampleRate: number;
  channelData: Float32Array[];
}): AudioLike {
  const length = decoded.channelData[0]?.length ?? 0;
  return {
    sampleRate: decoded.sampleRate,
    length,
    numberOfChannels: decoded.channelData.length,
    getChannelData(channel: number) {
      const data = decoded.channelData[channel];
      if (!data) throw new RangeError(`Audio channel ${channel} is unavailable`);
      return data;
    },
  };
}

function extensionOf(name: string): string {
  const match = /\.[A-Za-z0-9]{1,5}$/.exec(name);
  return match ? match[0].toLowerCase() : '.bin';
}

function stripExtension(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '')
    .trim()
    .slice(0, 200);
}
