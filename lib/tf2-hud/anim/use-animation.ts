/**
 * Brings animations into the editor: loads the HUD's animation scripts once something wants them, keeps the
 * runtime pointed at the current files, starts the events the game would start as the Play-mode numbers
 * change, and hands the scene a style function for whatever is moving.
 */
'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { animationEvents } from '../play/anim-events';
import type { HudPage } from '../pages';
import type { CondEnv } from '../scheme/cond';
import type { Scheme } from '../scheme/scheme';
import { useEditor } from '../store';
import { animEnvFor, panelProps } from './base';
import { manifestFiles, mergeScripts, parseAnimScript, type AnimScript } from './parse';
import { animRuntime } from './runtime';
import { animStyle, EMPTY_SNAPSHOT, type StyleFor } from './style';

export const ANIM_MANIFEST = 'scripts/hudanimations_manifest.txt';

const parsed = new Map<string, AnimScript>();
function parseCachedScript(text: string): AnimScript {
  let hit = parsed.get(text);
  if (!hit) {
    hit = parseAnimScript(text);
    parsed.set(text, hit);
    if (parsed.size > 8) parsed.delete(parsed.keys().next().value as string);
  }
  return hit;
}

/** The merged scripts the manifest lists, or null while they are still loading. */
export function useAnimScript(wanted: boolean): AnimScript | null {
  const baseStatus = useEditor((s) => s.baseStatus);
  const ensureFiles = useEditor((s) => s.ensureFiles);
  const readText = useEditor((s) => s.readText);
  const overlay = useEditor((s) => s.overlay);
  const baseVersion = useEditor((s) => s.baseVersion);

  const manifest = wanted ? readText(ANIM_MANIFEST) : undefined;
  const files = useMemo(() => manifestFiles(manifest), [manifest]);

  useEffect(() => {
    if (wanted && baseStatus === 'ready') void ensureFiles([ANIM_MANIFEST, ...files]);
  }, [wanted, baseStatus, files, ensureFiles]);

  // The same scripts give the same merged object, so an unrelated edit does not restart what is playing.
  const last = useRef<{ from: AnimScript[]; merged: AnimScript } | null>(null);
  return useMemo(() => {
    if (!wanted || manifest === undefined) return null;
    const scripts = files
      .map((f) => readText(f))
      .filter((t): t is string => t !== undefined)
      .map(parseCachedScript);
    if (!scripts.length) return null;
    const prev = last.current;
    if (
      prev &&
      prev.from.length === scripts.length &&
      prev.from.every((s, i) => s === scripts[i])
    ) {
      return prev.merged;
    }
    const merged = mergeScripts(scripts);
    last.current = { from: scripts, merged };
    return merged;
    // `overlay` and `baseVersion` are the real inputs behind `readText`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, manifest, files, overlay, baseVersion]);
}

export function useAnimation(
  scheme: Scheme,
  page: HudPage | undefined,
  env: CondEnv,
  minmode: boolean,
): StyleFor | undefined {
  const play = useEditor((s) => s.view.play);
  const wanted = useEditor((s) => s.animsWanted || s.view.play);
  const test = useEditor((s) => s.test);
  const readText = useEditor((s) => s.readText);
  const overlay = useEditor((s) => s.overlay);
  const baseVersion = useEditor((s) => s.baseVersion);
  const script = useAnimScript(wanted);

  const panels = useMemo(
    () => (wanted && page ? panelProps(page.files, readText, env, minmode) : new Map()),
    // `overlay` and `baseVersion` are the real inputs behind `readText`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wanted, page, overlay, baseVersion, env, minmode],
  );
  const animEnv = useMemo(() => animEnvFor(panels, scheme), [panels, scheme]);

  useEffect(() => {
    if (script) animRuntime.configure(script, animEnv);
  }, [script, animEnv]);

  // The game's own triggers, while playing.
  const prev = useRef<typeof test | null>(null);
  useEffect(() => {
    if (!play || !script) {
      prev.current = null;
      return;
    }
    for (const name of animationEvents(prev.current, test)) animRuntime.fire(name);
    prev.current = test;
  }, [play, script, test]);

  // Leaving Play mode puts the HUD back to what its files say.
  useEffect(() => {
    if (!play) animRuntime.stopAll();
  }, [play]);

  const snapshot = useSyncExternalStore(
    animRuntime.subscribe,
    animRuntime.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  return useMemo(() => animStyle(snapshot), [snapshot]);
}
