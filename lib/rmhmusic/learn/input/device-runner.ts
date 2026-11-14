/**
 * The impure shell around the device-lifecycle machine, shared by the hub
 * (one runner per source) and the microphone and MIDI adapters. It holds the
 * machine's state, feeds it events, and interprets its effects with the
 * callbacks it is given; it decides nothing itself. Client-safe.
 */
import * as life from '../machines/device-lifecycle';

export interface DeviceHooks {
  /**
   * Begin run `run`: acquire the device. `wanted()` says whether the user
   * still wants this run, so the device can release what it is handed after
   * an await instead of keeping it. Resolve when running, reject on failure.
   */
  launch(
    run: number,
    wanted: () => boolean,
  ): Promise<void>;
  /** Release the device (and anything it is about to be handed); idempotent. */
  stopDevice(): void;
  /** Stop listening to the device (the hub's subscription); optional. */
  unsubscribe?(): void;
  /** Called after every change of phase. */
  onPhase?(
    phase: life.Phase,
  ): void;
}

export interface DeviceRunner {
  start(): Promise<void>;
  stop(): void;
  phase(): life.Phase;
  lastError(): Error | null;
}

interface Waiter {
  resolve(): void;
  reject(
    err: Error,
  ): void;
}

export function createDeviceRunner(
  hooks: DeviceHooks,
): DeviceRunner {
  let state: life.State =
    life.initial;
  /** `start()` callers, by the run that answers them. */
  const waiters =
    new Map<
      number,
      Waiter[]
    >();

  const settle =
    (
      run: number,
      error: Error | null,
    ) => {
      const list =
        waiters.get(
          run,
        ) ??
        [];
      waiters.delete(
        run,
      );
      for (const w of list) {
        if (
          error
        )
          w.reject(
            error,
          );
        else
          w.resolve();
      }
    };

  const launch =
    (
      run: number,
    ) => {
      let started: Promise<void>;
      try {
        started =
          hooks.launch(
            run,
            () =>
              life.isWanted(
                state,
                run,
              ),
          );
      } catch (err) {
        started =
          Promise.reject(
            err,
          );
      }
      started.then(
        () =>
          send(
            {
              type: 'started',
              run,
            },
          ),
        (
          err: unknown,
        ) =>
          send(
            {
              type: 'failed',
              run,
              error:
                err instanceof
                Error
                  ? err
                  : new Error(
                      String(
                        err,
                      ),
                    ),
            },
          ),
      );
    };

  function send(
    event: life.Event,
    waiter?: Waiter,
  ): void {
    const before =
      life.phase(
        state,
      );
    const {
      state:
        next,
      effects,
    } =
      life.step(
        state,
        event,
      );
    state =
      next;
    for (const fx of effects) {
      switch (
        fx.type
      ) {
        case 'launch':
          launch(
            fx.run,
          );
          break;
        case 'join': {
          if (
            !waiter
          )
            break;
          const list =
            waiters.get(
              fx.run,
            );
          if (
            list
          )
            list.push(
              waiter,
            );
          else
            waiters.set(
              fx.run,
              [
                waiter,
              ],
            );
          break;
        }
        case 'answer-now':
          waiter?.resolve();
          break;
        case 'stop-device':
          hooks.stopDevice();
          break;
        case 'unsubscribe':
          hooks.unsubscribe?.();
          break;
        case 'answer':
          settle(
            fx.run,
            fx.error,
          );
          break;
        default: {
          const never: never =
            fx;
          throw new Error(
            `device-runner: unhandled effect ${JSON.stringify(never)}`,
          );
        }
      }
    }
    const after =
      life.phase(
        state,
      );
    if (
      after !==
      before
    )
      hooks.onPhase?.(
        after,
      );
  }

  return {
    start:
      () =>
        new Promise<void>(
          (
            resolve,
            reject,
          ) =>
            send(
              {
                type: 'start',
              },
              {
                resolve,
                reject,
              },
            ),
        ),
    stop: () =>
      send(
        {
          type: 'stop',
        },
      ),
    phase:
      () =>
        life.phase(
          state,
        ),
    lastError:
      () =>
        life.lastError(
          state,
        ),
  };
}
