/**
 * The sampled instruments as `voice.ts` sees them: one sampler per instrument (created on first
 * use, never at page load), one master chain on the shared context, and the lesson's SOUND SESSION.
 *
 * The session is the one decision a lesson makes about samples (plan §3.4): when it mounts it
 * names its instrument; while the samples are loading, sound reads `loading`; once they are ready
 * the instrument plays; if they fail, or are not ready within {@link LOAD_WAIT_MS}, the synth plays
 * **for the rest of that session**, so the timbre never changes mid-lesson. Samples that arrive
 * late are used by the next session. A load delay is never counted as heard: while the session is
 * deciding, sound is not `ready`, and a note asked for anyway (a key tap, a flashcard reveal) is
 * dropped by `voice.ts` (it never plays on the synth, and its `onStart` never fires).
 *
 * Memory: at most {@link MAX_DECODED} instruments stay decoded; the least recently used one is
 * disposed when another becomes ready (never the running session's).
 */
import { asset } from '@/lib/storage/asset';
import { getAudioContext } from '@/lib/shared/platform';
import {
  INSTRUMENT_CATALOG,
  SAMPLE_DIR,
  isAvailable,
  zonesOf,
} from './catalog';
import {
  createSampler,
  type SamplerDeps,
} from './sampler';
import type {
  Instrument,
  InstrumentId,
} from './types';

/** How long a lesson waits for its samples before it falls back to the synth (ms). */
export const LOAD_WAIT_MS = 2500;

/** What a session plays: still deciding, the samples, or the synth (and why). */
export type SessionChoice =
  | {
      kind: 'pending';
    }
  | {
      kind: 'instrument';
    }
  | {
      kind: 'synth';
      reason:
        | 'timeout'
        | 'failed';
    };

export interface SoundSession {
  readonly id: InstrumentId;
  readonly choice: SessionChoice;
}

// ─── Master chain ───────────────────────────────────────────────────────────

const masters =
  new WeakMap<
    BaseAudioContext,
    AudioNode
  >();

/** master gain 0.8 -> compressor (the safety net for chords) -> destination; one per context. */
export function masterOf(
  ctx: AudioContext,
): AudioNode {
  let node =
    masters.get(
      ctx,
    );
  if (
    node
  )
    return node;
  const gain =
    ctx.createGain();
  gain.gain.value = 0.8;
  const comp =
    ctx.createDynamicsCompressor();
  comp.threshold.value =
    -12;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  gain.connect(
    comp,
  );
  comp.connect(
    ctx.destination,
  );
  node =
    gain;
  masters.set(
    ctx,
    node,
  );
  return node;
}

// ─── Registry ───────────────────────────────────────────────────────────────

function browserDeps(
  id: InstrumentId,
): SamplerDeps {
  return {
    ctx: getAudioContext,
    output:
      masterOf,
    urlOf:
      (
        zone,
      ) =>
        asset(
          `${SAMPLE_DIR}/${id}/${zone.file}`,
        ),
    loader:
      {
        fetch:
          (
            url,
            signal,
          ) =>
            fetch(
              url,
              {
                credentials:
                  'omit',
                signal,
              },
            ),
        sleep:
          (
            ms,
          ) =>
            new Promise(
              (
                r,
              ) =>
                setTimeout(
                  r,
                  ms,
                ),
            ),
        crossOrigin:
          (
            url,
          ) => {
            try {
              return (
                new URL(
                  url,
                  window
                    .location
                    .href,
                )
                  .origin !==
                window
                  .location
                  .origin
              );
            } catch {
              return false;
            }
          },
        online:
          () =>
            typeof navigator ===
              'undefined' ||
            navigator.onLine !==
              false,
      },
    now: () =>
      Date.now(),
  };
}

type Factory =
  (
    id: InstrumentId,
  ) => Instrument;
const defaultFactory: Factory =
  (
    id,
  ) =>
    createSampler(
      INSTRUMENT_CATALOG[
        id
      ],
      zonesOf(
        id,
      ),
      browserDeps(
        id,
      ),
    );
let factory: Factory =
  defaultFactory;
const instruments =
  new Map<
    InstrumentId,
    Instrument
  >();

/**
 * Instruments kept decoded at once (plan §2.3: 6 to 12 MB of buffers each, two at most resident).
 * A third that becomes ready evicts the least recently used one, never the running session's.
 */
export const MAX_DECODED = 2;
/** Instrument ids by last use, least recent first. */
const recency: InstrumentId[] =
  [];

function touch(
  id: InstrumentId,
) {
  const i =
    recency.indexOf(
      id,
    );
  if (
    i >=
    0
  )
    recency.splice(
      i,
      1,
    );
  recency.push(
    id,
  );
}

/** Dispose the least recently used decoded instruments beyond {@link MAX_DECODED}. */
function evict() {
  const decoded =
    recency.filter(
      (
        id,
      ) =>
        instruments.get(
          id,
        )
          ?.state
          .kind ===
        'ready',
    );
  let excess =
    decoded.length -
    MAX_DECODED;
  for (const id of decoded) {
    if (
      excess <=
      0
    )
      break;
    // The running lesson's timbre is never taken away from it.
    if (
      session?.id ===
      id
    )
      continue;
    excess--;
    instruments
      .get(
        id,
      )
      ?.dispose();
  }
}

/**
 * The instrument for `id`, created on first use (nothing is fetched until `load()`). Counts as a
 * use for {@link MAX_DECODED}; a read that is not a use (a status line) takes {@link peekInstrument}.
 */
export function getInstrument(
  id: InstrumentId,
): Instrument | null {
  if (
    !isAvailable(
      id,
    )
  )
    return null;
  let inst =
    instruments.get(
      id,
    );
  if (
    !inst
  ) {
    inst =
      factory(
        id,
      );
    inst.subscribe(
      changed,
    );
    instruments.set(
      id,
      inst,
    );
  }
  touch(
    id,
  );
  return inst;
}

/** The instrument for `id` if one was made, without creating it or counting a use. */
export function peekInstrument(
  id: InstrumentId,
): Instrument | null {
  return (
    instruments.get(
      id,
    ) ??
    null
  );
}

/** Tests: swap how instruments are made and forget the ones made so far (and the session). */
export function __setInstrumentFactory(
  f: Factory | null,
): void {
  endSoundSession();
  for (const inst of instruments.values())
    inst.dispose();
  instruments.clear();
  recency.length = 0;
  factory =
    f ??
    defaultFactory;
}

/**
 * Start loading `id` in the background (LessonScreen calls it, browser idle, when a pitched lesson
 * route mounts; never the home page). Skipped with Data Saver on: the lesson's own session then
 * loads it when it begins.
 */
export function prefetchSound(
  id: InstrumentId,
  opts: {
    user?: boolean;
  } = {},
): Promise<unknown> {
  const inst =
    getInstrument(
      id,
    );
  if (
    !inst
  )
    return Promise.resolve();
  const saveData =
    typeof navigator !==
      'undefined' &&
    (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
        };
      }
    )
      .connection
      ?.saveData ===
      true;
  if (
    saveData &&
    !opts.user
  )
    return Promise.resolve();
  return inst.load(
    opts,
  );
}

// ─── Session ────────────────────────────────────────────────────────────────

const listeners =
  new Set<
    () => void
  >();
let session: {
  id: InstrumentId;
  choice: SessionChoice;
  timer: ReturnType<
    typeof setTimeout
  > | null;
  /** Stops waiting for the audio context to start running. */
  off: () => void;
} | null =
  null;

function notify() {
  for (const fn of [
    ...listeners,
  ])
    fn();
}

/** Re-read the session (and the decoded budget) after any instrument changes state. */
function changed() {
  evict();
  if (
    session &&
    session
      .choice
      .kind ===
      'pending'
  ) {
    const inst =
      instruments.get(
        session.id,
      );
    if (
      inst
        ?.state
        .kind ===
      'ready'
    )
      decide(
        {
          kind: 'instrument',
        },
      );
    else if (
      inst
        ?.state
        .kind ===
      'failed'
    )
      decide(
        {
          kind: 'synth',
          reason:
            'failed',
        },
      );
  }
  notify();
}

function decide(
  choice: SessionChoice,
) {
  if (
    !session
  )
    return;
  if (
    session.timer
  )
    clearTimeout(
      session.timer,
    );
  session.timer =
    null;
  session.choice =
    choice;
}

/**
 * A lesson mounted and will voice its notes with `id`. Starts the load if needed and returns the
 * function that ends the session (call it on unmount). A new session replaces the old one.
 */
export function beginSoundSession(
  id: InstrumentId,
): () => void {
  endSoundSession();
  const inst =
    getInstrument(
      id,
    );
  if (
    !inst
  )
    return () => {};
  const mine =
    {
      id,
      choice:
        {
          kind: 'pending',
        } as SessionChoice,
      timer:
        null as ReturnType<
          typeof setTimeout
        > | null,
      off: () => {},
    };
  session =
    mine;
  if (
    inst
      .state
      .kind ===
    'ready'
  )
    decide(
      {
        kind: 'instrument',
      },
    );
  else {
    // The wait counts from when sound can play (the context is running, usually after the learner's
    // first tap), not from the mount: a learner reading the page for 3 s still gets the samples.
    const startWait =
      () => {
        if (
          session !==
            mine ||
          mine.timer ||
          mine
            .choice
            .kind !==
            'pending'
        )
          return;
        mine.timer =
          setTimeout(
            () => {
              if (
                session ===
                  mine &&
                mine
                  .choice
                  .kind ===
                  'pending'
              ) {
                decide(
                  {
                    kind: 'synth',
                    reason:
                      'timeout',
                  },
                );
                notify();
              }
            },
            LOAD_WAIT_MS,
          );
      };
    const ctx =
      getAudioContext();
    if (
      !ctx ||
      ctx.state ===
        'running'
    )
      startWait();
    else {
      const onState =
        () => {
          if (
            ctx.state !==
            'running'
          )
            return;
          ctx.removeEventListener(
            'statechange',
            onState,
          );
          startWait();
        };
      ctx.addEventListener(
        'statechange',
        onState,
      );
      mine.off =
        () =>
          ctx.removeEventListener(
            'statechange',
            onState,
          );
    }
    // A user-initiated load: a failed instrument gets one more try when a lesson asks for it.
    void inst.load(
      {
        user: true,
      },
    );
    // `load` may finish synchronously (no Web Audio: failed at once).
    if (
      mine
        .choice
        .kind ===
      'pending'
    )
      changed();
  }
  notify();
  return () => {
    if (
      session ===
      mine
    )
      endSoundSession();
  };
}

export function endSoundSession(): void {
  if (
    !session
  )
    return;
  if (
    session.timer
  )
    clearTimeout(
      session.timer,
    );
  session.off();
  session =
    null;
  notify();
}

export function currentSession(): SoundSession | null {
  return session
    ? {
        id: session.id,
        choice:
          session.choice,
      }
    : null;
}

/** Run `fn` when an instrument's state or the session changes; returns the unsubscribe. */
export function onInstrumentChange(
  fn: () => void,
): () => void {
  listeners.add(
    fn,
  );
  return () => {
    listeners.delete(
      fn,
    );
  };
}

/**
 * The sampled instrument the running session fell back from, when its notes play the simple tone
 * instead (the samples failed or were not ready in time): the lessons say so once. Null when the
 * session plays its samples, is still deciding, or there is no Web Audio at all (then nothing plays
 * and the lessons say that instead).
 */
export function sessionFallback(): InstrumentId | null {
  if (
    !session ||
    session
      .choice
      .kind !==
      'synth'
  )
    return null;
  const state =
    instruments.get(
      session.id,
    )?.state;
  if (
    state?.kind ===
      'failed' &&
    state.reason ===
      'unsupported'
  )
    return null;
  return session.id;
}

/** How a note is voiced: the samples, the synth, or not at all yet (the session is deciding). */
export type NoteRoute =
  | {
      kind: 'instrument';
      inst: Instrument;
    }
  | {
      kind: 'synth';
    }
  | {
      kind: 'pending';
    };

const SYNTH: NoteRoute =
  {
    kind: 'synth',
  };
const PENDING: NoteRoute =
  {
    kind: 'pending',
  };

/**
 * How `midi` with sound `id` is voiced now. Inside a lesson's session for `id` the session decides,
 * and its choice holds for the rest of the lesson, so the timbre never changes mid-lesson: while it
 * is still deciding the note is `pending` (the caller drops it: never the synth, never "heard");
 * once it chose the samples they play every note they reach (a note out of their range is the one
 * exception, on the synth, plan §3.4); once it chose the synth, the synth plays everything. Outside
 * a session (the Sound dialog's preview) a ready instrument plays and anything else is the synth.
 */
export function instrumentFor(
  id:
    | InstrumentId
    | undefined,
  midi: number,
): NoteRoute {
  if (
    !id
  )
    return SYNTH;
  if (
    session &&
    session.id ===
      id
  ) {
    if (
      session
        .choice
        .kind ===
      'pending'
    )
      return PENDING;
    if (
      session
        .choice
        .kind ===
      'synth'
    )
      return SYNTH;
  }
  const inst =
    getInstrument(
      id,
    );
  if (
    !inst ||
    inst
      .state
      .kind !==
      'ready' ||
    !inst.canPlay(
      midi,
    )
  )
    return SYNTH;
  return {
    kind: 'instrument',
    inst,
  };
}
