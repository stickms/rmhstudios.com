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
 *   for each new timeline event (and `uncover`); feed the governor
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

import { UNCOVER_LEAD_MS } from '../constants';
import { SPIN_AXIS } from '../domain';
import { afterDomainTransform, alignAngle, fitEndIsometry } from '../orientation';
import { bakeLut } from '../projection-lut';
import { getProjection } from '../projections';
import { copySnapshot, createSnapshot } from '../snapshot';
import { Timeline } from '../timeline';
import type {
  ChannelId,
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
  /** Whether this context can create a WebGL2 context on an `OffscreenCanvas`. Absent: assume it can. */
  probeWebgl2?(): boolean;
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
    probeWebgl2() {
      if (typeof OffscreenCanvas === 'undefined') return false;
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
      if (!gl) return false;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    },
    solidBitmap(colour) {
      const bytes = new Uint8ClampedArray(4);
      for (let i = 0; i < 4; i++) bytes[i] = Math.round(Math.max(0, Math.min(1, colour[i]!)) * 255);
      return createImageBitmap(new ImageData(bytes, 1, 1));
    },
  };
}

/**
 * The size of the step `inject-hard-cut` applies to a channel's drawn value: large
 * enough to be an unmistakable cut, small enough to stay in the channel's range.
 */
function applyHardCut(s: TimelineSnapshot, channel: ChannelId): void {
  switch (channel) {
    case 'radius':
      s.radius *= 0.7;
      break;
    case 'evert':
      s.evert = Math.min(1, s.evert + 0.3);
      break;
    case 'spin':
      s.spin += Math.PI / 2;
      break;
    case 'tilt':
      s.tilt += 0.4;
      break;
    case 'wrap':
      s.wrap = Math.max(0, s.wrap - 0.5);
      break;
    case 'centreX':
      s.centreX += 120;
      break;
    default:
      break;
  }
}

/** Step of the scrub op's simulated clock: half a 60 Hz frame, well under `MAX_DT_MS`. */
const SCRUB_STEP_MS = 8;
/** Bound on {@link settleWhileHidden}'s steps (a hurried run is ~2 s; this is ~16 s of simulated time). */
const SETTLE_MAX_STEPS = 1000;
/**
 * A run whose tab has been hidden this long is run out without drawing, hurried or not: nobody is watching, and
 * on return it would otherwise replay ~5 s of effect for a navigation that finished long ago.
 */
export const HIDDEN_SETTLE_GRACE_MS = 1000;

/**
 * Create the render-side core over `env`.
 *
 * ## Clock
 *
 * The timeline runs on the render side's OWN clock: the frame callback's
 * timestamp. `start.t0` is the MAIN thread's `performance.now()`, and a dedicated
 * worker's time origin is its own creation time, not the page's (spec §3.3 says
 * they share one; they do not). So the core never feeds `t0` to the timeline. The
 * two clocks differ by exactly the difference of their `performance.timeOrigin`s,
 * so the offset is `timeOrigin(core) − start.origin` - NOT `t0 − now()`, which
 * would fold the message's latency into every deadline. It is applied only where
 * a time crosses back to the main thread (`need-after-by`). In-thread the clocks
 * are the same and the offset is zero. A frame timestamp can also
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
  /** The run ended (done/fail) and no `prime` has followed: a late texture has nothing to serve. */
  let runEnded = false;

  let handle: number | null = null;
  let requests = 0;
  let framesDrawn = 0;
  let coverSent = false;
  /** Last frame's timestamp; `null` after a start or a resume (there is no interval to record). */
  let lastFrameAt: number | null = null;
  let clock = 0;
  let clockOffset = 0;

  let afterUploaded = false;
  /** The viewport the current timeline was built for. */
  let timelineViewport: Viewport | null = null;
  let afterFailed = false;
  let pausedE: number | null = null;
  /** An abort or fast-forward reached the running timeline: it is on its way out and must not wait for a frame. */
  let hurried = false;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  /** Debug only (`inject-hard-cut`, T35): the channel whose drawn value is stepped, or `null`. */
  let hardCut: ChannelId | null = null;
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
      if (pausedE !== null || hardCut !== null) {
        const out = copySnapshot(snapshot, scratch);
        if (hardCut !== null) applyHardCut(out, hardCut);
        if (pausedE !== null) out.evert = pausedE;
        renderer.draw(out);
      } else {
        renderer.draw(snapshot);
      }
      framesDrawn++;

      if (flushEvents()) finish();
      else schedule();
    } catch (error) {
      fail(error);
    }
  }

  /** Emit the timeline's pending stage events in order; true once `done` was among them. */
  function flushEvents(): boolean {
    let finished = false;
    for (const event of timeline!.events()) {
      emit({ type: 'stage', stage: event.stage, t: event.t });
      if (event.stage === 'uncover') emit({ type: 'uncover' });
      if (event.stage === 'done') finished = true;
    }
    return finished;
  }

  function clearHiddenTimer() {
    if (hiddenTimer !== null) clearTimeout(hiddenTimer);
    hiddenTimer = null;
  }

  /** Arm the grace timer for a run that is hidden (it began hidden, or the tab just left). */
  function armHiddenSettle() {
    if (!hidden || !running || hiddenTimer !== null) return;
    hiddenTimer = setTimeout(() => {
      hiddenTimer = null;
      if (hidden && running && !disposed) {
        try {
          settleWhileHidden();
        } catch (error) {
          fail(error);
        }
      }
    }, HIDDEN_SETTLE_GRACE_MS);
  }

  /**
   * A hidden page draws no frames, so a run that is hurried (abort, fast-forward) would never reach its end
   * and the navigation would hang until the tab came back. Run the rest of the timeline synchronously instead,
   * on a simulated clock, nothing drawn: events come out in their usual order (uncover, reveal, done)
   * and the run ends through the same `finish` as a drawn one. Nobody is looking, so the reveal is answered
   * here rather than waiting a round trip to the main thread (a later `reveal` message is a no-op).
   */
  function settleWhileHidden() {
    if (!hidden || !running || !timeline) return;
    for (let i = 0; i < SETTLE_MAX_STEPS && timeline; i++) {
      const at = tickClock(clock + SCRUB_STEP_MS);
      timeline.tick(at);
      let uncovered = false;
      for (const event of timeline.events()) {
        emit({ type: 'stage', stage: event.stage, t: event.t });
        if (event.stage === 'uncover') {
          emit({ type: 'uncover' });
          uncovered = true;
        }
        if (event.stage === 'done') {
          finish();
          return;
        }
      }
      if (uncovered) timeline.reveal(at);
    }
  }

  function finish() {
    runEnded = true;
    stopLoop();
    clearHiddenTimer();
    const summary = stats.summary();
    timeline = null;
    pausedE = null;
    hardCut = null;
    renderer?.release();
    emit({ type: 'done', ...summary });
  }

  function fail(error: unknown) {
    stopLoop();
    clearHiddenTimer();
    runEnded = true;
    timeline = null;
    // The page textures are megabytes held until the next prime/init: a failed run is over, let them go.
    try {
      renderer?.release();
    } catch {
      /* the context may be the thing that failed */
    }
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

  function probe() {
    if (mode === 'worker' && env.scheduler.available === false) {
      emit({
        type: 'probe-result',
        ok: false,
        reason: 'eversion: no frame scheduler is available in this worker',
      });
      return;
    }
    let ok: boolean;
    try {
      ok = deps.probeWebgl2?.() ?? true;
    } catch {
      ok = false;
    }
    emit({
      type: 'probe-result',
      ok,
      reason: ok ? undefined : 'eversion: WebGL2 is not available here',
    });
  }

  /* ── Messages ─────────────────────────────────────────────────────────── */

  function init(message: Extract<ToWorker, { type: 'init' }>) {
    stopLoop();
    if (mode === 'worker' && env.scheduler.available === false) {
      // A worker with no frame scheduler would draw nothing: say so now, before `ready`, so the host
      // demotes to the main thread instead of failing on the first frame of every navigation.
      emit({
        type: 'error',
        message: 'eversion: no frame scheduler is available in this worker',
        fatal: true,
      });
      return;
    }
    renderer?.dispose();
    renderer = null;
    timeline = null;
    plan = null;
    lost = false;
    // The visibility of the previous page life says nothing about this one; the host re-sends the current one.
    hidden = false;
    runEnded = false;
    running = false;
    dprCap = message.dprCap;
    renderer = deps.createRenderer(message.canvas, {
      tier: message.tier,
      dprCap: message.dprCap,
      onContextLost: contextLost,
      precompileCosmos: message.precompileCosmos === true,
    });
    emit({ type: 'ready', tier: message.tier, host: mode });
  }

  function prime(message: Extract<ToWorker, { type: 'prime' }>) {
    if (!renderer) throw new Error('eversion: prime before init');
    stopLoop();
    const { lut, projection, viewport, globe, colours } = message;
    plan = { projection, viewport, globe, colours };
    const { thetaAlign, mAfter } = deps.orientation();
    renderer.prime({ ...plan, lut: lut ?? deps.bakeLut(projection, viewport), mAfter });
    timelineViewport = viewport;
    timelineConfig = { viewport, globe, thetaAlign };
    timeline = deps.createTimeline(timelineConfig);
    afterUploaded = false;
    afterFailed = false;
    runEnded = false;
    hurried = false;
    clearHiddenTimer();
    coverSent = false;
    framesDrawn = 0;
    stats.reset();
  }

  function texture(slot: TextureSlot, bitmap: ImageBitmap) {
    try {
      if (!renderer) throw new Error('eversion: texture before init');
      // The run is over (done, abort, fatal): nothing will ever draw this, and a resident texture is
      // megabytes held until the next prime. Close it unseen.
      if (runEnded && !timeline) return;
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

  function start(t0: number, origin: number | undefined) {
    if (!renderer || !timeline || !plan) throw new Error('eversion: start before prime');
    if (running) return;
    const now = env.now();
    if (mode !== 'worker') clockOffset = 0;
    else if (origin !== undefined)
      clockOffset = (env.timeOrigin?.() ?? performance.timeOrigin) - origin;
    else clockOffset = t0 - now;
    // A resize between prime and start only reached the plan: the timeline was built for the old viewport.
    if (timelineConfig && viewportChanged(timelineConfig.viewport, timelineViewport)) {
      timeline = deps.createTimeline(timelineConfig);
      timelineViewport = timelineConfig.viewport;
    }
    clock = now;
    lastFrameAt = null;
    coverSent = false;
    framesDrawn = 0;
    stats.reset();
    governor = new DprGovernor(Math.min(plan.viewport.dpr, dprCap));
    running = true;
    hurried = false;
    timeline!.start(now);
    if (afterUploaded) timeline.afterReady(now);
    if (afterFailed) timeline.afterFailed(now);
    const deadline = timeline.afterDeadline(now);
    if (Number.isFinite(deadline)) {
      emit({ type: 'need-after-by', deadline: deadline + clockOffset });
    }
    schedule();
    armHiddenSettle();
  }

  function viewportChanged(a: Viewport, b: Viewport | null): boolean {
    return !b || a.w !== b.w || a.h !== b.h || a.dpr !== b.dpr;
  }

  function whenRunning(act: (tl: TimelineApi, now: number) => void) {
    if (running && timeline) act(timeline, tickClock(env.now()));
  }

  function setHidden(next: boolean) {
    if (hidden === next) return;
    hidden = next;
    if (hidden) {
      cancelFrame();
      // Hurried already (an abort or fast-forward is in flight): no frame will come to finish it, finish it now.
      if (hurried) settleWhileHidden();
      else armHiddenSettle();
    } else {
      clearHiddenTimer();
      if (running) {
        // The gap is not a frame time: skip the interval; the timeline's dt clamp absorbs it.
        lastFrameAt = null;
        schedule();
      }
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
        // T35's deliberate defect: from the next frame on, the drawn value of one channel
        // is stepped by a fixed amount with no easing, which is exactly what a re-plan that
        // forgot to carry the channel's state would look like. It touches only the snapshot
        // handed to the renderer, never the timeline, and `null` removes it.
        hardCut = command.channel;
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
        let forwarded = command.ffAt == null;
        let failed = command.failAt == null;
        let uncoveredAt = -1;
        let answered = false;
        let snapshot: Readonly<TimelineSnapshot>;
        for (let t = SCRUB_STEP_MS; ; t += SCRUB_STEP_MS) {
          const at = Math.min(t, command.t);
          if (!ready && command.afterAt !== null && at >= command.afterAt) {
            tl.afterReady(at);
            ready = true;
          }
          if (!forwarded && command.ffAt != null && at >= command.ffAt) {
            tl.fastForward(at);
            forwarded = true;
          }
          if (!failed && command.failAt != null && at >= command.failAt) {
            tl.afterFailed(at);
            failed = true;
          }
          snapshot = tl.tick(at);
          // The live path answers `uncover` with `reveal` one round trip later (`UNCOVER_LEAD_MS`: cover off,
          // two frames, a post); so does the replay, or scrubbing to the reveal/DONE would stall at the
          // uncover state forever, and the dissolve would start at a different moment than a real run's.
          for (const event of tl.events()) if (event.stage === 'uncover') uncoveredAt = event.t;
          if (uncoveredAt >= 0 && !answered && at >= uncoveredAt + UNCOVER_LEAD_MS) {
            answered = true;
            tl.reveal(at);
            snapshot = tl.tick(at);
            tl.events();
          }
          if (at >= command.t) break;
        }
        const stage = snapshot.stage;
        const t = snapshot.t;
        if (pausedE !== null || hardCut !== null) {
          // The same debug-only overrides the live loop applies (inject-hard-cut, pause-at),
          // so the smoothness self-proof can step one channel in a scrubbed still.
          const out = copySnapshot(snapshot, scratch);
          if (hardCut !== null) applyHardCut(out, hardCut);
          if (pausedE !== null) out.evert = pausedE;
          renderer.draw(out);
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
            start(message.t0, message.origin);
            break;
          case 'fast-forward':
            whenRunning((tl, now) => tl.fastForward(now));
            if (running) hurried = true;
            settleWhileHidden();
            break;
          case 'after-failed':
            afterFailed = true;
            whenRunning((tl, now) => tl.afterFailed(now));
            break;
          case 'resize':
            renderer?.resize(message.viewport);
            // The plan's viewport feeds the DPR governor of the NEXT start; keep it current.
            if (plan) plan = { ...plan, viewport: message.viewport };
            if (timelineConfig) timelineConfig = { ...timelineConfig, viewport: message.viewport };
            whenRunning((tl, now) => tl.resize(now, message.viewport));
            break;
          case 'reveal':
            whenRunning((tl, now) => tl.reveal(now));
            break;
          case 'abort':
            whenRunning((tl, now) => tl.abort(now));
            if (running) hurried = true;
            settleWhileHidden();
            break;
          case 'probe':
            probe();
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
      clearHiddenTimer();
      renderer?.dispose();
      renderer = null;
      timeline = null;
      disposed = true;
    },
  };
}
