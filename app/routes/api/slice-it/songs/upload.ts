import { createFileRoute } from '@tanstack/react-router';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { optimizeImage } from '@/lib/image-optimize';
import { transcodeForGameplay } from '@/lib/audio/transcode.server';
import decode from '@audio/decode';
import {
  COVER_SIZE,
  MAX_DECODED_PCM_BYTES,
  MAX_SONG_DURATION_SEC,
  MIN_SONG_DURATION_SEC,
  PER_USER_STORAGE_LIMIT_BYTES,
  SONG_TITLE_MAX,
  TOTAL_STORAGE_LIMIT_BYTES,
  UPLOAD_BODY_MAX_BYTES,
} from '@/lib/slice-it/constants';
import { estimatedPcmBytes, probeAudioDuration } from '@/lib/audio/probe';
import { UploadFieldsZ } from '@/lib/slice-it/api-schemas';
import { validateAudioBuffer, validateImageBuffer } from '@/lib/slice-it/upload-validation';
import { deleteSongAssets, storeSongAudio, storeSongCover } from '@/lib/slice-it/songs.server';
import { artistKeyOf } from '@/lib/slice-it/artist';
import { createAlbumPack } from '@/lib/slice-it/packs.server';
import { decodedToAudioLike, type generateBeatmap } from '@/lib/slice-it/beatmap';
import { enqueueAnalysis } from '@/lib/slice-it/analysis-queue.server';
import { recordSongUploaded } from '@/lib/slice-it/progression.server';

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
 *
 * ## What changed (L16 — album upload)
 *
 * The route accepted exactly one `file`. Uploading an album meant twelve
 * requests, twelve rows with a hand-retyped `album` string, and no object
 * anywhere that said those twelve were one thing.
 *
 * It now accepts **many** `file` entries plus an `album` field, and when there
 * is more than one track it creates a `ChartPack` of `kind: 'album'` **in the
 * same transaction as the songs**. That is the whole design constraint: a pack
 * created by a follow-up call is a pack that does not exist when the upload
 * fails half way, and an album upload that dies on track 9 must leave either a
 * complete album or nothing — never eight songs and no album, and never an
 * album pointing at eight songs and a hole.
 *
 * Everything expensive — decode, analysis, transcode, object writes — happens
 * **before** the transaction opens, per track. A `$transaction` that holds a
 * database connection open across a minute of ffmpeg is a connection-pool
 * outage wearing an atomicity costume; the transaction here is a handful of
 * INSERTs and nothing else. Object writes are unwound by hand on failure,
 * because storage is not transactional and pretending otherwise is how the
 * orphaned-object bug above happened the first time.
 */

/**
 * How many tracks one album upload may carry.
 *
 * A bound, because every track costs a decode and an analysis pass inside one
 * request. The site-wide 62 MB body ceiling already bounds the bytes; this
 * bounds the CPU.
 */
const MAX_ALBUM_TRACKS = 16;

const AlbumFieldsZ = z.object({
  album: z.string().trim().max(200).optional(),
});

/** One track, fully prepared and stored, waiting only to be written as a row. */
interface PreparedTrack {
  title: string;
  artist: string;
  duration: number;
  bpm: number;
  contentHash: string;
  audioKey: string;
  fileSizeBytes: number;
  analysis: ReturnType<typeof generateBeatmap> | null;
  densityStrip: number[] | null;
}

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

        // `getAll` rather than `get`: a single-track upload is the one-element
        // case of an album upload, not a different code path. One pipeline
        // means the album path cannot drift away from the one that is
        // exercised on every upload.
        const files = formData
          .getAll('file')
          .filter((f): f is File => f instanceof File && f.size > 0);
        if (files.length === 0) {
          return Response.json({ error: 'No audio file provided.' }, { status: 400 });
        }
        if (files.length > MAX_ALBUM_TRACKS) {
          return Response.json(
            { error: `An album upload can carry at most ${MAX_ALBUM_TRACKS} tracks.` },
            { status: 400 },
          );
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
        const albumFields = AlbumFieldsZ.safeParse({ album: formData.get('album') ?? undefined });
        if (!albumFields.success) {
          return Response.json({ error: 'Invalid album details.' }, { status: 400 });
        }
        const album = albumFields.data.album || null;
        const isAlbum = files.length > 1;
        if (isAlbum && !album) {
          return Response.json(
            { error: 'An album upload needs an album title.' },
            { status: 400 },
          );
        }

        const artist = fields.data.artist || 'Unknown Artist';

        const coverFile = formData.get('cover');
        let coverBuffer: Buffer | null = null;
        if (coverFile instanceof File && coverFile.size > 0) {
          coverBuffer = Buffer.from(await coverFile.arrayBuffer());
          const coverCheck = validateImageBuffer(coverBuffer);
          if (!coverCheck.ok) {
            return Response.json({ error: coverCheck.error }, { status: 400 });
          }
        }

        const [globals, mine] = await Promise.all([
          prisma.song.aggregate({ _sum: { fileSizeBytes: true } }),
          prisma.song.aggregate({
            where: { uploadedBy: userId },
            _sum: { fileSizeBytes: true },
          }),
        ]);
        let globalUsed = globals._sum.fileSizeBytes ?? 0;
        let mineUsed = mine._sum.fileSizeBytes ?? 0;

        const prepared: PreparedTrack[] = [];
        /** Every object written so far, so a late failure can unwind all of them. */
        const written: { audioUrl: string | null; coverUrl: string | null }[] = [];
        const unwind = async () => {
          for (const asset of written) await deleteSongAssets(asset);
        };
        /** Hashes seen in THIS request — the same file twice in one album. */
        const batchHashes = new Set<string>();

        let coverKey: string | null = null;

        try {
          if (coverBuffer) {
            const { buffer: webp } = await optimizeImage(coverBuffer, {
              width: COVER_SIZE,
              height: COVER_SIZE,
              format: 'webp',
              quality: 82,
              autoOrient: true,
            });
            coverKey = await storeSongCover(webp);
            written.push({ audioUrl: null, coverUrl: coverKey });
          }

          for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const audioCheck = validateAudioBuffer(buffer);
            if (!audioCheck.ok) {
              await unwind();
              return Response.json(
                { error: `${file.name}: ${audioCheck.error}` },
                { status: 400 },
              );
            }

            // Hash the *original* bytes, before transcoding: the same source
            // file must hash the same whether or not ffmpeg was available.
            const contentHash = createHash('sha256').update(buffer).digest('hex');
            if (batchHashes.has(contentHash)) {
              await unwind();
              return Response.json(
                { error: `${file.name} appears twice in this upload.` },
                { status: 409 },
              );
            }
            batchHashes.add(contentHash);

            const duplicate = await prisma.song.findFirst({
              where: { uploadedBy: userId, contentHash },
              select: { id: true, title: true },
            });
            if (duplicate) {
              await unwind();
              return Response.json(
                {
                  error: `You already uploaded this track as "${duplicate.title}".`,
                  songId: duplicate.id,
                },
                { status: 409 },
              );
            }

            // Quotas accumulate across the batch. Checking each track against
            // the totals as they were when the request started would let a
            // 16-track album walk straight past a limit it exceeds by track 3.
            if (globalUsed + buffer.length > TOTAL_STORAGE_LIMIT_BYTES) {
              await unwind();
              return Response.json({ error: 'The song library is full.' }, { status: 507 });
            }
            if (mineUsed + buffer.length > PER_USER_STORAGE_LIMIT_BYTES) {
              await unwind();
              const limitMb = Math.round(PER_USER_STORAGE_LIMIT_BYTES / 1024 / 1024);
              return Response.json(
                {
                  error: `You have reached your ${limitMb} MB upload limit. Delete a track to free space.`,
                },
                { status: 507 },
              );
            }

            // ── Decode guard ────────────────────────────────────────────
            //
            // The length check has to happen HERE, from the container headers,
            // because `decode()` allocates the whole waveform before it returns
            // and compressed audio expands without bound: a valid 8 kbps
            // MPEG-2.5 file decodes to 32x its own size, so 4 MB of upload
            // measured 128 MB of PCM and 530 MB of RSS, and the 50 MB ceiling
            // bought 14.6 hours of audio — about 1.6 GB — from one request.
            // Checking `MAX_SONG_DURATION_SEC` against the decoder's answer, as
            // this did, is checking it after the allocation the check exists to
            // prevent.
            //
            // A file we cannot read a length from is refused rather than
            // decoded hopefully. Every format the magic-byte check just
            // accepted is one the probe understands, so `null` here means the
            // headers are damaged.
            const probe = probeAudioDuration(buffer);
            if (!probe) {
              await unwind();
              return Response.json(
                { error: `${file.name} could not be read. Try MP3, WAV, OGG or FLAC.` },
                { status: 400 },
              );
            }
            if (probe.durationSec > MAX_SONG_DURATION_SEC) {
              await unwind();
              return Response.json(
                { error: `Tracks must be under ${MAX_SONG_DURATION_SEC / 60} minutes.` },
                { status: 400 },
              );
            }
            if (estimatedPcmBytes(probe) > MAX_DECODED_PCM_BYTES) {
              // Short but enormous — a high sample rate, many channels, or both.
              await unwind();
              return Response.json(
                { error: `${file.name} is too large to process. Try a standard stereo mixdown.` },
                { status: 400 },
              );
            }

            // A file that passes the magic-byte check but cannot actually be
            // decoded should fail here, rather than leaving an unplayable row
            // and an orphaned object behind it.
            let audio: AudioLike;
            try {
              audio = decodedToAudioLike(await decode(buffer));
            } catch {
              await unwind();
              return Response.json(
                { error: `${file.name} could not be decoded. Try MP3, WAV, OGG or FLAC.` },
                { status: 400 },
              );
            }

            // Re-checked against the decoded truth. The probe is a bound, not a
            // measurement — a CBR estimate can be a little off, and the value
            // stored on the row is the one a score ceiling gets derived from.
            const duration = audio.length / (audio.sampleRate || 44100);
            if (!(duration >= MIN_SONG_DURATION_SEC)) {
              await unwind();
              return Response.json(
                { error: `Tracks must be at least ${MIN_SONG_DURATION_SEC} seconds long.` },
                { status: 400 },
              );
            }
            if (duration > MAX_SONG_DURATION_SEC) {
              await unwind();
              return Response.json(
                { error: `Tracks must be under ${MAX_SONG_DURATION_SEC / 60} minutes.` },
                { status: 400 },
              );
            }

            // O4 — re-encode before storing. Opus at 96 kbps first (typically
            // 5–10x smaller than the source, which is a 5–10x effective
            // increase in the 10 GB global quota), AAC as the compatibility
            // rung, original bytes only if ffmpeg is absent entirely — which is
            // local dev, where an upload should still work.
            //
            // O3's worker charts from the stored file, so this encode is
            // upstream of onset detection — see the note in
            // `transcode.server.ts`. Opus's transient timing at 96 kbps is
            // accurate to well under a millisecond against a 55 ms onset
            // filter, which is why Opus and not a low-bitrate AAC.
            let storedBuffer: Buffer = buffer;
            let storedExt = extensionOf(file.name);
            const encoded = await transcodeForGameplay(buffer);
            if (encoded.result) {
              storedBuffer = encoded.result.buffer;
              storedExt = encoded.result.ext;
            }

            // A single upload names its own track; an album takes each track's
            // name from its filename, because there is one title field and
            // twelve tracks.
            const title =
              (isAlbum ? '' : fields.data.title) || stripExtension(file.name) || 'Untitled';

            // O3 — charting is a queued job now, so nothing is generated here.
            // It is the expensive part (seconds of CPU, multiplied by the track
            // count on an album) and nothing in this response needs it: the row
            // is created `pending` and the library shows "Charting…" rather
            // than hiding it, because a song that vanishes for two minutes
            // after upload reads as a failed upload.
            //
            // The `decode()` above deliberately did NOT move. It is this
            // route's validation — the probe gives a bound on duration and the
            // decode gives the measurement, and the stored duration is what a
            // score ceiling is derived from. Handing the ceiling a looser
            // number to save a second of request time is the wrong trade.
            //
            // `bpm` and `densityStrip` are therefore the uploader's typed value
            // and null; the worker overwrites both from the real analysis.
            const audioKey = await storeSongAudio(storedBuffer, storedExt);
            written.push({ audioUrl: audioKey, coverUrl: null });

            globalUsed += storedBuffer.length;
            mineUsed += storedBuffer.length;

            prepared.push({
              title: title.slice(0, SONG_TITLE_MAX),
              artist,
              duration,
              bpm: fields.data.bpm ?? 0,
              contentHash,
              audioKey,
              fileSizeBytes: storedBuffer.length,
              analysis: null,
              densityStrip: null,
            });
          }

          /* ── The only database writes, and they are one unit ────────── */
          const result = await prisma.$transaction(async (tx) => {
            const songs = [];
            for (const track of prepared) {
              const song = await tx.song.create({
                data: {
                  title: track.title,
                  artist: track.artist,
                  // L15 — computed at write time, never at read time. A null
                  // key here is an artist tag that normalises to nothing.
                  artistKey: artistKeyOf(track.artist),
                  album,
                  description: fields.data.description || null,
                  duration: track.duration,
                  bpm: track.bpm,
                  audioUrl: track.audioKey,
                  coverUrl: coverKey,
                  fileSizeBytes: track.fileSizeBytes,
                  contentHash: track.contentHash,
                  analysisData: (track.analysis ?? undefined) as never,
                  densityStrip: track.densityStrip ?? undefined,
                  // O3 — the worker moves this to 'ready' or 'failed'.
                  analysisState: 'pending',
                  uploadedBy: userId,
                  isPublic: fields.data.isPublic,
                },
                select: { id: true, title: true, artist: true, duration: true, bpm: true },
              });
              songs.push(song);
            }

            // The pack and the songs commit together or not at all — see the
            // module doc. `album` is non-null here by the guard above.
            const pack = isAlbum
              ? await createAlbumPack(
                  tx,
                  { album: album as string, artist, coverUrl: coverKey },
                  songs.map((s) => s.id),
                  userId,
                )
              : null;

            return { songs, pack };
          });

          // X1 — "DJ". Best-effort and after the transaction commits: an
          // achievement-grant hiccup must not turn a successful upload into a
          // 500 and lose the song that was just written and paid for in quota.
          await recordSongUploaded(userId);

          // O3 — queued after the commit, so a job can never reference a row
          // that a rolled-back transaction never created. `enqueueAnalysis`
          // runs the work inline when there is no queue, which is why this is
          // awaited rather than fire-and-forget: without a worker, this is
          // where the two seconds went, and the upload still has to produce a
          // chart before anyone plays it.
          for (const song of result.songs) {
            await enqueueAnalysis({ songId: song.id, bpmHint: fields.data.bpm }).catch((error) => {
              // Both paths already failed if we get here. The song exists and
              // is playable — the client generates a chart locally and POSTs it
              // back — so this is a log, not a 500.
              console.error('[slice-it] could not chart', song.id, error);
            });
          }

          return Response.json({
            success: true,
            // The single-track response shape is unchanged — `SongLibrary.tsx`
            // reads `song` and `notes` and predates the album path.
            song: result.songs[0],
            songs: result.songs,
            packId: result.pack?.id ?? null,
            // O3 — null now, because charting has not happened yet. The client
            // shows the "Charting…" state instead of a note count.
            notes: null,
            tempoConfidence: 0,
            charting: true,
          });
        } catch (error) {
          await unwind();
          throw error;
        }
      }),
    },
  },
});

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
