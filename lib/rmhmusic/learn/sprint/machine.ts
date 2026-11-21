/**
 * The sight reading game ("Sprint") as one explicit machine — pure, `{ initial, step }` like
 * `machines/session.ts`:
 *
 *   ready → countdown (three quiet beats) → asking ⇄ feedback → complete | saving → saved |
 *   failed (Retry) | signed-out
 *
 * Timing. Every note is timed by the event's own `time` from the input hub: every adapter stamps
 * it with `performance.now()` when its event handler runs (MIDI's adapter reads the clock as the
 * message arrives, not the message's own `timeStamp`), so a slow React render never pollutes a
 * score, though the event loop's own delay does. A prompt is timed from `shown` to the note that
 * completes the answer; the screen sends `shown` from an effect that runs once the prompt has been
 * painted, which can be up to about a frame after the learner first saw it, so times are biased
 * long by at most a frame (~16 ms), the same for every prompt. A prompt cannot be answered before
 * it is drawn: until `shown` every note is ignored, and so is any note timed before it (an event
 * queued from the previous prompt). Note-offs never answer, so a key held from the previous prompt
 * answers nothing; a key must be struck again.
 *
 * What counts as the right note depends on the input. A MIDI keyboard has every key, so it must
 * play the written pitch. The computer keys reach one octave and a bit, the on-screen keys show a
 * window of the keyboard, and a voice or an instrument heard by the microphone may sit in another
 * octave; for them any octave of the written note is right (its pitch class). The screen says
 * which.
 *
 * Answers. One note (or an accidental): the first note struck. A bar: its notes in order, each
 * timed from the one before; a wrong note ends the prompt (no retry); a repeat of the note just
 * played (a doubled event) is ignored, since a bar never repeats a note. A chord: the notes struck
 * after the drawing collect in a window of `CHORD_WINDOW_MS` from the first (the same window as
 * `input/chord-window.ts`; its collector is not reused because it counts keys still held from the
 * previous prompt, which here must be struck again). The window is graded when it closes (`close`
 * from the screen's timer, or a later note): right when the notes are exactly the chord's pitch
 * classes in any octave or order — and, on the inverted-triad level, when the lowest note is the
 * inversion's bass — timed to the last note that went in; three or more pitch classes otherwise are
 * wrong (an extra note makes it wrong whatever the order); fewer are a lone tap, not graded (the
 * prompt stays and the clock keeps running).
 *
 * The microphone hears one note at a time: it answers notes, accidentals and bars, never a chord.
 * A run played on the microphone skips its chord prompts (recorded as `skipped`, never wrong, left
 * out of the score), and a mic note on a chord prompt is ignored. The input is fixed for a run:
 * `input` is taken only before the run starts or after it ends (the screen also locks its input
 * switch), so switching to the microphone mid-run cannot skip a hard prompt. If anything pauses a
 * run, `resume` draws the current prompt afresh (its clock and any notes so far are reset).
 *
 * Exactly one `complete` effect per run, after the last prompt's feedback. A scored run with at
 * least one prompt played then saves (`save`, carrying its attempt; a stale answer is ignored;
 * Retry is a new attempt). A run ends at `complete` with a reason (`why`) when it is not kept: a
 * daily replay (`practice`), nothing played (`empty`), nothing can keep results yet (`unsaved`), or
 * the day already has its scored run from another tab or device (`already-scored`). `again` starts
 * a new run from any finished state; in daily mode it is never scored.
 */
import { CHORD_WINDOW_MS } from '../input/chord-window';
import type { NoteEvent } from '../input/events';
import type { CompleteOutcome } from '../machines/learn-data';
import type { Machine } from '../machines/runner';
import type { Instrument } from '../schemas';
import { isChordAttempt, pitchClasses } from '../theory/chords';
import { promptMidis, type SprintPrompt } from './generate';
import { micAllowed } from './levels';
import { promptPoints, summarizeRun, type PromptResult, type RunSummary } from './scoring';

export type SprintMode = 'freeplay' | 'daily';

/**
 * How a save ended: a lesson's outcomes, plus `unsaved` (nothing keeps sprint results yet) and
 * `already-scored` (the day's challenge already has its scored run, from another tab or device).
 */
export type SprintSaveOutcome = CompleteOutcome | 'unsaved' | 'already-scored';

/** Why a finished run was not kept. */
export type CompleteWhy = 'practice' | 'empty' | 'unsaved' | 'already-scored';

/** What every state carries: the run and what has been answered so far. */
interface Run {
  mode: SprintMode;
  prompts: readonly SprintPrompt[];
  /** Each prompt's sounding pitches on the learner's instrument. */
  targets: readonly (readonly number[])[];
  instrument: Instrument;
  /** Whether this run's result is saved (false: a daily replay, practice). */
  scored: boolean;
  /** The input is the microphone (chords are skipped). Fixed while a run is under way. */
  mic: boolean;
  results: readonly PromptResult[];
}

export type SprintState =
  | (Run & {
      kind: 'ready';
    })
  | (Run & {
      kind: 'countdown';
      beat: 0 | 1 | 2;
    })
  | (Run & {
      kind: 'asking';
      index: number;
      /** When the prompt was drawn; null until then (nothing answers). */
      shownAt: number | null;
      /** Chord: the notes in the open window. Bar: the notes played right so far. */
      got: readonly number[];
      /** Bar: when each note in `got` was played. Chord: when the last note went in. */
      times: readonly number[];
      /** Chord: when the open window opened; null when none is open. */
      windowAt: number | null;
      /** Chord: windows closed with too few notes on this prompt. */
      tooFew: number;
    })
  | (Run & {
      kind: 'feedback';
      index: number;
      result: PromptResult;
      played: readonly number[];
      /** Wrong only by the octave: the right letter at another pitch (exact matching, MIDI). */
      octaveOff: boolean;
    })
  | (Run & {
      kind: 'complete';
      summary: RunSummary;
      why: CompleteWhy;
    })
  | (Run & {
      kind: 'saving';
      summary: RunSummary;
      attempt: number;
    })
  | (Run & {
      kind: 'saved';
      summary: RunSummary;
    })
  | (Run & {
      kind: 'failed';
      summary: RunSummary;
      attempt: number;
    })
  | (Run & {
      kind: 'signed-out';
      summary: RunSummary;
    });

export type SprintNoteEvent = Pick<NoteEvent, 'type' | 'midi' | 'time' | 'source'>;

export type SprintEvent =
  | {
      type: 'start';
    }
  | {
      type: 'tick';
    }
  | {
      type: 'shown';
      at: number;
    }
  | {
      type: 'resume';
    }
  | {
      type: 'note';
      note: SprintNoteEvent;
    }
  | {
      type: 'close';
      at: number;
    }
  | {
      type: 'input';
      mic: boolean;
    }
  | {
      type: 'next';
    }
  | {
      type: 'answered';
      attempt: number;
      outcome: SprintSaveOutcome;
    }
  | {
      type: 'retry';
    }
  | {
      type: 'again';
      prompts: readonly SprintPrompt[];
    };

export type SprintEffect =
  | {
      type: 'complete';
      mode: SprintMode;
      scored: boolean;
      summary: RunSummary;
    }
  | {
      type: 'save';
      mode: SprintMode;
      attempt: number;
      summary: RunSummary;
      results: readonly PromptResult[];
    };

type Step = {
  state: SprintState;
  effects: SprintEffect[];
};

function runOf(s: SprintState): Run {
  return {
    mode: s.mode,
    prompts: s.prompts,
    targets: s.targets,
    instrument: s.instrument,
    scored: s.scored,
    mic: s.mic,
    results: s.results,
  };
}

export function initial(opts: {
  prompts: readonly SprintPrompt[];
  mode: SprintMode;
  scored: boolean;
  mic: boolean;
  instrument?: Instrument;
}): SprintState {
  const instrument = opts.instrument ?? 'piano';
  return {
    kind: 'ready',
    mode: opts.mode,
    prompts: opts.prompts,
    targets: opts.prompts.map((p) => promptMidis(p, instrument)),
    instrument,
    scored: opts.scored,
    mic: opts.mic,
    results: [],
  };
}

const same = (state: SprintState): Step => ({
  state,
  effects: [],
});

const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;

/** Whether a struck note is the wanted one: the exact pitch on MIDI, any octave otherwise. */
export function sameNote(source: NoteEvent['source'], played: number, wanted: number): boolean {
  return source === 'midi' ? played === wanted : pc(played) === pc(wanted);
}

/** Whether this input must play the written octave (see the header). */
export function exactOctave(source: NoteEvent['source']): boolean {
  return source === 'midi';
}

const skippedResult = (p: SprintPrompt): PromptResult => ({
  level: p.level,
  kind: p.kind,
  correct: false,
  ms: null,
  noteMs: [],
  points: 0,
  skipped: true,
});

function finished(run: Run, results: readonly PromptResult[]): Step {
  const summary = summarizeRun(results);
  const next: Run = {
    ...run,
    results,
  };
  const complete: SprintEffect = {
    type: 'complete',
    mode: run.mode,
    scored: run.scored,
    summary,
  };
  if (!run.scored || summary.played === 0) {
    return {
      state: {
        ...next,
        kind: 'complete',
        summary,
        why: summary.played === 0 ? 'empty' : 'practice',
      },
      effects: [complete],
    };
  }
  return {
    state: {
      ...next,
      kind: 'saving',
      summary,
      attempt: 1,
    },
    effects: [
      complete,
      {
        type: 'save',
        mode: run.mode,
        attempt: 1,
        summary,
        results,
      },
    ],
  };
}

/**
 * Ask prompt `index` — or, while the input is the microphone, skip the chords from there on —
 * or end the run past the last prompt.
 */
function askFrom(run: Run, index: number): Step {
  let i = index;
  let results = run.results;
  for (;;) {
    const p = run.prompts[i];
    if (!p || !run.mic || micAllowed(p.kind)) break;
    results = [...results, skippedResult(p)];
    i += 1;
  }
  if (i >= run.prompts.length) return finished(run, results);
  return {
    state: {
      ...run,
      results,
      ...freshPrompt(i),
    },
    effects: [],
  };
}

function freshPrompt(index: number) {
  return {
    kind: 'asking' as const,
    index,
    shownAt: null,
    got: [],
    times: [],
    windowAt: null,
    tooFew: 0,
  };
}

type Asking = Extract<
  SprintState,
  {
    kind: 'asking';
  }
>;

function answer(
  s: Asking,
  correct: boolean,
  at: number,
  noteMs: readonly number[],
  played: readonly number[],
  octaveOff = false,
): Step {
  const p = s.prompts[s.index];
  if (!p || s.shownAt === null) return same(s);
  const ms = Math.max(0, at - s.shownAt);
  const result: PromptResult = {
    level: p.level,
    kind: p.kind,
    correct,
    ms,
    noteMs,
    points: promptPoints(p.kind, ms, correct, p.notes.length),
    skipped: false,
  };
  return {
    state: {
      ...runOf(s),
      results: [...s.results, result],
      kind: 'feedback',
      index: s.index,
      result,
      played,
      octaveOff,
    },
    effects: [],
  };
}

/**
 * Close the chord window: right when the notes are exactly the chord (and, on the inverted-triad
 * level, its bass is the lowest), timed to the last note in; another attempt is wrong; too few is
 * not graded.
 */
function closeWindow(s: Asking, at: number): Step {
  const p = s.prompts[s.index];
  const target = s.targets[s.index];
  if (!p || !target) return same(s);
  const want = pitchClasses(target);
  const have = pitchClasses(s.got);
  const bass = target[0];
  const lowest = Math.min(...s.got);
  const right =
    want.length === have.length &&
    want.every((x, i) => x === have[i]) &&
    (p.level !== 'inversion' || (bass !== undefined && pc(lowest) === pc(bass)));
  if (right) return answer(s, true, s.times[s.times.length - 1] ?? at, [], s.got);
  if (isChordAttempt(s.got)) return answer(s, false, at, [], s.got);
  return {
    state: {
      ...s,
      got: [],
      times: [],
      windowAt: null,
      tooFew: s.tooFew + 1,
    },
    effects: [],
  };
}

function onNote(s: Asking, e: SprintNoteEvent): Step {
  const p = s.prompts[s.index];
  const target = s.targets[s.index];
  if (!p || !target) return same(s);
  if (e.type !== 'on' || !Number.isFinite(e.midi) || !Number.isFinite(e.time)) return same(s);
  if (s.shownAt === null || e.time < s.shownAt) return same(s);
  if (e.source === 'mic' && !micAllowed(p.kind)) return same(s);
  const at = e.time;
  switch (p.kind) {
    case 'note':
    case 'accidental': {
      const want = target[0] ?? Number.NaN;
      const right = sameNote(e.source, e.midi, want);
      return answer(s, right, at, [at - s.shownAt], [e.midi], !right && pc(e.midi) === pc(want));
    }
    case 'bar': {
      const last = s.got[s.got.length - 1];
      if (last === e.midi) return same(s);
      const shownAt = s.shownAt;
      const times = [...s.times, at];
      const noteMs = times.map((t, i) => t - (times[i - 1] ?? shownAt));
      const want = target[s.got.length] ?? Number.NaN;
      if (!sameNote(e.source, e.midi, want)) {
        return answer(s, false, at, noteMs.slice(0, -1), [...s.got, e.midi], pc(e.midi) === pc(want));
      }
      const got = [...s.got, e.midi];
      if (got.length < target.length)
        return {
          state: {
            ...s,
            got,
            times,
          },
          effects: [],
        };
      return answer(s, true, at, noteMs, got);
    }
    case 'chord': {
      let cur: Asking = s;
      if (cur.windowAt !== null && at - cur.windowAt >= CHORD_WINDOW_MS) {
        const closed = closeWindow(cur, cur.windowAt + CHORD_WINDOW_MS);
        if (closed.state.kind !== 'asking') return closed;
        cur = closed.state;
      }
      if (cur.got.includes(e.midi)) return same(cur);
      return {
        state: {
          ...cur,
          got: [...cur.got, e.midi],
          times: [at],
          windowAt: cur.windowAt ?? at,
        },
        effects: [],
      };
    }
    default:
      return unreachable(p.kind);
  }
}

const isFinished = (s: SprintState) =>
  s.kind === 'complete' || s.kind === 'saved' || s.kind === 'failed' || s.kind === 'signed-out';

export function step(s: SprintState, e: SprintEvent): Step {
  switch (e.type) {
    case 'start':
      if (s.kind !== 'ready') return same(s);
      return {
        state: {
          ...runOf(s),
          kind: 'countdown',
          beat: 0,
        },
        effects: [],
      };
    case 'tick':
      if (s.kind !== 'countdown') return same(s);
      if (s.beat < 2)
        return {
          state: {
            ...s,
            beat: (s.beat + 1) as 1 | 2,
          },
          effects: [],
        };
      return askFrom(runOf(s), 0);
    case 'shown':
      if (s.kind !== 'asking' || s.shownAt !== null || !Number.isFinite(e.at)) return same(s);
      return {
        state: {
          ...s,
          shownAt: e.at,
        },
        effects: [],
      };
    case 'resume':
      if (s.kind !== 'asking' || s.shownAt === null) return same(s);
      return {
        state: {
          ...s,
          ...freshPrompt(s.index),
          tooFew: s.tooFew,
        },
        effects: [],
      };
    case 'note':
      return s.kind === 'asking' ? onNote(s, e.note) : same(s);
    case 'close': {
      if (s.kind !== 'asking' || s.windowAt === null || !Number.isFinite(e.at)) return same(s);
      if (e.at - s.windowAt < CHORD_WINDOW_MS) return same(s);
      return closeWindow(s, s.windowAt + CHORD_WINDOW_MS);
    }
    case 'input': {
      // Fixed for a run: only before it starts or after it ends.
      if (s.mic === e.mic || (s.kind !== 'ready' && !isFinished(s))) return same(s);
      return {
        state: {
          ...s,
          mic: e.mic,
        },
        effects: [],
      };
    }
    case 'next':
      if (s.kind !== 'feedback') return same(s);
      return askFrom(runOf(s), s.index + 1);
    case 'answered': {
      if (s.kind !== 'saving' || s.attempt !== e.attempt) return same(s);
      const base = {
        ...runOf(s),
        summary: s.summary,
      };
      switch (e.outcome) {
        case 'saved':
          return {
            state: {
              ...base,
              kind: 'saved',
            },
            effects: [],
          };
        case 'unsaved':
        case 'already-scored':
          return {
            state: {
              ...base,
              kind: 'complete',
              why: e.outcome,
            },
            effects: [],
          };
        case 'unauthorized':
          return {
            state: {
              ...base,
              kind: 'signed-out',
            },
            effects: [],
          };
        case 'failed':
        case 'invalid':
          return {
            state: {
              ...base,
              kind: 'failed',
              attempt: s.attempt,
            },
            effects: [],
          };
        default:
          return unreachable(e.outcome);
      }
    }
    case 'retry': {
      if (s.kind !== 'failed') return same(s);
      const attempt = s.attempt + 1;
      return {
        state: {
          ...runOf(s),
          kind: 'saving',
          summary: s.summary,
          attempt,
        },
        effects: [
          {
            type: 'save',
            mode: s.mode,
            attempt,
            summary: s.summary,
            results: s.results,
          },
        ],
      };
    }
    case 'again': {
      if (!isFinished(s)) return same(s);
      return {
        state: {
          ...runOf(s),
          kind: 'countdown',
          beat: 0,
          prompts: e.prompts,
          targets: e.prompts.map((p) => promptMidis(p, s.instrument)),
          scored: s.mode === 'daily' ? false : s.scored,
          results: [],
        },
        effects: [],
      };
    }
    default:
      return unreachable(e);
  }
}

/** One run's machine, in the shape `createRunner` / `useMachine` take. */
export function createSprintMachine(
  opts: Parameters<typeof initial>[0],
): Machine<SprintState, SprintEvent, SprintEffect> {
  return {
    initial: initial(opts),
    step,
  };
}

function unreachable(x: never): never {
  throw new Error(`sprint: unhandled ${JSON.stringify(x)}`);
}
