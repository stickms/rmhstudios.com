import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createFanOut } from './fan-out';

describe('fan-out (the mic level and frame listeners)', () => {
  it('hands every value to every listener until it unsubscribes', () => {
    const fan =
      createFanOut<number>();
    const a =
      vi.fn();
    const b =
      vi.fn();
    const offA =
      fan.add(
        a,
      );
    fan.add(
      b,
    );
    fan.emit(
      1,
    );
    offA();
    fan.emit(
      2,
    );
    expect(
      a
        .mock
        .calls,
    ).toEqual(
      [
        [
          1,
        ],
      ],
    );
    expect(
      b
        .mock
        .calls,
    ).toEqual(
      [
        [
          1,
        ],
        [
          2,
        ],
      ],
    );
    expect(
      fan.size(),
    ).toBe(
      1,
    );
  });

  it('does nothing (and allocates nothing) with no listeners', () => {
    const fan =
      createFanOut<number>();
    const from =
      vi.spyOn(
        Array,
        'from',
      );
    fan.emit(
      1,
    );
    expect(
      from,
    ).not.toHaveBeenCalled();
    from.mockRestore();
  });

  it('a throwing listener neither stops the others nor reaches the caller', () => {
    const fan =
      createFanOut<number>();
    const after =
      vi.fn();
    fan.add(
      () => {
        throw new Error(
          'listener bug',
        );
      },
    );
    fan.add(
      after,
    );
    expect(
      () =>
        fan.emit(
          3,
        ),
    ).not.toThrow();
    expect(
      after,
    ).toHaveBeenCalledWith(
      3,
    );
  });

  it('a listener removed during an emit is not called later in that emit', () => {
    const fan =
      createFanOut<number>();
    const second =
      vi.fn();
    let off =
      () => {};
    fan.add(
      () =>
        off(),
    );
    off =
      fan.add(
        second,
      );
    fan.emit(
      1,
    );
    expect(
      second,
    ).not.toHaveBeenCalled();
  });
});
