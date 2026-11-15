// Stepping an ImpactBus with the clock it was emitted on.
//
// `bus.step(dt, now)` takes the same `now` (ms) as `bus.emit(event, now)`, so a victim's knock-back spring
// freezes during a hit-stop and slows in the knockout slow motion instead of ticking on in real time.
// The second argument is optional on the bus (omitting it steps in real time), so this wrapper is safe
// against a bus that does not take it yet.
import type { ImpactBus } from './impact';

type SteppableBus =
  {
    step(
      dt: number,
      now?: number,
    ): void;
  };

export function stepBus(
  bus: ImpactBus,
  dt: number,
  now: number,
): void {
  (
    bus as unknown as SteppableBus
  ).step(
    dt,
    now,
  );
}
