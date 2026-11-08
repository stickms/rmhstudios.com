/**
 * RMH Music learn — client state. Holds the learner's profile and lesson
 * progress, and owns the one input hub (microphone / MIDI / computer keyboard /
 * on-screen keys) the lesson UI listens to.
 *
 * The route is server-rendered, so importing this module must do nothing: the
 * hub and the on-screen-keys handle are built lazily, once, in the browser
 * (`ensureInput`, called from `load()`), never at import or during SSR.
 *
 * Writes are optimistic. A failed request restores only what that request
 * changed and leaves a short machine-ish code in `error` (`load_failed`,
 * `save_failed`, `unauthorized`); the store holds no user-facing copy, the UI
 * translates or replaces it.
 */
import { create } from 'zustand';
import { getLesson } from './content/path';
import { createInputHub, type InputHub } from './input/hub';
import { createKeyboardInput } from './input/keyboard';
import { createMicInput } from './input/mic';
import { createMidiInput } from './input/midi';
import { createScreenInput } from './input/screen';
import type { LessonProgressRow, Profile } from './progress.server';
import { INPUTS, INSTRUMENTS, lessonCompleteSchema, profileSchema } from './schemas';
import type { Instrument, LearnInput } from './schemas';
import { mergeLessonResult } from './xp';

export type { LessonProgressRow, Profile };

export type LearnStatus = 'idle' | 'loading' | 'ready' | 'error';
export type ScreenInput = ReturnType<typeof createScreenInput>;

/** Stable codes for `error`; the UI decides what to say. */
export type LearnError = 'load_failed' | 'save_failed' | 'unauthorized' | 'not_loaded' | 'invalid';

export interface LearnState {
  profile: Profile | null;
  progress: LessonProgressRow[];
  /** Null until `load()` has run in the browser (and always during SSR). */
  hub: InputHub | null;
  /** The on-screen keys' `press`/`release` handle; same lifetime as `hub`. */
  screen: ScreenInput | null;
  status: LearnStatus;
  error: LearnError | null;

  load(): Promise<void>;
  setInstrument(instrument: Instrument): Promise<void>;
  setInput(input: LearnInput): Promise<void>;
  setLatency(ms: number): Promise<void>;
  completeLesson(lessonId: string, stars: number, score: number): Promise<void>;
}

const PROFILE_URL = '/api/rmhmusic/learn/profile';
const COMPLETE_URL = '/api/rmhmusic/learn/lesson-complete';

// ─── Input (client only) ─────────────────────────────────────────

let input: { hub: InputHub; screen: ScreenInput } | null = null;

function ensureInput(): { hub: InputHub; screen: ScreenInput } | null {
  // The adapters read browser APIs; on the server there is nothing to build.
  if (typeof window === 'undefined') return null;
  if (!input) {
    const screen = createScreenInput();
    const hub = createInputHub([
      createMicInput(),
      createMidiInput(),
      createKeyboardInput(),
      screen,
    ]);
    input = { hub, screen };
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

// ─── Store ───────────────────────────────────────────────────────

let loading: Promise<void> | null = null;

export const useLearnStore = create<LearnState>()((set, get) => {
  /** Failure of a write: keep the screen usable unless the session is gone. */
  const failSave = (r: Extract<Reply, { ok: false }>) =>
    set(r.unauthorized ? { status: 'error', error: 'unauthorized' } : { error: 'save_failed' });

  /** Optimistically change one profile field, PUT the whole profile, undo on failure. */
  async function saveProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    const current = get().profile;
    if (!current) {
      set({ error: 'not_loaded' });
      return;
    }
    const next = { ...current, [key]: value };
    if (!profileSchema.safeParse(next).success) {
      set({ error: 'invalid' });
      return;
    }
    const previous = current[key];
    set({ profile: next, error: null });
    const reply = await request(PROFILE_URL, 'PUT', next);
    if (reply.ok) return;
    // Undo only this field, and only if nothing newer has replaced it meanwhile.
    set((s) => ({
      profile:
        s.profile && s.profile[key] === value ? { ...s.profile, [key]: previous } : s.profile,
    }));
    failSave(reply);
  }

  return {
    profile: null,
    progress: [],
    hub: null,
    screen: null,
    status: 'idle',
    error: null,

    load() {
      if (loading) return loading;
      const run = (async () => {
        const built = ensureInput();
        set({ status: 'loading', error: null, ...(built ?? {}) });
        const reply = await request(PROFILE_URL, 'GET');
        if (!reply.ok) {
          set({ status: 'error', error: reply.unauthorized ? 'unauthorized' : 'load_failed' });
          return;
        }
        const data = reply.data as { profile?: unknown; progress?: unknown } | null;
        if (!data || !isProfile(data.profile) || !Array.isArray(data.progress)) {
          set({ status: 'error', error: 'load_failed' });
          return;
        }
        set({ profile: data.profile, progress: data.progress.filter(isRow), status: 'ready' });
      })().finally(() => {
        loading = null;
      });
      loading = run;
      return run;
    },

    setInstrument(instrument) {
      if (!INSTRUMENTS.includes(instrument)) return Promise.resolve();
      return saveProfile('instrument', instrument);
    },

    setInput(next) {
      if (!INPUTS.includes(next)) return Promise.resolve();
      return saveProfile('input', next);
    },

    setLatency(ms) {
      if (!Number.isFinite(ms)) return Promise.resolve();
      return saveProfile('latencyMs', Math.max(-500, Math.min(500, Math.round(ms))));
    },

    async completeLesson(lessonId, stars, score) {
      if (!getLesson(lessonId)) return;
      const body = lessonCompleteSchema.safeParse({
        lessonId,
        stars: Math.max(0, Math.min(3, Math.round(stars))),
        score: Math.max(0, Math.min(100, Math.round(score))),
      });
      if (!body.success) {
        set({ error: 'invalid' });
        return;
      }

      const before = get().progress.find((r) => r.lessonId === lessonId) ?? null;
      // The same merge the server applies, so the optimistic row matches its answer.
      const merged = mergeLessonResult(before, body.data);
      const optimistic: LessonProgressRow = {
        lessonId,
        stars: merged.stars,
        bestScore: merged.bestScore,
        completedAt: before?.completedAt ?? (merged.stars >= 1 ? new Date().toISOString() : null),
      };
      const withRow = (rows: LessonProgressRow[], row: LessonProgressRow | null) => {
        const rest = rows.filter((r) => r.lessonId !== lessonId);
        return row ? [...rest, row] : rest;
      };
      set((s) => ({ progress: withRow(s.progress, optimistic), error: null }));

      const reply = await request(COMPLETE_URL, 'POST', body.data);
      const server = reply.ok ? (reply.data as { progress?: unknown } | null)?.progress : null;
      if (reply.ok && Array.isArray(server)) {
        set({ progress: server.filter(isRow) });
        return;
      }
      // Restore just this lesson's row; other completions in flight keep theirs.
      set((s) => ({ progress: withRow(s.progress, before) }));
      failSave(reply.ok ? { ok: false, unauthorized: false } : reply);
    },
  };
});
