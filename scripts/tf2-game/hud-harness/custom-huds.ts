/**
 * Builds the sample custom HUDs (lib/tf2-game/client/custom-hud/sample-huds.ts)
 * in the browser for the harness: base files fetched from public/, the edits
 * applied with the editor's lossless KeyValues edits, binaries copied in.
 * Not part of the app.
 */
import { applySampleEdits, sampleHud } from '@/lib/tf2-game/client/custom-hud/sample-huds';
import type { LoadedHud } from '@/lib/tf2-game/client/custom-hud/source';
import { binaryContent, textContent } from '@/lib/tf2-hud/project/model';
import type { FileContent } from '@/lib/tf2-hud/project/types';
import { DEFAULT_META } from '@/lib/tf2-hud/project/types';

async function fetchText(path: string): Promise<string | undefined> {
  const res = await fetch(`/tf2-hud/base/${path}`);
  return res.ok ? res.text() : undefined;
}

/** `base` = the TF2 Default through the custom-HUD pipeline; otherwise a sample id. */
export async function harnessHud(id: string): Promise<LoadedHud | null> {
  if (id === 'base')
    return {
      selection: { kind: 'draft', id: 'harness-base' },
      meta: { ...DEFAULT_META, name: 'TF2 Default (editor renderer)' },
      overlay: new Map(),
    };
  const sample = sampleHud(id);
  if (!sample) return null;
  const texts = new Map<string, string>();
  for (const e of sample.edits) {
    const t = await fetchText(e.path);
    if (t !== undefined) texts.set(e.path, t);
  }
  const changed = applySampleEdits(sample, (p) => texts.get(p));
  const overlay = new Map<string, FileContent | null>();
  for (const [p, t] of changed) overlay.set(p, textContent(t));
  for (const [p, url] of Object.entries(sample.binaries ?? {})) {
    const res = await fetch(url);
    if (res.ok) overlay.set(p, binaryContent(new Uint8Array(await res.arrayBuffer())));
  }
  return {
    selection: { kind: 'draft', id: `harness-${sample.id}` },
    meta: { ...DEFAULT_META, name: sample.name },
    overlay,
  };
}
