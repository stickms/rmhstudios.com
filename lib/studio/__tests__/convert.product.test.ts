import { describe, expect, it } from 'vitest';
import { RMHDrums } from '@/lib/studio/plugins/instruments/RMHDrums';
import {
  DRUM_CHANNEL,
  flattenPattern,
  importToStudio,
  projectToSmf,
  smfToImport,
  type ExportableProject,
} from '@/lib/studio/midi/convert';
import { readSmf } from '@/lib/studio/midi/smf-read';
import { writeSmf } from '@/lib/studio/midi/smf-write';
import type { Pattern } from '@/lib/studio/types';

const steps = (on: number[], n = 16) =>
  Array.from(
    {
      length: n,
    },
    (_, i) => ({
      active: on.includes(i),
      velocity: 100,
    }),
  );

const pattern: Pattern = {
  id: 'p1',
  name: 'Beat',
  lengthBeats: 4,
  stepsPerBeat: 4,
  tracks: [
    {
      instrumentId: 'drum-0',
      steps: steps([0, 8]),
    },
    {
      instrumentId: 'drum-1',
      steps: steps([4, 12]),
    },
  ],
};

function project(over: Partial<ExportableProject> = {}): ExportableProject {
  return {
    bpm: 90,
    timeSignature: [3, 4],
    tracks: [
      {
        id: 'm',
        name: 'Keys',
        type: 'midi',
        clipIds: ['c1'],
      },
      {
        id: 'd',
        name: 'Drums',
        type: 'midi',
        clipIds: ['c2'],
      },
      {
        id: 'a',
        name: 'Vox',
        type: 'audio',
        clipIds: [],
      },
    ],
    clips: {
      c1: {
        type: 'midi',
        startBeat: 4,
        durationBeats: 4,
        notes: [
          {
            id: 'n1',
            pitch: 60,
            startBeat: 0,
            durationBeats: 1,
            velocity: 90,
          },
          {
            id: 'n2',
            pitch: 67,
            startBeat: 1,
            durationBeats: 0.5,
            velocity: 0,
          },
        ],
      },
      c2: {
        type: 'pattern',
        startBeat: 0,
        durationBeats: 8,
        patternId: 'p1',
      } as ExportableProject['clips'][string],
    },
    patterns: [pattern],
    ...over,
  };
}

describe('flattenPattern', () => {
  it('turns active steps into notes at their beats, on the pad pitches', () => {
    const notes = flattenPattern(pattern, 4);
    expect(notes).toHaveLength(4);
    const kick = notes.filter((n) => n.pitch === RMHDrums.PAD_NOTES[0]).map((n) => n.startBeat);
    const snare = notes.filter((n) => n.pitch === RMHDrums.PAD_NOTES[1]).map((n) => n.startBeat);
    expect(kick).toEqual([0, 2]);
    expect(snare).toEqual([1, 3]);
    expect(notes[0].durationBeats).toBe(0.25);
  });

  it('loops over a longer clip and cuts at a shorter one', () => {
    expect(flattenPattern(pattern, 8)).toHaveLength(8);
    expect(
      flattenPattern(pattern, 2)
        .map((n) => n.startBeat)
        .sort(),
    ).toEqual([0, 1]);
    expect(flattenPattern(pattern, 0)).toEqual([]);
  });

  it('uses a step pitch when it has one', () => {
    const p: Pattern = {
      ...pattern,
      tracks: [
        {
          instrumentId: 'drum-0',
          steps: [
            {
              active: true,
              velocity: 100,
              pitch: 49,
            },
          ],
        },
      ],
    };
    expect(flattenPattern(p, 4)[0].pitch).toBe(49);
  });
});

describe('projectToSmf', () => {
  it('writes tempo and time signature in a conductor track', () => {
    const { file } = projectToSmf(project());
    expect(file.format).toBe(1);
    expect(file.ppq).toBe(480);
    const events = file.tracks[0].events;
    expect(events).toContainEqual({
      tick: 0,
      type: 'tempo',
      microsPerQuarter: Math.round(60_000_000 / 90),
    });
    expect(events).toContainEqual({
      tick: 0,
      type: 'timeSignature',
      numerator: 3,
      denominator: 4,
    });
  });

  it('makes one track per MIDI or pattern track and none for audio', () => {
    const { file, noteCount } = projectToSmf(project());
    expect(file.tracks).toHaveLength(3); // conductor, Keys, Drums
    expect(noteCount).toBe(2 + 8);
    const names = file.tracks.map((t) => t.events.find((e) => e.type === 'trackName'));
    expect(names.map((n) => n && n.type === 'trackName' && n.name)).toEqual(['Tempo', 'Keys', 'Drums']);
  });

  it('puts melodic notes in ticks from the clip start, with velocity at least 1', () => {
    const keys = projectToSmf(project()).file.tracks[1].events.filter((e) => e.type === 'noteOn');
    expect(keys[0]).toMatchObject({
      tick: 4 * 480,
      note: 60,
      velocity: 90,
      channel: 0,
    });
    expect(keys[1]).toMatchObject({
      tick: 5 * 480,
      note: 67,
      velocity: 1,
    });
  });

  it('puts drum patterns on channel 10 and keeps melodic tracks off it', () => {
    const { file } = projectToSmf(project());
    const drums = file.tracks[2].events.filter((e) => e.type === 'noteOn');
    expect(drums.length).toBe(8);
    expect(drums.every((e) => e.type === 'noteOn' && e.channel === DRUM_CHANNEL)).toBe(true);
    const many = project({
      tracks: Array.from(
        {
          length: 12,
        },
        (_, i) => ({
          id: `t${i}`,
          name: `T${i}`,
          type: 'midi' as const,
          clipIds: [`k${i}`],
        }),
      ),
      clips: Object.fromEntries(
        Array.from(
          {
            length: 12,
          },
          (_, i) => [
            `k${i}`,
            {
              type: 'midi',
              startBeat: 0,
              durationBeats: 1,
              notes: [
                {
                  id: 'x',
                  pitch: 60,
                  startBeat: 0,
                  durationBeats: 1,
                  velocity: 80,
                },
              ],
            },
          ],
        ),
      ) as ExportableProject['clips'],
    });
    const channels = projectToSmf(many)
      .file.tracks.slice(1)
      .map((t) => {
        const on = t.events.find((e) => e.type === 'noteOn');
        return on && on.type === 'noteOn' ? on.channel : -1;
      });
    expect(channels).not.toContain(DRUM_CHANNEL);
  });

  it('splits a track that has both notes and a pattern', () => {
    const p = project({
      tracks: [
        {
          id: 'm',
          name: 'Mix',
          type: 'midi',
          clipIds: ['c1', 'c2'],
        },
      ],
    });
    const { file } = projectToSmf(p);
    expect(file.tracks).toHaveLength(3);
    const second = file.tracks[2].events[0];
    expect(second.type === 'trackName' && second.name).toBe('Mix (drums)');
  });

  it('reports no notes for a project with only audio', () => {
    const r = projectToSmf(
      project({
        tracks: [
          {
            id: 'a',
            name: 'Vox',
            type: 'audio',
            clipIds: [],
          },
        ],
        clips: {},
      }),
    );
    expect(r.noteCount).toBe(0);
  });
});

describe('import', () => {
  it('reads back the same notes, tempo and time signature', () => {
    const smf = projectToSmf(project());
    const parsed = readSmf(writeSmf(smf.file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const imp = smfToImport(parsed.file);
    expect(imp.bpm).toBe(90);
    expect(imp.timeSignature).toEqual([3, 4]);
    expect(imp.tracks.map((t) => t.name)).toEqual(['Keys', 'Drums']);
    expect(imp.noteCount).toBe(10);
    const keys = imp.tracks[0].notes;
    expect(keys.map((n) => [n.pitch, n.startBeat, n.durationBeats])).toEqual([
      [60, 4, 1],
      [67, 5, 0.5],
    ]);
  });

  it('splits a type 0 file by channel and closes a note that never ends', () => {
    const imp = smfToImport({
      format: 0,
      ppq: 96,
      tracks: [
        {
          events: [
            {
              tick: 0,
              type: 'tempo',
              microsPerQuarter: 400000,
            },
            {
              tick: 0,
              type: 'noteOn',
              channel: 0,
              note: 60,
              velocity: 80,
            },
            {
              tick: 0,
              type: 'noteOn',
              channel: 3,
              note: 40,
              velocity: 80,
            },
            {
              tick: 96,
              type: 'noteOff',
              channel: 0,
              note: 60,
              velocity: 0,
            },
            {
              tick: 192,
              type: 'trackName',
              name: 'ignored late name',
            },
          ],
        },
      ],
    });
    expect(imp.bpm).toBe(150);
    expect(imp.tracks.map((t) => t.channel)).toEqual([0, 3]);
    expect(imp.tracks[1].notes[0]).toMatchObject({
      pitch: 40,
      startBeat: 0,
      durationBeats: 2,
    });
  });

  it('builds Studio tracks with one clip each, in whole bars', () => {
    let n = 0;
    const built = importToStudio(
      [
        {
          name: '',
          channel: 0,
          lengthBeats: 5,
          notes: [
            {
              pitch: 60,
              startBeat: 0,
              durationBeats: 1,
              velocity: 90,
            },
          ],
        },
      ],
      {
        makeId: () => `id${++n}`,
        firstTrackNumber: 3,
        colors: ['#111', '#222', '#333'],
        trackHeight: 80,
        barBeats: 4,
      },
    );
    expect(built.tracks[0]).toMatchObject({
      type: 'midi',
      name: 'MIDI 3',
      color: '#333',
      clipIds: [],
    });
    expect(built.clips[0]).toMatchObject({
      trackId: built.tracks[0].id,
      durationBeats: 8,
      startBeat: 0,
    });
    expect(built.clips[0].notes[0].id).toMatch(/^id/);
  });
});
