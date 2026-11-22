/**
 * What a Sprint run teaches the scheduler — pure.
 *
 * Every single-note and accidental prompt is one FSRS item (`sprintNoteItemId`: clef, written
 * natural, printed accidental) and every triad another (`sprintChordItemId`: clef, lowest written
 * note, quality). A bar is a string of notes, not one thing to remember, so it is no item. The
 * prompt is identified as the learner saw it (after `forInstrument` / `forVoice`), so a guitarist's
 * low note and a pianist's are different items.
 *
 * A run posts one review per distinct item, graded from the FIRST attempt (the result in `results`:
 * Learning mode's retries add none) by `gradeAttempt` with Sprint's speed bands. A prompt that was
 * skipped (a chord on the microphone) or never reached is not reviewed: nothing was asked. When an
 * item came up twice in a run, the worse grade stands.
 */
import { MAX_REVIEWS_PER_BATCH, type ReviewInput } from '../schemas';
import { SPRINT_TIMES, gradeAttempt } from '../srs/grade';
import { sprintChordItemId, sprintNoteItemId } from '../srs/items';
import type { Grade } from '../srs/schedule';
import { chordQuality } from '../theory/chords';
import { noteMidi, type SprintPrompt } from './generate';
import type { PromptResult } from './scoring';

/** The FSRS item a prompt is, or null when it is none (a bar, or a chord that is not a triad). */
export function itemIdOf(p: SprintPrompt): string | null {
  const first = p.notes[0];
  if (!first) return null;
  switch (p.kind) {
    case 'note':
    case 'accidental':
      return p.notes.length === 1 ? sprintNoteItemId(p.clef, first.written, first.accidental) : null;
    case 'chord': {
      const quality = chordQuality(p.notes.map(noteMidi));
      if (!quality) return null;
      return sprintChordItemId(p.clef, Math.min(...p.notes.map((n) => n.written)), quality);
    }
    case 'bar':
      return null;
  }
}

const WORSE: Record<Grade, number> = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 3,
};

/** The reviews of a finished run: results[i] answers prompts[i]. */
export function reviewsOfRun(prompts: readonly SprintPrompt[], results: readonly PromptResult[]): ReviewInput[] {
  const byItem = new Map<string, Grade>();
  results.forEach((r, i) => {
    const p = prompts[i];
    if (!p || r.skipped) return;
    const id = itemIdOf(p);
    if (!id) return;
    const grade = gradeAttempt(
      {
        right: r.correct,
        ms: r.ms,
      },
      SPRINT_TIMES,
    );
    const had = byItem.get(id);
    if (had === undefined || WORSE[grade] < WORSE[had]) byItem.set(id, grade);
  });
  return [...byItem].slice(0, MAX_REVIEWS_PER_BATCH).map(([cardId, grade]) => ({
    cardId,
    grade,
  }));
}
