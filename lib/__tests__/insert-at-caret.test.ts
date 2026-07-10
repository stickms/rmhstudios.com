import { describe, it, expect } from 'vitest';
import { insertAtCaret } from '@/lib/emoji/insert-at-caret';

describe('insertAtCaret', () => {
  it('inserts at a caret in the middle of the text', () => {
    expect(insertAtCaret('hello world', '🔥', 5, 5)).toEqual({
      next: 'hello🔥 world',
      caret: 7, // '🔥' is 2 UTF-16 units
    });
  });

  it('appends at the end', () => {
    expect(insertAtCaret('hi', '😀', 2, 2)).toEqual({ next: 'hi😀', caret: 4 });
  });

  it('replaces an active selection', () => {
    expect(insertAtCaret('abcdef', '❤️', 1, 4)).toEqual({ next: 'a❤️ef', caret: 3 });
  });

  it('clamps out-of-range offsets', () => {
    expect(insertAtCaret('ab', '😀', 10, 20)).toEqual({ next: 'ab😀', caret: 4 });
    expect(insertAtCaret('ab', '😀', -1, 0)).toEqual({ next: '😀ab', caret: 2 });
  });

  it('treats end < start as a collapsed caret at start', () => {
    expect(insertAtCaret('abcd', 'x', 2, 1)).toEqual({ next: 'abxcd', caret: 3 });
  });
});
