import {
  describe,
  expect,
  it,
} from 'vitest';
import { rmhmusicReturnPath } from './return-path';

describe('rmhmusicReturnPath', () => {
  it('returns to a lesson the visitor asked for', () => {
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/lesson/play-first-note',
      ),
    ).toBe(
      '/rmhmusic/lesson/play-first-note',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/lesson/play-first-note/',
      ),
    ).toBe(
      '/rmhmusic/lesson/play-first-note',
    );
  });

  it('returns to Practice', () => {
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/practice',
      ),
    ).toBe(
      '/rmhmusic/practice',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/practice/',
      ),
    ).toBe(
      '/rmhmusic/practice',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/practice/x',
      ),
    ).toBe(
      '/rmhmusic',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/practicex',
      ),
    ).toBe(
      '/rmhmusic',
    );
  });

  it('returns to the sound credits', () => {
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/credits',
      ),
    ).toBe(
      '/rmhmusic/credits',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/credits/x',
      ),
    ).toBe(
      '/rmhmusic',
    );
  });

  it('returns to the sight reading game', () => {
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/sprint',
      ),
    ).toBe(
      '/rmhmusic/sprint',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/sprint/',
      ),
    ).toBe(
      '/rmhmusic/sprint',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/sprintx',
      ),
    ).toBe(
      '/rmhmusic',
    );
  });

  it('returns to the tuner', () => {
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/tuner',
      ),
    ).toBe(
      '/rmhmusic/tuner',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/tuner/',
      ),
    ).toBe(
      '/rmhmusic/tuner',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/tunerx',
      ),
    ).toBe(
      '/rmhmusic',
    );
  });

  it('returns to the songbook and to a song', () => {
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/songs',
      ),
    ).toBe(
      '/rmhmusic/songs',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/songs/',
      ),
    ).toBe(
      '/rmhmusic/songs',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/songs/ode-to-joy',
      ),
    ).toBe(
      '/rmhmusic/songs/ode-to-joy',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/songs/Ode',
      ),
    ).toBe(
      '/rmhmusic',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/songs/a/b',
      ),
    ).toBe(
      '/rmhmusic',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/songsx',
      ),
    ).toBe(
      '/rmhmusic',
    );
  });

  it('sends everything else to the app home, never off the app', () => {
    for (const bad of [
      undefined,
      null,
      42,
      '',
      '/',
      '/rmhmusic',
      '/rmhmusic/',
      'https://evil.example/rmhmusic/lesson/x',
      '//evil.example/rmhmusic/lesson/x',
      '/rmhmusic/lesson/../../admin',
      '/rmhmusic/lesson/x?next=//evil',
      '/rmhmusicx/lesson/x',
      '/feed',
    ]) {
      expect(
        rmhmusicReturnPath(
          bad,
        ),
      ).toBe(
        '/rmhmusic',
      );
    }
  });

  it('returns to the Daily board (Phase 6)', () => {
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/daily',
      ),
    ).toBe(
      '/rmhmusic/daily',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/daily/',
      ),
    ).toBe(
      '/rmhmusic/daily',
    );
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/dailyx',
      ),
    ).toBe(
      '/rmhmusic',
    );
    // A shared result is public: there is nothing to sign in and return to.
    expect(
      rmhmusicReturnPath(
        '/rmhmusic/r/abc',
      ),
    ).toBe(
      '/rmhmusic',
    );
  });
});
