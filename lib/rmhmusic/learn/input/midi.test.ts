import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { NoteEvent } from './events';
import { createMidiInput } from './midi';

// The MIDI adapter's privacy- and stuck-note-critical paths: a stop() while
// the permission prompt is open binds nothing, a double start asks once, and
// a stop releases the notes still held.

function fakeAccess() {
  const input =
    {
      id: 'in-1',
      name: 'Keys',
      state:
        'connected',
      onmidimessage:
        null as
          | ((e: {
              data: Uint8Array;
            }) => void)
          | null,
    };
  const access =
    {
      inputs:
        new Map(
          [
            [
              'in-1',
              input,
            ],
          ],
        ),
      addEventListener:
        vi.fn(),
      removeEventListener:
        vi.fn(),
    };
  return {
    access,
    input,
  };
}

describe('createMidiInput', () => {
  let resolveAccess!: (
    a: unknown,
  ) => void;
  let requestMIDIAccess: ReturnType<
    typeof vi.fn
  >;

  beforeEach(
    () => {
      requestMIDIAccess =
        vi.fn(
          () =>
            new Promise(
              (
                res,
              ) => {
                resolveAccess =
                  res;
              },
            ),
        );
      vi.stubGlobal(
        'navigator',
        {
          requestMIDIAccess,
        },
      );
    },
  );

  afterEach(
    () => {
      vi.unstubAllGlobals();
    },
  );

  it('binds nothing when the prompt is answered after stop()', async () => {
    const midi =
      createMidiInput();
    const started =
      midi.start();
    midi.stop();
    const {
      access,
      input,
    } =
      fakeAccess();
    resolveAccess(
      access,
    );
    await started;
    expect(
      input.onmidimessage,
    ).toBeNull();
    expect(
      access.addEventListener,
    ).not.toHaveBeenCalled();
    expect(
      midi.devices(),
    ).toEqual(
      [],
    );
  });

  it('start, stop, start, stop asks once and ends with nothing bound', async () => {
    const midi =
      createMidiInput();
    const first =
      midi.start();
    midi.stop();
    const second =
      midi.start();
    midi.stop();
    const {
      access,
      input,
    } =
      fakeAccess();
    resolveAccess(
      access,
    );
    await Promise.all(
      [
        first,
        second,
      ],
    );
    expect(
      requestMIDIAccess,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      input.onmidimessage,
    ).toBeNull();
  });

  it('a double start asks once; stop releases held notes and unbinds', async () => {
    const midi =
      createMidiInput();
    const got: NoteEvent[] =
      [];
    midi.subscribe(
      (
        e,
      ) =>
        got.push(
          e,
        ),
    );
    const a =
      midi.start();
    const b =
      midi.start();
    const {
      access,
      input,
    } =
      fakeAccess();
    resolveAccess(
      access,
    );
    await Promise.all(
      [
        a,
        b,
      ],
    );
    expect(
      requestMIDIAccess,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      midi.devices(),
    ).toEqual(
      [
        {
          id: 'in-1',
          name: 'Keys',
        },
      ],
    );
    input.onmidimessage?.(
      {
        data: new Uint8Array(
          [
            0x90,
            60,
            100,
          ],
        ),
      },
    );
    expect(
      got.map(
        (
          e,
        ) => [
          e.type,
          e.midi,
        ],
      ),
    ).toEqual(
      [
        [
          'on',
          60,
        ],
      ],
    );
    midi.stop();
    expect(
      got.map(
        (
          e,
        ) => [
          e.type,
          e.midi,
        ],
      ),
    ).toEqual(
      [
        [
          'on',
          60,
        ],
        [
          'off',
          60,
        ],
      ],
    );
    expect(
      input.onmidimessage,
    ).toBeNull();
    expect(
      access.removeEventListener,
    ).toHaveBeenCalled();
  });

  it('a failed request rejects, and a later start asks again', async () => {
    const midi =
      createMidiInput();
    const first =
      midi.start();
    const denied =
      Object.assign(
        new Error(
          'denied',
        ),
        {
          name: 'SecurityError',
        },
      );
    resolveAccess(
      Promise.reject(
        denied,
      ),
    );
    await expect(
      first,
    ).rejects.toBe(
      denied,
    );
    const second =
      midi.start();
    resolveAccess(
      fakeAccess()
        .access,
    );
    await second;
    expect(
      requestMIDIAccess,
    ).toHaveBeenCalledTimes(
      2,
    );
  });
});
