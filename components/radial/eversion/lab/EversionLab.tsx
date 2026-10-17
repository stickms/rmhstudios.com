/**
 * The globe-eversion harness (T26): drives the REAL host/worker/core/renderer
 * from sample pages, with no router, hub or capture in the loop. It exists so
 * the effect can be judged (and screenshotted) in isolation — T27/T28 consume it.
 *
 * Internal tooling, English only (like /liquid-glass): the route is admin-gated
 * and noindex, so it carries no `t()` strings.
 *
 * Two ways to look at a frame:
 *  - **Scrub** — the slider replays a fresh timeline deterministically to `t`
 *    (the core's `scrub` debug op, 8 ms steps) and draws that one frame. Idle
 *    only; no loop runs.
 *  - **Play** — a real run: `prime` → textures → `start`, then the host's own
 *    frame loop until `done`, with the AFTER page arriving at the chosen time.
 *
 * Nothing here runs a frame loop of its own: the only timers are one-shots
 * (theme settle, delayed AFTER) and a 250 ms status poll while a run is in flight.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, FastForward, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { PLAN_MS, STRETCH_CAP_MS } from '@/lib/eversion/constants';
import { isEversionDebugEnabled } from '@/lib/eversion/flags';
import { defaultDeps } from '@/lib/eversion/gl/core';
import { detectHostMode, getEversionHost, resetEversionHost } from '@/lib/eversion/gl/host';
import { fitEndIsometry } from '@/lib/eversion/orientation';
import { resolveProjection } from '@/lib/eversion/random';
import {
  PROJECTION_IDS,
  type ChannelId,
  type DebugCommand,
  type EversionHost,
  type FrameStats,
  type FromWorker,
  type ProjectionId,
  type StageId,
} from '@/lib/eversion/types';
import { useThemeStore, type SiteStyle } from '@/stores/themeStore';
import { drawSamplePage } from './samplePages';
import { readThemeColours } from './themeColours';

const THEMES = [
  { id: 'graphite', label: 'Dark' },
  { id: 'default', label: 'Light' },
  { id: 'high-contrast', label: 'High contrast' },
];

const PROJECTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'random', label: 'Random' },
  ...PROJECTION_IDS.map((id) => ({ value: id, label: id })),
];

/** Where each stage begins on the default plan (ms from `start`). */
const STAGE_BUTTONS: { label: string; t: number }[] = [
  { label: 'Hub (0)', t: 0 },
  { label: 'Wrap', t: 350 },
  { label: 'Evert', t: PLAN_MS.evert[0] },
  { label: 'Mid-evert', t: (PLAN_MS.evert[0] + PLAN_MS.evert[1]) / 2 },
  { label: 'Unwrap', t: PLAN_MS.unwrap[0] },
  { label: 'Pop', t: PLAN_MS.pop[0] },
  { label: 'Done', t: PLAN_MS.total },
];

const SCRUB_MAX = Math.round(PLAN_MS.total + STRETCH_CAP_MS);
const SOLID_BEFORE = [0.9, 0.15, 0.15, 1] as const;
const SOLID_AFTER = [0.1, 0.35, 0.95, 1] as const;
const DEBUG_ID_BASE = 1_000_000;

interface Status {
  mode: string;
  stage: StageId | '—';
  stageT: number;
  running: boolean;
  frames: number;
  stats: FrameStats | null;
  note: string;
}

/** Let Providers' effect swap the style class (a one-shot timer, not a frame loop). */
const settle = (ms = 80) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function EversionLab() {
  const style = useThemeStore((s) => s.style);
  const setStyle = useThemeStore((s) => s.setStyle);

  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EversionHost | null>(null);
  const readyRef = useRef(false);
  const dirtyRef = useRef(true); // the next scrub/play must prime + upload first
  const runningRef = useRef(false);
  const debugId = useRef(DEBUG_ID_BASE);
  const waiting = useRef(new Map<number, (r: FromWorker & { type: 'debug-result' }) => void>());

  const [projectionSetting, setProjectionSetting] = useState<string>('mercator');
  const [projection, setProjection] = useState<ProjectionId>('mercator');
  const [t, setT] = useState(PLAN_MS.evert[0] + 800);
  const [afterAtOn, setAfterAtOn] = useState(false);
  const [afterAt, setAfterAt] = useState(1500);
  const [solid, setSolid] = useState(false);
  const [themeTick, setThemeTick] = useState(0); // bumped when computed theme colours settle
  const [status, setStatus] = useState<Status>({
    mode: '—',
    stage: '—',
    stageT: 0,
    running: false,
    frames: 0,
    stats: null,
    note: 'starting…',
  });
  const [ready, setReady] = useState(false);

  const patch = useCallback((p: Partial<Status>) => setStatus((s) => ({ ...s, ...p })), []);

  /* ── Host lifecycle ───────────────────────────────────────────────────── */

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // A canvas can be handed to a worker once, so each mount builds its own.
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-eversion-lab-canvas', '');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    stage.appendChild(canvas);

    // The end isometry (T13) is what the worker normally computes. Until that
    // task lands it throws; the lab then runs the SAME core on the main thread
    // with an identity orientation so the renderer can still be judged.
    let fallback = '';
    try {
      fitEndIsometry();
    } catch {
      fallback = 'orientation unavailable (T13): identity, main thread';
      detectHostMode('main');
    }
    const host = getEversionHost(
      fallback
        ? {
            coreDeps: {
              ...defaultDeps(),
              orientation: () => ({
                thetaAlign: 0,
                mAfter: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
              }),
            },
          }
        : {},
    );
    hostRef.current = host;
    readyRef.current = false;
    dirtyRef.current = true;
    const waits = waiting.current;

    const off = host.subscribe((m) => {
      switch (m.type) {
        case 'ready':
          readyRef.current = true;
          setReady(true);
          patch({
            mode: m.host,
            note: `ready (${m.host}, tier ${m.tier})${fallback ? ` — ${fallback}` : ''}`,
          });
          break;
        case 'stage':
          patch({ stage: m.stage, stageT: Math.round(m.t) });
          break;
        case 'need-after-by':
          patch({ note: `AFTER needed by ${Math.round(m.deadline)}` });
          break;
        case 'unwrap-done':
          // The controller's half of the hand-off: the flat page is on screen, so reveal.
          host.post({ type: 'reveal' });
          break;
        case 'done':
          runningRef.current = false;
          dirtyRef.current = true; // the core released its textures
          patch({
            running: false,
            stage: 'done',
            stats: { frames: m.frames, dropped: m.dropped, p95: m.p95 },
            note: 'run complete',
          });
          break;
        case 'context-lost':
          runningRef.current = false;
          dirtyRef.current = true;
          patch({ running: false, note: 'GL context lost' });
          break;
        case 'error':
          console.warn('eversion-lab: render-side error', m.message);
          patch({ note: `error: ${m.message}${m.fatal ? ' (fatal)' : ''}` });
          break;
        case 'debug-result':
          waits.get(m.id)?.(m);
          waits.delete(m.id);
          break;
        default:
          break;
      }
    });

    host.post({
      type: 'init',
      canvas,
      tier: 'high',
      dprCap: 2,
    });
    patch({ mode: host.mode, note: 'initialising…' });

    return () => {
      off();
      resetEversionHost();
      hostRef.current = null;
      readyRef.current = false;
      setReady(false);
      canvas.remove();
      waits.clear();
    };
  }, [patch]);

  /* ── Helpers that talk to the core ────────────────────────────────────── */

  const ask = useCallback(<T,>(command: DebugCommand): Promise<T> => {
    const host = hostRef.current;
    if (!host) return Promise.reject(new Error('no host'));
    const id = debugId.current++;
    return new Promise<T>((resolve, reject) => {
      waiting.current.set(id, (r) =>
        r.ok ? resolve(r.value as T) : reject(new Error(String(r.value))),
      );
      host.post({ type: 'debug', id, command });
    });
  }, []);

  const viewport = useCallback(() => {
    const el = stageRef.current;
    const w = Math.max(64, Math.round(el?.clientWidth ?? window.innerWidth));
    const h = Math.max(64, Math.round(el?.clientHeight ?? window.innerHeight));
    return { w, h, dpr: Math.min(window.devicePixelRatio || 1, 2) };
  }, []);

  const sendTexture = useCallback(
    async (slot: 'before' | 'after' | 'placeholder') => {
      const host = hostRef.current;
      if (!host) return;
      const { w, h, dpr } = viewport();
      let bg: string | undefined;
      if (isEversionDebugEnabled()) {
        // Debug (the e2e suites): pages as bright as the theme's own, see drawSamplePage.
        const [r, g, b] = readThemeColours().bg;
        bg = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
      }
      const page = drawSamplePage(slot === 'after' ? 'after' : 'before', w * dpr, h * dpr, bg);
      const bitmap = await createImageBitmap(page);
      host.post({ type: 'texture', slot, bitmap }, [bitmap]);
    },
    [viewport],
  );

  /** Prime the plan and upload the pages (AFTER too unless `holdAfter`). */
  const prepare = useCallback(
    async (holdAfter: boolean) => {
      const host = hostRef.current;
      if (!host) throw new Error('no host');
      const vp = viewport();
      host.post({
        type: 'prime',
        lut: null,
        projection,
        viewport: vp,
        globe: {
          yaw: 0,
          pitch: 0,
          yawVel: 0,
          pitchVel: 0,
          centre: [vp.w / 2, vp.h / 2],
          radius: Math.min(vp.w, vp.h) * 0.3,
        },
        orb: { cx: 48, cy: 48, radius: 20 },
        colours: readThemeColours(),
      });
      await Promise.all([
        sendTexture('before'),
        sendTexture('placeholder'),
        holdAfter ? Promise.resolve() : sendTexture('after'),
      ]);
      if (solid) await ask({ op: 'solid-textures', before: SOLID_BEFORE, after: SOLID_AFTER });
      dirtyRef.current = false;
    },
    [ask, projection, sendTexture, solid, viewport],
  );

  // The smoothness detector's door (testing/e2e/eversion-smoothness.mjs): with `?eversion-debug`
  // only, `window.__eversionLab.scrub` plays a scripted timeline to an absolute time and draws it,
  // exactly as the scrubber does, optionally with the core's `inject-hard-cut` step applied (the
  // caller waits for the compositor before it reads pixels). Absent without the flag; the lab
  // itself is dev/admin only.
  useEffect(() => {
    if (!ready || !isEversionDebugEnabled()) return;
    let cut: ChannelId | null = null;
    const api = {
      async scrub(
        command: Extract<DebugCommand, { op: 'scrub' }>,
        hardCut: ChannelId | null = null,
      ) {
        if (runningRef.current) throw new Error('lab: a run is in flight');
        if (dirtyRef.current) await prepare(false);
        if (hardCut !== cut) {
          cut = hardCut;
          await ask({ op: 'inject-hard-cut', channel: hardCut });
        }
        return ask<{ stage: StageId; t: number }>(command);
      },
    };
    (window as unknown as { __eversionLab?: typeof api }).__eversionLab = api;
    return () => {
      delete (window as unknown as { __eversionLab?: typeof api }).__eversionLab;
    };
  }, [ask, prepare, ready]);

  // Anything that changes the primed plan invalidates it.
  useEffect(() => {
    dirtyRef.current = true;
  }, [projection, solid, themeTick, style]);

  /* ── Scrubbing ────────────────────────────────────────────────────────── */

  const wanted = useRef<{ t: number; afterAt: number | null } | null>(null);
  const scrubbing = useRef(false);

  const pump = useCallback(async () => {
    if (scrubbing.current) return;
    scrubbing.current = true;
    try {
      for (let req = wanted.current; req; req = wanted.current) {
        wanted.current = null;
        if (runningRef.current || !readyRef.current) break;
        if (dirtyRef.current) await prepare(false);
        const r = await ask<{ stage: StageId; t: number }>({
          op: 'scrub',
          t: req.t,
          afterAt: req.afterAt,
        });
        patch({
          stage: r.stage,
          stageT: Math.round(r.t),
          note: `scrubbed to ${Math.round(req.t)} ms`,
        });
      }
    } catch (e) {
      patch({ note: `scrub failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      scrubbing.current = false;
    }
  }, [ask, patch, prepare]);

  const requestScrub = useCallback(() => {
    wanted.current = { t, afterAt: afterAtOn ? afterAt : 0 };
    void pump();
  }, [afterAt, afterAtOn, pump, t]);

  // Re-draw whenever the scrub inputs or the primed plan change (and once ready).
  useEffect(() => {
    if (ready && !status.running) requestScrub();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- status.running read only to gate
  }, [ready, t, afterAt, afterAtOn, projection, solid, themeTick, style, requestScrub]);

  /* ── Play ─────────────────────────────────────────────────────────────── */

  const afterTimer = useRef<number | null>(null);
  const poll = useRef<number | null>(null);

  const stopPoll = () => {
    if (poll.current !== null) window.clearInterval(poll.current);
    poll.current = null;
  };

  const play = useCallback(async () => {
    const host = hostRef.current;
    if (!host || runningRef.current || !readyRef.current) return;
    try {
      await prepare(afterAtOn);
      runningRef.current = true;
      patch({ running: true, stats: null, stage: 'wrap', stageT: 0, note: 'running' });
      host.post({ type: 'start', t0: performance.now() });
      if (afterAtOn) {
        afterTimer.current = window.setTimeout(() => {
          if (runningRef.current) void sendTexture('after');
        }, afterAt);
      }
      stopPoll();
      poll.current = window.setInterval(() => {
        if (!runningRef.current) return stopPoll();
        void ask<{ frames: number }>({ op: 'loop' }).then((l) => patch({ frames: l.frames }));
      }, 250);
    } catch (e) {
      runningRef.current = false;
      patch({ running: false, note: `play failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [afterAt, afterAtOn, ask, patch, prepare, sendTexture]);

  const abort = useCallback(() => {
    hostRef.current?.post({ type: 'abort' });
    if (afterTimer.current !== null) window.clearTimeout(afterTimer.current);
    runningRef.current = false;
    dirtyRef.current = true;
    stopPoll();
    patch({ running: false, note: 'aborted' });
  }, [patch]);

  useEffect(
    () => () => {
      if (afterTimer.current !== null) window.clearTimeout(afterTimer.current);
      stopPoll();
    },
    [],
  );

  // A finished run stops the poll.
  useEffect(() => {
    if (!status.running) stopPoll();
  }, [status.running]);

  // Viewport changes re-prime (the stage is full-window).
  useEffect(() => {
    let id: number | null = null;
    const onResize = () => {
      if (id !== null) window.clearTimeout(id);
      id = window.setTimeout(() => {
        dirtyRef.current = true;
        hostRef.current?.post({ type: 'resize', viewport: viewport() });
        setThemeTick((n) => n + 1);
      }, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (id !== null) window.clearTimeout(id);
    };
  }, [viewport]);

  /* ── Controls ─────────────────────────────────────────────────────────── */

  const chooseProjection = (value: string) => {
    setProjectionSetting(value);
    setProjection(value === 'random' ? resolveProjection('random') : (value as ProjectionId));
  };

  const chooseTheme = async (id: string) => {
    setStyle(id as SiteStyle);
    await settle();
    setThemeTick((n) => n + 1);
  };

  const fastForward = () => hostRef.current?.post({ type: 'fast-forward' });
  const afterFailed = () => hostRef.current?.post({ type: 'after-failed' });

  const statsLine = useMemo(() => {
    const s = status.stats;
    return s ? `${s.frames} frames · ${s.dropped} dropped · p95 ${s.p95.toFixed(1)} ms` : '—';
  }, [status.stats]);

  return (
    <div
      className="bg-site-bg text-site-text relative h-dvh w-full overflow-hidden"
      data-eversion-lab
    >
      <div ref={stageRef} className="absolute inset-0" data-eversion-lab-stage />

      <section
        aria-label="Eversion lab controls"
        className="glass-overlay rounded-site absolute bottom-3 left-3 flex max-h-[calc(100dvh-1.5rem)] w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-3 overflow-y-auto p-3 text-sm"
        data-eversion-lab-panel
      >
        <header className="flex items-baseline justify-between gap-2">
          <h1 className="text-base font-semibold">Eversion lab</h1>
          <span className="text-site-text-muted text-xs" data-eversion-lab-mode>
            {status.mode}
          </span>
        </header>

        <div className="flex items-center gap-2">
          <label htmlFor="lab-projection" className="text-site-text-muted w-20 shrink-0 text-xs">
            Projection
          </label>
          <Select
            id="lab-projection"
            controlSize="sm"
            containerClassName="flex-1"
            value={projectionSetting}
            onChange={(e) => chooseProjection(e.target.value)}
            data-testid="lab-projection"
          >
            {PROJECTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {projectionSetting === 'random' && (
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Re-roll random projection"
              onClick={() => setProjection(resolveProjection('random'))}
            >
              <RefreshCw aria-hidden />
            </Button>
          )}
        </div>
        {projectionSetting === 'random' && (
          <p className="text-site-text-muted -mt-2 text-xs">drew: {projection}</p>
        )}

        <LiquidTabs
          tabs={THEMES}
          value={style}
          onChange={(id) => void chooseTheme(id)}
          aria-label="Theme"
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <label htmlFor="lab-scrub" className="text-site-text-muted">
              Scrub
            </label>
            <span data-eversion-lab-t>
              {t} ms · {status.stage}
            </span>
          </div>
          <Slider
            id="lab-scrub"
            aria-label="Timeline position (ms)"
            min={0}
            max={SCRUB_MAX}
            step={10}
            value={[t]}
            disabled={status.running}
            onValueChange={([v]) => setT(v ?? 0)}
            data-testid="lab-scrub"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STAGE_BUTTONS.map((b) => (
            <Button
              key={b.label}
              size="xs"
              variant="outline"
              disabled={status.running}
              onClick={() => setT(Math.round(b.t))}
            >
              {b.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={() => void play()} disabled={!ready || status.running}>
            <Play aria-hidden /> Play
          </Button>
          <Button size="sm" variant="outline" onClick={fastForward} disabled={!status.running}>
            <FastForward aria-hidden /> Fast-forward
          </Button>
          <Button size="sm" variant="outline" onClick={afterFailed} disabled={!status.running}>
            <Pause aria-hidden /> AFTER failed
          </Button>
          <Button size="sm" variant="outline" onClick={abort} disabled={!status.running}>
            <Square aria-hidden /> Abort
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="lab-after-on"
            checked={afterAtOn}
            onCheckedChange={setAfterAtOn}
            aria-label="Delay the AFTER page"
          />
          <label htmlFor="lab-after-on" className="text-xs">
            AFTER arrives at
          </label>
          <Input
            type="number"
            min={0}
            max={SCRUB_MAX}
            step={50}
            value={afterAt}
            disabled={!afterAtOn}
            onChange={(e) => setAfterAt(Math.max(0, Number(e.target.value) || 0))}
            aria-label="AFTER arrival time (ms)"
            className="h-8 w-24"
          />
          <span className="text-site-text-muted text-xs">ms</span>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="lab-solid"
            checked={solid}
            onCheckedChange={setSolid}
            aria-label="Solid-colour pages"
          />
          <label htmlFor="lab-solid" className="text-xs">
            Solid colours (BEFORE red, AFTER blue)
          </label>
        </div>

        <dl
          className="glass-inset rounded-site grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 p-2 text-xs"
          data-eversion-lab-stats
          aria-live="polite"
        >
          <dt className="text-site-text-muted">Run</dt>
          <dd>{status.running ? `running · ${status.frames} frames` : 'idle'}</dd>
          <dt className="text-site-text-muted">Stage</dt>
          <dd>
            {status.stage} @ {status.stageT} ms
          </dd>
          <dt className="text-site-text-muted">Last run</dt>
          <dd data-eversion-lab-last-run>{statsLine}</dd>
          <dt className="text-site-text-muted">Note</dt>
          <dd data-eversion-lab-note>{status.note}</dd>
        </dl>
      </section>
    </div>
  );
}
