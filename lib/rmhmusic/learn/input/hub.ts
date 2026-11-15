/**
 * One place to turn input sources on and off and listen to all of them. The
 * hub subscribes to an adapter only while it is started, remembers why a start
 * failed (so the UI can say "microphone blocked" and still offer the keyboard),
 * and never lets one source's failure touch another. Client-safe and
 * unit-tested with fakes.
 *
 * Each source's start/stop/cancel lifecycle is the pure machine in
 * `../machines/device-lifecycle.ts`, run by `device-runner.ts`; this file only
 * says what its effects mean for an adapter (subscribe then start it, stop it,
 * unsubscribe) and keeps the active order and the phase snapshot.
 */
import type * as life from '../machines/device-lifecycle';
import {
  createDeviceRunner,
  type DeviceRunner,
} from './device-runner';
import type {
  InputAdapter,
  InputSource,
  NoteEvent,
  NoteListener,
} from './events';

export type InputPhase =
  life.Phase;

/** Every source's phase, replaced (never mutated) whenever one changes. */
export type InputPhases =
  Readonly<
    Record<
      InputSource,
      InputPhase
    >
  >;

export interface InputHub {
  /** Listen to every started adapter; returns a function that removes it. */
  subscribe(
    l: NoteListener,
  ): () => void;
  /** Start a source. Failure is recorded in `lastError` and rethrown. */
  start(
    source: InputSource,
  ): Promise<void>;
  /** Stop a source; a no-op if it was never started. */
  stop(
    source: InputSource,
  ): void;
  /** Sources currently started, in the order they were started. */
  active(): InputSource[];
  lastError(
    source: InputSource,
  ): Error | null;
  /** Where a source is in its lifecycle (a start waiting on a permission prompt is `starting`). */
  phase(
    source: InputSource,
  ): InputPhase;
  /** The phases of every source; the same object until one changes (for `useSyncExternalStore`). */
  phases(): InputPhases;
  /** Hear every phase change; returns a function that removes the listener. */
  onChange(
    l: () => void,
  ): () => void;
}

const SOURCES: readonly InputSource[] =
  [
    'mic',
    'midi',
    'keys',
    'screen',
  ];

export function createInputHub(
  adapters: InputAdapter[],
): InputHub {
  const listeners =
    new Set<NoteListener>();
  const changeListeners =
    new Set<
      () => void
    >();
  /** Started sources in the order they became active. */
  let order: InputSource[] =
    [];

  const forward =
    (
      e: NoteEvent,
    ) => {
      for (const l of [
        ...listeners,
      ])
        l(
          e,
        );
    };

  const runners =
    new Map<
      InputSource,
      DeviceRunner
    >();
  for (const adapter of adapters) {
    const source =
      adapter.source;
    let unsubscribe:
      | (() => void)
      | null =
      null;
    runners.set(
      source,
      createDeviceRunner(
        {
          launch() {
            // Subscribe first so a note emitted while start() resolves is not lost.
            unsubscribe?.();
            unsubscribe =
              adapter.subscribe(
                forward,
              );
            return adapter.start();
          },
          stopDevice:
            () =>
              adapter.stop(),
          unsubscribe() {
            unsubscribe?.();
            unsubscribe =
              null;
          },
          onPhase(
            phase,
          ) {
            order =
              order.filter(
                (
                  s,
                ) =>
                  s !==
                  source,
              );
            if (
              phase ===
              'active'
            )
              order.push(
                source,
              );
            snapshot =
              phasesNow();
            for (const l of [
              ...changeListeners,
            ])
              l();
          },
        },
      ),
    );
  }

  function phasesNow(): InputPhases {
    const out =
      {} as Record<
        InputSource,
        InputPhase
      >;
    for (const s of SOURCES)
      out[
        s
      ] =
        runners
          .get(
            s,
          )
          ?.phase() ??
        'idle';
    return out;
  }
  let snapshot: InputPhases =
    phasesNow();

  return {
    subscribe(
      l,
    ) {
      listeners.add(
        l,
      );
      return () => {
        listeners.delete(
          l,
        );
      };
    },

    start(
      source,
    ) {
      const runner =
        runners.get(
          source,
        );
      if (
        !runner
      )
        return Promise.reject(
          new Error(
            `No input adapter for "${source}"`,
          ),
        );
      return runner.start();
    },

    stop(
      source,
    ) {
      runners
        .get(
          source,
        )
        ?.stop();
    },

    active() {
      return [
        ...order,
      ];
    },

    lastError(
      source,
    ) {
      return (
        runners
          .get(
            source,
          )
          ?.lastError() ??
        null
      );
    },

    phase(
      source,
    ) {
      return snapshot[
        source
      ];
    },

    phases() {
      return snapshot;
    },

    onChange(
      l,
    ) {
      changeListeners.add(
        l,
      );
      return () => {
        changeListeners.delete(
          l,
        );
      };
    },
  };
}
