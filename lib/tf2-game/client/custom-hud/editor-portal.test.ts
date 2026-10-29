/**
 * The in-game HUD editor in full screen: it and its dialogs mount inside the
 * full-screen element (so the browser need not leave full screen to show
 * them), and the pointer lock it borrows is given back on the way out.
 */
import { describe, expect, it, vi } from 'vitest';
import { portalRoot } from '@/lib/tf2-hud/portal-root';
import { editorContainer, PointerLockMemo } from './editor-portal';

/** A minimal element: class names, children, `matches` / `querySelector` on `.class` selectors. */
class FakeEl {
  children: FakeEl[] = [];
  isConnected = true;
  constructor(readonly classes: string[] = []) {}
  add(c: FakeEl): FakeEl {
    this.children.push(c);
    return c;
  }
  matches(sel: string): boolean {
    return this.classes.includes(sel.replace(/^\./, ''));
  }
  querySelector(sel: string): FakeEl | null {
    for (const c of this.children) {
      if (c.matches(sel)) return c;
      const hit = c.querySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
}

/** The play page: the app shell (themed), and inside it the game container with the HUD root. */
function page() {
  const body = new FakeEl();
  const shell = body.add(new FakeEl(['tf2hud-theme']));
  const game = shell.add(new FakeEl(['game']));
  const hud = game.add(new FakeEl(['tf2g-hud', 'tf2hud-theme']));
  const doc = {
    body,
    fullscreenElement: null as FakeEl | null,
    querySelector: (sel: string) => body.querySelector(sel),
  };
  return { doc, shell, game, hud };
}

describe('the HUD editor over a full-screen game', () => {
  it('mounts in the page’s themed root out of full screen, and inside the full-screen element in it', () => {
    const { doc, shell, game, hud } = page();
    const d = doc as unknown as Parameters<typeof editorContainer>[0];
    expect(editorContainer(d)).toBe(shell);
    expect(portalRoot(d)).toBe(shell);
    doc.fullscreenElement = game;
    expect(editorContainer(d)).toBe(hud);
    // The editor's own dialogs and popovers follow the same root.
    expect(portalRoot(d)).toBe(hud);
    // Full screen on the HUD root itself, or on an element with no themed root inside: still inside it.
    doc.fullscreenElement = hud;
    expect(editorContainer(d)).toBe(hud);
    const bare = new FakeEl();
    doc.fullscreenElement = bare;
    expect(editorContainer(d)).toBe(bare);
  });

  it('gives back the pointer lock it took, and only when it took one', () => {
    const canvas = { isConnected: true, requestPointerLock: vi.fn(() => Promise.resolve()) };
    const doc = { pointerLockElement: canvas as unknown as Element, exitPointerLock: vi.fn() };
    const memo = new PointerLockMemo();
    memo.release(doc);
    expect(doc.exitPointerLock).toHaveBeenCalledOnce();
    expect(memo.held).toBe(true);
    memo.restore();
    expect(canvas.requestPointerLock).toHaveBeenCalledOnce();
    memo.restore();
    expect(canvas.requestPointerLock).toHaveBeenCalledOnce();

    const unlocked = { pointerLockElement: null, exitPointerLock: vi.fn() };
    const none = new PointerLockMemo();
    none.release(unlocked);
    expect(unlocked.exitPointerLock).not.toHaveBeenCalled();
    none.restore();

    // A canvas that left the page (the match ended meanwhile) is not asked; a refusal is swallowed.
    const gone = { isConnected: false, requestPointerLock: vi.fn() };
    const m2 = new PointerLockMemo();
    m2.release({ pointerLockElement: gone as unknown as Element, exitPointerLock: () => {} });
    m2.restore();
    expect(gone.requestPointerLock).not.toHaveBeenCalled();
    const refuses = {
      isConnected: true,
      requestPointerLock: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
    };
    const m3 = new PointerLockMemo();
    m3.release({ pointerLockElement: refuses as unknown as Element, exitPointerLock: () => {} });
    expect(() => m3.restore()).not.toThrow();
  });
});
