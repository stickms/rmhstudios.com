import {
  describe,
  expect,
  it,
} from 'vitest';
import { readSmf } from '@/lib/studio/midi/smf-read';
import { writeSmf } from '@/lib/studio/midi/smf-write';
import {
  SMF_MAX_BYTES,
  SMF_MAX_EVENTS,
  SMF_MAX_TRACKS,
  type SmfFile,
} from '@/lib/studio/midi/smf-types';

const bytes =
  (
    ...parts: (
      | number
      | number[]
      | string
    )[]
  ) =>
    Uint8Array.from(
      parts.flatMap(
        (
          p,
        ) =>
          typeof p ===
          'string'
            ? [
                ...p,
              ].map(
                (
                  c,
                ) =>
                  c.charCodeAt(
                    0,
                  ),
              )
            : Array.isArray(
                  p,
                )
              ? p
              : [
                  p,
                ],
      ),
    );
const u32 =
  (
    n: number,
  ) => [
    (n >>>
      24) &
      255,
    (n >>>
      16) &
      255,
    (n >>>
      8) &
      255,
    n &
      255,
  ];
const header =
  (
    format: number,
    tracks: number,
    division = 480,
  ) =>
    bytes(
      'MThd',
      u32(
        6,
      ),
      [
        0,
        format,
      ],
      [
        0,
        tracks,
      ],
      [
        division >>
          8,
        division &
          255,
      ],
    );
const trackOf =
  (
    body: ArrayLike<number>,
  ) =>
    concat(
      bytes(
        'MTrk',
        u32(
          body.length,
        ),
      ),
      Uint8Array.from(
        body as ArrayLike<number>,
      ),
    );
const track =
  (
    ...body: number[]
  ) =>
    trackOf(
      body,
    );
function concat(
  ...a: Uint8Array[]
): Uint8Array {
  const out =
    new Uint8Array(
      a.reduce(
        (
          n,
          x,
        ) =>
          n +
          x.length,
        0,
      ),
    );
  let at = 0;
  for (const x of a) {
    out.set(
      x,
      at,
    );
    at +=
      x.length;
  }
  return out;
}

describe('write then read', () => {
  const file: SmfFile =
    {
      format: 1,
      ppq: 480,
      tracks:
        [
          {
            events:
              [
                {
                  tick: 0,
                  type: 'trackName',
                  name: 'Tempo',
                },
                {
                  tick: 0,
                  type: 'tempo',
                  microsPerQuarter: 500000,
                },
                {
                  tick: 0,
                  type: 'timeSignature',
                  numerator: 6,
                  denominator: 8,
                },
              ],
          },
          {
            events:
              [
                {
                  tick: 0,
                  type: 'trackName',
                  name: 'Lead',
                },
                {
                  tick: 480,
                  type: 'noteOn',
                  channel: 2,
                  note: 60,
                  velocity: 90,
                },
                {
                  tick: 960,
                  type: 'noteOff',
                  channel: 2,
                  note: 60,
                  velocity: 0,
                },
                {
                  tick: 100_000,
                  type: 'noteOn',
                  channel: 2,
                  note: 64,
                  velocity: 1,
                },
                {
                  tick: 100_480,
                  type: 'noteOff',
                  channel: 2,
                  note: 64,
                  velocity: 0,
                },
              ],
          },
        ],
    };

  it('round-trips every event', () => {
    const r =
      readSmf(
        writeSmf(
          file,
        ),
      );
    expect(
      r.ok,
    ).toBe(
      true,
    );
    if (
      !r.ok
    )
      return;
    expect(
      r
        .file
        .format,
    ).toBe(
      1,
    );
    expect(
      r
        .file
        .ppq,
    ).toBe(
      480,
    );
    expect(
      r
        .file
        .tracks,
    ).toHaveLength(
      2,
    );
    expect(
      r
        .file
        .tracks[0]
        .events,
    ).toEqual(
      file
        .tracks[0]
        .events,
    );
    expect(
      r
        .file
        .tracks[1]
        .events,
    ).toEqual(
      file
        .tracks[1]
        .events,
    );
  });

  it('puts a note-off before a note-on at the same tick', () => {
    const r =
      readSmf(
        writeSmf(
          {
            format: 1,
            ppq: 480,
            tracks:
              [
                {
                  events:
                    [
                      {
                        tick: 0,
                        type: 'noteOn',
                        channel: 0,
                        note: 60,
                        velocity: 80,
                      },
                      {
                        tick: 480,
                        type: 'noteOn',
                        channel: 0,
                        note: 60,
                        velocity: 80,
                      },
                      {
                        tick: 480,
                        type: 'noteOff',
                        channel: 0,
                        note: 60,
                        velocity: 0,
                      },
                    ],
                },
              ],
          },
        ),
      );
    expect(
      r.ok &&
        r.file.tracks[0].events.map(
          (
            e,
          ) =>
            e.type,
        ),
    ).toEqual(
      [
        'noteOn',
        'noteOff',
        'noteOn',
      ],
    );
  });
});

describe('readSmf', () => {
  it('reads a type 0 file', () => {
    const data =
      concat(
        header(
          0,
          1,
        ),
        track(
          0,
          0x91,
          60,
          100,
          0x60,
          0x81,
          60,
          0,
          0,
          0xff,
          0x2f,
          0,
        ),
      );
    const r =
      readSmf(
        data,
      );
    expect(
      r.ok,
    ).toBe(
      true,
    );
    if (
      !r.ok
    )
      return;
    expect(
      r
        .file
        .format,
    ).toBe(
      0,
    );
    expect(
      r
        .file
        .tracks[0]
        .events,
    ).toEqual(
      [
        {
          tick: 0,
          type: 'noteOn',
          channel: 1,
          note: 60,
          velocity: 100,
        },
        {
          tick: 96,
          type: 'noteOff',
          channel: 1,
          note: 60,
          velocity: 0,
        },
      ],
    );
  });

  it('follows running status and reads a velocity-0 note-on as a note-off', () => {
    const data =
      concat(
        header(
          0,
          1,
        ),
        track(
          0,
          0x90,
          60,
          100,
          10,
          62,
          100,
          10,
          60,
          0,
          10,
          62,
          0,
          0,
          0xff,
          0x2f,
          0,
        ),
      );
    const r =
      readSmf(
        data,
      );
    expect(
      r.ok &&
        r.file.tracks[0].events.map(
          (
            e,
          ) =>
            e.type,
        ),
    ).toEqual(
      [
        'noteOn',
        'noteOn',
        'noteOff',
        'noteOff',
      ],
    );
  });

  it('skips sysex, unknown meta and unknown chunks', () => {
    const data =
      concat(
        header(
          1,
          1,
        ),
        bytes(
          'XXXX',
          u32(
            2,
          ),
          [
            1,
            2,
          ],
        ),
        track(
          0,
          0xf0,
          2,
          1,
          0xf7,
          0,
          0xff,
          0x7f,
          1,
          9,
          0,
          0xc0,
          5,
          0,
          0xff,
          0x2f,
          0,
        ),
      );
    const r =
      readSmf(
        data,
      );
    expect(
      r.ok &&
        r
          .file
          .tracks[0]
          .events,
    ).toEqual(
      [],
    );
  });

  it('refuses truncated files without throwing', () => {
    const full =
      concat(
        header(
          1,
          1,
        ),
        track(
          0,
          0x90,
          60,
          100,
          0x60,
          0x80,
          60,
          0,
          0,
          0xff,
          0x2f,
          0,
        ),
      );
    for (
      let cut = 0;
      cut <
      full.length;
      cut++
    ) {
      const r =
        readSmf(
          full.subarray(
            0,
            cut,
          ),
        );
      if (
        r.ok
      )
        continue; // a cut after a whole chunk can still be a valid, shorter file
      expect(
        [
          'truncated',
          'not-midi',
          'malformed',
        ],
      ).toContain(
        r.error,
      );
    }
    expect(
      readSmf(
        full.subarray(
          0,
          full.length -
            3,
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'truncated',
      },
    );
  });

  it('refuses a track whose body ends mid-event', () => {
    const data =
      concat(
        header(
          0,
          1,
        ),
        track(
          0,
          0x90,
          60,
        ),
      );
    expect(
      readSmf(
        data,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'truncated',
      },
    );
  });

  it('refuses non-MIDI, other formats and SMPTE timing', () => {
    expect(
      readSmf(
        bytes(
          'RIFF',
          u32(
            0,
          ),
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'not-midi',
      },
    );
    expect(
      readSmf(
        new Uint8Array(
          0,
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'not-midi',
      },
    );
    expect(
      readSmf(
        concat(
          header(
            2,
            1,
          ),
          track(
            0,
            0xff,
            0x2f,
            0,
          ),
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'unsupported-format',
      },
    );
    expect(
      readSmf(
        concat(
          header(
            1,
            1,
            0xe728,
          ),
          track(
            0,
            0xff,
            0x2f,
            0,
          ),
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'unsupported-timing',
      },
    );
  });

  it('refuses a data byte above 127 and a delta over four bytes', () => {
    expect(
      readSmf(
        concat(
          header(
            0,
            1,
          ),
          track(
            0,
            0x90,
            200,
            100,
          ),
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'malformed',
      },
    );
    expect(
      readSmf(
        concat(
          header(
            0,
            1,
          ),
          track(
            0x81,
            0x81,
            0x81,
            0x81,
            0x01,
            0x90,
            60,
            100,
          ),
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'malformed',
      },
    );
    // running status with nothing to run on
    expect(
      readSmf(
        concat(
          header(
            0,
            1,
          ),
          track(
            0,
            60,
            100,
          ),
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'malformed',
      },
    );
  });

  it('refuses a meta length that runs past the chunk', () => {
    expect(
      readSmf(
        concat(
          header(
            0,
            1,
          ),
          track(
            0,
            0xff,
            0x03,
            0x40,
            65,
          ),
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'truncated',
      },
    );
  });

  it('enforces the size, track and event caps', () => {
    expect(
      readSmf(
        new Uint8Array(
          SMF_MAX_BYTES +
            1,
        ),
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'too-large',
      },
    );

    const many =
      concat(
        header(
          1,
          SMF_MAX_TRACKS +
            1,
        ),
        ...Array.from(
          {
            length:
              SMF_MAX_TRACKS +
              1,
          },
          () =>
            track(
              0,
              0xff,
              0x2f,
              0,
            ),
        ),
      );
    expect(
      readSmf(
        many,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'too-many-tracks',
      },
    );
    const atCap =
      concat(
        header(
          1,
          SMF_MAX_TRACKS,
        ),
        ...Array.from(
          {
            length:
              SMF_MAX_TRACKS,
          },
          () =>
            track(
              0,
              0xff,
              0x2f,
              0,
            ),
        ),
      );
    expect(
      readSmf(
        atCap,
      )
        .ok,
    ).toBe(
      true,
    );

    // 200 001 one-tick events fit in under 1 MB: delta 0, status 0xB0 (a controller, skipped), two data bytes
    const body: number[] =
      [];
    for (
      let i = 0;
      i <
      SMF_MAX_EVENTS +
        1;
      i++
    )
      body.push(
        0,
        0xb0,
        1,
        1,
      );
    const flood =
      concat(
        header(
          0,
          1,
        ),
        trackOf(
          [
            ...body,
            0,
            0xff,
            0x2f,
            0,
          ],
        ),
      );
    expect(
      flood.length,
    ).toBeLessThan(
      SMF_MAX_BYTES,
    );
    expect(
      readSmf(
        flood,
      ),
    ).toEqual(
      {
        ok: false,
        error:
          'too-many-events',
      },
    );
  });

  it('never throws on arbitrary bytes', () => {
    let seed = 12345;
    const rand =
      () =>
        (seed =
          (seed *
            1103515245 +
            12345) &
          0x7fffffff) /
        0x7fffffff;
    const valid =
      concat(
        header(
          1,
          1,
        ),
        track(
          0,
          0x90,
          60,
          100,
          0x60,
          0x80,
          60,
          0,
          0,
          0xff,
          0x2f,
          0,
        ),
      );
    for (
      let i = 0;
      i <
      300;
      i++
    ) {
      const copy =
        Uint8Array.from(
          valid,
        );
      for (
        let k = 0;
        k <
        4;
        k++
      )
        copy[
          Math.floor(
            rand() *
              copy.length,
          )
        ] =
          Math.floor(
            rand() *
              256,
          );
      expect(
        () =>
          readSmf(
            copy,
          ),
      ).not.toThrow();
    }
  });
});
