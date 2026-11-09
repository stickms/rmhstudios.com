/**
 * The learn store's data as one pure machine: loading the profile and
 * progress, optimistic profile writes, and lesson completions.
 *
 * It replaces a `status` + `error` pair, a module-level `loading` promise, a
 * `writes` counter, a promise `queue`, a `confirmed` snapshot and a
 * same-value rollback guard, which together could (review findings): roll a
 * field back past a newer same-value write (10, 20, 10, first fails -> 0),
 * leave `save_failed` up after a later write saved the field, stay `error`
 * after a 401 that a later success disproved, let a load clobber queued
 * optimistic fields, and show one action's failure in another's UI.
 *
 * The model: what the server holds (`confirmed`, `progress`) plus what the
 * learner asked for and is not yet answered (`intents`, `completions`). The
 * screen shows the second folded over the first (`viewProfile`,
 * `viewProgress`), so:
 *
 * - a failed write just drops its intent: the field falls back to the newest
 *   remaining intent for it, or to the server's value (the last intent wins);
 * - a field is reported failed only when the failed intent was its newest,
 *   and stops being failed the moment it is changed again;
 * - a load (or any server answer) replaces only the server half, so queued
 *   optimistic fields survive it;
 * - profile writes go out one at a time, head first, each carrying the full
 *   view at the moment it is sent (`flush` runs a microtask after the change,
 *   so changes made together share the first request).
 *
 * Async answers carry the id (or load token) they answer; a stale one is
 * ignored here. Pure: no fetch, no clock (the caller passes `at`).
 */
import { getLesson } from '../content/path';
import type { LessonProgressRow, Profile } from '../progress.server';
import { lessonCompleteSchema, profileSchema, type LessonCompleteInput } from '../schemas';
import { mergeLessonResult } from '../xp';

export type LoadPhase =
  | { kind: 'idle' }
  | { kind: 'loading'; token: number }
  | { kind: 'ready' }
  | { kind: 'failed'; reason: 'load_failed' | 'unauthorized' };

export type ProfileKey = keyof Profile;

/** One requested profile change, waiting for (or riding) a PUT. */
export type Intent = { [K in ProfileKey]: { id: number; key: K; value: Profile[K] } }[ProfileKey];

/** A change as the caller asks for it (before it is given an id). */
export type Change = { [K in ProfileKey]: { key: K; value: Profile[K] } }[ProfileKey];

/** One lesson completion, posted and not yet answered. */
export interface Completion extends LessonCompleteInput {
  id: number;
  /** When it was completed (ISO), for the optimistic row's `completedAt`. */
  at: string;
}

export interface State {
  load: LoadPhase;
  /** Id source for intents, completions and load tokens. */
  seq: number;
  /** The profile the server last answered with; null until loaded. */
  confirmed: Profile | null;
  /** Requested changes not yet answered, oldest first. */
  intents: readonly Intent[];
  /** The intent whose PUT is in flight (always `intents[0]`), if any. */
  sending: number | null;
  /** Fields whose newest change failed to save. */
  failed: readonly ProfileKey[];
  /** The progress rows the server last answered with. */
  progress: readonly LessonProgressRow[];
  completions: readonly Completion[];
  /** A request came back 401 and nothing since has succeeded. */
  expired: boolean;
  /** The last call was refused before any request (no profile yet, or an invalid value). */
  rejected: 'not_loaded' | 'invalid' | null;
}

export type CompleteOutcome = 'saved' | 'failed' | 'unauthorized' | 'invalid';

export type Event =
  | { type: 'load' }
  | { type: 'loaded'; token: number; profile: Profile; progress: LessonProgressRow[] }
  | { type: 'load-failed'; token: number; unauthorized: boolean }
  | { type: 'change'; change: Change }
  | { type: 'flush' }
  /** `profile`: what the server answered, or the body sent when its answer had none. */
  | { type: 'put-ok'; id: number; profile: Profile }
  | { type: 'put-failed'; id: number; unauthorized: boolean }
  | { type: 'complete'; lessonId: string; stars: number; score: number; at: string }
  /** `progress`: the server's rows, or null when its answer had none (a failure). */
  | { type: 'post-ok'; id: number; progress: LessonProgressRow[] | null }
  | { type: 'post-failed'; id: number; unauthorized: boolean };

export type Effect =
  | { type: 'fetch'; token: number }
  /** Send the head intent's PUT with this body. */
  | { type: 'put'; id: number; body: Profile }
  | { type: 'post'; id: number; body: LessonCompleteInput }
  /** Feed `flush` back after the current task's changes have all been made. */
  | { type: 'schedule-flush' }
  /** The caller of this event is answered when `id` settles. */
  | { type: 'join'; id: number }
  /** The caller of this event is answered now (with `outcome`, for a completion). */
  | { type: 'answer-now'; outcome?: CompleteOutcome }
  | { type: 'settle'; id: number; outcome?: CompleteOutcome };

export const initial: State = {
  load: { kind: 'idle' },
  seq: 0,
  confirmed: null,
  intents: [],
  sending: null,
  failed: [],
  progress: [],
  completions: [],
  expired: false,
  rejected: null,
};

// ─── Views ───────────────────────────────────────────────────────

function apply(profile: Profile, c: Change): Profile {
  return { ...profile, [c.key]: c.value };
}

/** The profile the learner sees: the server's, with every unanswered change on top. */
export function viewProfile(s: State): Profile | null {
  if (!s.confirmed) return null;
  let p = s.confirmed;
  for (const i of s.intents) p = apply(p, i);
  return p;
}

/** Fold one completion into rows, the way the server will (stars and best score only go up). */
function completeRow(rows: readonly LessonProgressRow[], c: Completion): LessonProgressRow[] {
  const before = rows.find((r) => r.lessonId === c.lessonId) ?? null;
  const merged = mergeLessonResult(before, c);
  const row: LessonProgressRow = {
    lessonId: c.lessonId,
    stars: merged.stars,
    bestScore: merged.bestScore,
    completedAt: before?.completedAt ?? (merged.stars >= 1 ? c.at : null),
  };
  return [...rows.filter((r) => r.lessonId !== c.lessonId), row];
}

/** The progress the learner sees: the server's rows, with every unanswered completion on top. */
export function viewProgress(s: State): readonly LessonProgressRow[] {
  let rows = s.progress;
  for (const c of s.completions) rows = completeRow(rows, c);
  return rows;
}

export type Status = 'idle' | 'loading' | 'ready' | 'error';
export type ErrorCode = 'load_failed' | 'save_failed' | 'unauthorized' | 'not_loaded' | 'invalid';

export function status(s: State): Status {
  switch (s.load.kind) {
    case 'idle':
      return 'idle';
    case 'loading':
      return 'loading';
    case 'ready':
      return s.expired ? 'error' : 'ready';
    case 'failed':
      return 'error';
    default:
      return unreachable(s.load);
  }
}

export function errorCode(s: State): ErrorCode | null {
  if (s.load.kind === 'failed') return s.load.reason;
  if (s.expired) return 'unauthorized';
  if (s.rejected) return s.rejected;
  return s.failed.length > 0 ? 'save_failed' : null;
}

// ─── Transitions ─────────────────────────────────────────────────

export interface Step {
  state: State;
  effects: Effect[];
}

const same = (s: State): Step => ({ state: s, effects: [] });

export function step(s: State, e: Event): Step {
  switch (e.type) {
    case 'load': {
      if (s.load.kind === 'loading')
        return { state: s, effects: [{ type: 'join', id: s.load.token }] };
      // Already loaded (a remount): keep what is on screen. Idle, failed and a 401 since still fetch.
      if (s.load.kind === 'ready' && !s.expired)
        return { state: s, effects: [{ type: 'answer-now' }] };
      const token = s.seq + 1;
      return {
        state: { ...s, seq: token, load: { kind: 'loading', token }, rejected: null, failed: [] },
        effects: [
          { type: 'fetch', token },
          { type: 'join', id: token },
        ],
      };
    }

    case 'loaded':
    case 'load-failed': {
      if (s.load.kind !== 'loading' || s.load.token !== e.token) return same(s);
      const settle: Effect = { type: 'settle', id: e.token };
      if (e.type === 'load-failed') {
        return {
          state: {
            ...s,
            load: { kind: 'failed', reason: e.unauthorized ? 'unauthorized' : 'load_failed' },
          },
          effects: [settle],
        };
      }
      // Only the server half is replaced: unanswered changes and completions stay on top.
      return {
        state: {
          ...s,
          load: { kind: 'ready' },
          confirmed: e.profile,
          progress: e.progress,
          expired: false,
        },
        effects: [settle],
      };
    }

    case 'change': {
      const view = viewProfile(s);
      if (!view)
        return { state: { ...s, rejected: 'not_loaded' }, effects: [{ type: 'answer-now' }] };
      if (!profileSchema.safeParse(apply(view, e.change)).success) {
        return { state: { ...s, rejected: 'invalid' }, effects: [{ type: 'answer-now' }] };
      }
      const id = s.seq + 1;
      const intent = { id, ...e.change } as Intent;
      return {
        state: {
          ...s,
          seq: id,
          intents: [...s.intents, intent],
          failed: s.failed.filter((k) => k !== e.change.key),
          rejected: null,
        },
        effects:
          s.sending === null
            ? [{ type: 'join', id }, { type: 'schedule-flush' }]
            : [{ type: 'join', id }],
      };
    }

    case 'flush': {
      if (s.sending !== null || s.intents.length === 0) return same(s);
      const body = viewProfile(s);
      if (!body) return same(s);
      const id = s.intents[0].id;
      return { state: { ...s, sending: id }, effects: [{ type: 'put', id, body }] };
    }

    case 'put-ok':
    case 'put-failed': {
      if (s.sending !== e.id) return same(s);
      const done = s.intents.find((i) => i.id === e.id);
      const intents = s.intents.filter((i) => i.id !== e.id);
      let next: State = { ...s, intents, sending: null };
      if (e.type === 'put-ok') {
        next = { ...next, confirmed: e.profile, expired: false };
      } else {
        // Failed only if nothing newer for the same field is still on its way.
        const superseded = done !== undefined && intents.some((i) => i.key === done.key);
        if (done && !superseded && !next.failed.includes(done.key)) {
          next = { ...next, failed: [...next.failed, done.key] };
        }
        if (e.unauthorized) next = { ...next, expired: true };
      }
      const effects: Effect[] = [{ type: 'settle', id: e.id }];
      if (intents.length > 0) effects.push({ type: 'schedule-flush' });
      return { state: next, effects };
    }

    case 'complete': {
      if (!getLesson(e.lessonId))
        return { state: s, effects: [{ type: 'answer-now', outcome: 'invalid' }] };
      const body = lessonCompleteSchema.safeParse({
        lessonId: e.lessonId,
        stars: Math.max(0, Math.min(3, Math.round(e.stars))),
        score: Math.max(0, Math.min(100, Math.round(e.score))),
      });
      if (!body.success) {
        return {
          state: { ...s, rejected: 'invalid' },
          effects: [{ type: 'answer-now', outcome: 'invalid' }],
        };
      }
      const id = s.seq + 1;
      return {
        state: {
          ...s,
          seq: id,
          completions: [...s.completions, { ...body.data, id, at: e.at }],
          rejected: null,
        },
        effects: [
          { type: 'post', id, body: body.data },
          { type: 'join', id },
        ],
      };
    }

    case 'post-ok':
    case 'post-failed': {
      if (!s.completions.some((c) => c.id === e.id)) return same(s);
      const completions = s.completions.filter((c) => c.id !== e.id);
      if (e.type === 'post-ok' && e.progress) {
        return {
          state: { ...s, completions, progress: e.progress, expired: false },
          effects: [{ type: 'settle', id: e.id, outcome: 'saved' }],
        };
      }
      const unauthorized = e.type === 'post-failed' && e.unauthorized;
      return {
        state: { ...s, completions, expired: unauthorized ? true : s.expired },
        effects: [{ type: 'settle', id: e.id, outcome: unauthorized ? 'unauthorized' : 'failed' }],
      };
    }

    default:
      return unreachable(e);
  }
}

export function transition(s: State, e: Event): State {
  return step(s, e).state;
}

export function effects(prev: State, _next: State, e: Event): Effect[] {
  return step(prev, e).effects;
}

function unreachable(x: never): never {
  throw new Error(`learn-data: unhandled ${JSON.stringify(x)}`);
}
