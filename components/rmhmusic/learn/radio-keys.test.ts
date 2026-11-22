import { describe, expect, it } from 'vitest';
import { radioKey } from './radio-keys';

describe('the Sound dialog radio group keys', () => {
  it('moves with the arrows, wrapping at both ends, without picking', () => {
    expect(radioKey('ArrowDown', 0, 4)).toEqual({
      kind: 'move',
      index: 1,
    });
    expect(radioKey('ArrowRight', 3, 4)).toEqual({
      kind: 'move',
      index: 0,
    });
    expect(radioKey('ArrowUp', 0, 4)).toEqual({
      kind: 'move',
      index: 3,
    });
    expect(radioKey('ArrowLeft', 2, 4)).toEqual({
      kind: 'move',
      index: 1,
    });
    expect(radioKey('Home', 2, 4)).toEqual({
      kind: 'move',
      index: 0,
    });
    expect(radioKey('End', 0, 4)).toEqual({
      kind: 'move',
      index: 3,
    });
  });

  it('picks the focused row with Space or Enter', () => {
    expect(radioKey(' ', 1, 4)).toEqual({
      kind: 'select',
    });
    expect(radioKey('Enter', 1, 4)).toEqual({
      kind: 'select',
    });
  });

  it('leaves every other key (Tab, letters) to the browser', () => {
    expect(radioKey('Tab', 1, 4)).toBeNull();
    expect(radioKey('a', 1, 4)).toBeNull();
    expect(radioKey('ArrowDown', 0, 0)).toBeNull();
  });
});
