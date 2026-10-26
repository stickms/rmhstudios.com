/**
 * Derives the preview scene from the store: parses the scheme, makes sure the
 * page's base files are loaded, and rebuilds the scene whenever a file, a test
 * value or a view setting changes.
 */
'use client';

import { useEffect, useMemo } from 'react';
import { COND_ENVS } from './scheme/cond';
import { EMPTY_SCHEME, parseScheme, type Scheme } from './scheme/scheme';
import { buildScene } from './scene/build';
import type { Scene } from './scene/types';
import { varsFromState } from './fixtures';
import { resolvePage, type HudPage } from './pages';
import { CORE_FILES, useEditor } from './store';
import { screenOf } from './view';

export interface SceneResult {
  scene: Scene | null;
  scheme: Scheme;
  page: HudPage | undefined;
  /** Page files still being fetched. */
  loading: boolean;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function useScene(): SceneResult {
  const pageId = useEditor((s) => s.pageId);
  const overlay = useEditor((s) => s.overlay);
  const baseVersion = useEditor((s) => s.baseVersion);
  const baseStatus = useEditor((s) => s.baseStatus);
  const test = useEditor((s) => s.test);
  const view = useEditor((s) => s.view);
  const forceShown = useEditor((s) => s.forceShown);
  const forceHidden = useEditor((s) => s.forceHidden);
  const strings = useEditor((s) => s.localisation);
  const ensureFiles = useEditor((s) => s.ensureFiles);
  const readText = useEditor((s) => s.readText);
  const hasFile = useEditor((s) => s.hasFile);

  const page = useMemo(() => resolvePage(pageId), [pageId]);

  useEffect(() => {
    if (baseStatus !== 'ready' || !page) return;
    void ensureFiles([...CORE_FILES, ...page.files]);
  }, [baseStatus, page, ensureFiles]);

  const env = COND_ENVS[view.env];
  const schemeText = readText('resource/clientscheme.res');
  const scheme = useMemo(
    () => (schemeText === undefined ? EMPTY_SCHEME : parseScheme(schemeText, env)),
    [schemeText, env],
  );

  const screen = useMemo(() => screenOf(view), [view]);
  const vars = useMemo(() => varsFromState(test), [test]);

  const scene = useMemo(() => {
    if (!page || baseStatus !== 'ready') return null;
    return buildScene(
      {
        readText,
        scheme,
        env,
        screen,
        minmode: view.minmode,
        showHidden: view.showHidden,
        forceShown: forceShown ?? EMPTY_SET,
        forceHidden: forceHidden ?? EMPTY_SET,
        vars,
        strings,
        progress: test.progress / 100,
      },
      page.files,
    );
    // `overlay` and `baseVersion` are the real inputs behind `readText`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    baseStatus,
    overlay,
    baseVersion,
    scheme,
    env,
    screen,
    view.minmode,
    view.showHidden,
    forceShown,
    forceHidden,
    vars,
    strings,
    test.progress,
  ]);

  // Files that exist but whose bytes have not arrived yet.
  const loading =
    baseStatus === 'loading' ||
    (page?.files.some((f) => hasFile(f) && readText(f) === undefined) ?? false);
  return { scene, scheme, page, loading };
}
