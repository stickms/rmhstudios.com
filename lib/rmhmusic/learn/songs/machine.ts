/**
 * Playing a song, as one explicit machine — pure, `{ initial, step }` like `sprint/machine.ts`.
 *
 *   ready → waiting (Wait for me) | counting → playing (Play along) → saving → saved | failed
 *   (Retry) | signed-out | unsaved
 *
 * **Which note is right** follows the Sprint (`sprint/machine.ts` `sameNote`): MIDI must play the
 * exact pitch the version SOUNDS (guitar an octave under the staff), the computer keys, the
 * on-screen keys and the microphone any octave of it (they reach one octave, show a window of the
 * keyboard, or hear a voice in another octave). Note-offs never answer.
 *
 * **Wait for me.** `start { at }` puts the cursor on the first note. A note-on timed before `at`
 * is ignored (a key held from before). The right note moves the cursor on; a wrong one is counted
 * against the note (`wrong`), which stays until it is right. `skip` gives up on the note (recorded
 * as {@link SKIPPED_WRONG} wrong notes: no points, marked wrong). After the last note the run is
 * saved.
 *
 * **Play along.** `start` asks the screen to `prepare { token }` (wake sound, start the metronome's
 * count-in); the screen answers `begin { token, t0, beatMs, latencyMs, calibrated }` once the first
 * click is scheduled: note i is due at `t0 + onset_i × beatMs` on the note events' clock. A begin
 * for another token (a run stopped and started again while sound woke) is ignored. Every note-on,
 * its time less the latency, goes to the open note of its pitch whose window (`ZERO_MS`) holds it
 * (the nearest, if several), else to the nearest open note, which it answers wrongly — so
 * overlapping eighths never steal each other's notes. A mic note-on also loses `MIC_ONSET_MS`, but
 * only while the latency is the uncalibrated default: a calibrated latency already holds the delay
 * of the input it was measured with (calibrated on keys and played on the mic, a mic note still
 * reads about `MIC_ONSET_MS` late — accepted). A note-on that answers no note costs an extra
 * (`scoring.ts`), unless it is outside the song's span (the count-in, the tail). `tick { at }`
 * moves the cursor to the latest note due by `at` and closes every window that ended by then (an
 * unanswered note is missed); the screen sends one at {@link nextDue}, so nothing runs at rest.
 * After the last window closes the run ends (`halt` stops the metronome) and is saved. `stop`
 * drops a run (the tab hidden, a dialog, sound stopped) back to ready, saying why.
 *
 * Exactly one `save` per finished run; a stale answer (an older attempt) is ignored; Retry is a
 * new attempt. `again` goes back to ready from any state.
 */
import type { NoteEvent } from '../input/events';
import type { Machine } from '../machines/runner';
import { ZERO_MS } from '../scoring/timing';
import { sameNote } from '../sprint/machine';
import { notesOf, soundingPitch, type Song, type SongVersion } from './score';
import {
  MAX_WRONG,
  MIC_ONSET_MS,
  summarizePlay,
  summarizeWait,
  type PlayNoteResult,
  type SongMode,
  type SongRunRecord,
  type SongSummary,
} from './scoring';

export type SongSaveOutcome = 'saved' | 'failed' | 'unauthorized' | 'invalid' | 'unsaved';
export type StopReason = 'away' | 'dialog' | 'sound';

interface Run {
  mode: SongMode;
  /** How many runs have started on this screen: the current play-along run's token. */
  runs: number;
  /** Each note's sounding pitch on this version. */
  pitches: readonly number[];
  /** Each note's onset in beats. */
  onsets: readonly number[];
}

export type SongState =
  | (Run & {
      kind: 'ready';
      stopped: StopReason | null;
    })
  | (Run & {
      kind: 'waiting';
      index: number;
      wrong: number;
      counts: readonly number[];
      since: number;
      lastWrong: number | null;
    })
  | (Run & {
      kind: 'counting';
      token: number;
    })
  | (Run & {
      kind: 'playing';
      t0: number;
      beatMs: number;
      latencyMs: number;
      /** Taken off a mic note's time: `MIC_ONSET_MS` with the default latency, 0 once calibrated. */
      micOnsetMs: number;
      cursor: number;
      /** Each note's result; null while its window is open. */
      notes: readonly (PlayNoteResult | null)[];
      extras: number;
    })
  | (Run & {
      kind: 'saving';
      summary: SongSummary;
      record: SongRunRecord;
      attempt: number;
    })
  | (Run & {
      kind: 'failed';
      summary: SongSummary;
      record: SongRunRecord;
      attempt: number;
    })
  | (Run & {
      kind: 'saved' | 'signed-out' | 'unsaved';
      summary: SongSummary;
      record: SongRunRecord;
    });

export type SongNoteEvent = Pick<NoteEvent, 'type' | 'midi' | 'time' | 'source'>;

export type SongEvent =
  | {
      type: 'start';
      at: number;
    }
  | {
      type: 'begin';
      /** The run it is for (the `prepare` effect's token); another run's begin is ignored. */
      token: number;
      t0: number;
      beatMs: number;
      latencyMs: number;
      /** The latency was measured (it holds the calibrating input's own delay). */
      calibrated: boolean;
    }
  /** Wait for me: give up on the note to play (it counts as wrong). */
  | {
      type: 'skip';
    }
  | {
      type: 'tick';
      at: number;
    }
  | {
      type: 'note';
      note: SongNoteEvent;
    }
  | {
      type: 'stop';
      why: StopReason;
    }
  | {
      type: 'answered';
      attempt: number;
      outcome: SongSaveOutcome;
    }
  | {
      type: 'retry';
    }
  | {
      type: 'again';
    };

export type SongEffect =
  | {
      type: 'prepare';
      token: number;
    }
  | {
      type: 'halt';
    }
  | {
      type: 'save';
      attempt: number;
      run: SongRunRecord;
      summary: SongSummary;
    };

type Step = {
  state: SongState;
  effects: SongEffect[];
};

/** A skipped note is recorded as this many wrong notes: the fewest that score it nothing. */
export const SKIPPED_WRONG = 2;

/** When note i's window is closed for every input: its beat, the window, a late setup and the mic's onset. */
function closeAt(
  s: Extract<
    SongState,
    {
      kind: 'playing';
    }
  >,
  i: number,
): number {
  return s.t0 + (s.onsets[i] ?? 0) * s.beatMs + ZERO_MS + Math.max(0, s.latencyMs) + s.micOnsetMs;
}

function save(run: Run, record: SongRunRecord, summary: SongSummary, extra: SongEffect[] = []): Step {
  return {
    state: {
      ...run,
      kind: 'saving',
      summary,
      record,
      attempt: 1,
    },
    effects: [
      ...extra,
      {
        type: 'save',
        attempt: 1,
        run: record,
        summary,
      },
    ],
  };
}

function runOf(s: SongState): Run {
  return {
    mode: s.mode,
    runs: s.runs,
    pitches: s.pitches,
    onsets: s.onsets,
  };
}

/** Advance a play-along run to `at`: the cursor, and every window closed by then. */
function advance(
  s: Extract<
    SongState,
    {
      kind: 'playing';
    }
  >,
  at: number,
): Step {
  let cursor = s.cursor;
  while (cursor + 1 < s.onsets.length && s.t0 + (s.onsets[cursor + 1] ?? 0) * s.beatMs <= at) cursor++;
  let notes = s.notes;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i] === null && closeAt(s, i) <= at) {
      if (notes === s.notes) notes = [...s.notes];
      (notes as (PlayNoteResult | null)[])[i] = {
        outcome: 'missed',
        offMs: null,
      };
    }
  }
  const last = s.onsets.length - 1;
  if (notes.every((n) => n !== null) && at >= closeAt(s, last)) {
    const done = notes as readonly PlayNoteResult[];
    const record: SongRunRecord = {
      mode: 'play',
      notes: done,
      extras: s.extras,
    };
    return save(runOf(s), record, summarizePlay(done, s.extras), [
      {
        type: 'halt',
      },
    ]);
  }
  if (cursor === s.cursor && notes === s.notes)
    return {
      state: s,
      effects: [],
    };
  return {
    state: {
      ...s,
      cursor,
      notes,
    },
    effects: [],
  };
}

function stepState(s: SongState, e: SongEvent): Step {
  const same: Step = {
    state: s,
    effects: [],
  };
  const run = runOf(s);

  if (e.type === 'again') {
    const halt: SongEffect[] =
      s.kind === 'counting' || s.kind === 'playing'
        ? [
            {
              type: 'halt',
            },
          ]
        : [];
    return {
      state: {
        ...run,
        kind: 'ready',
        stopped: null,
      },
      effects: halt,
    };
  }
  if (e.type === 'stop') {
    if (s.kind !== 'counting' && s.kind !== 'playing' && s.kind !== 'waiting') return same;
    return {
      state: {
        ...run,
        kind: 'ready',
        stopped: e.why,
      },
      effects: [
        {
          type: 'halt',
        },
      ],
    };
  }

  switch (s.kind) {
    case 'ready': {
      if (e.type !== 'start') return same;
      const runs = s.runs + 1;
      if (s.mode === 'wait')
        return {
          state: {
            ...run,
            runs,
            kind: 'waiting',
            index: 0,
            wrong: 0,
            counts: [],
            since: e.at,
            lastWrong: null,
          },
          effects: [],
        };
      return {
        state: {
          ...run,
          runs,
          kind: 'counting',
          token: runs,
        },
        effects: [
          {
            type: 'prepare',
            token: runs,
          },
        ],
      };
    }

    case 'waiting': {
      const skip = e.type === 'skip';
      if (!skip && (e.type !== 'note' || e.note.type !== 'on' || e.note.time < s.since)) return same;
      const want = s.pitches[s.index];
      if (want === undefined) return same;
      if (!skip && e.type === 'note' && !sameNote(e.note.source, e.note.midi, want))
        return {
          state: {
            ...s,
            wrong: Math.min(MAX_WRONG, s.wrong + 1),
            lastWrong: e.note.midi,
          },
          effects: [],
        };
      const counts = [...s.counts, skip ? Math.max(SKIPPED_WRONG, s.wrong) : s.wrong];
      if (counts.length === s.pitches.length) {
        const record: SongRunRecord = {
          mode: 'wait',
          wrong: counts,
        };
        return save(run, record, summarizeWait(counts));
      }
      return {
        state: {
          ...s,
          index: s.index + 1,
          wrong: 0,
          counts,
          lastWrong: null,
        },
        effects: [],
      };
    }

    case 'counting':
      if (e.type !== 'begin' || e.token !== s.token) return same;
      return {
        state: {
          ...run,
          kind: 'playing',
          t0: e.t0,
          beatMs: e.beatMs,
          latencyMs: e.latencyMs,
          micOnsetMs: e.calibrated ? 0 : MIC_ONSET_MS,
          cursor: -1,
          notes: s.pitches.map(() => null),
          extras: 0,
        },
        effects: [],
      };

    case 'playing': {
      if (e.type === 'tick') return advance(s, e.at);
      if (e.type !== 'note' || e.note.type !== 'on') return same;
      const note = e.note;
      const t = note.time - s.latencyMs - (note.source === 'mic' ? s.micOnsetMs : 0);
      // The open note of this pitch whose window holds the note-on, the nearest if several; else the
      // nearest open note (which the note-on then answers wrongly). Overlapping eighths stay apart.
      let best = -1;
      let bestOff = Infinity;
      let bestRight = false;
      for (let i = 0; i < s.notes.length; i++) {
        if (s.notes[i] !== null) continue;
        const off = t - (s.t0 + (s.onsets[i] ?? 0) * s.beatMs);
        if (Math.abs(off) > ZERO_MS) continue;
        const right = sameNote(note.source, note.midi, s.pitches[i] ?? -1);
        if ((right && !bestRight) || (right === bestRight && Math.abs(off) < Math.abs(bestOff))) {
          best = i;
          bestOff = off;
          bestRight = right;
        }
      }
      if (best < 0) {
        const first = s.t0 - ZERO_MS;
        const last = s.t0 + (s.onsets[s.onsets.length - 1] ?? 0) * s.beatMs + ZERO_MS;
        if (t < first || t > last) return same;
        return {
          state: {
            ...s,
            extras: s.extras + 1,
          },
          effects: [],
        };
      }
      const notes = [...s.notes];
      notes[best] = {
        outcome: bestRight ? 'right' : 'wrong',
        offMs: Math.round(bestOff),
      };
      return {
        state: {
          ...s,
          notes,
        },
        effects: [],
      };
    }

    case 'saving':
      if (e.type !== 'answered' || e.attempt !== s.attempt) return same;
      switch (e.outcome) {
        case 'saved':
          return {
            state: {
              ...run,
              kind: 'saved',
              summary: s.summary,
              record: s.record,
            },
            effects: [],
          };
        case 'unauthorized':
          return {
            state: {
              ...run,
              kind: 'signed-out',
              summary: s.summary,
              record: s.record,
            },
            effects: [],
          };
        case 'unsaved':
        case 'invalid':
          return {
            state: {
              ...run,
              kind: 'unsaved',
              summary: s.summary,
              record: s.record,
            },
            effects: [],
          };
        case 'failed':
          return {
            state: {
              ...run,
              kind: 'failed',
              summary: s.summary,
              record: s.record,
              attempt: s.attempt,
            },
            effects: [],
          };
      }
      return same;

    case 'failed': {
      if (e.type !== 'retry') return same;
      const attempt = s.attempt + 1;
      return {
        state: {
          ...run,
          kind: 'saving',
          summary: s.summary,
          record: s.record,
          attempt,
        },
        effects: [
          {
            type: 'save',
            attempt,
            run: s.record,
            summary: s.summary,
          },
        ],
      };
    }

    default:
      return same;
  }
}

export function createSongMachine({
  song,
  version,
  mode,
}: {
  song: Song;
  version: SongVersion;
  mode: SongMode;
}): Machine<SongState, SongEvent, SongEffect> {
  const notes = notesOf(song);
  return {
    initial: {
      mode,
      runs: 0,
      pitches: notes.map((n) => soundingPitch(n.written, version)),
      onsets: notes.map((n) => n.onset),
      kind: 'ready',
      stopped: null,
    },
    step: stepState,
  };
}

/** The note the cursor is on: the one to play (Wait for me) or the latest due (Play along); −1 for none. */
export function cursorOf(s: SongState): number {
  if (s.kind === 'waiting') return s.index;
  if (s.kind === 'playing') return s.cursor;
  return -1;
}

/** Each note's pencil mark: right, wrong (or missed, or played after a wrong note), or none yet. */
export function marksOf(s: SongState): ('right' | 'wrong' | null)[] {
  const n = s.pitches.length;
  const out: ('right' | 'wrong' | null)[] = new Array<'right' | 'wrong' | null>(n).fill(null);
  const fromWait = (counts: readonly number[]) => counts.forEach((c, i) => (out[i] = c === 0 ? 'right' : 'wrong'));
  const fromPlay = (notes: readonly (PlayNoteResult | null)[]) =>
    notes.forEach((r, i) => (out[i] = r === null ? null : r.outcome === 'right' ? 'right' : 'wrong'));
  if (s.kind === 'waiting') fromWait(s.counts);
  else if (s.kind === 'playing') fromPlay(s.notes);
  else if ('record' in s) {
    if (s.record.mode === 'wait') fromWait(s.record.wrong);
    else fromPlay(s.record.notes);
  }
  return out;
}

/** When the screen should next send `tick` (ms, the note events' clock); null when nothing is due. */
export function nextDue(s: SongState): number | null {
  if (s.kind !== 'playing') return null;
  const next = s.cursor + 1;
  if (next < s.onsets.length) return s.t0 + (s.onsets[next] ?? 0) * s.beatMs;
  // After the last onset: when the last open window closes — or, every note answered, when the last
  // note's window would have (a note-on until then may still be an extra), which ends the run.
  let due = closeAt(s, s.onsets.length - 1);
  for (let i = 0; i < s.notes.length; i++) if (s.notes[i] === null) due = Math.max(due, closeAt(s, i));
  return due;
}

/** Every note's due time in a play-along run (empty before `begin`). */
export function targetTimes(s: SongState): number[] {
  if (s.kind !== 'playing') return [];
  return s.onsets.map((o) => s.t0 + o * s.beatMs);
}
