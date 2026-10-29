/**
 * A custom HUD's files, for the game: the editor's project model (an overlay
 * of the author's files on the TF2 Default base, lib/tf2-hud/project) read
 * through the same base cache the editor uses, and loaders for every place a
 * HUD can come from (a local draft, an account, a share link).
 *
 * A HUD is data: `.res`, scheme, animation scripts, fonts and textures are
 * parsed and drawn, never executed. Fonts register as font faces and
 * textures decode to bitmaps through the editor's own decoders.
 */

import { api } from '@/lib/tf2-hud/api';
import { loadOverlay } from '@/lib/tf2-hud/cloud';
import { loadDraft } from '@/lib/tf2-hud/local-drafts';
import { contentBytes } from '@/lib/tf2-hud/project/model';
import { baseCache } from '@/lib/tf2-hud/project/base-cache';
import { DEFAULT_META, type HudMeta, type Overlay } from '@/lib/tf2-hud/project/types';
import type { HudSelection } from './selection';

export interface LoadedHud {
  selection: HudSelection;
  meta: HudMeta;
  overlay: Overlay;
}

export const DEFAULT_HUD_META: HudMeta = { ...DEFAULT_META, name: 'TF2 Default' };

export class HudLoadError extends Error {
  constructor(
    readonly reason: 'missing' | 'forbidden' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'HudLoadError';
  }
}

/** Read a HUD's files: the author's overlay first, then the shared base cache. */
export class HudFiles {
  constructor(readonly overlay: Overlay) {}

  readText = (path: string): string | undefined => {
    const o = this.overlay.get(path);
    if (o === null) return undefined;
    if (o) return o.kind === 'text' ? o.text : undefined;
    return baseCache.getText(path);
  };

  readBytes = (path: string): Uint8Array | undefined => {
    const o = this.overlay.get(path);
    if (o === null) return undefined;
    if (o) return contentBytes(o);
    return baseCache.getBytes(path);
  };

  /** Font files the HUD ships (registered under their internal and `CustomFontFiles` names). */
  fontFiles(): Map<string, Uint8Array> {
    const out = new Map<string, Uint8Array>();
    for (const [path, c] of this.overlay) {
      if (c && /\.(ttf|otf)$/i.test(path)) out.set(path, contentBytes(c));
    }
    return out;
  }

  /** Fetch the base copies of `paths` the overlay does not replace (unknown paths are skipped). */
  async ensure(paths: readonly string[]): Promise<void> {
    await baseCache.ensure(paths.filter((p) => !this.overlay.has(p)));
  }
}

/** Load a selection's files. The default HUD is an empty overlay (the base as it ships). */
export async function loadHud(selection: HudSelection): Promise<LoadedHud> {
  switch (selection.kind) {
    case 'default':
      return { selection, meta: DEFAULT_HUD_META, overlay: new Map() };
    case 'draft': {
      const rec = await loadDraft(selection.id);
      if (!rec) throw new HudLoadError('missing', 'That draft is not on this device.');
      return { selection, meta: rec.meta, overlay: rec.overlay };
    }
    case 'cloud':
    case 'share': {
      try {
        const detail =
          selection.kind === 'cloud'
            ? await api.get(selection.id)
            : await api.getShared(selection.token);
        const { overlay, meta } = await loadOverlay(
          detail,
          selection.kind === 'cloud' ? { hud: detail.id } : { token: selection.token },
        );
        return { selection, meta, overlay };
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404) throw new HudLoadError('missing', 'That HUD could not be found.');
        if (status === 401 || status === 403)
          throw new HudLoadError('forbidden', 'That HUD is private.');
        throw new HudLoadError('network', 'The HUD could not be downloaded.');
      }
    }
  }
}
