'use client';

/**
 * One live level: load it, mount an engine and a renderer on the canvas, read
 * every input device, and run **one** `requestAnimationFrame` loop over the lot.
 *
 * ## One loop, and why it matters
 *
 * Every fast-changing thing in this game is driven from the single `frame()`
 * below: the gamepad poll, the input merge, the fixed-timestep simulation, the
 * draw, and the HUD's direct DOM writes. A second rAF anywhere — a HUD that
 * animates itself, a touch layer that repaints its own stick — would double the
 * per-frame overhead and, worse, would read state from a different point in the
 * step than the canvas drew, so an arrow and the character it points at would
 * disagree by a frame. There is exactly one loop and it lives here.
 *
 * ## What is deliberately NOT here
 *
 * Canvas sizing. `BumsRushRenderer.resize()` owns the drawing buffer and is the
 * only thing that assigns `canvas.width` (design-language.md §12.1 rule 4);
 * this file calls it from a `ResizeObserver` and on orientation change, and
 * never from inside the loop.
 *
 * ## The three device paths are one path
 *
 * Keyboard, mouse, gamepad and touch all reduce to a `DeviceSnapshot` and go
 * through `produceInputFrame`, which is the input layer's merge rule. None of
 * them is special-cased here — a seat is bound to a device KIND, and the kind
 * decides which snapshot fields are populated. That is what makes "playable
 * with any one of the three" a property of the data rather than of three
 * parallel branches that drift.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { ASSIST, BR_C2S, BR_S2C, NET, PHYSICS } from '@/lib/bums-rush/constants';
import {
  computeEdgeIndicators,
  createAccumulator,
  createCamera,
  createSimulation,
  type Camera,
  type CameraSeat,
  type EdgeIndicator,
} from '@/lib/bums-rush/engine';
import { loadLevel, loadShowdownArena } from '@/lib/bums-rush/levels';
import { createRenderer, type BumsRushRenderer } from '@/lib/bums-rush/render';
import {
  DeviceSeatRegistry,
  createKeyboardState,
  createMouseTracker,
  createSeatInputState,
  createTouchArmState,
  defaultBindingSetFor,
  gamepadDeviceIdentity,
  keyboardDeviceIdentity,
  playGamepadRumble,
  pollGamepads,
  produceInputFrame,
  resolvePadBrand,
  resolveTouchFrame,
  touchDeviceIdentity,
  type BindingSet,
  type DeviceProfileKind,
  type KeyboardState,
  type MouseTracker,
  type PadBrand,
  type SeatInputState,
  type TouchArmState,
} from '@/lib/bums-rush/input';
import {
  GuestInterpolator,
  HostLoop,
  InputHistory,
  buildInputPacket,
  emitBumsRush,
  onBumsRush,
  unpackEvent,
  type BrEventMsg,
  type HostTransport,
} from '@/lib/bums-rush/net';
import { handleGameEvent as playGameEventAudio } from '@/lib/bums-rush/audio';
import type {
  Assists,
  Cosmetics,
  GameEvent,
  GameSettings,
  InputFrame,
  Level,
  LevelResult,
  RenderSeat,
  RoomMode,
  SeatIndex,
  SeatView,
  Simulation,
} from '@/lib/bums-rush/types';
import { createGuestRenderAdapter, type GuestRenderAdapter } from './guestRenderState';
import { bindingKeyFor, useBumsRushStore } from './store';
import type { HudLiveFrame, LiveHandle } from './hud/types';

// ─── Public shape ───────────────────────────────────────────────────────────

export type SessionStatus = 'loading' | 'running' | 'error';

/** A pad that pressed a button while owning no seat (§4.6). */
export interface PendingJoin {
  padIndex: number;
  padId: string;
  brand: PadBrand;
}

export interface SessionNet {
  amHost: boolean;
  roomCode: string;
  hostClientId: string;
  mySeats: readonly SeatIndex[];
  seatViews: readonly SeatView[];
  startedAt: number;
  reportResult: (envelope: unknown) => void;
}

export interface LevelSessionOptions {
  levelId: string;
  mode: RoomMode;
  settings: GameSettings;
  bindings: Record<string, BindingSet>;
  cosmetics: Cosmetics;
  reducedMotion: boolean;
  /** True where the only pointer is a finger — decides the starting seat's device. */
  touchPrimary: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hudRef: RefObject<LiveHandle | null>;
  edgeRef: RefObject<LiveHandle | null>;
  touchStateRef: MutableRefObject<TouchArmState>;
  touchButtonsRef: MutableRefObject<Set<string>>;
  translate: (key: string) => string;
  onFinish: (result: LevelResult) => void;
  net: SessionNet | null;
}

export interface LevelSessionApi {
  status: SessionStatus;
  level: Level | null;
  error: string | null;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  /** Objective ids completed this attempt — drives the tray's highlighter swipe. */
  completedObjectives: readonly string[];
  deaths: number;
  localSeats: readonly SeatIndex[];
  /** Which device drives each local seat, for the seat bar's glyphs. */
  seatDeviceKinds: Readonly<Partial<Record<SeatIndex, DeviceProfileKind>>>;
  pendingJoin: PendingJoin | null;
  acceptJoin: () => void;
  dismissJoin: () => void;
  objectivesOpen: boolean;
  setObjectivesOpen: (open: boolean) => void;
  retry: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID_RE = /^w[1-8]-\d{2}$/;

function loadAnyLevel(levelId: string): Promise<Level> {
  return CAMPAIGN_ID_RE.test(levelId) ? loadLevel(levelId) : loadShowdownArena(levelId);
}

/**
 * A seat's assists.
 *
 * `settings.assists` is per-PLAYER — that is what the save schema stores —
 * while §4.7 describes auto-grab as a per-DEVICE default. Auto-grab is not
 * really a preference on touch: it is what the chosen scheme MEANS, so it
 * follows `touchScheme` rather than being a second switch that can disagree
 * with it. Everything else is the player's saved choice, unmodified.
 */
function assistsForDevice(settings: GameSettings, kind: DeviceProfileKind): Assists {
  if (kind !== 'touch') return settings.assists;
  return { ...settings.assists, autoGrab: settings.touchScheme === 'auto-grab' };
}

interface SeatDevice {
  seat: SeatIndex;
  kind: DeviceProfileKind;
  /** Index into `navigator.getGamepads()`. */
  padIndex: number | null;
  padId: string | null;
  input: SeatInputState;
}

/**
 * A relayed host event, or null if it did not survive the wire.
 *
 * A malformed event is a missed splat, not a crash: the world keeps running
 * from the snapshots, which are a separate channel.
 */
function safeUnpackEvent(message: BrEventMsg): GameEvent | null {
  try {
    return unpackEvent(message);
  } catch {
    return null;
  }
}

/** The rumble effects from §2.7, in one table so they can be read together. */
const RUMBLE = {
  grip: { durationMs: 15, weak: 0.25, strong: 0.1 },
  death: { durationMs: 120, weak: 0.4, strong: 0.6 },
} as const;

// ─── The hook ───────────────────────────────────────────────────────────────

export function useLevelSession(options: LevelSessionOptions): LevelSessionApi {
  const { levelId, mode, canvasRef, hudRef, edgeRef, touchStateRef, touchButtonsRef, net } = options;

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [level, setLevel] = useState<Level | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [completedObjectives, setCompletedObjectives] = useState<string[]>([]);
  const [deaths, setDeaths] = useState(0);
  const [localSeats, setLocalSeats] = useState<SeatIndex[]>([]);
  const [seatDeviceKinds, setSeatDeviceKinds] = useState<Partial<Record<SeatIndex, DeviceProfileKind>>>({});
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(null);
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Everything the loop reads but does not own. Held in a ref so a volume
  // slider does not tear down a running simulation mid-swing.
  const liveRef = useRef(options);
  liveRef.current = options;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const joinPendingRef = useRef<PendingJoin | null>(pendingJoin);
  joinPendingRef.current = pendingJoin;

  const acceptJoinRef = useRef<(() => void) | null>(null);

  // ── Load the level ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setLevel(null);
    Promise.resolve()
      .then(() => loadAnyLevel(levelId))
      .then((loaded) => {
        if (!cancelled) setLevel(loaded);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [levelId, attempt]);

  // ── Mount the engine, the renderer, the devices and the loop ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!level || !canvas) return undefined;

    const opts = liveRef.current;

    let renderer: BumsRushRenderer;
    try {
      renderer = createRenderer(canvas, level, {
        reducedMotion: opts.reducedMotion,
        translate: opts.translate,
        showTags: opts.settings.alwaysShowTags,
      });
    } catch (cause) {
      // No 2D context — an ancient engine, a blocked canvas, a dead GPU
      // process. A blank screen is the one answer this must never give.
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
      return undefined;
    }

    const isGuest = net !== null && !net.amHost;
    const seatCount = Math.max(1, net?.seatViews.length ?? 1);
    const solo = seatCount <= 1;

    let sim: Simulation | null = null;
    let host: HostLoop | null = null;
    let guest: GuestInterpolator | null = null;
    let guestAdapter: GuestRenderAdapter | null = null;

    const accumulator = createAccumulator();
    const inputHistory = new InputHistory();
    const pendingInput: InputFrame[] = [];

    // Captured for the cleanup: the ref's `.current` may point at a different
    // Set by teardown time (a scheme change swaps it), and clearing the wrong
    // one would leave a phantom button held down for the next level.
    const touchButtons = touchButtonsRef.current;

    const keyboard: KeyboardState = createKeyboardState();
    const mouse: MouseTracker = createMouseTracker();
    const registry = new DeviceSeatRegistry();
    const unsubscribes: (() => void)[] = [];

    // The camera the HUD's edge arrows are computed against. On the host path
    // it mirrors the engine's own camera; on the guest path it mirrors the
    // adapter's. Either way it is one object, reused, never allocated per frame.
    const hudCamera: Camera = createCamera(level, { solo });
    const hudCameraSeats: CameraSeat[] = [];
    const edges: EdgeIndicator[] = [];

    let lastRenderSeats: readonly RenderSeat[] = [];
    const lastCamera = { x: hudCamera.x, y: hudCamera.y, zoom: hudCamera.zoom };
    let canvasRect: DOMRect = canvas.getBoundingClientRect();

    // ── Seats ───────────────────────────────────────────────────────────────
    const seats: SeatDevice[] = [];

    const publishSeats = () => {
      setLocalSeats(seats.map((s) => s.seat));
      const kinds: Partial<Record<SeatIndex, DeviceProfileKind>> = {};
      for (const seat of seats) kinds[seat.seat] = seat.kind;
      setSeatDeviceKinds(kinds);
    };

    const bindingFor = (kind: DeviceProfileKind, padId: string | null): BindingSet => {
      const current = liveRef.current;
      const key = bindingKeyFor(kind, padId);
      return current.bindings[key] ?? current.bindings[kind] ?? defaultBindingSetFor(kind);
    };

    const primaryKind: DeviceProfileKind = opts.touchPrimary ? 'touch' : 'keyboard-p1';
    /**
     * Whether anyone has actually moved yet. Until they have, a pad pressing a
     * button TAKES the first seat rather than raising a join card: a solo
     * player who reaches for their controller should not be told they are
     * "Player 2" and left with an idle keyboard character on screen.
     */
    let primaryUsed = false;

    registry.join(primaryKind === 'touch' ? touchDeviceIdentity() : keyboardDeviceIdentity('keyboard-p1'));

    if (isGuest) {
      guest = new GuestInterpolator();
      guestAdapter = createGuestRenderAdapter(level, solo);
      for (const view of net?.seatViews ?? []) guestAdapter.setCosmetics(view.seat, view.cosmetics);
      for (const seat of net?.mySeats ?? []) {
        seats.push({ seat, kind: primaryKind, padIndex: null, padId: null, input: createSeatInputState() });
      }
    } else {
      sim = createSimulation(level, {
        mode,
        solo,
        reducedMotion: opts.reducedMotion,
        catAfterWipes: opts.settings.catAfterWipes,
        pvp: mode === 'showdown',
      });
      const firstSeat = (net?.mySeats[0] ?? 0) as SeatIndex;
      seats.push({
        seat: firstSeat,
        kind: primaryKind,
        padIndex: null,
        padId: null,
        input: createSeatInputState(),
      });
      sim.addSeat(firstSeat, opts.cosmetics, assistsForDevice(opts.settings, primaryKind));
      for (const view of net?.seatViews ?? []) {
        if (view.seat === firstSeat) continue;
        sim.addSeat(view.seat, view.cosmetics, view.assists);
      }
    }
    publishSeats();

    // ── Events ──────────────────────────────────────────────────────────────
    let pendingObjectives: string[] = [];
    let pendingDeaths = 0;
    let flushScheduled = false;

    const flush = () => {
      flushScheduled = false;
      if (pendingObjectives.length > 0) {
        const batch = pendingObjectives;
        pendingObjectives = [];
        setCompletedObjectives((prev) => {
          const next = new Set(prev);
          for (const id of batch) next.add(id);
          return [...next];
        });
      }
      if (pendingDeaths > 0) {
        const batch = pendingDeaths;
        pendingDeaths = 0;
        setDeaths((prev) => prev + batch);
      }
    };

    const scheduleFlush = () => {
      if (flushScheduled) return;
      flushScheduled = true;
      // A microtask rather than a frame: several events can land in one step,
      // and this coalesces them into one render without adding latency.
      queueMicrotask(flush);
    };

    const rumbleFor = (seat: SeatIndex, effect: (typeof RUMBLE)[keyof typeof RUMBLE]) => {
      const device = seats.find((s) => s.seat === seat);
      if (!device || device.padIndex === null) return;
      playGamepadRumble(pollGamepads()[device.padIndex] ?? null, effect, liveRef.current.settings.rumble);
    };

    const handleEvent = (event: GameEvent) => {
      renderer.emit(event);
      playGameEventAudio(event);

      switch (event.kind) {
        case 'objective':
          pendingObjectives.push(event.objectiveId);
          scheduleFlush();
          break;
        case 'death':
          pendingDeaths += 1;
          scheduleFlush();
          rumbleFor(event.seat, RUMBLE.death);
          break;
        case 'grip':
          if (event.on) rumbleFor(event.seat, RUMBLE.grip);
          break;
        case 'finish':
          liveRef.current.onFinish({
            levelId: level.id,
            playerCount: seatCount,
            durationMs: event.ms,
            deaths: event.deaths,
            objectiveIds: event.objectives,
            assisted: event.assisted,
            catUsed: false,
            seats: seats.map((s) => ({ seat: s.seat, userId: null })),
          });
          break;
        default:
          break;
      }
    };

    // ── Networking ──────────────────────────────────────────────────────────
    if (net && !isGuest && sim) {
      const transport: HostTransport = {
        sendSnapshot: (buffer) => {
          emitBumsRush(BR_C2S.SNAPSHOT, buffer);
        },
        sendEvent: (message) => {
          emitBumsRush(BR_C2S.EVENT, message);
        },
        sendResult: (envelope) => net.reportResult(envelope),
      };
      host = new HostLoop({
        sim,
        transport,
        roomId: net.roomCode,
        hostClientId: net.hostClientId,
      });
      host.start(performance.now());
      const hostLoop = host;
      unsubscribes.push(
        onBumsRush<ArrayBuffer>(BR_S2C.INPUT, (buffer) => {
          // The hub has already rejected any packet claiming a seat its sender
          // does not own (`handlers/bums-rush.ts`, `br:input`), and it forwards
          // only to the host — so by the time a packet reaches this line its
          // seats are authoritative.
          hostLoop.ingestRemoteInput(buffer, [0, 1, 2, 3]);
        }),
      );
    }

    if (isGuest && guest && guestAdapter) {
      const interpolator = guest;
      const adapter = guestAdapter;
      unsubscribes.push(
        onBumsRush<ArrayBuffer>(BR_S2C.SNAPSHOT, (buffer) => {
          try {
            interpolator.push(buffer, performance.now());
          } catch {
            // A malformed snapshot is a dropped frame, not a crash — the
            // interpolator keeps rendering the last good pair.
          }
        }),
        onBumsRush<BrEventMsg>(BR_S2C.EVENT, (message) => {
          const event = safeUnpackEvent(message);
          if (!event) return;
          adapter.applyEvent(event);
          handleEvent(event);
        }),
      );
    }

    // ── Resize ──────────────────────────────────────────────────────────────
    const remeasure = () => {
      renderer.resize();
      canvasRect = canvas.getBoundingClientRect();
    };
    const observer = new ResizeObserver(remeasure);
    observer.observe(canvas);
    // `resize` AND `orientationchange` AND `scroll`: rotation fires the second,
    // iOS Safari's collapsing toolbar changes the canvas's CSS height without
    // resizing its element box, and any page scroll moves the rect the mouse
    // aim is measured against.
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    window.addEventListener('scroll', remeasure, { passive: true });

    const onVisibility = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    // ── Device join (§4.6) ──────────────────────────────────────────────────
    acceptJoinRef.current = () => {
      const request = joinPendingRef.current;
      setPendingJoin(null);
      if (!request || !sim) return;
      const result = registry.join(gamepadDeviceIdentity(request.padId));
      if (!result) return;
      seats.push({
        seat: result.seat,
        kind: 'gamepad',
        padIndex: request.padIndex,
        padId: request.padId,
        input: createSeatInputState(),
      });
      // NEVER pause to add a player (§4.6): the character is sketched in at the
      // checkpoint and the world keeps running underneath.
      sim.addSeat(result.seat, liveRef.current.cosmetics, assistsForDevice(liveRef.current.settings, 'gamepad'));
      publishSeats();
    };

    // ── The loop ────────────────────────────────────────────────────────────
    const hudFrame: HudLiveFrame = {
      elapsedMs: 0,
      seats: [],
      camera: lastCamera,
      edges,
      edgeCount: 0,
      localSeats: [],
    };

    let raf = 0;
    let last = performance.now();
    let inputAccumulatorMs = 0;
    let localFrameCounter = 0;

    /**
     * The right shoulder in viewport coordinates, for mouse aim (§4.3).
     *
     * The stage is exactly the design rect scaled uniformly, so this needs no
     * measurement beyond the canvas box — cached and refreshed only on resize,
     * because `getBoundingClientRect()` in a 60 Hz loop forces layout.
     */
    const shoulderInClientSpace = (seat: SeatIndex): { x: number; y: number } | undefined => {
      const source = lastRenderSeats.find((s) => s.seat === seat);
      if (!source || canvasRect.width === 0) return undefined;
      const zoom = lastCamera.zoom || 1;
      const scale = canvasRect.width / PHYSICS.DESIGN_WIDTH;
      return {
        x: canvasRect.left + canvasRect.width / 2 + (source.head.x - lastCamera.x) * zoom * scale,
        y: canvasRect.top + canvasRect.height / 2 + (source.head.y - lastCamera.y) * zoom * scale,
      };
    };

    const pollForJoins = (pads: readonly (Gamepad | null)[]) => {
      if (joinPendingRef.current) return;
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad) continue;
        if (seats.some((s) => s.padIndex === i)) continue;
        if (!pad.buttons.some((button) => button.pressed)) continue;

        // A pad only becomes visible to the browser when it is pressed, so this
        // is also the moment the rest of the game learns its brand — which is
        // what re-labels every glyph, including the join card about to appear.
        // Read imperatively rather than through the hook: this is inside the
        // loop, and a subscription here would re-render on every room tick.
        useBumsRushStore.getState().notePad(pad.id, resolvePadBrand(pad.id, liveRef.current.settings.padBrand));

        if (!primaryUsed && seats.length > 0) {
          const seat = seats[0];
          seat.kind = 'gamepad';
          seat.padIndex = i;
          seat.padId = pad.id;
          seat.input = createSeatInputState();
          primaryUsed = true;
          sim?.setAssists(seat.seat, assistsForDevice(liveRef.current.settings, 'gamepad'));
          publishSeats();
          return;
        }
        if (seats.length >= NET.MAX_SEATS) return;
        setPendingJoin({
          padIndex: i,
          padId: pad.id,
          brand: resolvePadBrand(pad.id, liveRef.current.settings.padBrand),
        });
        return;
      }
    };

    const stepInputs = (dtSeconds: number, pads: readonly (Gamepad | null)[]) => {
      const current = liveRef.current;
      const touchFrame = resolveTouchFrame(touchStateRef.current, current.settings.touchScheme);

      for (const seat of seats) {
        const base = bindingFor(seat.kind, seat.padId);
        const effective: BindingSet = {
          ...base,
          deadzone: current.settings.deadzone,
          saturation: current.settings.saturation,
        };
        const pad = seat.padIndex === null ? null : (pads[seat.padIndex] ?? null);
        const usesKeyboard = seat.kind === 'keyboard-p1' || seat.kind === 'keyboard-p2';

        const result = produceInputFrame({
          seat: seat.seat,
          frameNumber: sim ? sim.frame : localFrameCounter,
          dtSeconds,
          bindingSet: effective,
          devices: {
            keyboard: usesKeyboard ? { held: keyboard.pressed } : undefined,
            gamepad: pad ? { pad } : undefined,
            mouse: seat.kind === 'keyboard-p1' ? { state: mouse.state } : undefined,
            touch: seat.kind === 'touch' ? touchFrame : undefined,
            touchButtonsPressed: seat.kind === 'touch' ? touchButtonsRef.current : undefined,
          },
          mouseAnchorR: seat.kind === 'keyboard-p1' ? shoulderInClientSpace(seat.seat) : undefined,
          assists: assistsForDevice(current.settings, seat.kind),
          touchScheme: current.settings.touchScheme,
          prevState: seat.input,
        });

        seat.input = result.nextState;

        const magnitude =
          Math.abs(result.frame.aimL.x) +
          Math.abs(result.frame.aimL.y) +
          Math.abs(result.frame.aimR.x) +
          Math.abs(result.frame.aimR.y);
        if (magnitude > 0.05 || result.frame.gripL > 0 || result.frame.gripR > 0) primaryUsed = true;

        if (result.meta.pauseJustPressed) setPaused((value) => !value);
        if (result.meta.objectivesJustPressed) setObjectivesOpen((value) => !value);

        if (host) host.submitLocalInput(result.frame);
        else if (sim) pendingInput.push(result.frame);
        if (isGuest) inputHistory.push(result.frame);
      }
    };

    const publishHud = (elapsedMs: number, renderSeats: readonly RenderSeat[]) => {
      hudCamera.x = lastCamera.x;
      hudCamera.y = lastCamera.y;
      hudCamera.zoom = lastCamera.zoom;

      hudCameraSeats.length = 0;
      for (const seat of renderSeats) {
        hudCameraSeats.push({
          seat: seat.seat,
          active: seat.state !== 'dead',
          x: seat.head.x,
          y: seat.head.y,
          vx: 0,
          vy: 0,
          deadForMs: 0,
        });
      }

      hudFrame.elapsedMs = elapsedMs;
      hudFrame.seats = renderSeats;
      hudFrame.camera = lastCamera;
      hudFrame.localSeats = seats.map((s) => s.seat);
      hudFrame.edgeCount = computeEdgeIndicators(hudCamera, hudCameraSeats, edges);

      hudRef.current?.update(hudFrame);
      edgeRef.current?.update(hudFrame);
    };

    const adoptCamera = (camera: { x: number; y: number; zoom: number }) => {
      lastCamera.x = camera.x;
      lastCamera.y = camera.y;
      lastCamera.zoom = camera.zoom;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const rawDt = Math.min(250, Math.max(0, now - last));
      last = now;
      localFrameCounter++;

      const current = liveRef.current;
      const pads = pollGamepads();
      pollForJoins(pads);

      if (!pausedRef.current) stepInputs(rawDt / 1000, pads);

      // §4.7 slow-mo is local practice only; a shared room never runs at 0.75×.
      const slowMo = !net && current.settings.assists.slowMo ? ASSIST.SLOWMO_SCALE : 1;
      const dt = rawDt * slowMo;

      if (isGuest && guest && guestAdapter) {
        inputAccumulatorMs += rawDt;
        const interval = 1000 / NET.INPUT_HZ;
        if (inputAccumulatorMs >= interval) {
          inputAccumulatorMs -= interval;
          if (inputAccumulatorMs > interval) inputAccumulatorMs = 0;
          emitBumsRush(BR_C2S.INPUT, buildInputPacket(inputHistory));
        }
        const elapsed = net ? Math.max(0, Date.now() - net.startedAt) : 0;
        const state = guestAdapter.update(guest.sample(now), dt, elapsed);
        renderer.frame(state, now);
        lastRenderSeats = state.seats;
        adoptCamera(state.camera);
        publishHud(state.elapsedMs, state.seats);
        return;
      }

      if (!sim) return;

      if (host) {
        host.setPaused(pausedRef.current);
        host.tick(now);
      } else if (!pausedRef.current) {
        const steps = accumulator.advance(dt);
        for (let i = 0; i < steps; i++) {
          sim.step(pendingInput);
          pendingInput.length = 0;
        }
      }

      for (const event of sim.drainEvents()) handleEvent(event);

      // `HostLoop` owns its own accumulator and does not expose the remainder,
      // so the host renders the settled step rather than an interpolated one.
      const state = sim.render(host ? 1 : accumulator.alpha);
      renderer.frame(state, now);
      lastRenderSeats = state.seats;
      adoptCamera(state.camera);
      publishHud(state.elapsedMs, state.seats);
    };

    setStatus('running');
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      window.removeEventListener('scroll', remeasure);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const off of unsubscribes) off();
      acceptJoinRef.current = null;
      host?.stop();
      renderer.dispose();
      sim?.dispose();
      keyboard.dispose();
      mouse.dispose();
      touchStateRef.current = createTouchArmState();
      touchButtons.clear();
    };
    // Rebuilt only when the LEVEL changes or the player retries. Settings,
    // bindings and cosmetics are read through `liveRef` inside the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, attempt]);

  const retry = useCallback(() => {
    setCompletedObjectives([]);
    setDeaths(0);
    setPaused(false);
    setAttempt((n) => n + 1);
  }, []);

  const acceptJoin = useCallback(() => acceptJoinRef.current?.(), []);
  const dismissJoin = useCallback(() => setPendingJoin(null), []);

  return {
    status,
    level,
    error,
    paused,
    setPaused,
    completedObjectives,
    deaths,
    localSeats,
    seatDeviceKinds,
    pendingJoin,
    acceptJoin,
    dismissJoin,
    objectivesOpen,
    setObjectivesOpen,
    retry,
  };
}
