/**
 * Slice It — artist identity (L15).
 *
 * ## Why a second column
 *
 * `Song.artist` is free text typed by whoever uploaded the track, and it is the
 * only thing "everything by this artist" had to work with. That made the
 * question a substring search, which is wrong in both directions at once: it
 * misses `"Artist feat. Someone"` (the string is longer than what you typed) and
 * it matches `"Artist Two"` (the string you typed is a prefix of somebody else).
 * "MOTHER3" and "Mother 3" are the same artist and neither is a substring of the
 * other.
 *
 * So there are two columns. `artist` stays exactly as typed — it is what is
 * shown, and normalising the display string would be taking a decision away
 * from the uploader for no benefit. `artistKey` is the grouping value: derived,
 * never shown, and the only thing an equality filter or an index is ever built
 * on.
 *
 * ## Where this lives
 *
 * Next to the ingest path rather than in a UI module: the key has to be computed
 * at the moment the tags are read, in the same request that writes the row, or
 * the row is written with a null key and the grouping silently has a hole in it.
 * `lib/audio/probe.ts` is the neighbouring half of that ingest read (container
 * headers → duration); this is metadata → identity. Client-safe on purpose, so
 * the browser can build an artist link from a `SliceSong` it already holds
 * without a round trip.
 *
 * ## What it deliberately does not do
 *
 * It is not a disambiguator. Two genuinely different artists who share a name
 * collapse into one key, exactly as they do on every music service that keys on
 * a name string. Fixing that needs an artist entity with an identity of its own
 * (MusicBrainz ids, a merge/split moderation surface), which is a much larger
 * feature than "the artist page finds the tracks".
 */

/** `@db.VarChar(200)` on `Song.artistKey` — the key is truncated to fit. */
export const ARTIST_KEY_MAX = 200;

/**
 * Collaboration markers that introduce a *secondary* artist.
 *
 * `"Artist feat. Someone"` and `"Artist"` are the same primary artist and must
 * land on the same key, or every guest spot forks a new artist page holding one
 * track. The separator has to be bounded on the left by a word boundary and on
 * the right by whitespace, or `"Feature"` (a real band name) becomes `""`.
 *
 * `&`, `+` and `,` are NOT in this list. "Simon & Garfunkel" is one artist, not
 * Simon with a guest, and there is no way to tell those apart from the string.
 * Over-splitting loses tracks off the page a user asked for; under-splitting
 * merely leaves a collaboration with its own page, which is what most services
 * do anyway.
 */
const FEATURING = /\s[([]?\s*(?:feat\.?|ft\.?|featuring|with|w\/|vs\.?|x)\s+.*$/i;

/**
 * Latin-1 accented letters and the ASCII they fold to.
 *
 * Used only as documentation of intent for the SQL side: the migration's
 * backfill cannot call this function, so it reproduces exactly this table with
 * `translate()`. Keeping the two lists adjacent in source is the only thing that
 * stops them drifting — if you add a character here, add it to
 * `prisma/migrations/*_slice_it_library_scale/migration.sql` too.
 *
 * The runtime path below uses `NFKD` + combining-mark stripping instead, which
 * is a superset (it folds Vietnamese, Polish, Greek transliterations and so on).
 * A row whose artist carries a non-Latin-1 diacritic therefore gets a slightly
 * different key from the one-time backfill than it will get the next time it is
 * written. That is a stale grouping for a handful of rows, self-healing on the
 * next edit, and the alternative was requiring the `unaccent` extension.
 */
export const LATIN1_FOLD_FROM = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ';
export const LATIN1_FOLD_TO = 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY';

/**
 * The grouping key for a display artist string, or `null` when there is nothing
 * left to group on.
 *
 * `null` rather than `''`: Postgres treats NULLs as distinct, so every
 * unkeyable row stays its own thing instead of every one of them joining a
 * single artist page called "". An empty-string key would be a page listing
 * every track whose artist tag was punctuation.
 *
 * ```ts
 * artistKeyOf('MOTHER3')            // 'mother3'
 * artistKeyOf('Mother 3')           // 'mother3'
 * artistKeyOf('Björk feat. Thom')   // 'bjork'
 * artistKeyOf('  ***  ')            // null
 * ```
 */
export function artistKeyOf(artist: string | null | undefined): string | null {
  if (!artist) return null;

  const folded = artist
    .normalize('NFKD')
    // Combining marks left behind by the decomposition above.
    .replace(/[̀-ͯ]/g, '')
    .replace(FEATURING, '')
    .toLowerCase()
    // Everything that is not a letter or a digit is a separator, and separators
    // vanish rather than collapsing to a space: "Mother 3", "Mother-3" and
    // "Mother3" are one artist and a retained space would keep two of them apart.
    .replace(/[^\p{L}\p{N}]+/gu, '');

  if (!folded) return null;
  return folded.slice(0, ARTIST_KEY_MAX);
}

/**
 * The in-game artist page for a key.
 *
 * A helper rather than a template literal at each call site because the key can
 * legitimately contain characters that are not URL-safe — CJK, Cyrillic — and
 * three call sites remembering to encode is three chances for two of them to.
 */
export function artistPath(key: string): string {
  return `/slice-it/artist/${encodeURIComponent(key)}`;
}

/**
 * Pick the display string for a group of rows that share one key.
 *
 * The rows disagree by construction (that is what the key is for), so something
 * has to choose. The most frequent spelling wins, ties broken by the longest —
 * a longer spelling carries more information ("Mother 3" over "mother3"), and
 * the alternative tiebreak, "whichever row the database happened to return
 * first", makes the artist page's own title flicker between deploys.
 */
export function artistDisplayName(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && name.length > best.length)) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
