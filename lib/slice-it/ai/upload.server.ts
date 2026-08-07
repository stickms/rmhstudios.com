/**
 * Slice It — upload metadata cleanup and blurb. Server-only. (Features 8 and 9.)
 *
 * The library's real quality problem is not missing songs, it is rows that read
 * `04 - track (1).mp3` with an empty artist. Uploaders skip the fields because
 * typing them is friction at the exact moment they want to play, and every
 * skipped field is a song that search can never find.
 *
 * ## The one rule that matters here
 *
 * **An unreadable field comes back empty, never guessed.** A blank artist is a
 * gap the uploader fills in; a guessed artist is a false credit attached to a
 * real person's name, published on a public library card, that the uploader
 * accepts without reading because it looked plausible. Those are not two
 * degrees of the same error. The prompt says so, {@link suggestMetadata} strips
 * anything that looks invented, and the UI presents every field as a
 * pre-filled suggestion the uploader confirms rather than a value it applies.
 *
 * The blurb (feature 9) is written from the chart statistics — length, note
 * count, density — and never from the music, because DeepSeek has not heard the
 * track. A description that praised a melody nobody played would be the single
 * most obvious tell that the library's copy is machine-written.
 */

import { SLICE_IT_METADATA } from '@/lib/ai/prompts';
import { attempt } from './run.server';
import { metadataSuggestionSchema, type MetadataSuggestion } from './types';
import { chartFactsToText, type ChartFacts } from './facts';
import { SONG_ARTIST_MAX, SONG_DESCRIPTION_MAX, SONG_TITLE_MAX } from '../constants';

/**
 * Filename fragments that are never part of a title.
 *
 * Applied before the model sees the name, not after: stripping them here means
 * the model is reading `Artist - Title` rather than
 * `Artist - Title (Official Video) [320kbps]`, and a cleaner input is a better
 * extraction than any amount of instruction about what to ignore.
 */
const NOISE = [
  /\.[a-z0-9]{2,4}$/i, // extension
  /\b\d{2,4}\s?kbps\b/gi,
  /\b(official\s+)?(music\s+)?video\b/gi,
  /\b(official\s+)?(lyrics?|audio|visualizer|hd|hq|4k|1080p|720p)\b/gi,
  /\b(free\s+)?download\b/gi,
  /\bfull\s+album\b/gi,
  /[[(]\s*[\])]/g, // brackets emptied by the rules above
];

/** Strip the noise a downloaded filename accumulates. */
export function cleanFilename(filename: string): string {
  let out = filename;
  for (const pattern of NOISE) out = out.replace(pattern, ' ');
  return (
    out
      .replace(/[_+]+/g, ' ')
      // A leading track number, with or without a separator.
      .replace(/^\s*\d{1,3}\s*[-.)]\s*/, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/**
 * Suggest metadata for an upload.
 *
 * Returns `null` when AI is unavailable — the upload form's fields are already
 * there and already work, which is the whole degraded path.
 *
 * Nothing here is written to the database. The caller renders the suggestions
 * into the form and the uploader submits them, so a wrong guess costs a
 * keystroke rather than becoming the library's record of a track.
 */
export async function suggestMetadata(
  input: {
    filename: string;
    /** What the uploader has typed so far. Respected, never overwritten. */
    typed?: { title?: string; artist?: string; album?: string };
    facts: ChartFacts | null;
    durationSec: number;
  },
  opts: { userId?: string | null } = {},
): Promise<MetadataSuggestion | null> {
  const cleaned = cleanFilename(input.filename);

  const lines = [
    `filename: ${input.filename}`,
    `filename with noise stripped: ${cleaned}`,
    `title typed so far: ${input.typed?.title || '(blank)'}`,
    `artist typed so far: ${input.typed?.artist || '(blank)'}`,
    `album typed so far: ${input.typed?.album || '(blank)'}`,
  ];
  if (input.facts) {
    lines.push('', 'the generated chart:', chartFactsToText(input.facts));
  } else {
    lines.push(`length: ${Math.round(input.durationSec)} seconds (no chart generated yet)`);
  }

  const suggestion = await attempt(
    SLICE_IT_METADATA,
    metadataSuggestionSchema,
    lines.join('\n'),
    opts,
  );
  if (!suggestion) return null;

  return {
    // Never overwrite what the uploader typed. They know the track; the model
    // is reading a filename.
    title: input.typed?.title || clamp(suggestion.title, SONG_TITLE_MAX),
    artist: input.typed?.artist || clamp(suggestion.artist, SONG_ARTIST_MAX),
    album: input.typed?.album || clamp(suggestion.album, SONG_ARTIST_MAX),
    description: clamp(suggestion.description, SONG_DESCRIPTION_MAX),
    tags: suggestion.tags
      .map((tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, ''))
      .filter((tag) => tag.length >= 2)
      .slice(0, 6),
  };
}

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max);
}
