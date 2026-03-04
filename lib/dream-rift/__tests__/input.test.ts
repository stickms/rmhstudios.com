import { describe, it, expect, beforeEach } from 'vitest';
import { InputManager } from '../input';

// Helper to create a minimal KeyboardEvent-like object for Node.js tests
function keyEvent(key: string): KeyboardEvent {
  return { key, preventDefault: () => {} } as unknown as KeyboardEvent;
}

describe('InputManager', () => {
  let input: InputManager;
  beforeEach(() => { input = new InputManager(); });

  it('initializes with all keys released', () => {
    const state = input.getState();
    expect(state.up).toBe(false);
    expect(state.shot).toBe(false);
    expect(state.melee).toBe(false);
  });

  it('registers key presses', () => {
    input.handleKeyDown(keyEvent('ArrowUp'));
    input.handleKeyDown(keyEvent('x'));
    const state = input.getState();
    expect(state.up).toBe(true);
    expect(state.shot).toBe(true);
  });

  it('registers key releases', () => {
    input.handleKeyDown(keyEvent('ArrowUp'));
    input.handleKeyUp(keyEvent('ArrowUp'));
    expect(input.getState().up).toBe(false);
  });

  it('maps z to melee, c to special, a to dash, s to bomb', () => {
    input.handleKeyDown(keyEvent('z'));
    expect(input.getState().melee).toBe(true);
    input.handleKeyDown(keyEvent('c'));
    expect(input.getState().special).toBe(true);
    input.handleKeyDown(keyEvent('a'));
    expect(input.getState().dash).toBe(true);
    input.handleKeyDown(keyEvent('s'));
    expect(input.getState().bomb).toBe(true);
  });

  it('maps Shift to focus', () => {
    input.handleKeyDown(keyEvent('Shift'));
    expect(input.getState().focus).toBe(true);
  });

  it('detects just-pressed keys (rising edge)', () => {
    expect(input.justPressed('melee')).toBe(false);
    input.handleKeyDown(keyEvent('z'));
    expect(input.justPressed('melee')).toBe(true);
    input.update();
    expect(input.justPressed('melee')).toBe(false);
  });
});
