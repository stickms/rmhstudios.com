import { describe, expect, it } from 'vitest';
import {
  MAX_SCREENSHOTS,
  moveScreenshot,
  screenshotProblem,
  stepIndex,
  viewerKeyAction,
} from '@/lib/builds/screenshots';
import { saveScreenshotsBody } from '@/lib/builds/screenshots-schema';

const shot = (n: number, description = 'A description') => ({
  url: `u${n}`,
  width: 1280,
  height: 720,
  description,
});

describe('screenshotProblem', () => {
  it('accepts up to eight described, distinct screenshots', () => {
    expect(screenshotProblem([])).toBeNull();
    expect(
      screenshotProblem(
        Array.from(
          {
            length: MAX_SCREENSHOTS,
          },
          (_, i) => shot(i),
        ),
      ),
    ).toBeNull();
  });

  it('refuses a ninth', () => {
    expect(
      screenshotProblem(
        Array.from(
          {
            length: 9,
          },
          (_, i) => shot(i),
        ),
      ),
    ).toEqual({
      code: 'TOO_MANY',
      max: 8,
    });
  });

  it('names the first undescribed screenshot, blank or whitespace', () => {
    expect(screenshotProblem([shot(0), shot(1, ''), shot(2, ' ')])).toEqual({
      code: 'DESCRIPTION_REQUIRED',
      index: 1,
    });
  });

  it('refuses a description over 500 characters and a picture listed twice', () => {
    expect(screenshotProblem([shot(0, 'x'.repeat(501))])).toEqual({
      code: 'DESCRIPTION_TOO_LONG',
      index: 0,
    });
    expect(
      screenshotProblem([
        shot(0),
        {
          ...shot(1),
          url: 'u0',
        },
      ]),
    ).toEqual({
      code: 'DUPLICATE',
      index: 1,
    });
  });
});

describe('moveScreenshot', () => {
  it('moves an item and leaves the original alone', () => {
    const list = ['a', 'b', 'c'];
    expect(moveScreenshot(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveScreenshot(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('ignores a move off either end', () => {
    expect(moveScreenshot(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveScreenshot(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});

describe('viewer stepping', () => {
  it('wraps at both ends', () => {
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it('maps keys to actions, mirrored in a right-to-left language', () => {
    expect(viewerKeyAction('ArrowRight', false)).toBe('next');
    expect(viewerKeyAction('ArrowLeft', false)).toBe('previous');
    expect(viewerKeyAction('ArrowRight', true)).toBe('previous');
    expect(viewerKeyAction('ArrowLeft', true)).toBe('next');
    expect(viewerKeyAction('Home', false)).toBe('first');
    expect(viewerKeyAction('End', false)).toBe('last');
    expect(viewerKeyAction('Escape', false)).toBeNull();
  });
});

describe('saveScreenshotsBody', () => {
  it('lets an empty description through so the server can name the index', () => {
    expect(
      saveScreenshotsBody.safeParse({
        screenshots: [shot(0, '')],
      }).success,
    ).toBe(true);
  });

  it('rejects a bad shape, an absurd size and a list past nine', () => {
    expect(
      saveScreenshotsBody.safeParse({
        screenshots: [
          {
            ...shot(0),
            width: 0,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      saveScreenshotsBody.safeParse({
        screenshots: [
          {
            ...shot(0),
            width: 99999,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      saveScreenshotsBody.safeParse({
        screenshots: Array.from(
          {
            length: 10,
          },
          (_, i) => shot(i),
        ),
      }).success,
    ).toBe(false);
    expect(saveScreenshotsBody.safeParse({}).success).toBe(false);
  });
});
