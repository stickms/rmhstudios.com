/**
 * Assemble a downloadable zip from an overlay. Shared by the editor and the
 * public HUD page so both produce byte-identical archives.
 */

import type { BaseCache } from '../project/base';
import { binaryContent, listPaths, textContent } from '../project/model';
import { isTextPath } from '../project/paths';
import type { FileContent, HudMeta, Overlay } from '../project/types';
import { decodeUtf8 } from '../util/sha1';
import { exportZip, type ExportScope } from './export';

export interface BuildOptions {
  meta: HudMeta;
  overlay: Overlay;
  base: BaseCache;
  scope: ExportScope;
  includeInfoVdf?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function buildHudZip(opts: BuildOptions): Promise<Blob> {
  const { meta, overlay, base, scope } = opts;
  const index = await base.loadIndex();
  const files = new Map<string, FileContent>();

  if (scope === 'full') {
    const all = listPaths(overlay, index);
    const needed = all.filter((p) => !overlay.get(p));
    const SLICE = 40;
    for (let i = 0; i < needed.length; i += SLICE) {
      await base.ensure(needed.slice(i, i + SLICE));
      opts.onProgress?.(Math.min(needed.length, i + SLICE), needed.length);
    }
    for (const p of all) {
      const o = overlay.get(p);
      if (o) files.set(p, o);
      else {
        const b = base.getBytes(p);
        if (b) files.set(p, isTextPath(p) ? textContent(decodeUtf8(b)) : binaryContent(b));
      }
    }
  } else {
    for (const [p, c] of overlay) if (c) files.set(p, c);
  }

  let licenseText: string | undefined;
  try {
    const res = await fetch('/tf2-hud/base/LICENSE');
    if (res.ok) licenseText = await res.text();
  } catch {
    /* the README still names the licence */
  }

  return exportZip({
    meta,
    files,
    licenseText,
    scope,
    includeInfoVdf: opts.includeInfoVdf,
    baseCommit: index.source.commit,
  });
}
