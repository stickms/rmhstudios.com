/**
 * RMH Music learn — client state. Holds the learner's profile and lesson
 * progress, and owns the one input hub (microphone / MIDI / computer keyboard /
 * on-screen keys) the lesson UI listens to.
 *
 * The route is server-rendered, so importing this module must do nothing: the
 * hub and the on-screen-keys handle are built lazily, once, in the browser
 * (`ensureInput`, called from `load()`), never at import or during SSR.
 *
 * Loading, optimistic writes and completions are the pure machine in
 * `machines/learn-data.ts`; this file performs its requests and publishes its
 * state as the fields below. Writes are optimistic. A failed request undoes
 * only what it asked for (the field falls back to the newest change still on
 * its way, or the server's value) and leaves a short code in `error`
 * (`load_failed`, `save_failed`, `unauthorized`) with the failed fields in
 * `saveFailed`; the store holds no user-facing copy, the UI translates it.
 */
import { create } from 'zustand';
import { createInputHub, type InputHub } from './input/hub';
import { createKeyboardInput } from './input/keyboard';
import { createMicInput } from './input/mic';
import { createMidiInput, type MidiInputAdapter } from './input/midi';
import { createScreenInput } from './input/screen';
import type { LessonProgressRow, Profile } from './progress.server';
import type { CardRow } from './content/practice';
import * as data from './machines/learn-data';
import type { CompleteOutcome, ProfileKey } from './machines/learn-data';
import { INPUTS, INSTRUMENTS, profileSchema } from './schemas';
import type { Instrument, LearnInput, LessonCompleteInput, ReviewInput } from './schemas';

export type { CardRow, LessonProgressRow, Profile };

/**
 * The remembered cards' load, kept apart from the profile's so a failed card request never
 * breaks the home: the home just shows no Practice link, and Practice says so itself.
 */
export type CardsStatus = 'idle' | 'loading' | 'ready' | 'load_failed' | 'unauthorized';

export type LearnStatus = data.Status;
export type { CompleteOutcome, ProfileKey };
export type ScreenInput = ReturnType<typeof createScreenInput>;

/** Stable codes for `error`; the UI decides what to say. */
export type LearnError = data.ErrorCode;

export interface LearnState {
  profile: Profile | null;
  progress: LessonProgressRow[];
  /** Null until `load()` has run in the browser (and always during SSR). */
  hub: InputHub | null;
  /** The on-screen keys' `press`/`release` handle; same lifetime as `hub`. */
  screen: ScreenInput | null;
  /** The MIDI adapter, for its device list (`devices`, `onDevicesChange`); same lifetime as `hub`. */
  midi: MidiInputAdapter | null;
  status: LearnStatus;
  /**
   * The screen-level problem, if any: the load failed, the session ended, the
   * last call was refused, or some field's newest change failed to save. Which
   * field is in `saveFailed`, so a screen shows only its own action's failure.
   */
  error: LearnError | null;
  /** Profile fields whose newest change failed to save (cleared when the field is changed again). */
  saveFailed: readonly ProfileKey[];
  /** The machine behind every field above (`machines/learn-data.ts`); read the projected fields instead. */
  sync: data.State;

  load(): Promise<void>;
  setInstrument(instrument: Instrument): Promise<void>;
  setInput(input: LearnInput): Promise<void>;
  setLatency(ms: number): Promise<void>;
  /** Resolves with how the save went, so the lesson can say so without reading the shared `error`. */
  completeLesson(lessonId: string, stars: number, score: number): Promise<CompleteOutcome>;

  /** The learner's remembered cards (Practice), as the server last answered. */
  cards: readonly CardRow[];
  cardsStatus: CardsStatus;
  /** Fetch the remembered cards once per page load (again after a failure); concurrent calls share it. */
  loadCards(): Promise<void>;
  /**
   * Post one Practice session's reviews. On success the returned rows replace the stored ones, so
   * the home and the next session see the new schedule without a reload. Pays nothing.
   */
  saveReviews(reviews: ReviewInput[]): Promise<CompleteOutcome>;
}

const PROFILE_URL = '/api/rmhmusic/learn/profile';
const COMPLETE_URL = '/api/rmhmusic/learn/lesson-complete';
const CARDS_URL = '/api/rmhmusic/learn/cards';

// ─── Input (client only) ─────────────────────────────────────────

type BuiltInput = { hub: InputHub; screen: ScreenInput; midi: MidiInputAdapter };

let input: BuiltInput | null = null;

/** Listeners for the microphone's input level (RMS, 0..1), fed while the mic runs. */
const micLevelListeners = new Set<(rms: number) => void>();

/**
 * Hear the microphone's level (about 40 times a second while it is on), for a
 * level meter. Returns a function that removes the listener.
 */
export function subscribeMicLevel(l: (rms: number) => void): () => void {
  micLevelListeners.add(l);
  return () => {
    micLevelListeners.delete(l);
  };
}

function ensureInput(): BuiltInput | null {
  // The adapters read browser APIs; on the server there is nothing to build.
  if (typeof window === 'undefined') return null;
  if (!input) {
    const screen = createScreenInput();
    const midi = createMidiInput();
    const mic = createMicInput({
      onLevel: (rms) => {
        for (const l of [...micLevelListeners]) l(rms);
      },
    });
    const hub = createInputHub([mic, midi, createKeyboardInput(), screen]);
    input = { hub, screen, midi };
  }
  return input;
}

// ─── Requests ────────────────────────────────────────────────────

type Reply = { ok: true; data: unknown } | { ok: false; unauthorized: boolean };

async function request(url: string, method: string, body?: unknown): Promise<Reply> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, unauthorized: res.status === 401 };
    // A write's body is not needed; only `load` and `completeLesson` validate it.
    return { ok: true, data: await res.json().catch(() => null) };
  } catch {
    return { ok: false, unauthorized: false };
  }
}

const isRow = (v: unknown): v is LessonProgressRow =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as LessonProgressRow).lessonId === 'string' &&
  typeof (v as LessonProgressRow).stars === 'number';

const isProfile = (v: unknown): v is Profile => profileSchema.safeParse(v).success;

const isCardRow = (v: unknown): v is CardRow => {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as CardRow;
  return (
    typeof r.cardId === 'string' &&
    typeof r.due === 'string' &&
    (r.lastReviewAt === null || typeof r.lastReviewAt === 'string') &&
    typeof r.stability === 'number' &&
    typeof r.difficulty === 'number' &&
    typeof r.reps === 'number' &&
    typeof r.lapses === 'number'
  );
};

/** `prev` with `updated` written over it by card id (the server's answer to a review batch). */
export function mergeCards(prev: readonly CardRow[], updated: readonly CardRow[]): CardRow[] {
  const byId = new Map(updated.map((r) => [r.cardId, r]));
  const out = prev.map((r) => byId.get(r.cardId) ?? r);
  const seen = new Set(prev.map((r) => r.cardId));
  for (const r of updated) if (!seen.has(r.cardId)) out.push(r);
  return out;
}

// ─── Store ───────────────────────────────────────────────────────

/** The machine's state projected onto the store's public fields. */
type Projection = Pick<LearnState, 'profile' | 'progress' | 'status' | 'error' | 'saveFailed'>;

const sameProfile = (a: Profile | null, b: Profile | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.instrument === b.instrument &&
    a.input === b.input &&
    a.latencyMs === b.latencyMs &&
    a.dailyGoal === b.dailyGoal);

const sameList = <T>(a: readonly T[], b: readonly T[]) =>
  a === b || (a.length === b.length && a.every((v, i) => v === b[i]));

/**
 * The public fields for `sync`, reusing the previous objects when nothing in
 * them changed, so a selector over `profile` or `progress` does not re-render
 * on an unrelated transition.
 */
export function project(sync: data.State, prev?: Projection): Projection {
  const profile = data.viewProfile(sync);
  const progress = data.viewProgress(sync);
  return {
    profile: prev && sameProfile(prev.profile, profile) ? prev.profile : profile,
    progress:
      prev && sameList(prev.progress, progress) ? prev.progress : (progress as LessonProgressRow[]),
    status: data.status(sync),
    error: data.errorCode(sync),
    saveFailed: prev && sameList(prev.saveFailed, sync.failed) ? prev.saveFailed : sync.failed,
  };
}

export const useLearnStore = create<LearnState>()((set, get) => {
  /** Callers waiting on an id (a load token, a write, a completion). */
  const waiters = new Map<number, ((outcome?: CompleteOutcome) => void)[]>();

  /** Feed one event to the machine, publish the result, then carry out its effects. */
  function send(event: data.Event, waiter?: (outcome?: CompleteOutcome) => void): void {
    const current = get();
    const { state, effects } = data.step(current.sync, event);
    if (state !== current.sync) set({ sync: state, ...project(state, current) });
    for (const fx of effects) {
      switch (fx.type) {
        case 'fetch':
          void fetchProfile(fx.token);
          break;
        case 'put':
          void put(fx.id, fx.body);
          break;
        case 'post':
          void post(fx.id, fx.body);
          break;
        case 'schedule-flush':
          queueMicrotask(() => send({ type: 'flush' }));
          break;
        case 'join':
          if (waiter) waiters.set(fx.id, [...(waiters.get(fx.id) ?? []), waiter]);
          break;
        case 'answer-now':
          waiter?.(fx.outcome);
          break;
        case 'settle': {
          const list = waiters.get(fx.id) ?? [];
          waiters.delete(fx.id);
          for (const w of list) w(fx.outcome);
          break;
        }
        default: {
          const never: never = fx;
          throw new Error(`learn store: unhandled effect ${JSON.stringify(never)}`);
        }
      }
    }
  }

  const ask = <T = void>(event: data.Event) =>
    new Promise<T>((resolve) => send(event, (outcome) => resolve(outcome as T)));

  async function fetchProfile(token: number) {
    const reply = await request(PROFILE_URL, 'GET');
    if (!reply.ok) {
      send({ type: 'load-failed', token, unauthorized: reply.unauthorized });
      return;
    }
    const body = reply.data as { profile?: unknown; progress?: unknown } | null;
    if (!body || !isProfile(body.profile) || !Array.isArray(body.progress)) {
      send({ type: 'load-failed', token, unauthorized: false });
      return;
    }
    send({ type: 'loaded', token, profile: body.profile, progress: body.progress.filter(isRow) });
  }

  async function put(id: number, body: Profile) {
    const reply = await request(PROFILE_URL, 'PUT', body);
    if (!reply.ok) {
      send({ type: 'put-failed', id, unauthorized: reply.unauthorized });
      return;
    }
    const returned = (reply.data as { profile?: unknown } | null)?.profile;
    send({ type: 'put-ok', id, profile: isProfile(returned) ? returned : body });
  }

  async function post(id: number, body: LessonCompleteInput) {
    const reply = await request(COMPLETE_URL, 'POST', body);
    if (!reply.ok) {
      send({ type: 'post-failed', id, unauthorized: reply.unauthorized });
      return;
    }
    const rows = (reply.data as { progress?: unknown } | null)?.progress;
    send({ type: 'post-ok', id, progress: Array.isArray(rows) ? rows.filter(isRow) : null });
  }

  const change = (c: data.Change) => ask({ type: 'change', change: c });

  let cardsLoading: Promise<void> | null = null;

  return {
    ...project(data.initial),
    sync: data.initial,
    hub: null,
    screen: null,
    midi: null,

    load() {
      const built = ensureInput();
      if (built && get().hub !== built.hub) set(built);
      return ask({ type: 'load' });
    },

    setInstrument(instrument) {
      if (!INSTRUMENTS.includes(instrument)) return Promise.resolve();
      return change({ key: 'instrument', value: instrument });
    },

    setInput(next) {
      if (!INPUTS.includes(next)) return Promise.resolve();
      return change({ key: 'input', value: next });
    },

    setLatency(ms) {
      if (!Number.isFinite(ms)) return Promise.resolve();
      return change({ key: 'latencyMs', value: Math.max(-500, Math.min(500, Math.round(ms))) });
    },

    completeLesson(lessonId, stars, score) {
      return ask<CompleteOutcome>({
        type: 'complete',
        lessonId,
        stars,
        score,
        at: new Date().toISOString(),
      });
    },

    cards: [],
    cardsStatus: 'idle',

    loadCards() {
      const { cardsStatus } = get();
      if (cardsStatus === 'ready') return Promise.resolve();
      if (cardsLoading) return cardsLoading;
      set({ cardsStatus: 'loading' });
      cardsLoading = request(CARDS_URL, 'GET').then((reply) => {
        cardsLoading = null;
        const rows = reply.ok ? (reply.data as { cards?: unknown } | null)?.cards : null;
        if (!reply.ok || !Array.isArray(rows)) {
          set({ cardsStatus: !reply.ok && reply.unauthorized ? 'unauthorized' : 'load_failed' });
          return;
        }
        set({ cards: rows.filter(isCardRow), cardsStatus: 'ready' });
      });
      return cardsLoading;
    },

    async saveReviews(reviews) {
      const reply = await request(CARDS_URL, 'POST', { reviews });
      if (!reply.ok) return reply.unauthorized ? 'unauthorized' : 'failed';
      const rows = (reply.data as { cards?: unknown } | null)?.cards;
      if (!Array.isArray(rows)) return 'failed';
      set({ cards: mergeCards(get().cards, rows.filter(isCardRow)) });
      return 'saved';
    },
  };
});
