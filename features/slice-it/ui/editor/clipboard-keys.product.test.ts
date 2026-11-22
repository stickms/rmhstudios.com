/**
 * The key table for the clipboard and time operations: each binding maps to its
 * operation, Cmd works like Ctrl, and nothing maps while a text field, a dialog
 * or a menu has focus.
 */

import { describe, expect, it } from 'vitest';
import { clipboardOpForEvent, type KeyLike } from './clipboard-keys';

const el = (tagName: string, role?: string) => {
  const self = {
    tagName,
    isContentEditable: false,
    closest: (selector: string) =>
      role && selector.includes(`[role="${role}"]`) ? self : null,
  };
  return self as unknown as EventTarget;
};

const key = (k: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  target: el('DIV'),
  ...over,
});

describe('clipboard key table', () => {
  it.each([
    ['c', { ctrlKey: true }, 'copy'],
    ['x', { ctrlKey: true }, 'cut'],
    ['v', { ctrlKey: true }, 'paste'],
    ['V', { ctrlKey: true, shiftKey: true }, 'paste-mirrored'],
    ['d', { ctrlKey: true }, 'duplicate'],
    ['i', { ctrlKey: true }, 'insert-time'],
    ['L', { ctrlKey: true, shiftKey: true }, 'remove-time'],
    ['S', { ctrlKey: true, shiftKey: true }, 'scale'],
    ['h', {}, 'mirror'],
    ['H', {}, 'mirror'],
    ['q', {}, 'quantize'],
  ] as const)('%s %o -> %s', (k, mods, op) => {
    expect(clipboardOpForEvent(key(k, mods))).toBe(op);
  });

  it('treats Cmd (macOS Meta) as Ctrl', () => {
    expect(clipboardOpForEvent(key('c', { metaKey: true }))).toBe('copy');
    expect(clipboardOpForEvent(key('V', { metaKey: true, shiftKey: true }))).toBe('paste-mirrored');
    expect(clipboardOpForEvent(key('L', { metaKey: true, shiftKey: true }))).toBe('remove-time');
  });

  it('leaves the bindings it does not own alone', () => {
    expect(clipboardOpForEvent(key('s', { ctrlKey: true }))).toBeNull(); // save
    expect(clipboardOpForEvent(key('z', { ctrlKey: true }))).toBeNull(); // undo
    expect(clipboardOpForEvent(key('a', { ctrlKey: true }))).toBeNull();
    expect(clipboardOpForEvent(key('h', { altKey: true }))).toBeNull();
    expect(clipboardOpForEvent(key('H', { shiftKey: true }))).toBeNull();
    expect(clipboardOpForEvent(key('x'))).toBeNull();
  });

  it('does nothing while a text field has focus', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(clipboardOpForEvent(key('c', { ctrlKey: true, target: el(tag) }))).toBeNull();
      expect(clipboardOpForEvent(key('h', { target: el(tag) }))).toBeNull();
    }
  });

  it('does nothing while a dialog or menu has focus', () => {
    for (const role of ['dialog', 'alertdialog', 'menu']) {
      expect(clipboardOpForEvent(key('v', { ctrlKey: true, target: el('BUTTON', role) }))).toBeNull();
      expect(clipboardOpForEvent(key('q', { target: el('BUTTON', role) }))).toBeNull();
    }
  });
});
