/**
 * The note reader tab: play or sing a note and see it written. Every note-on from the learner's
 * input (the microphone, MIDI, the computer keys or the on-screen keys) is written on the low card
 * (`SprintSheet`, one note) where `readPlacement` puts it — piano: treble from middle C, bass
 * below; guitar: treble an octave up with the small 8 — with its name and octave, the cents for
 * the microphone, and the last few notes before it as plain text. A note the card cannot reach is
 * named and said to be too high or too low on its own staff, never drawn in the wrong place.
 *
 * The notes are kept by the screen (`useReadNotes` in `TunerScreen`), so switching tabs keeps
 * them. The sheet's lines and the input region keep their heights in every state, so a note never
 * moves the page. The polite status line names each new note, a repeated one too.
 */
import {
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Instrument,
  LearnInput,
} from '@/lib/rmhmusic/learn/schemas';
import type { InputSource } from '@/lib/rmhmusic/learn/input/events';
import {
  readName,
  readPlacement,
} from '@/lib/rmhmusic/learn/tuner/read';
import { SprintSheet } from '../StaffCard';
import { DeviceRegion } from '../LessonParts';
import { OnScreenKeyboard } from '../OnScreenKeyboard';
import {
  useInputPhases,
  useNoteEvents,
} from '../useLearnInput';
import { centsText } from './cents';

/** How many earlier notes the history line keeps. */
export const HISTORY = 5;

export interface ReadNote {
  /** Counts notes on this screen: the keys of the lines that show it. */
  seq: number;
  midi: number;
  /** The microphone's cents; absent for exact sources. */
  cents?: number;
  source: InputSource;
}

/** The notes played on this screen, newest first (the current one and {@link HISTORY} before it). */
export function useReadNotes(): readonly ReadNote[] {
  const [
    notes,
    setNotes,
  ] =
    useState<
      readonly ReadNote[]
    >(
      [],
    );
  const seq =
    useRef(
      0,
    );
  useNoteEvents(
    (
      e,
    ) => {
      if (
        e.type !==
        'on'
      )
        return;
      const note: ReadNote =
        {
          seq: ++seq.current,
          midi: e.midi,
          source:
            e.source,
        };
      if (
        e.source ===
          'mic' &&
        e.cents !==
          undefined &&
        Number.isFinite(
          e.cents,
        )
      )
        note.cents =
          e.cents;
      setNotes(
        (
          prev,
        ) =>
          [
            note,
            ...prev,
          ].slice(
            0,
            HISTORY +
              1,
          ),
      );
    },
  );
  return notes;
}

/** "A4, C4, E4"-style lists in the reader's language (plain commas where Intl cannot). */
function formatList(
  lang: string,
  items: string[],
): string {
  try {
    return new Intl.ListFormat(
      lang,
      {
        style:
          'short',
        type: 'unit',
      },
    ).format(
      items,
    );
  } catch {
    return items.join(
      ', ',
    );
  }
}

export function ReadPanel({
  notes,
  input,
  instrument,
  loading,
}: {
  notes: readonly ReadNote[];
  input: LearnInput | null;
  instrument: Instrument;
  loading: boolean;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const phases =
    useInputPhases();

  const current =
    notes[0];
  const placed =
    current
      ? readPlacement(
          current.midi,
          instrument,
        )
      : null;
  const onCard =
    placed &&
    'note' in
      placed
      ? placed
      : null;
  const name =
    current
      ? readName(
          current.midi,
        )
      : '';
  const clef =
    placed?.clef ??
    'treble';
  const staffName =
    clef ===
    'bass'
      ? t(
          'tuner-bass-staff',
          {
            defaultValue:
              'the bass staff',
          },
        )
      : t(
          'tuner-treble-staff',
          {
            defaultValue:
              'the treble staff',
          },
        );
  const label =
    current
      ? onCard
        ? t(
            'tuner-read-label',
            {
              name,
              staff:
                staffName,
              defaultValue:
                '{{name}} written on {{staff}}',
            },
          )
        : t(
            'tuner-read-off-label',
            {
              name,
              defaultValue:
                '{{name}}, off this staff',
            },
          )
      : t(
          'tuner-read-empty-label',
          {
            defaultValue:
              'An empty staff',
          },
        );

  let detail =
    '';
  if (
    placed &&
    'off' in
      placed
  )
    detail =
      placed.off ===
      'high'
        ? t(
            'tuner-read-high',
            {
              defaultValue:
                'Too high to write on this staff.',
            },
          )
        : t(
            'tuner-read-low',
            {
              defaultValue:
                'Too low to write on this staff.',
            },
          );
  else if (
    current?.cents !==
    undefined
  )
    detail =
      centsText(
        t,
        current.cents,
      );

  const earlier =
    notes
      .slice(
        1,
      )
      .map(
        (
          n,
        ) =>
          readName(
            n.midi,
          ),
      );
  const history =
    earlier.length
      ? t(
          'tuner-read-history',
          {
            notes:
              formatList(
                i18n.language,
                earlier,
              ),
            defaultValue:
              'Before: {{notes}}',
          },
        )
      : '';
  // A no-break space on every other note makes a repeated note a change, so it is said again.
  const said =
    current
      ? `${name}${current.seq % 2 ? ' ' : ''}`
      : '';

  let region;
  if (
    loading ||
    input ===
      null
  ) {
    region =
      (
        <div
          aria-hidden="true"
          className="app-skeleton h-full w-full"
        />
      );
  } else if (
    input ===
      'mic' ||
    input ===
      'midi'
  ) {
    region =
      (
        <DeviceRegion
          input={
            input
          }
          on={
            phases[
              input
            ] ===
            'active'
          }
        />
      );
  } else if (
    input ===
    'keys'
  ) {
    region =
      (
        <div className="rmm-sheet flex h-full items-center justify-center p-4 text-center">
          <p className="text-sm leading-6 text-app-text-muted">
            {t(
              'flash-keys-region',
              {
                defaultValue:
                  'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
              },
            )}
          </p>
        </div>
      );
  } else {
    region =
      (
        <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />
      );
  }

  const key =
    current?.seq ??
    0;
  return (
    <div className="space-y-4">
      <section
        aria-label={t(
          'tuner-read-sheet',
          {
            defaultValue:
              'The note you played',
          },
        )}
        className="rmm-sheet space-y-1 p-5 text-center sm:p-6"
      >
        <p
          key={`hint:${!!current}`}
          className="h-6 text-sm leading-6 text-app-text-muted"
        >
          {current
            ? ''
            : t(
                'tuner-read-hint',
                {
                  defaultValue:
                    'Play or sing a note to see it written.',
                },
              )}
        </p>
        <SprintSheet
          clef={
            clef
          }
          notes={
            onCard
              ? [
                  onCard.note,
                ]
              : []
          }
          arrangement="chord"
          state="ask"
          label={
            label
          }
          range="low"
          octaveClef={
            instrument ===
            'guitar'
          }
        />
        <p
          key={`name:${key}`}
          dir="ltr"
          className="rmm-display h-12 text-[2.5rem] leading-[3rem] text-app-text"
        >
          {
            name
          }
        </p>
        <p
          key={`detail:${key}`}
          className="h-6 text-sm leading-6 text-app-text-muted tabular-nums"
        >
          {
            detail
          }
        </p>
        <p
          key={`history:${key}`}
          className="h-6 truncate text-sm leading-6 text-app-text-muted"
        >
          {
            history
          }
        </p>
        <p
          role="status"
          className="sr-only"
        >
          {
            said
          }
        </p>
      </section>
      <div className="rmm-input-region">
        {
          region
        }
      </div>
    </div>
  );
}
