/**
 * Slice It — reading a chart as notation.
 *
 * The renderer's default note skin draws each tap as the note it actually is:
 * a head, a stem, and a flag per subdivision, taken from `Slice.quant`. This
 * module is the part of that with no canvas in it — which subdivision gets how
 * many flags, and which notes belong to the same beamed group.
 *
 * It lives here rather than in `GameCanvas.tsx` because it is the half worth
 * testing: the grouping rule has a phase problem that only shows up on a real
 * chart, and a unit test is a much cheaper place to catch a regression in it
 * than a screenshot.
 */

/**
 * How many flags a notehead carries for a subdivision.
 *
 * `Slice.quant` is the denominator the note snapped to: 1 = on the beat,
 * 2 = eighth, 3 = triplet, 4 = sixteenth. Flags follow notation — a quarter has
 * none, an eighth one, a sixteenth two — and a triplet is drawn as an eighth
 * (which is what a triplet's members are) with the 3 that says so.
 *
 * An unknown or absent subdivision falls back to a quarter — see the default
 * branch for why that is the honest reading rather than the loud one.
 */
export function flagsForQuant(quant: number | undefined): { flags: number; triplet: boolean } {
  switch (quant) {
    case 1:
      return { flags: 0, triplet: false };
    case 2:
      return { flags: 1, triplet: false };
    case 3:
      return { flags: 1, triplet: true };
    case 4:
      return { flags: 2, triplet: false };
    default:
      // A chart with no subdivision still gets a NOTE — head and stem, no flag.
      //
      // The first version returned null here and the renderer drew a bare head,
      // on the reasoning that an unknown value must not claim to be on the
      // beat. That reasoning was right and the drawing was wrong: a bare oval
      // head is a whole note, which is a louder rhythmic claim than the quarter
      // it was avoiding. A stem with no flag is notation's neutral note, and
      // for a tap — which has no duration at all — it claims nothing.
      //
      // `Slice.quant`'s contract still holds where it was written to: the quant
      // COLOUR is still only applied when the chart actually carries one.
      return { flags: 0, triplet: false };
  }
}

/**
 * How far the beam search will walk the chart looking for a partner.
 *
 * Bounded because this runs per visible note per frame. Twelve is far more than
 * the interleaving of two lanes can need — a partner is at most a couple of
 * entries away once the other lane's notes are skipped.
 */
export const BEAM_SCAN_LIMIT = 12;

/** The fields beaming reads off a note. Structural so the helpers stay pure and
 *  testable without dragging the whole `Slice` shape in. */
export type BeamCandidate = { lane: number; time: number; type: string; quant?: number };

/**
 * The next or previous note this one should be BEAMED to, or null.
 *
 * Beaming is what notation does instead of drawing a flag on every note: a run
 * of eighths becomes a pair or a group joined by a bar, which is both how the
 * rhythm is actually read and — the reason it is here — a much calmer playfield
 * than the same run wearing one flag each.
 *
 * The rule is deliberately strict, because a beam that joins notes a player
 * does not hear as a group is worse than no beam: same lane, same subdivision,
 * both plain taps, and no further apart than that subdivision's own spacing
 * (plus a little, for charts whose onsets are not perfectly quantised).
 */
export function beamNeighbour(
  slices: BeamCandidate[],
  index: number,
  step: 1 | -1,
  beatSeconds: number,
): number {
  const note = slices[index];
  const quant = note.quant;
  // Quarter notes have no flag, so they have nothing to beam WITH.
  if (!quant || quant < 2 || !(beatSeconds > 0)) return -1;
  const subdivision = beatSeconds / quant;
  const limit = subdivision * 1.35;
  // What bounds a group, without walking the chart: its SUBDIVISION index.
  //
  // `quant` subdivisions make a beat, so grouping every `quant` of them gives
  // the sizes the rhythm actually has — two beamed eighths, three beamed
  // triplets, four beamed sixteenths — which is what notation does when it
  // breaks a beam at the beat.
  //
  // Indexed off the subdivision rather than off `floor(time / beat)`, which was
  // the first attempt and is too brittle to use: the chart is snapped to a grid
  // derived from the detected tempo, and that grid has a PHASE against the
  // audio clock's zero. On the harness chart (139.67 BPM) the first note of
  // each triplet sat one side of a beat boundary and the other two sat on the
  // other, so every group of three rendered as a lone note plus a pair.
  //
  // Counting subdivisions is only sensitive to that phase at the START of a
  // run, where it can produce one short group — a cosmetic difference, not a
  // structural one.
  const group = Math.floor(Math.round(note.time / subdivision) / quant);

  for (
    let i = index + step, scanned = 0;
    scanned < BEAM_SCAN_LIMIT && i >= 0 && i < slices.length;
    i += step, scanned++
  ) {
    const other = slices[i];
    // The other lane is a different voice; step over it rather than ending the
    // group, because the two lanes interleave in the time-sorted array.
    if (other.lane !== note.lane) continue;
    if (other.type !== 'STANDARD' || other.quant !== quant) return -1;
    if (Math.abs(other.time - note.time) > limit) return -1;
    if (Math.floor(Math.round(other.time / subdivision) / quant) !== group) return -1;
    return i;
  }
  return -1;
}
