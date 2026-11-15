/**
 * Every sentence the sight reading game says, as pure functions of the translator and the
 * machine's state, so each case can be checked without a DOM. One key per case, with i18next
 * plurals where a number is said; nothing is assembled from fragments.
 *
 * While a prompt is asked its image is named only by what kind of prompt it is and the staff it is
 * on ("A chord on the treble staff"), never by its notes: a screen reader must not hear the answer.
 * The notes are named once answered.
 *
 * Every call names its namespace (`ns`): this file has no `useTranslation` of its own, and the
 * extractor files a key with no namespace under `common`.
 */
import type { TFunction } from 'i18next';
import type { NoteEvent } from '@/lib/rmhmusic/learn/input/events';
import type { SprintLevelId } from '@/lib/rmhmusic/learn/sprint/levels';
import type { SprintPrompt } from '@/lib/rmhmusic/learn/sprint/generate';
import type { SprintState } from '@/lib/rmhmusic/learn/sprint/machine';
import type { RunSummary } from '@/lib/rmhmusic/learn/sprint/scoring';

type T =
  TFunction<'c-rmhmusic'>;

export function levelName(
  t: T,
  id: SprintLevelId,
): string {
  switch (
    id
  ) {
    case 'note':
      return t(
        'sprint-level-note',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'One note',
        },
      );
    case 'note-both':
      return t(
        'sprint-level-more-notes',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'More notes',
        },
      );
    case 'accidental':
      return t(
        'sprint-level-accidental',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Sharps and flats',
        },
      );
    case 'triad':
      return t(
        'sprint-level-triad',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Triads',
        },
      );
    case 'inversion':
      return t(
        'sprint-level-inversion',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Inverted triads',
        },
      );
    case 'bar':
      return t(
        'sprint-level-bar',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Four notes in a row',
        },
      );
  }
}

/** A level's line under its name, for the learner's instrument (guitar reads treble only). */
export function levelHint(
  t: T,
  id: SprintLevelId,
  guitar: boolean,
): string {
  switch (
    id
  ) {
    case 'note':
      return t(
        'sprint-level-note-hint',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Naturals on the treble staff',
        },
      );
    case 'note-both':
      return guitar
        ? t(
            'sprint-level-more-notes-hint-guitar',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'Naturals down to the low E string',
            },
          )
        : t(
            'sprint-level-note-both-hint',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'Naturals on the treble and bass staves',
            },
          );
    case 'accidental':
      return t(
        'sprint-level-accidental-hint',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'A sharp or a flat before the note',
        },
      );
    case 'triad':
      return t(
        'sprint-level-triad-hint',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Three notes together, root position',
        },
      );
    case 'inversion':
      return t(
        'sprint-level-inversion-hint-bass',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Three notes together, the lowest one at the bottom',
        },
      );
    case 'bar':
      return t(
        'sprint-level-bar-hint',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Play them in order',
        },
      );
  }
}

/** The sheet's accessible name: generic while asking, the notes once answered. */
export function promptLabel(
  t: T,
  prompt: SprintPrompt,
  answered: boolean,
  notes: string,
): string {
  const bass =
    prompt.clef ===
    'bass';
  if (
    !answered
  ) {
    if (
      prompt.kind ===
      'bar'
    ) {
      return bass
        ? t(
            'sprint-ask-bar-bass',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'A bar of four notes on the bass staff',
            },
          )
        : t(
            'sprint-ask-bar-treble',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'A bar of four notes on the treble staff',
            },
          );
    }
    if (
      prompt.kind ===
      'chord'
    ) {
      return bass
        ? t(
            'sprint-ask-chord-bass',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'A chord on the bass staff',
            },
          )
        : t(
            'sprint-ask-chord-treble',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'A chord on the treble staff',
            },
          );
    }
    return bass
      ? t(
          'flash-card-ask-bass',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'A note on the bass staff',
          },
        )
      : t(
          'flash-card-ask-treble',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'A note on the treble staff',
          },
        );
  }
  if (
    prompt.kind ===
    'bar'
  ) {
    return bass
      ? t(
          'sprint-label-bar-bass',
          {
            ns: 'c-rmhmusic',
            notes,
            defaultValue:
              '{{notes}} in order on the bass staff',
          },
        )
      : t(
          'sprint-label-bar-treble',
          {
            ns: 'c-rmhmusic',
            notes,
            defaultValue:
              '{{notes}} in order on the treble staff',
          },
        );
  }
  if (
    prompt.kind ===
    'chord'
  ) {
    return bass
      ? t(
          'sprint-label-chord-bass',
          {
            ns: 'c-rmhmusic',
            notes,
            defaultValue:
              '{{notes}} together on the bass staff',
          },
        )
      : t(
          'sprint-label-chord-treble',
          {
            ns: 'c-rmhmusic',
            notes,
            defaultValue:
              '{{notes}} together on the treble staff',
          },
        );
  }
  return bass
    ? t(
        'flash-card-named-bass',
        {
          ns: 'c-rmhmusic',
          note: notes,
          defaultValue:
            '{{note}} on the bass staff',
        },
      )
    : t(
        'flash-card-named-treble',
        {
          ns: 'c-rmhmusic',
          note: notes,
          defaultValue:
            '{{note}} on the treble staff',
        },
      );
}

/** What to do with the prompt, saying whether the octave counts on this input. */
export function askHint(
  t: T,
  prompt: SprintPrompt,
  source: NoteEvent['source'],
  tooFew: number,
): string {
  if (
    prompt.kind ===
    'chord'
  ) {
    return tooFew >
      0
      ? t(
          'sprint-chord-too-few',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'Play all the notes together.',
          },
        )
      : t(
          'sprint-chord-hint',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'Play the notes together.',
          },
        );
  }
  const exact =
    source ===
    'midi';
  if (
    prompt.kind ===
    'bar'
  ) {
    return exact
      ? t(
          'sprint-bar-hint-exact',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'Play the notes in order, at the written pitch.',
          },
        )
      : t(
          'sprint-bar-hint-any',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'Play the notes in order: any octave counts.',
          },
        );
  }
  return exact
    ? t(
        'sprint-note-hint-exact',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Play the note at the written pitch.',
        },
      )
    : t(
        'sprint-note-hint-any',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Play the note: any octave counts.',
        },
      );
}

export function formatSeconds(
  language: string,
  ms: number,
): string {
  return new Intl.NumberFormat(
    language,
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(
    ms /
      1000,
  );
}

/** One prompt's feedback. `notes`: the right notes; `exact`: their names with the octave. */
export function feedbackLine(
  t: T,
  language: string,
  state: Extract<
    SprintState,
    {
      kind: 'feedback';
    }
  >,
  notes: string,
  exact: string,
): string {
  if (
    state
      .result
      .correct
  ) {
    return t(
      'sprint-right',
      {
        ns: 'c-rmhmusic',
        seconds:
          formatSeconds(
            language,
            state
              .result
              .ms ??
              0,
          ),
        defaultValue:
          'Right, in {{seconds}} s.',
      },
    );
  }
  if (
    state.octaveOff
  ) {
    return t(
      'sprint-wrong-octave',
      {
        ns: 'c-rmhmusic',
        note: exact,
        defaultValue:
          'Right letter, wrong octave: it was {{note}}.',
      },
    );
  }
  return t(
    'sprint-wrong',
    {
      ns: 'c-rmhmusic',
      notes,
      defaultValue:
        'Not this time: it was {{notes}}.',
    },
  );
}

/** The result in one sentence: one key per case. */
export function resultSentence(
  t: T,
  language: string,
  s: RunSummary,
): string {
  if (
    s.played ===
    0
  ) {
    return t(
      'sprint-result-empty',
      {
        ns: 'c-rmhmusic',
        defaultValue:
          'No prompts were played, so this run has no score.',
      },
    );
  }
  const skipped =
    s.skipped >
    0;
  if (
    s.avgMs ===
    null
  ) {
    return skipped
      ? t(
          'sprint-result-none-skipped',
          {
            ns: 'c-rmhmusic',
            count:
              s.played,
            defaultValue_one:
              'You scored 0: the one prompt played was not right. Chords were skipped for the microphone.',
            defaultValue:
              'You scored 0: none of the {{count}} prompts played was right. Chords were skipped for the microphone.',
          },
        )
      : t(
          'sprint-result-none',
          {
            ns: 'c-rmhmusic',
            count:
              s.played,
            defaultValue_one:
              'You scored 0: the one prompt was not right.',
            defaultValue:
              'You scored 0: none of the {{count}} prompts was right.',
          },
        );
  }
  const seconds =
    formatSeconds(
      language,
      s.avgMs,
    );
  return skipped
    ? t(
        'sprint-result-some-skipped',
        {
          ns: 'c-rmhmusic',
          count:
            s.played,
          score:
            s.score,
          correct:
            s.correct,
          seconds,
          defaultValue_one:
            'You scored {{score}}: the one prompt played was right, in {{seconds}} s. Chords were skipped for the microphone.',
          defaultValue:
            'You scored {{score}}: {{correct}} of {{count}} prompts played were right, in {{seconds}} s on average. Chords were skipped for the microphone.',
        },
      )
    : t(
        'sprint-result-some',
        {
          ns: 'c-rmhmusic',
          count:
            s.played,
          score:
            s.score,
          correct:
            s.correct,
          seconds,
          defaultValue_one:
            'You scored {{score}}: the one prompt was right, in {{seconds}} s.',
          defaultValue:
            'You scored {{score}}: {{correct}} of {{count}} prompts were right, in {{seconds}} s on average.',
        },
      );
}

type Finished =
  Extract<
    SprintState,
    {
      summary: RunSummary;
    }
  >;

/** Whether the result was kept, in plain words. */
export function saveSentence(
  t: T,
  state: Finished,
): string {
  switch (
    state.kind
  ) {
    case 'saving':
      return t(
        'sprint-saving',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Saving…',
        },
      );
    case 'saved':
      return t(
        'sprint-saved',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Saved.',
        },
      );
    case 'failed':
      return t(
        'sprint-save-failed',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            "Couldn't save this result.",
        },
      );
    case 'signed-out':
      return t(
        'sprint-signed-out',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Not saved: sign in again to keep your results.',
        },
      );
    case 'complete':
      switch (
        state.why
      ) {
        case 'practice':
          return t(
            'sprint-practice',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                "Practice: today's score is your first run.",
            },
          );
        case 'empty':
          return t(
            'sprint-not-saved-empty',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'Not saved: there was nothing to score.',
            },
          );
        case 'already-scored':
          return t(
            'sprint-already-scored',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                "Not saved: today's challenge already has a score from another tab or device.",
            },
          );
        case 'unsaved':
          return t(
            'sprint-not-saved',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'Not saved: results are not kept yet.',
            },
          );
      }
  }
}
