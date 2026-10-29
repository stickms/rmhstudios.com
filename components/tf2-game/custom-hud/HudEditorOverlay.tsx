/**
 * The full HUD editor (components/tf2-hud/Tf2HudEditor) over the running
 * game: pause menu → HUD → Edit HUD. Loaded on demand (the editor is large).
 *
 * The editor works on the HUD the game is using (or a copy of someone else's),
 * in the editor's own store, so closing and reopening it keeps every edit and
 * the undo history. "Test in game" saves the draft, applies it to the game and
 * returns to the match; the pause menu's "Back to the HUD editor" comes back.
 * While it is open the game is paused offline (online play goes on) and gets
 * no input. It mounts inside the game's HUD root when the game is full screen
 * (its dialogs too: `portalRoot`), so opening it no longer leaves full screen;
 * it borrows the pointer lock and gives it back on the way out.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { flushLocalDraft, useEditor } from '@/lib/tf2-hud/store';
import { selectionKey, type HudSelection } from '@/lib/tf2-game/client/custom-hud/selection';
import { toTestState } from '@/lib/tf2-game/client/custom-hud/adapter';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import Tf2HudEditor from '../../tf2-hud/Tf2HudEditor';
import { ensureEditorHolds } from './editor-session';
import { editorContainer, PointerLockMemo } from '@/lib/tf2-game/client/custom-hud/editor-portal';
import { useHudChoice } from './hud-choice';

export default function HudEditorOverlay({ store }: { store: HudStore }) {
  const { t } = useTranslation('c-tf2-game');
  const selection = useHudChoice((s) => s.selection);
  const setEditorOpen = useHudChoice((s) => s.setEditorOpen);
  const [ready, setReady] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const lock = useRef(new PointerLockMemo());

  useEffect(() => {
    // The editor needs the mouse; full screen stays (the editor mounts inside it).
    lock.current.release(document);
    setContainer(editorContainer(document));
  }, []);

  useEffect(() => {
    let live = true;
    void ensureEditorHolds(selection, t('editor_copy_suffix', { defaultValue: '(copy)' })).then(
      (ok) => {
        if (!live) return;
        if (ok) {
          // The editor previews what the player was just looking at: their class, team, health, ammo, meters.
          const now = store.getSnapshot();
          if (now.local && now.local.cls > 0) useEditor.getState().setTest(toTestState(now));
          setReady(true);
        } else {
          toast.error(
            t('hud_edit_failed', { defaultValue: 'That HUD could not be opened in the editor.' }),
          );
          setEditorOpen(false);
        }
      },
    );
    return () => {
      live = false;
    };
    // Only the HUD the editor was opened for; a later choice does not swap the project mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToGame = () => {
    // Inside the click: a browser grants pointer lock only during a user gesture.
    lock.current.restore();
    void flushLocalDraft();
    setEditorOpen(false);
  };

  const testInGame = async () => {
    lock.current.restore();
    const saved = await flushLocalDraft();
    const ed = useEditor.getState();
    const sel: HudSelection = saved ? { kind: 'draft', id: ed.draftId } : { kind: 'default' };
    useHudChoice
      .getState()
      .setEditorKey(saved ? selectionKey(sel) : useHudChoice.getState().editorKey);
    setEditorOpen(false);
    const ok =
      sel.kind === 'draft'
        ? await useHudChoice
            .getState()
            .apply({ selection: sel, meta: ed.meta, overlay: ed.overlay })
        : await useHudChoice.getState().choose(sel);
    if (ok)
      toast.success(
        t('hud_applied', { defaultValue: 'Playing with {{name}}', name: ed.meta.name }),
      );
  };

  if (!container) return null;
  // A Radix dialog: focus stays in the editor (and its own dialogs nest inside it); Esc does not close it —
  // the editor uses Esc itself, and "Back to game" is one click away.
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && backToGame()}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="tf2g-hud-editor fixed inset-0 z-50 bg-(--app-bg) outline-none"
          data-jelly="off"
        >
          <DialogPrimitive.Title className="sr-only">
            {t('hud_editor', { defaultValue: 'HUD editor' })}
          </DialogPrimitive.Title>
          {ready ? (
            <Tf2HudEditor
              embedded={{ onTestInGame: () => void testInGame(), onBackToGame: backToGame }}
            />
          ) : (
            <p
              role="status"
              className="flex h-full items-center justify-center text-sm text-(--app-text-muted)"
            >
              {t('hud_editor_loading', { defaultValue: 'Opening the HUD editor…' })}
            </p>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
