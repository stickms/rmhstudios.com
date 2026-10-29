/**
 * The HUD editor's store holding the game's HUD: what "Edit HUD" and "Export"
 * in the pause menu's HUD view need before the editor (or its export dialog)
 * opens. Kept apart from the editor overlay so the pause menu does not load
 * the whole editor.
 */
'use client';

import { api } from '@/lib/tf2-hud/api';
import { loadOverlay } from '@/lib/tf2-hud/cloud';
import { useEditor } from '@/lib/tf2-hud/store';
import { selectionKey, type HudSelection } from '@/lib/tf2-game/client/custom-hud/selection';
import { useHudChoice } from './hud-choice';

/** Put `selection`'s HUD in the editor's store (a copy when it is someone else's). */
export async function loadIntoEditor(selection: HudSelection, copySuffix: string): Promise<void> {
  const ed = useEditor.getState();
  await ed.boot();
  switch (selection.kind) {
    case 'default':
      ed.newProject();
      return;
    case 'draft': {
      if (await ed.restoreDraft(selection.id)) return;
      // Not on this device's draft store (yet): the game has the files, so edit those under the same id.
      const active = useHudChoice.getState().active?.hud;
      if (!active || selectionKey(active.selection) !== selectionKey(selection))
        throw new Error('missing draft');
      ed.loadProject({ draftId: selection.id, meta: active.meta, overlay: active.overlay });
      return;
    }
    case 'cloud':
    case 'share': {
      const detail =
        selection.kind === 'cloud'
          ? await api.get(selection.id)
          : await api.getShared(selection.token);
      const { overlay, meta } = await loadOverlay(
        detail,
        selection.kind === 'cloud' ? { hud: detail.id } : { token: selection.token },
      );
      if (selection.kind === 'cloud' && detail.isOwner) {
        ed.loadProject({ remoteId: detail.id, slug: detail.slug, meta, overlay });
      } else {
        ed.loadProject({
          forkOfId: detail.id,
          meta: { ...meta, name: `${meta.name} ${copySuffix}`.slice(0, 80) },
          overlay,
        });
      }
    }
  }
}

/** Make sure the editor holds the game's HUD; resolves false when it could not be loaded. */
export async function ensureEditorHolds(
  selection: HudSelection,
  copySuffix: string,
): Promise<boolean> {
  const key = selectionKey(selection);
  const choice = useHudChoice.getState();
  if (choice.editorKey === key) return true;
  try {
    await loadIntoEditor(selection, copySuffix);
    useHudChoice.getState().setEditorKey(key);
    return true;
  } catch {
    return false;
  }
}
