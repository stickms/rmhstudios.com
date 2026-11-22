import { describe, expect, it } from 'vitest';
import { PATH, VOICE_PATH, type Unit } from '../content/path';
import { compareFriends, finishedUnits, friendDaily, friendSongs, type FriendSortKey } from './friends';

const lessonIds = (path: readonly Unit[]) => path.flatMap((u) => u.lessons.map((l) => l.id));

describe('finishedUnits', () => {
  it('counts a unit once every available lesson of it has a star, on the learner’s own path', () => {
    const piano = finishedUnits(PATH, new Set());
    expect(piano).toEqual({
      finished: 0,
      total: PATH.length,
      last: null,
    });
    const first = PATH[0]!;
    const one = finishedUnits(PATH, new Set(first.lessons.map((l) => l.id)));
    expect(one.finished).toBe(1);
    expect(one.last).toBe(first.title);
    expect(finishedUnits(PATH, new Set(lessonIds(PATH)))).toEqual({
      finished: PATH.length,
      total: PATH.length,
      last: PATH[PATH.length - 1]!.title,
    });
  });

  it('is partial until every lesson has a star', () => {
    const first = PATH[0]!;
    const most = new Set(first.lessons.slice(1).map((l) => l.id));
    expect(finishedUnits(PATH, most).finished).toBe(0);
  });

  it('reads a singer’s path for a singer: piano lessons finish nothing there', () => {
    const allPiano = new Set(
      lessonIds(PATH).filter(
        (id) =>
          !id.startsWith('rhythm-') &&
          // the key-signature lessons are on both paths, like rhythm
          !id.startsWith('key-signatures-'),
      ),
    );
    expect(finishedUnits(VOICE_PATH, allPiano).finished).toBe(0);
    expect(finishedUnits(VOICE_PATH, new Set(lessonIds(VOICE_PATH))).finished).toBe(VOICE_PATH.length);
  });

  it('shares the rhythm unit between paths (its progress is the same lesson ids)', () => {
    const rhythm = PATH.find((u) => u.id === 'rhythm-basics')!;
    const ids = new Set(rhythm.lessons.map((l) => l.id));
    expect(finishedUnits(PATH, ids)).toMatchObject({
      finished: 1,
      last: rhythm.title,
    });
    expect(finishedUnits(VOICE_PATH, ids)).toMatchObject({
      finished: 1,
      last: rhythm.title,
    });
  });

  it('ignores lessons that are not available yet, and units with none', () => {
    const path: Unit[] = [
      {
        id: 'u1',
        title: 'One',
        lessons: [
          {
            id: 'a',
            unit: 'u1',
            title: 'A',
            summary: '',
            mode: 'rhythm-basics',
            available: true,
          },
          {
            id: 'b',
            unit: 'u1',
            title: 'B',
            summary: '',
            mode: 'rhythm-basics',
            available: false,
          },
        ],
      },
      {
        id: 'u2',
        title: 'Two',
        lessons: [
          {
            id: 'c',
            unit: 'u2',
            title: 'C',
            summary: '',
            mode: 'rhythm-basics',
            available: false,
          },
        ],
      },
    ];
    expect(finishedUnits(path, new Set(['a']))).toEqual({
      finished: 1,
      total: 1,
      last: 'One',
    });
  });
});

describe('friendDaily', () => {
  it('is the Daily challenge streak, with whether today is done', () => {
    expect(friendDaily(['2026-11-16', '2026-11-15', '2026-11-14'], '2026-11-16')).toEqual({
      streak: 3,
      today: true,
    });
  });

  it('keeps a streak that ended yesterday alive until today ends', () => {
    expect(friendDaily(['2026-11-15', '2026-11-14'], '2026-11-16')).toEqual({
      streak: 2,
      today: false,
    });
  });

  it('is zero after a missed day', () => {
    expect(friendDaily(['2026-11-14'], '2026-11-16')).toEqual({
      streak: 0,
      today: false,
    });
    expect(friendDaily([], '2026-11-16')).toEqual({
      streak: 0,
      today: false,
    });
  });
});

describe('compareFriends', () => {
  const f = (name: string | null, streak: number, today: boolean, userId = name ?? 'x'): FriendSortKey => ({
    name,
    streak,
    today,
    userId,
  });

  it('puts today’s Daily first, then the longer streak, then the name', () => {
    const list = [f('Cy', 9, false), f('Bo', 2, true), f('Al', 2, true), f('Di', 4, true), f(null, 9, false, 'z')];
    expect(list.sort(compareFriends).map((x) => x.name)).toEqual(['Di', 'Al', 'Bo', 'Cy', null]);
  });

  it('is deterministic for equal names', () => {
    const a = f('Same', 1, false, 'a');
    const b = f('Same', 1, false, 'b');
    expect([b, a].sort(compareFriends)).toEqual([a, b]);
  });
});

describe('friendSongs', () => {
  it('keeps songs of the songbook in its order, with titles, and drops unknown ids and modes', () => {
    const songs = friendSongs([
      {
        songId: 'no-such-song',
        mode: 'play',
        bestScore: 90,
      },
      {
        songId: 'ode-to-joy',
        mode: 'play',
        bestScore: 98,
      },
      {
        songId: 'ode-to-joy',
        mode: 'wait',
        bestScore: 100,
      },
      {
        songId: 'ode-to-joy',
        mode: 'sideways',
        bestScore: 1,
      },
    ]);
    expect(songs.map((s) => [s.songId, s.mode, s.bestScore])).toEqual([
      ['ode-to-joy', 'wait', 100],
      ['ode-to-joy', 'play', 98],
    ]);
    expect(songs[0]!.title).toBe('Ode to Joy');
    expect(songs[0]!.composer.length).toBeGreaterThan(0);
  });
});
