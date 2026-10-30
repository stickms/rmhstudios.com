/**
 * /balatro — the player's own copy of Balatro, running on LÖVE compiled to
 * WebAssembly (lib/balatro/runtime.ts has the pipeline; docs/balatro-wasm.md the
 * write-up).
 *
 * The site ships the engine and the platform layer only, never the game: the
 * player picks the Balatro.exe (or Balatro.love) they already own, it is read in
 * the browser and, if they keep it, cached in their own IndexedDB. Saves live in
 * IndexedDB too, and can be exported to or imported from the desktop layout
 * (%AppData%\Balatro, ~/Library/Application Support/Balatro).
 */
'use client';

import { ArrowLeft, Download, FileUp, Maximize, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  bootBalatro,
  clearCachedSource,
  GameSourceError,
  loadCachedSource,
  prefetchEngine,
  readGameSource,
  storeCachedSource,
  type BalatroSession,
  type BootPhase,
  type GameSource,
} from '@/lib/balatro/runtime';
import { cn } from '@/lib/utils';
import './balatro.css';

type Stage =
  | { kind: 'checking' }
  | { kind: 'pick'; cached: GameSource | null; error?: string }
  | { kind: 'booting'; phase: BootPhase; progress?: number }
  | { kind: 'running'; version: string }
  | { kind: 'failed'; message: string };

function hasWebGL(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl');
  } catch {
    return false;
  }
}

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function BalatroPage() {
  const { t } = useTranslation('c-balatro');
  const [stage, setStage] = useState<Stage>({ kind: 'checking' });
  const [keepCopy, setKeepCopy] = useState(true);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<BalatroSession | null>(null);
  const gameInput = useRef<HTMLInputElement>(null);
  const saveInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    prefetchEngine();
    void loadCachedSource().then((cached) => live && setStage({ kind: 'pick', cached }));
    return () => {
      live = false;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  const boot = useCallback(
    async (source: GameSource) => {
      if (!hasWebGL()) {
        setStage({
          kind: 'failed',
          message: t('error_webgl', { defaultValue: 'This browser has WebGL turned off, and the game needs it to draw.' }),
        });
        return;
      }
      setStage({ kind: 'booting', phase: 'engine' });
      try {
        sessionRef.current = await bootBalatro({
          canvas: canvasRef.current!,
          frame: frameRef.current!,
          source,
          onPhase: (phase, progress) => {
            if (phase !== 'running') setStage({ kind: 'booting', phase, progress });
          },
          onLog: (line, isError) => {
            if (isError) console.warn('[balatro]', line);
          },
        });
        setStage({ kind: 'running', version: source.version });
        canvasRef.current?.focus();
      } catch (err) {
        console.error('[balatro] boot failed', err);
        setStage({
          kind: 'failed',
          message: t('error_boot', { defaultValue: 'The engine could not start. Reload the page to try again.' }),
        });
      }
    },
    [t],
  );

  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const source = await readGameSource(new Uint8Array(await file.arrayBuffer()));
        if (keepCopy) await storeCachedSource(source).catch(() => {});
        void boot(source);
      } catch (err) {
        const code = err instanceof GameSourceError ? err.code : 'not-a-zip';
        setStage({
          kind: 'pick',
          cached: null,
          error:
            code === 'not-balatro'
              ? t('error_not_balatro', { defaultValue: 'That file is a LÖVE game, but not Balatro.' })
              : t('error_not_zip', {
                  defaultValue: 'That file has no game inside. Pick Balatro.exe or Balatro.love.',
                }),
        });
      }
    },
    [boot, keepCopy, t],
  );

  const onGameInput = (e: ChangeEvent<HTMLInputElement>) => {
    void pickFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void pickFile(e.dataTransfer.files?.[0]);
  };

  const forget = async () => {
    await clearCachedSource().catch(() => {});
    setStage({ kind: 'pick', cached: null });
  };

  const exportSaves = async () => {
    const session = sessionRef.current;
    if (!session) return;
    download(await session.exportSaves(), 'balatro-saves.zip');
  };

  const onSaveInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const session = sessionRef.current;
    if (!file || !session) return;
    try {
      const count = await session.importSaves(new Uint8Array(await file.arrayBuffer()));
      if (!count) {
        toast.error(t('import_empty', { defaultValue: 'No Balatro saves (.jkr files) in that zip.' }));
        return;
      }
      toast.success(t('import_done', { defaultValue: 'Saves imported. Reloading…' }));
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error(t('import_failed', { defaultValue: 'That file is not a zip.' }));
    }
  };

  const fullscreen = () => {
    void frameRef.current?.requestFullscreen?.().catch(() => {});
  };

  // Leaving a running engine needs a real navigation: it holds a WebAssembly
  // heap and audio contexts that only a fresh document gives back.
  const leave = () => {
    sessionRef.current?.stop();
    window.location.assign('/games');
  };

  const showGame = stage.kind === 'booting' || stage.kind === 'running';

  return (
    <main className="balatro-page app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <div
        ref={frameRef}
        className={cn('balatro-frame', !showGame && 'hidden')}
        data-jelly-zone="playfield"
        aria-hidden={!showGame}
      >
        <canvas
          ref={canvasRef}
          id="canvas"
          className="balatro-canvas"
          tabIndex={0}
          aria-label={t('canvas_label', { defaultValue: 'Balatro' })}
          onContextMenu={(e) => e.preventDefault()}
        />
        {stage.kind === 'booting' && (
          <div className="balatro-boot" role="status">
            <span className="font-mono text-xs uppercase tracking-widest text-(--app-text-dim)">
              {stage.phase === 'engine'
                ? t('phase_engine', { defaultValue: 'Loading engine' })
                : stage.phase === 'unpack'
                  ? t('phase_unpack', { defaultValue: 'Unpacking game' })
                  : t('phase_start', { defaultValue: 'Starting LÖVE' })}
            </span>
            {stage.phase === 'unpack' && (
              <span className="balatro-meter" aria-hidden>
                <span style={{ transform: `scaleX(${stage.progress ?? 0})` }} />
              </span>
            )}
          </div>
        )}
        {stage.kind === 'running' && (
          <div className="balatro-toolbar" role="toolbar" aria-label={t('toolbar', { defaultValue: 'Game controls' })}>
            <button type="button" onClick={leave} aria-label={t('leave', { defaultValue: 'Leave' })}>
              <ArrowLeft className="size-4 rtl-flip" aria-hidden />
            </button>
            <button type="button" onClick={fullscreen} aria-label={t('fullscreen', { defaultValue: 'Fullscreen' })}>
              <Maximize className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void exportSaves()}
              aria-label={t('export_saves', { defaultValue: 'Export saves' })}
            >
              <Download className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => saveInput.current?.click()}
              aria-label={t('import_saves', { defaultValue: 'Import saves' })}
            >
              <Upload className="size-4" aria-hidden />
            </button>
            <input
              ref={saveInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => void onSaveInput(e)}
            />
          </div>
        )}
      </div>

      {!showGame && (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pr-[calc(1rem_+_var(--safe-right,0px))] pb-16 pl-[calc(1rem_+_var(--safe-left,0px))] pt-[calc(var(--safe-top,0px)+1rem)]">
          <a
            href="/games"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-(--app-text-muted) hover:text-(--app-text)"
          >
            <ArrowLeft className="size-4 rtl-flip" aria-hidden />
            {t('back', { defaultValue: 'Games' })}
          </a>

          <header>
            <p className="font-mono text-xs uppercase tracking-widest text-(--app-text-dim)">
              {t('eyebrow', { defaultValue: 'LÖVE → WebAssembly' })}
            </p>
            <h1 className="mt-2 text-5xl font-semibold tracking-tight">{t('title', { defaultValue: 'Balatro' })}</h1>
            <p className="mt-3 text-sm text-(--app-text-muted)">
              {t('intro', {
                defaultValue:
                  'Play your own copy of Balatro in the browser. Pick the game file from your install; it is read on this device and never uploaded.',
              })}
            </p>
          </header>

          {stage.kind === 'checking' && (
            <p className="text-sm text-(--app-text-muted)" role="status">
              {t('checking', { defaultValue: 'Looking for a saved copy…' })}
            </p>
          )}

          {stage.kind === 'failed' && (
            <p className="balatro-panel text-sm" role="alert">
              {stage.message}
            </p>
          )}

          {stage.kind === 'pick' && (
            <section className="flex flex-col gap-4">
              {stage.cached && (
                <div className="balatro-panel flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {t('cached_title', { defaultValue: 'Your copy is on this device' })}
                    </p>
                    <p className="font-mono text-xs text-(--app-text-dim)">{stage.cached.version}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="balatro-action" onClick={() => void forget()}>
                      <Trash2 className="size-4" aria-hidden />
                      {t('forget', { defaultValue: 'Remove copy' })}
                    </button>
                    <button
                      type="button"
                      className="balatro-action balatro-action-primary"
                      onClick={() => void boot(stage.cached!)}
                    >
                      {t('play', { defaultValue: 'Play' })}
                    </button>
                  </div>
                </div>
              )}

              <div
                role="group"
                aria-label={t('drop_label', { defaultValue: 'Game file' })}
                className={cn('balatro-drop', dragging && 'balatro-drop-active')}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <FileUp className="size-6 text-(--app-text-dim)" aria-hidden />
                <button
                  type="button"
                  className={cn('balatro-action', !stage.cached && 'balatro-action-primary')}
                  onClick={() => gameInput.current?.click()}
                >
                  {t('choose', { defaultValue: 'Choose game file' })}
                </button>
                <p className="text-xs text-(--app-text-dim)">
                  {t('drop_hint', { defaultValue: 'or drop Balatro.exe / Balatro.love here' })}
                </p>
                <input
                  ref={gameInput}
                  type="file"
                  accept=".exe,.love,.zip"
                  className="hidden"
                  onChange={onGameInput}
                />
              </div>

              {stage.error && (
                <p className="text-sm text-(--app-danger)" role="alert">
                  {stage.error}
                </p>
              )}

              <label className="flex min-h-11 items-center gap-2 text-sm text-(--app-text-muted)">
                <input type="checkbox" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} />
                {t('keep_copy', { defaultValue: 'Keep the game on this device so it opens without picking it again' })}
              </label>

              <div className="balatro-panel text-sm text-(--app-text-muted)">
                <h2 className="mb-2 text-sm font-semibold text-(--app-text)">
                  {t('where_title', { defaultValue: 'Where to find it' })}
                </h2>
                <ul className="flex list-disc flex-col gap-1 pl-5">
                  <li>
                    {t('where_windows', {
                      defaultValue: 'Windows: in Steam, right-click Balatro → Manage → Browse local files → Balatro.exe.',
                    })}
                  </li>
                  <li>
                    {t('where_mac', {
                      defaultValue: 'macOS: Balatro.app → Show Package Contents → Contents/Resources/Balatro.love.',
                    })}
                  </li>
                  <li>
                    {t('where_saves', {
                      defaultValue:
                        'Saves stay in this browser. Use the export and import buttons in the game to move them to or from %AppData%\\Balatro.',
                    })}
                  </li>
                </ul>
              </div>

              <details className="balatro-panel text-sm text-(--app-text-muted)">
                <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-(--app-text)">
                  {t('how_title', { defaultValue: 'How it runs' })}
                </summary>
                <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5">
                  <li>
                    {t('how_1', {
                      defaultValue:
                        'Balatro.exe is the LÖVE engine with the game zipped onto its end. The page finds the zip in the file and unpacks it in memory.',
                    })}
                  </li>
                  <li>
                    {t('how_2', {
                      defaultValue:
                        'The engine is LÖVE 11 compiled to WebAssembly with Emscripten (love.js). The Windows DLLs are never used: they are x86 code.',
                    })}
                  </li>
                  <li>
                    {t('how_3', {
                      defaultValue:
                        'A small Lua layer runs first. It turns the game’s threads into coroutines and adds LuaJIT’s bit library and random generator, so seeds deal the same cards as on desktop.',
                    })}
                  </li>
                  <li>
                    {t('how_4', {
                      defaultValue:
                        'The save folder is mounted on IndexedDB and flushed after every save. Steam is not available, so achievements are tracked locally.',
                    })}
                  </li>
                </ol>
              </details>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
