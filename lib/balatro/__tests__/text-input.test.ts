import { describe, expect, it } from 'vitest';
import { hitsField, keyForChar, keyForNamed, parseTextState } from '../text-input';

describe('parseTextState', () => {
  it('reads the hook flag and the field', () => {
    expect(parseTextState('1\n10 20 300 40')).toEqual({ hooked: true, field: { x: 10, y: 20, w: 300, h: 40 } });
  });
  it('has no field when none is open or the line is bad', () => {
    expect(parseTextState('0\n')).toEqual({ hooked: false, field: null });
    expect(parseTextState('0\n1 2 3')).toEqual({ hooked: false, field: null });
    expect(parseTextState('')).toEqual({ hooked: false, field: null });
  });
});

describe('hitsField', () => {
  const field = { x: 100, y: 100, w: 200, h: 50 };
  it('hits inside and within the finger margin only', () => {
    expect(hitsField(field, 150, 120)).toBe(true);
    expect(hitsField(field, 92, 120)).toBe(true);
    expect(hitsField(field, 60, 120)).toBe(false);
    expect(hitsField(null, 150, 120)).toBe(false);
  });
});

describe('keyForChar', () => {
  it('maps letters, digits and space to their US keys', () => {
    expect(keyForChar('a')).toEqual({ key: 'a', code: 'KeyA', keyCode: 65, shift: false });
    expect(keyForChar('Q')).toEqual({ key: 'Q', code: 'KeyQ', keyCode: 81, shift: true });
    expect(keyForChar('7')).toEqual({ key: '7', code: 'Digit7', keyCode: 55, shift: false });
    expect(keyForChar(' ')?.code).toBe('Space');
  });
  it('shifts symbols onto their base key', () => {
    expect(keyForChar('_')).toEqual({ key: '_', code: 'Minus', keyCode: 189, shift: true });
    expect(keyForChar('!')).toEqual({ key: '!', code: 'Digit1', keyCode: 49, shift: true });
  });
  it('has none for what a US keyboard cannot type', () => {
    expect(keyForChar('é')).toBeNull();
    expect(keyForChar('😀')).toBeNull();
  });
});

describe('keyForNamed', () => {
  it('maps the keys the game field reacts to', () => {
    expect(keyForNamed('Backspace')?.keyCode).toBe(8);
    expect(keyForNamed('Enter')?.code).toBe('Enter');
    expect(keyForNamed('Tab')).toBeNull();
  });
});
