import {
  describe,
  expect,
  it,
} from 'vitest';
import { ImpactBus } from './impact';
import { stepBus } from './impactStep';

describe('stepBus', () => {
  it('passes both the delta and the clock to the bus', () => {
    const calls: Array<
      [
        number,
        (
          | number
          | undefined
        ),
      ]
    > =
      [];
    const fake =
      {
        step: (
          dt: number,
          now?: number,
        ) =>
          calls.push(
            [
              dt,
              now,
            ],
          ),
      };
    stepBus(
      fake as unknown as ImpactBus,
      0.016,
      1234,
    );
    expect(
      calls,
    ).toEqual(
      [
        [
          0.016,
          1234,
        ],
      ],
    );
  });
  it('still steps a bus that only takes a delta (trauma decays)', () => {
    const bus =
      new ImpactBus();
    bus.emit(
      {
        kind: 'hit',
        victim: 1,
        attacker: 0,
        power: 20,
        x: 0,
        y: 1,
        z: 0,
        dirX: 1,
        dirZ: 0,
      },
      0,
    );
    const before =
      bus.trauma;
    stepBus(
      bus,
      0.05,
      10,
    );
    expect(
      bus.trauma,
    ).toBeLessThan(
      before,
    );
  });
});
