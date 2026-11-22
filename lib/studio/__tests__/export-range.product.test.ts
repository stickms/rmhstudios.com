import { describe, expect, it } from 'vitest';
import { CHALLENGE_AUDIO_MAX_BYTES } from '@/lib/studio/challenge/shared';
import {
  audibleTracks,
  challengeFit,
  exportRange,
  MAX_EXPORT_SECONDS,
  TAIL_SECONDS,
  wavBytes,
  type RangeInput,
} from '@/lib/studio/export/range';
import { formatClock, safeFileName } from '@/lib/studio/export/download';

function input(over: Partial<RangeInput> = {}): RangeInput {
  return {
    mode: 'song',
    bpm: 120,
    tracks: [
      {
        id: 't1',
        type: 'midi',
        muted: false,
        soloed: false,
        clipIds: ['a', 'b'],
      },
    ],
    clips: {
      a: {
        type: 'midi',
        startBeat: 4,
        durationBeats: 4,
      },
      b: {
        type: 'midi',
        startBeat: 16,
        durationBeats: 8,
      },
    },
    loopStart: 8,
    loopEnd: 16,
    ...over,
  };
}

describe('exportRange', () => {
  it('covers first clip start to last clip end, plus the tail', () => {
    const r = exportRange(input());
    expect(r).toMatchObject({
      ok: true,
      startBeat: 4,
      endBeat: 24,
      startSeconds: 2,
    });
    // 20 beats at 120 bpm = 10 s
    expect(r.ok && r.durationSeconds).toBe(10 + TAIL_SECONDS);
  });

  it('exports exactly the loop region, with no tail', () => {
    const r = exportRange(
      input({
        mode: 'loop',
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      startBeat: 8,
      endBeat: 16,
      startSeconds: 4,
    });
    expect(r.ok && r.durationSeconds).toBe(4);
  });

  it('refuses a loop that has no length', () => {
    expect(
      exportRange(
        input({
          mode: 'loop',
          loopStart: 4,
          loopEnd: 4,
        }),
      ),
    ).toMatchObject({
      ok: false,
      reason: 'no-loop',
    });
  });

  it('refuses an empty song and ignores automation clips', () => {
    expect(
      exportRange(
        input({
          tracks: [],
          clips: {},
        }),
      ),
    ).toMatchObject({
      ok: false,
      reason: 'empty',
    });
    const onlyAutomation = input({
      clips: {
        a: {
          type: 'automation',
          startBeat: 0,
          durationBeats: 4,
        },
      },
    });
    expect(exportRange(onlyAutomation)).toMatchObject({
      ok: false,
      reason: 'empty',
    });
  });

  it('honours mute and solo as playback does', () => {
    const tracks = [
      {
        id: 'm',
        type: 'midi',
        muted: true,
        soloed: false,
        clipIds: ['a'],
      },
      {
        id: 's',
        type: 'midi',
        muted: false,
        soloed: false,
        clipIds: ['b'],
      },
    ];
    expect(
      exportRange(
        input({
          tracks,
        }),
      ).ok &&
        (
          exportRange(
            input({
              tracks,
            }),
          ) as {
            startBeat: number;
          }
        ).startBeat,
    ).toBe(16);
    expect(
      audibleTracks([
        {
          muted: false,
          soloed: false,
        },
        {
          muted: true,
          soloed: true,
        },
      ]),
    ).toEqual([
      {
        muted: true,
        soloed: true,
      },
    ]);
  });

  it('refuses more than ten minutes before rendering', () => {
    const long = input({
      clips: {
        a: {
          type: 'midi',
          startBeat: 0,
          durationBeats: 1200,
        },
        b: {
          type: 'midi',
          startBeat: 0,
          durationBeats: 1,
        },
      },
    });
    // 1200 beats at 120 bpm = 600 s, plus the tail, is over the cap
    const r = exportRange(long);
    expect(r).toMatchObject({
      ok: false,
      reason: 'too-long',
    });
    expect(r.durationSeconds).toBeGreaterThan(MAX_EXPORT_SECONDS);
    const fits = input({
      clips: {
        a: {
          type: 'midi',
          startBeat: 0,
          durationBeats: 1100,
        },
        b: {
          type: 'midi',
          startBeat: 0,
          durationBeats: 1,
        },
      },
    });
    expect(exportRange(fits).ok).toBe(true);
  });
});

describe('sizes', () => {
  it('computes a stereo WAV size', () => {
    expect(wavBytes(1, 44100, 16)).toBe(44 + 44100 * 4);
    expect(wavBytes(1, 48000, 24)).toBe(44 + 48000 * 6);
  });

  it('checks a challenge export against 8 MB', () => {
    // 8 MB of 16-bit 44.1 kHz stereo is about 47.5 s
    expect(challengeFit(40, 44100).fits).toBe(true);
    expect(challengeFit(47, 44100).fits).toBe(true);
    expect(challengeFit(48, 44100).fits).toBe(false);
    expect(challengeFit(180, 44100)).toMatchObject({
      fits: false,
    });
    expect(challengeFit(180, 44100).bytes).toBeGreaterThan(CHALLENGE_AUDIO_MAX_BYTES);
  });
});

describe('file names and clock', () => {
  it('cleans a project name for the file system', () => {
    expect(safeFileName('My: song/1?')).toBe('My song1');
    expect(safeFileName('...')).toBe('project');
    expect(safeFileName('  ')).toBe('project');
    expect(safeFileName('a'.repeat(200)).length).toBe(80);
  });
  it('formats m:ss', () => {
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(-3)).toBe('0:00');
  });
});
