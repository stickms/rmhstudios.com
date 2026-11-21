import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CLIPBOARD_MARKER,
  parseClipboard,
  placeClips,
  placeNotes,
  serializeClipboard,
} from '@/lib/studio/clipboard';
import type {
  AudioClipData,
  MidiClipData,
} from '@/lib/studio/types';

const midi =
  (
    id: string,
    trackId: string,
    start: number,
  ): MidiClipData => ({
    id,
    trackId,
    type: 'midi',
    name: id,
    startBeat:
      start,
    durationBeats: 4,
    color:
      '#fff',
    notes:
      [
        {
          id: `${id}-n`,
          pitch: 60,
          startBeat: 0,
          durationBeats: 1,
          velocity: 100,
        },
      ],
  });
const audio =
  (
    id: string,
    trackId: string,
    start: number,
  ): AudioClipData => ({
    id,
    trackId,
    type: 'audio',
    name: id,
    startBeat:
      start,
    durationBeats: 2,
    color:
      '#fff',
    bufferId:
      'b',
    sampleOffset: 0,
    fadeInBeats: 0,
    fadeOutBeats: 0,
  });
let n = 0;
const newId =
  () =>
    `new${++n}`;

describe('clipboard round trip', () => {
  it('serialises and parses clips and notes', () => {
    const clips =
      [
        midi(
          'a',
          't1',
          4,
        ),
        audio(
          'b',
          't2',
          8,
        ),
      ];
    const back =
      parseClipboard(
        serializeClipboard(
          {
            kind: 'clips',
            clips,
          },
        ),
      );
    expect(
      back,
    ).toEqual(
      {
        kind: 'clips',
        clips,
      },
    );
    const notes =
      [
        {
          id: 'x',
          pitch: 64,
          startBeat: 1,
          durationBeats: 0.5,
          velocity: 90,
        },
      ];
    expect(
      parseClipboard(
        serializeClipboard(
          {
            kind: 'notes',
            notes,
          },
        ),
      ),
    ).toEqual(
      {
        kind: 'notes',
        notes,
      },
    );
  });

  it('ignores foreign text silently', () => {
    expect(
      parseClipboard(
        'hello',
      ),
    ).toBeNull();
    expect(
      parseClipboard(
        '{"a":1}',
      ),
    ).toBeNull();
    expect(
      parseClipboard(
        `${CLIPBOARD_MARKER} not json`,
      ),
    ).toBeNull();
    expect(
      parseClipboard(
        null,
      ),
    ).toBeNull();
    expect(
      parseClipboard(
        JSON.stringify(
          {
            marker:
              'other/1',
            kind: 'clips',
            clips:
              [],
          },
        ),
      ),
    ).toBeNull();
  });

  it('drops unknown fields and rejects out-of-range values', () => {
    const c =
      {
        ...midi(
          'a',
          't1',
          0,
        ),
        evil: {
          polluted: true,
        },
      };
    const text =
      JSON.stringify(
        {
          marker:
            CLIPBOARD_MARKER,
          kind: 'clips',
          clips:
            [
              c,
            ],
        },
      );
    const parsed =
      parseClipboard(
        text,
      );
    expect(
      parsed?.kind,
    ).toBe(
      'clips',
    );
    expect(
      JSON.stringify(
        parsed,
      ),
    ).not.toContain(
      'evil',
    );
    const bad =
      {
        ...midi(
          'a',
          't1',
          0,
        ),
        notes:
          [
            {
              id: 'n',
              pitch: 300,
              startBeat: 0,
              durationBeats: 1,
              velocity: 1,
            },
          ],
      };
    expect(
      parseClipboard(
        JSON.stringify(
          {
            marker:
              CLIPBOARD_MARKER,
            kind: 'clips',
            clips:
              [
                bad,
              ],
          },
        ),
      ),
    ).toBeNull();
    expect(
      parseClipboard(
        JSON.stringify(
          {
            marker:
              CLIPBOARD_MARKER,
            kind: 'clips',
            clips:
              [
                {
                  type: 'script',
                },
              ],
          },
        ),
      ),
    ).toBeNull();
  });
});

describe('paste placement', () => {
  const tracks =
    [
      {
        id: 't1',
        type: 'midi' as const,
      },
      {
        id: 't2',
        type: 'audio' as const,
      },
    ];

  it('puts the earliest clip at the playhead and keeps spacing', () => {
    const out =
      placeClips(
        [
          midi(
            'a',
            't1',
            4,
          ),
          midi(
            'b',
            't1',
            8,
          ),
        ],
        {
          playheadBeat: 20,
          selectedTrackId:
            null,
          tracks,
          newId,
        },
      );
    expect(
      out.map(
        (
          c,
        ) =>
          c.startBeat,
      ),
    ).toEqual(
      [
        20,
        24,
      ],
    );
    expect(
      out.every(
        (
          c,
        ) =>
          c.trackId ===
          't1',
      ),
    ).toBe(
      true,
    );
    expect(
      new Set(
        out.map(
          (
            c,
          ) =>
            c.id,
        ),
      )
        .size,
    ).toBe(
      2,
    );
    expect(
      out[0]
        .id,
    ).not.toBe(
      'a',
    );
  });

  it('goes to the selected track when it fits, else the original tracks', () => {
    const sel =
      placeClips(
        [
          midi(
            'a',
            't1',
            0,
          ),
        ],
        {
          playheadBeat: 0,
          selectedTrackId:
            't1',
          tracks:
            [
              ...tracks,
              {
                id: 't3',
                type: 'midi',
              },
            ],
          newId,
        },
      );
    expect(
      sel[0]
        .trackId,
    ).toBe(
      't1',
    );
    const other =
      placeClips(
        [
          midi(
            'a',
            't1',
            0,
          ),
        ],
        {
          playheadBeat: 0,
          selectedTrackId:
            't3',
          tracks:
            [
              ...tracks,
              {
                id: 't3',
                type: 'midi',
              },
            ],
          newId,
        },
      );
    expect(
      other[0]
        .trackId,
    ).toBe(
      't3',
    );
    const orig =
      placeClips(
        [
          audio(
            'b',
            't2',
            0,
          ),
        ],
        {
          playheadBeat: 0,
          selectedTrackId:
            null,
          tracks,
          newId,
        },
      );
    expect(
      orig[0]
        .trackId,
    ).toBe(
      't2',
    );
  });

  it('falls back to the selected track when the original was deleted', () => {
    const out =
      placeClips(
        [
          midi(
            'a',
            'gone',
            0,
          ),
        ],
        {
          playheadBeat: 2,
          selectedTrackId:
            't1',
          tracks,
          newId,
        },
      );
    expect(
      out,
    ).toHaveLength(
      1,
    );
    expect(
      out[0]
        .trackId,
    ).toBe(
      't1',
    );
  });

  it('leaves out a clip with nowhere to go', () => {
    expect(
      placeClips(
        [
          midi(
            'a',
            'gone',
            0,
          ),
        ],
        {
          playheadBeat: 0,
          selectedTrackId:
            null,
          tracks,
          newId,
        },
      ),
    ).toEqual(
      [],
    );
    // an audio clip cannot go on a MIDI track
    expect(
      placeClips(
        [
          audio(
            'b',
            'gone',
            0,
          ),
        ],
        {
          playheadBeat: 0,
          selectedTrackId:
            't1',
          tracks,
          newId,
        },
      ),
    ).toEqual(
      [],
    );
  });

  it('gives pasted MIDI clips fresh note ids', () => {
    const [
      c,
    ] =
      placeClips(
        [
          midi(
            'a',
            't1',
            0,
          ),
        ],
        {
          playheadBeat: 0,
          selectedTrackId:
            null,
          tracks,
          newId,
        },
      ) as MidiClipData[];
    expect(
      c
        .notes[0]
        .id,
    ).not.toBe(
      'a-n',
    );
  });

  it('places notes relative to the clip and never before it', () => {
    const notes =
      [
        {
          id: 'a',
          pitch: 60,
          startBeat: 2,
          durationBeats: 1,
          velocity: 100,
        },
        {
          id: 'b',
          pitch: 64,
          startBeat: 3,
          durationBeats: 1,
          velocity: 100,
        },
      ];
    expect(
      placeNotes(
        notes,
        8,
        12,
        newId,
      ).map(
        (
          x,
        ) =>
          x.startBeat,
      ),
    ).toEqual(
      [
        4,
        5,
      ],
    );
    expect(
      placeNotes(
        notes,
        8,
        2,
        newId,
      ).map(
        (
          x,
        ) =>
          x.startBeat,
      ),
    ).toEqual(
      [
        0,
        1,
      ],
    );
  });
});
