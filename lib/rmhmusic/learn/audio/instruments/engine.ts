/**
 * The sampled instruments as `voice.ts` sees them: one sampler per instrument (created on first
 * use, never at page load), one master chain on the shared context, and the lesson's SOUND SESSION.
 *
 * The session is the one decision a lesson makes about samples (plan §3.4): when it mounts it
 * names its instrument; while the samples are loading, sound reads `loading`; once they are ready
 * the instrument plays; if they fail, or are not ready within {@link LOAD_WAIT_MS}, the synth plays
 * **for the rest of that session**, so the timbre never changes mid-lesson. Samples that arrive
 * late are used by the next session. A load delay is never counted as heard: while the session is
 * deciding, sound is not `ready`, so lessons neither play nor accept answers.
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

/** How long a lesson waits for its samples before it settles for the synth (ms). */
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
          ) =>
            fetch(
              url,
              {
                credentials:
                  'omit',
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

/** The instrument for `id`, created on first use (nothing is fetched until `load()`). */
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
  return inst;
}

/** Tests: swap how instruments are made and forget the ones made so far (and the session). */
export function __setInstrumentFactory(
  f: Factory | null,
): void {
  for (const inst of instruments.values())
    inst.dispose();
  instruments.clear();
  factory =
    f ??
    defaultFactory;
  endSoundSession();
}

/**
 * Start loading `id` in the background when the browser is idle (a lesson route, the Sound
 * dialog). Skipped with Data Saver on: the lesson then loads on its own when it begins.
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
} | null =
  null;

function notify() {
  for (const fn of [
    ...listeners,
  ])
    fn();
}

/** Re-read the session after any instrument changes state. */
function changed() {
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
      settle(
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
      settle(
        {
          kind: 'synth',
          reason:
            'failed',
        },
      );
  }
  notify();
}

function settle(
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
    };
  session =
    mine;
  if (
    inst
      .state
      .kind ===
    'ready'
  )
    settle(
      {
        kind: 'instrument',
      },
    );
  else {
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
            settle(
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
    // A user-initiated load: a failed instrument gets one more try when a lesson asks for it.
    void inst.load(
      {
        user: true,
      },
    );
    // `load` may settle synchronously (no Web Audio: failed at once).
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
 * The instrument that should voice `midi` now, or null for the synth: it must be ready and reach
 * the note, and inside a session only once the session chose the samples.
 */
export function instrumentFor(
  id:
    | InstrumentId
    | undefined,
  midi: number,
): Instrument | null {
  if (
    !id
  )
    return null;
  if (
    session &&
    session.id ===
      id &&
    session
      .choice
      .kind !==
      'instrument'
  )
    return null;
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
    return null;
  return inst;
}
