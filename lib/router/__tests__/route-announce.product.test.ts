import { describe, expect, it } from 'vitest';
import { announcementText, nextInputKind, pathnameChanged, shouldMoveFocus } from '@/lib/router/route-announce';

describe('announcementText', () => {
  it('removes the site suffix', () => {
    expect(announcementText('Settings | RMH Studios')).toBe('Settings');
    expect(announcementText('Pick a game — RMH Studios')).toBe('Pick a game');
    expect(announcementText('Privacy & data | RMH Studios')).toBe('Privacy & data');
  });
  it('keeps a title that has no suffix, and an inner separator', () => {
    expect(announcementText('Users | Admin | RMH Studios')).toBe('Users | Admin');
    expect(announcementText('Settings')).toBe('Settings');
  });
  it('says nothing for an empty title or the bare site name', () => {
    expect(announcementText('')).toBe('');
    expect(announcementText(undefined)).toBe('');
    expect(announcementText('RMH Studios')).toBe('');
  });
});

describe('pathnameChanged', () => {
  it('is true when the pathname differs', () => {
    expect(pathnameChanged({ pathname: '/explore' }, { pathname: '/settings' })).toBe(true);
  });
  it('is false for the same pathname (a search or hash change)', () => {
    expect(pathnameChanged({ pathname: '/games' }, { pathname: '/games' })).toBe(false);
  });
  it('ignores a trailing slash', () => {
    expect(pathnameChanged({ pathname: '/games/' }, { pathname: '/games' })).toBe(false);
  });
  it('is false with no previous location', () => {
    expect(pathnameChanged(undefined, { pathname: '/' })).toBe(false);
  });
});

describe('the input tracker', () => {
  it('follows the last input', () => {
    expect(nextInputKind('none', 'keydown')).toBe('keyboard');
    expect(nextInputKind('keyboard', 'pointerdown')).toBe('pointer');
    expect(nextInputKind('pointer', 'keydown')).toBe('keyboard');
  });
  it('ignores other events', () => {
    expect(nextInputKind('keyboard', 'scroll')).toBe('keyboard');
  });
});

describe('shouldMoveFocus', () => {
  it('moves after a keyboard-started navigation on the site tier', () => {
    expect(shouldMoveFocus({ input: 'keyboard', focusOnBody: false, appRoute: false })).toBe(true);
  });
  it('moves when focus fell to the body', () => {
    expect(shouldMoveFocus({ input: 'pointer', focusOnBody: true, appRoute: false })).toBe(true);
  });
  it('keeps focus after a pointer-started navigation that left it on a link', () => {
    expect(shouldMoveFocus({ input: 'pointer', focusOnBody: false, appRoute: false })).toBe(false);
    expect(shouldMoveFocus({ input: 'none', focusOnBody: false, appRoute: false })).toBe(false);
  });
  it('never moves on an app-tier route', () => {
    expect(shouldMoveFocus({ input: 'keyboard', focusOnBody: true, appRoute: true })).toBe(false);
  });
});
