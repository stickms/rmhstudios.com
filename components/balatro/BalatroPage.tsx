/**
 * /balatro — Balatro on LÖVE compiled to WebAssembly (lib/balatro/runtime.ts has
 * the pipeline; docs/balatro-wasm.md the write-up). Signed-in only (the route's
 * beforeLoad), unlisted and noindex.
 *
 * Opening the page starts the game: the engine and the core pack download in
 * parallel (both cached in the browser after the first visit) and the audio
 * follows in the background. Saves live in IndexedDB and are backed up to the
 * account (lib/balatro/cloud-saves.ts); the toolbar also exports and imports them
 * in the desktop layout (%AppData%\Balatro).
 *
 * Multiplayer is lazy (docs/balatro-mp.md): until the player presses the game's
 * MULTIPLAYER button, all this page carries is the small stub below that waits
 * for Lua's `mp_open`. Then it imports the MP chunk (lib/balatro/mp/pack-loader)
 * and hands the mailbox over. An invite link (`?lobby=`) or a match to rejoin
 * starts that at boot, fetching the MP pack alongside the core.
 */
'use client';

import { ArrowLeft, Download, Maximize, Minimize, Upload } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Tooltip } from '@/components/ui/Tooltip';
import { useLobbyInvite, useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { createCloudSaves } from '@/lib/balatro/cloud-saves';
import type { MpController, MpIntent, StubHandover } from '@/lib/balatro/mp/pack-loader';
import {
  bootBalatro,
  MP_REJOIN_HINT_KEY,
  PackError,
  prefetchEngine,
  type BalatroSession,
  type BootPhase,
  type MpAutoload,
  type MpHost,
} from '@/lib/balatro/runtime';
import './balatro.css';

const MpToolbar = lazy(() => import('./mp/MpToolbar'));
const loadMp = () => import('@/lib/balatro/mp/pack-loader');

type Stage =
  | { kind: 'booting'; phase: BootPhase; progress?: number }
  | { kind: 'running' }
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

/** Lua→JS mailbox batches land here (bridge-protocol.ts BRIDGE_PATHS.OUT; not imported, it pulls zod). */
const MP_OUT = '/rmh/net/out';

/**
 * The entry stub: until the MP chunk exists, watch Lua's batches for `mp_open`
 * (one line scan per batch, and Lua sends nothing in single player). Everything
 * read after it is kept for the mailbox, which takes over with `handover()`.
 */
function watchMpOpen(host: MpHost, onOpen: (intent: MpIntent) => void) {
  let lastLuaSeq = 0;
  let opened = false;
  const backlog: string[] = [];
  const read = () => {
    if (!host.fs.analyzePath(MP_OUT).exists) return;
    const text = new TextDecoder().decode(host.fs.readFile(MP_OUT));
    host.fs.unlink(MP_OUT);
    if (opened) return void backlog.push(text);
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (opened || !line) return;
      try {
        const m = JSON.parse(line) as { s?: unknown; t?: unknown; d?: { intent?: MpIntent } };
        if (typeof m.s !== 'number') return;
        lastLuaSeq = m.s;
        if (m.t !== 'mp_open') return;
        opened = true;
        backlog.push(lines.slice(i + 1).join('\n'));
        onOpen(m.d?.intent ?? 'menu');
      } catch {
        /* the mailbox validates; the stub only looks for its cue */
      }
    });
  };
  let off: () => void;
  if (host.tracking) off = host.onMove((_from, to) => to === MP_OUT && read());
  else {
    const id = window.setInterval(read, 250);
    off = () => window.clearInterval(id);
  }
  return {
    handover(): StubHandover {
      off();
      read();
      return { lastLuaSeq, backlog: backlog.splice(0) };
    },
  };
}

interface MpRun {
  controller: Promise<MpController> | null;
  listener: ((controller: MpController) => void) | null;
  open: (intent: MpIntent, invite?: string | null) => void;
}

interface BootRun {
  session: Promise<BalatroSession>;
  stage: Stage;
  listener: ((stage: Stage) => void) | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
  mp: MpRun;
}

function readRejoinHint(): boolean {
  try {
    return !!window.localStorage.getItem(MP_REJOIN_HINT_KEY);
  } catch {
    return false;
  }
}

/** Wires the stub to a booted engine; the MP chunk loads on the first open. */
function startMpEntry(run: BootRun, session: BalatroSession) {
  const host = session.mp;
  const stub = watchMpOpen(host, (intent) => run.mp.open(intent));
  run.mp.open = (intent, invite = null) => {
    run.mp.controller ??= loadMp().then((mod) => {
      const controller = mod.openMultiplayer(host, {
        handover: stub.handover(),
        onLog: (line, isError) => {
          if (isError) console.warn('[balatro]', line);
        },
      });
      run.mp.listener?.(controller);
      return controller;
    });
    void run.mp.controller.then((c) => c.open(intent, invite)).catch((err) => console.error('[balatro] multiplayer failed', err));
  };
  // A rejoin or a continued MP run starts at boot; an invite waits for the page's join.
  if (host.autoload === 'rejoin' || host.autoload === 'sp') run.mp.open(host.autoload);
}

// One engine per document. A remount (React StrictMode in development, or the
// router re-rendering the route) re-attaches to it; unmounting stops it one tick
// later unless something re-attached in between. A document whose engine was
// stopped reloads, since an Emscripten module cannot be started twice.
let current: BootRun | null = null;

function attach(
  listener: (stage: Stage) => void,
  opts: {
    canvas: HTMLCanvasElement;
    frame: HTMLElement;
    messages: Record<'webgl' | 'signedOut' | 'boot' | 'tooLarge' | 'audio', string>;
    /** Multiplayer must start at boot: preload its pack with the core. */
    mpAutoload: MpAutoload | null;
  },
): BootRun {
  if (current && !current.stopped) {
    if (current.stopTimer) clearTimeout(current.stopTimer);
    current.stopTimer = null;
    current.listener = listener;
    listener(current.stage);
    return current;
  }
  if (current?.stopped) {
    window.location.reload();
  }
  const run: BootRun = {
    session: new Promise<BalatroSession>(() => {}),
    stage: { kind: 'booting', phase: 'download', progress: 0 },
    listener,
    stopTimer: null,
    stopped: false,
    mp: { controller: null, listener: null, open: () => {} },
  };
  current = run;
  const emit = (stage: Stage) => {
    run.stage = stage;
    run.listener?.(stage);
  };
  prefetchEngine();
  if (!hasWebGL()) {
    emit({ kind: 'failed', message: opts.messages.webgl });
    return run;
  }
  const cloud = createCloudSaves(undefined, (code) => {
    if (code === 'save-too-large') toast.error(opts.messages.tooLarge);
  });
  run.session = bootBalatro({
    canvas: opts.canvas,
    frame: opts.frame,
    cloud,
    onPhase: (phase, progress) => {
      if (phase !== 'running') emit({ kind: 'booting', phase, progress });
    },
    onLog: (line, isError) => {
      if (isError) console.warn('[balatro]', line);
    },
    onAudioError: () => toast.error(opts.messages.audio),
    mp: opts.mpAutoload
      ? { autoload: opts.mpAutoload, files: loadMp().then((mod) => mod.fetchMpPack()) }
      : undefined,
  });
  run.session.then(
    (session) => {
      if (run.stopped) return session.stop();
      startMpEntry(run, session);
      emit({ kind: 'running' });
    },
    (err) => {
      console.error('[balatro] boot failed', err);
      emit({
        kind: 'failed',
        message: err instanceof PackError && err.status === 401 ? opts.messages.signedOut : opts.messages.boot,
      });
    },
  );
  return run;
}

function detach(listener: (stage: Stage) => void) {
  const run = current;
  if (!run || run.listener !== listener) return;
  run.listener = null;
  run.mp.listener = null;
  run.stopTimer = setTimeout(() => {
    run.stopped = true;
    void run.mp.controller?.then((c) => c.stop());
    void run.session.then((s) => s.stop());
  }, 0);
}

export default function BalatroPage() {
  const { t } = useTranslation('c-balatro');
  const [stage, setStage] = useState<Stage>({ kind: 'booting', phase: 'download', progress: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<BalatroSession | null>(null);
  const saveInput = useRef<HTMLInputElement>(null);
  const runRef = useRef<BootRun | null>(null);
  const [mp, setMp] = useState<MpController | null>(null);
  const invite = useLobbyInvite();
  const inviteRef = useRef(invite);

  // An invite link joins once the engine runs (and drops ?lobby= from the URL).
  useLobbyInviteJoin(stage.kind === 'running', (code) => runRef.current?.mp.open('invite', code));

  useEffect(() => {
    const listener = (next: Stage) => setStage(next);
    const run = attach(listener, {
      canvas: canvasRef.current!,
      frame: frameRef.current!,
      messages: {
        webgl: t('error_webgl', { defaultValue: 'This browser has WebGL turned off, and the game needs it to draw.' }),
        signedOut: t('error_signed_out', { defaultValue: 'Your session ended. Sign in again to play.' }),
        boot: t('error_start', { defaultValue: 'The game could not start. Reload the page to try again.' }),
        tooLarge: t('cloud_too_large', { defaultValue: 'Your saves are too large to back up to your account.' }),
        audio: t('audio_failed', { defaultValue: 'The sound could not load. Reload the page to try again.' }),
      },
      mpAutoload: inviteRef.current ? 'invite' : readRejoinHint() ? 'rejoin' : null,
    });
    runRef.current = run;
    run.mp.listener = setMp;
    void run.mp.controller?.then(setMp);
    sessionRef.current = null;
    void run.session.then((session) => {
      sessionRef.current = session;
      canvasRef.current?.focus();
    });
    return () => detach(listener);
  }, [t]);

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

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void frameRef.current?.requestFullscreen?.().catch(() => {});
    canvasRef.current?.focus();
  };

  // Leaving a running engine needs a real navigation: it holds a WebAssembly
  // heap and audio contexts that only a fresh document gives back.
  const leave = () => {
    sessionRef.current?.stop();
    window.location.assign('/games');
  };

  const progress = stage.kind === 'booting' ? (stage.progress ?? 0) : 1;

  return (
    <main className="balatro-page app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <div ref={frameRef} className="balatro-frame" data-jelly-zone="playfield">
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
              {stage.phase === 'download'
                ? t('phase_download', { defaultValue: 'Downloading' })
                : stage.phase === 'unpack'
                  ? t('phase_unpacking', { defaultValue: 'Unpacking' })
                  : t('phase_starting', { defaultValue: 'Starting' })}
            </span>
            <span className="balatro-meter" aria-hidden>
              <span style={{ transform: `scaleX(${stage.phase === 'start' ? 1 : progress})` }} />
            </span>
          </div>
        )}
        {stage.kind === 'failed' && (
          <div className="balatro-boot" role="alert">
            <p className="max-w-sm px-4 text-center text-sm">{stage.message}</p>
            <a href="/games" className="balatro-action">
              <ArrowLeft className="size-4 rtl-flip" aria-hidden />
              {t('back', { defaultValue: 'Games' })}
            </a>
          </div>
        )}
        {stage.kind === 'running' && (
          <div className="balatro-toolbar" role="toolbar" aria-label={t('toolbar', { defaultValue: 'Game controls' })}>
            <Tooltip content={t('leave_hint', { defaultValue: 'Leave the game. Your progress is saved.' })}>
              <button type="button" onClick={leave} aria-label={t('leave', { defaultValue: 'Leave' })}>
                <ArrowLeft className="size-4 rtl-flip" aria-hidden />
              </button>
            </Tooltip>
            <Tooltip
              content={
                isFullscreen
                  ? t('fullscreen_exit_hint', { defaultValue: 'Exit fullscreen (Esc)' })
                  : t('fullscreen_hint', { defaultValue: 'Play fullscreen' })
              }
            >
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-pressed={isFullscreen}
                aria-label={t('fullscreen', { defaultValue: 'Fullscreen' })}
              >
                {isFullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
              </button>
            </Tooltip>
            <Tooltip
              content={t('export_hint', {
                defaultValue: 'Download your saves as a zip, in the same layout as the desktop game’s save folder.',
              })}
            >
              <button
                type="button"
                onClick={() => void exportSaves()}
                aria-label={t('export_saves', { defaultValue: 'Export saves' })}
              >
                <Download className="size-4" aria-hidden />
              </button>
            </Tooltip>
            <Tooltip
              content={t('import_hint', {
                defaultValue: 'Replace your saves with a zip of a Balatro save folder, such as one from the desktop game.',
              })}
            >
              <button
                type="button"
                onClick={() => saveInput.current?.click()}
                aria-label={t('import_saves', { defaultValue: 'Import saves' })}
              >
                <Upload className="size-4" aria-hidden />
              </button>
            </Tooltip>
            {mp && (
              <Suspense fallback={null}>
                <MpToolbar controller={mp} container={frameRef.current} />
              </Suspense>
            )}
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
    </main>
  );
}
