/**
 * The render-side state machine, independent of where it runs (spec §3.2, §3.3,
 * §7.7). OWNER: T25. Client-only.
 *
 * ## Why a core, separate from the worker and the host
 *
 * The spec runs the SAME renderer and loop in a dedicated worker where
 * `OffscreenCanvas` + WebGL2 + worker frame scheduling all exist, and on the
 * main thread where they do not, with "identical behaviour". The way to make
 * that true rather than hoped-for is to have one implementation. This is it:
 * it handles {@link ToWorker}, owns the renderer, the timeline and the frame
 * loop, and emits {@link FromWorker}; it knows nothing of `self.onmessage` or
 * `postMessage`. `worker.ts` wires it to a worker scope, `host.ts` wires the
 * same core to the main thread, and a test can wire it to a fake scheduler.
 *
 * The frame scheduler is INJECTED ({@link CoreEnv.scheduler}) so the one place
 * a frame callback is actually requested is in `worker.ts` and `host.ts` — the
 * two files the rAF allowlist sanctions ("bounded by the navigation") — and
 * nothing in this file schedules a frame by name.
 *
 * ## Behaviour to implement
 *
 * - `init`: create the renderer on the canvas; reply `ready`. A second `init`
 *   (a fresh canvas) disposes the previous context first.
 * - `prime`: bake the LUT if `lut` is `null` (`projection-lut.ts`); compute
 *   `R`, `θ_align`, `M_after` (`orientation.ts`); build the `Timeline`; prime the
 *   renderer. No frame is drawn.
 * - `texture`: upload to the renderer. An `after` bitmap triggers
 *   `timeline.afterReady` once uploaded; closes the bitmap afterwards.
 * - `start`: `timeline.start(t0)`, start the loop, emit `need-after-by`. Post
 *   `cover` after the frame AFTER the first draw has been presented.
 * - Each frame: `timeline.tick(now)` → `renderer.draw(snapshot)` → emit `stage`
 *   for each new timeline event (and `unwrap-done`); feed the governor
 *   (`governor-tiers.ts`).
 * - `fast-forward` / `after-failed` / `resize` / `reveal` / `abort`: forward to
 *   the timeline (resize also to the renderer).
 * - `done`: stop the loop, emit `done` with the frame stats, `release()` the
 *   renderer; programs stay compiled.
 * - Context loss: stop the loop, emit `context-lost`.
 * - Hidden tab: pause the loop; resume on return (the timeline's `dt` clamp
 *   does the rest).
 * - `debug`: execute the {@link DebugCommand} and reply `debug-result`.
 *
 * **No loop runs at rest** — between `done` and the next `start`, and before the
 * first `start`, no frame is scheduled and no GPU work is issued.
 */

import { SPIN_AXIS } from '../domain';
import { afterDomainTransform, alignAngle, fitEndIsometry } from '../orientation';
import { bakeLut } from '../projection-lut';
import { getProjection } from '../projections';
import { copySnapshot, createSnapshot } from '../snapshot';
import { Timeline } from '../timeline';
import type {
  CoreEnv,
  DebugCommand,
  EversionCore,
  EversionPlan,
  FromWorker,
  Mat3,
  ProjectionId,
  RendererApi,
  RendererOptions,
  Rgba,
  TextureSlot,
  TimelineApi,
  TimelineConfig,
  TimelineSnapshot,
  ToWorker,
  Viewport,
} from '../types';
import { DprGovernor, FrameStatsRecorder } from './governor-tiers';
import { createRenderer } from './renderer';

/**
 * The collaborators the core builds a run from. Everything the core does not
 * own is reached through here, which is what lets a unit test run the whole
 * state machine with a fake renderer and a scripted timeline. Production passes
 * nothing: {@link defaultDeps} is the real set.
 */
export interface CoreDeps {
  createRenderer(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    options: RendererOptions,
  ): RendererApi;
  createTimeline(config: TimelineConfig): TimelineApi;
  /** Bake the LUT for `prime` messages that carry `lut: null` (spec §5.4: the bake belongs in the worker). */
  bakeLut(projection: ProjectionId, viewport: Viewport): Float32Array;
  /** `θ_align` and `M_after` (spec §4.5, §7.4); the end isometry is memoised, so this is cheap after the first call. */
  orientation(): { thetaAlign: number; mAfter: Mat3 };
  /** A 1×1 bitmap of one colour, for the `solid-textures` debug op. */
  solidBitmap(colour: Rgba): Promise<ImageBitmap>;
}

/** The real collaborators. */
export function defaultDeps(): CoreDeps {
  return {
    createRenderer,
    createTimeline: (config) => new Timeline(config),
    bakeLut(id, viewport) {
      const projection = getProjection(id);
      return bakeLut(projection, projection.fit(viewport.w, viewport.h));
    },
    orientation() {
      const { R } = fitEndIsometry();
      const thetaAlign = alignAngle(R);
      return { thetaAlign, mAfter: afterDomainTransform(R, SPIN_AXIS, thetaAlign) };
    },
    solidBitmap(colour) {
      const bytes = new Uint8ClampedArray(4);
      for (let i = 0; i < 4; i++) bytes[i] = Math.round(Math.max(0, Math.min(1, colour[i]!)) * 255);
      return createImageBitmap(new ImageData(bytes, 1, 1));
    },
  };
}

/** Step of the scrub op's simulated clock: one 60 Hz frame, well under `MAX_DT_MS`. */
const SCRUB_STEP_MS = 16;

/**
 * Create the render-side core over `env`.
 *
 * ## Clock
 *
 * The timeline runs on the render side's OWN clock: the frame callback's
 * timestamp. `start.t0` is the MAIN thread's `performance.now()`, and a dedicated
 * worker's time origin is its own creation time, not the page's (spec §3.3 says
 * they share one; they do not). So the core never feeds `t0` to the timeline. It
 * measures the offset between the two clocks once, at `start`, and applies it
 * only where a time crosses back to the main thread (`need-after-by`). In-thread
 * the clocks are the same and the offset is zero. A frame timestamp can also
 * precede the instant `start` was handled, so the clock handed to the timeline
 * is made monotonic.
 *
 * ## One loop, three ways out
 *
 * A frame is requested only between `start` and `done`, and never while the
 * page is hidden. The loop ends with the timeline's own `done` event (which
 * `abort` and `fast-forward` merely hurry along), a lost context, or a fatal
 * error — in each case the next frame is simply not requested, so there is no
 * flag to forget to check at rest.
 */
export function createEversionCore(env: CoreEnv, deps: CoreDeps = defaultDeps()): EversionCore {
  const mode = env.mode ?? 'main';
  const stats = new FrameStatsRecorder();

  let renderer: RendererApi | null = null;
  let dprCap = 1;
  let governor = new DprGovernor();
  let plan: EversionPlan | null = null;
  let timelineConfig: TimelineConfig | null = null;
  let timeline: TimelineApi | null = null;
  let running = false;
  let hidden = false;
  let lost = false;
  let disposed = false;

  let handle: number | null = null;
  let requests = 0;
  let framesDrawn = 0;
  let coverSent = false;
  /** Last frame's timestamp; `null` after a start or a resume (there is no interval to record). */
  let lastFrameAt: number | null = null;
  let clock = 0;
  let clockOffset = 0;

  let afterUploaded = false;
  let afterFailed = false;
  let pausedE: number | null = null;
  const scratch = createSnapshot();

  const emit = (message: FromWorker, transfer?: Transferable[]) => {
    if (!disposed) env.emit(message, transfer);
  };

  /* ── The loop ─────────────────────────────────────────────────────────── */

  function schedule() {
    if (!running || hidden || handle !== null || lost || disposed) return;
    requests++;
    handle = env.scheduler.request(frame);
  }

  function cancelFrame() {
    if (handle !== null) {
      env.scheduler.cancel(handle);
      handle = null;
    }
  }

  function stopLoop() {
    running = false;
    cancelFrame();
  }

  function tickClock(now: number): number {
    if (now > clock) clock = now;
    return clock;
  }

  function frame(now: number) {
    handle = null;
    if (!running || !renderer || !timeline) return;
    try {
      // The frame after the first draw: the first has been presented by now.
      if (framesDrawn > 0 && !coverSent) {
        coverSent = true;
        emit({ type: 'cover' });
      }

      if (lastFrameAt === null) {
        stats.recordFirst();
      } else {
        const interval = now - lastFrameAt;
        stats.record(interval);
        const step = governor.record(interval);
        if (step !== null) renderer.setDprScale(step);
      }
      lastFrameAt = now;

      const snapshot = timeline.tick(tickClock(now));
      if (pausedE !== null) {
        copySnapshot(snapshot, scratch).evert = pausedE;
        renderer.draw(scratch);
      } else {
        renderer.draw(snapshot);
      }
      framesDrawn++;

      let finished = false;
      for (const event of timeline.events()) {
        emit({ type: 'stage', stage: event.stage, t: event.t });
        if (event.stage === 'unwrap-done') emit({ type: 'unwrap-done' });
        if (event.stage === 'done') finished = true;
      }
      if (finished) finish();
      else schedule();
    } catch (error) {
      fail(error);
    }
  }

  function finish() {
    stopLoop();
    const summary = stats.summary();
    timeline = null;
    pausedE = null;
    renderer?.release();
    emit({ type: 'done', ...summary });
  }

  function fail(error: unknown) {
    stopLoop();
    emit({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      fatal: true,
    });
  }

  function contextLost() {
    if (lost || disposed) return;
    lost = true;
    stopLoop();
    emit({ type: 'context-lost' });
  }

  /* ── Messages ─────────────────────────────────────────────────────────── */

  function init(message: Extract<ToWorker, { type: 'init' }>) {
    stopLoop();
    renderer?.dispose();
    renderer = null;
    timeline = null;
    plan = null;
    lost = false;
    dprCap = message.dprCap;
    renderer = deps.createRenderer(message.canvas, {
      tier: message.tier,
      dprCap: message.dprCap,
      onContextLost: contextLost,
    });
    emit({ type: 'ready', tier: message.tier, host: mode });
  }

  function prime(message: Extract<ToWorker, { type: 'prime' }>) {
    if (!renderer) throw new Error('eversion: prime before init');
    stopLoop();
    const { lut, projection, viewport, globe, orb, colours } = message;
    plan = { projection, viewport, globe, orb, colours };
    const { thetaAlign, mAfter } = deps.orientation();
    renderer.prime({ ...plan, lut: lut ?? deps.bakeLut(projection, viewport), mAfter });
    timelineConfig = { viewport, globe, orb, thetaAlign };
    timeline = deps.createTimeline(timelineConfig);
    afterUploaded = false;
    afterFailed = false;
    coverSent = false;
    framesDrawn = 0;
    stats.reset();
  }

  function texture(slot: TextureSlot, bitmap: ImageBitmap) {
    try {
      if (!renderer) throw new Error('eversion: texture before init');
      renderer.setTexture(slot, bitmap);
      if (slot === 'after') {
        afterUploaded = true;
        if (running && timeline) timeline.afterReady(tickClock(env.now()));
      }
    } finally {
      // Ours to close: the main thread transferred it (spec §8.5).
      bitmap.close?.();
    }
  }

  function start(t0: number) {
    if (!renderer || !timeline || !plan) throw new Error('eversion: start before prime');
    if (running) return;
    const now = env.now();
    clockOffset = mode === 'worker' ? t0 - now : 0;
    clock = now;
    lastFrameAt = null;
    coverSent = false;
    framesDrawn = 0;
    stats.reset();
    governor = new DprGovernor(Math.min(plan.viewport.dpr, dprCap));
    running = true;
    timeline.start(now);
    if (afterUploaded) timeline.afterReady(now);
    if (afterFailed) timeline.afterFailed(now);
    const deadline = timeline.afterDeadline(now);
    if (Number.isFinite(deadline)) {
      emit({ type: 'need-after-by', deadline: deadline + clockOffset });
    }
    schedule();
  }

  function whenRunning(act: (tl: TimelineApi, now: number) => void) {
    if (running && timeline) act(timeline, tickClock(env.now()));
  }

  function setHidden(next: boolean) {
    if (hidden === next) return;
    hidden = next;
    if (hidden) {
      cancelFrame();
    } else if (running) {
      // The gap is not a frame time: skip the interval; the timeline's dt clamp absorbs it.
      lastFrameAt = null;
      schedule();
    }
  }

  /* ── Debug ────────────────────────────────────────────────────────────── */

  async function debug(
    command: DebugCommand,
  ): Promise<{ value?: unknown; transfer?: Transferable[] }> {
    switch (command.op) {
      case 'pause-at': {
        pausedE = command.e;
        if (command.e !== null && plan && renderer && !running) {
          // Not at rest any more by request: show the globe in the hub pose at `e`.
          const s: TimelineSnapshot = createSnapshot();
          s.wrap = 1;
          s.radius = plan.globe.radius;
          s.centreX = plan.globe.centre[0];
          s.centreY = plan.globe.centre[1];
          s.evert = command.e;
          renderer.draw(s);
        }
        return {};
      }
      case 'solid-textures': {
        if (!renderer) throw new Error('eversion: solid-textures before init');
        const [before, after] = await Promise.all([
          deps.solidBitmap(command.before),
          deps.solidBitmap(command.after),
        ]);
        renderer.setTexture('before', before);
        renderer.setTexture('after', after);
        renderer.setTexture('placeholder', after);
        before.close?.();
        after.close?.();
        return {};
      }
      case 'evaluate': {
        if (!renderer) throw new Error('eversion: evaluate before init');
        const value = renderer.debugEvaluate(command.es);
        return { value, transfer: [value.buffer as ArrayBuffer] };
      }
      case 'counters':
        if (!renderer) throw new Error('eversion: counters before init');
        return { value: renderer.counters() };
      case 'inject-hard-cut':
        // The re-plan lives in the timeline (T10/T35); there is nothing for the core to skip.
        return {};
      case 'loop':
        return {
          value: {
            running,
            hidden,
            pending: handle !== null ? 1 : 0,
            requests,
            frames: framesDrawn,
          },
        };
      case 'scrub': {
        if (running) throw new Error('eversion: scrub during a run');
        if (!renderer || !timelineConfig) throw new Error('eversion: scrub before prime');
        const tl = deps.createTimeline(timelineConfig);
        tl.start(0);
        let ready = command.afterAt === null;
        let snapshot: Readonly<TimelineSnapshot>;
        for (let t = SCRUB_STEP_MS; ; t += SCRUB_STEP_MS) {
          const at = Math.min(t, command.t);
          if (!ready && command.afterAt !== null && at >= command.afterAt) {
            tl.afterReady(at);
            ready = true;
          }
          snapshot = tl.tick(at);
          if (at >= command.t) break;
        }
        tl.events();
        const stage = snapshot.stage;
        const t = snapshot.t;
        if (pausedE !== null) {
          copySnapshot(snapshot, scratch).evert = pausedE;
          renderer.draw(scratch);
        } else {
          renderer.draw(snapshot);
        }
        return { value: { stage, t } };
      }
    }
  }

  function runDebug(id: number, command: DebugCommand) {
    debug(command).then(
      ({ value, transfer }) => emit({ type: 'debug-result', id, ok: true, value }, transfer),
      (error: unknown) =>
        emit({
          type: 'debug-result',
          id,
          ok: false,
          value: error instanceof Error ? error.message : String(error),
        }),
    );
  }

  /* ── Public ───────────────────────────────────────────────────────────── */

  return {
    handle(message: ToWorker) {
      if (disposed || (lost && message.type !== 'init')) {
        if (message.type === 'texture') message.bitmap.close?.();
        return;
      }
      try {
        switch (message.type) {
          case 'init':
            init(message);
            break;
          case 'prime':
            prime(message);
            break;
          case 'texture':
            texture(message.slot, message.bitmap);
            break;
          case 'start':
            start(message.t0);
            break;
          case 'fast-forward':
            whenRunning((tl, now) => tl.fastForward(now));
            break;
          case 'after-failed':
            afterFailed = true;
            whenRunning((tl, now) => tl.afterFailed(now));
            break;
          case 'resize':
            renderer?.resize(message.viewport);
            if (timelineConfig) timelineConfig = { ...timelineConfig, viewport: message.viewport };
            whenRunning((tl, now) => tl.resize(now, message.viewport));
            break;
          case 'reveal':
            whenRunning((tl, now) => tl.reveal(now));
            break;
          case 'abort':
            whenRunning((tl, now) => tl.abort(now));
            break;
          case 'visibility':
            setHidden(message.hidden);
            break;
          case 'debug':
            runDebug(message.id, message.command);
            break;
        }
      } catch (error) {
        fail(error);
      }
    },

    dispose() {
      if (disposed) return;
      stopLoop();
      renderer?.dispose();
      renderer = null;
      timeline = null;
      disposed = true;
    },
  };
}
