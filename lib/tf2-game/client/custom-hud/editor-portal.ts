/**
 * Where the in-game HUD editor (HudEditorOverlay) and every dialog, menu and
 * popover inside it mount, and the pointer lock it borrows.
 *
 * A full-screen page shows only the full-screen element's subtree: a portal
 * into the app root is not drawn there, so the editor used to leave full
 * screen to be seen. Mounted inside the game's HUD root (which is inside the
 * full-screen element) it stays put. Out of full screen it keeps the app's
 * themed root, as before. The editor's own dialogs follow the same rule
 * (`portalRoot`, components/tf2-hud/ui.tsx). Pure DOM logic: tested in
 * editor-portal.test.ts.
 */

import { portalRoot, type PortalDoc } from '@/lib/tf2-hud/portal-root';

/** The element the editor mounts in: the themed root inside the full-screen element, else the page's. */
export function editorContainer(doc: PortalDoc & { body: HTMLElement } = document): HTMLElement {
  return portalRoot(doc) ?? doc.body;
}

type LockDoc = Pick<Document, 'exitPointerLock'> & { pointerLockElement: Element | null };

/**
 * The game's pointer lock while the editor has the mouse: `release` lets go of it and remembers the
 * element, `restore` locks it again on the way back. Call `restore` from the click that returns to the
 * game: a browser grants pointer lock only during a user gesture.
 */
export class PointerLockMemo {
  private target: Element | null = null;

  release(doc: LockDoc): void {
    this.target = doc.pointerLockElement;
    if (this.target) doc.exitPointerLock();
  }

  get held(): boolean {
    return this.target !== null;
  }

  restore(): void {
    const el = this.target as
      (Element & { requestPointerLock?: () => Promise<void> | void }) | null;
    this.target = null;
    if (!el || !el.isConnected || typeof el.requestPointerLock !== 'function') return;
    try {
      const p = el.requestPointerLock();
      if (p && typeof (p as Promise<void>).catch === 'function')
        (p as Promise<void>).catch(() => undefined);
    } catch {
      // Refused (no gesture, the document lost focus): the game asks again on the next click, as always.
    }
  }
}
