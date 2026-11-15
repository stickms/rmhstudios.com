/**
 * The v86 wrapper. Client only: v86 is loaded with a dynamic import() so it
 * is never in the server render and ships only in the /rmhos chunk.
 *
 * Wiring decisions (measured against the dev image):
 *  - The machine is `vmOptions()`, the same definition the snapshot was taken
 *    with. The network device is always declared, with or without a relay.
 *  - The snapshot is `initial_state: { url: state.zst }` (v86 decompresses a
 *    .zst itself). If it cannot be fetched or restored, one cold boot follows.
 *  - Nothing is sent to the guest before `emulator-ready`: serial input sent
 *    while the state is still loading is lost.
 */
import type { V86 as V86Class, V86 as V86Instance, V86Options } from 'v86';
// The one servable copy of the emulator core: Vite emits it as a hashed, same-origin asset.
// Here and not in image-manifest.ts, which stays a pure module the strict island checks.
import wasmUrl from 'v86/build/v86.wasm?url';
import { reportClientError } from '@/lib/client-errors';
import { BootWatchdog, browserClock, STALL_MS, type WatchdogClock } from './boot-watchdog';
import { RMHOS } from './constants';
import { probeImage, type ProbeResult } from './image-probe';
import type { ImageManifest } from './image-manifest';
import { MODIFIER_BREAK_CODES } from './scancodes';
import { vmOptions } from './vm-options';
import type { BootFailureReason, VmHandle, VmPhase, VmPhaseDetail } from './vm-types';

export type { BootFailureReason, VmHandle, VmPhase, VmPhaseDetail } from './vm-types';

export type NetConfig = { url: string; ticket: string } | null;

/** A ticket is minted for 60 s of first use; past this age it is fetched again before it is baked in. */
export const TICKET_REFRESH_MS = 45_000;

export interface CreateVmOptions {
  screen: HTMLDivElement;
  manifest: ImageManifest;
  /**
   * The relay and ticket. A function is called as late as possible (after the emulator module
   * has loaded, just before the machine is built, and again before a cold-boot rebuild if the
   * ticket is older than TICKET_REFRESH_MS), because v86 bakes the URLs in when it starts.
   */
  net: NetConfig | (() => Promise<NetConfig>);
  /** Aborting while the emulator is still loading rejects with an AbortError and starts nothing. */
  signal?: AbortSignal;
  /** Test seam: how the emulator module is loaded. Defaults to the memoised v86 import. */
  loader?: () => Promise<{ V86: typeof V86Class }>;
  /** Test seam: the clock the boot watchdog runs on. */
  clock?: WatchdogClock;
  /** Test seam: how the image files are probed before the machine is built. */
  fetch?: typeof fetch;
  /** Test seam: where a failed or degraded boot is reported (default: the site's client error log). */
  report?: (error: Error) => void;
  /** Each preflight request is given up on after this long. */
  probeTimeoutMs?: number;
}

/** createVm could not produce a machine. `reason` is what the page tells the person. */
export class BootFailure extends Error {
  constructor(
    readonly reason: BootFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'BootFailure';
  }
}

/** The directory the BIOS, kernel and disk are served from (they share one). */
function baseUrlOf(manifest: ImageManifest): string {
  return manifest.rootfs.url.slice(0, manifest.rootfs.url.lastIndexOf('/') + 1);
}

/**
 * Relay and resolver for the page. v86's Wisp backend takes the resolver as a bare
 * `host[:port]` and builds `https://${doh_server}/dns-query` by string concatenation, with no
 * way to set a path or a query. A ticket cannot ride on that, so the value closes the host
 * early: `host/rmhos-net/dns-query?ticket=T#` makes the request URL
 * `https://host/rmhos-net/dns-query?ticket=T` (the trailing `#` swallows the appended path).
 * Without a relay (networking off) both are empty and v86 opens nothing.
 */
export function relayConfig(net: NetConfig) {
  if (!net) {
    // An empty relay URL makes v86 build no network adapter at all: the card exists, nothing is
    // dialled, no WebSocket is opened.
    return { relayUrl: '', dohServer: '' };
  }
  const u = new URL(net.url);
  const secure = u.protocol === 'wss:' || u.protocol === 'https:';
  u.protocol = secure ? 'https:' : 'http:';
  u.searchParams.set('ticket', net.ticket);
  const relayUrl = u.toString().replace(/^https?:/, secure ? 'wisps:' : 'wisp:');
  return {
    relayUrl,
    dohServer: `${u.host}${RMHOS.netPath}dns-query?ticket=${encodeURIComponent(net.ticket)}#`,
  };
}

/**
 * v86 picks its scheduler when the module loads: `typeof process !== 'undefined'` selects the Node
 * path (`global.setImmediate`), which does not exist in a browser. Some bundles define a `process`
 * stub, so it is hidden while the import runs and put back right after. The import is memoised:
 * two overlapping calls (StrictMode's double mount, a fast retry) must not each hide and restore
 * it, or the second would "restore" the first one's hidden value and leave `process` gone for
 * good. A failed import clears the memo so a retry can try again.
 */
export function createV86Loader<T>(importer: () => Promise<T>): () => Promise<T> {
  let memo: Promise<T> | null = null;
  return () => {
    if (memo) return memo;
    const g = globalThis as { process?: unknown };
    const had = 'process' in g;
    const saved = g.process;
    if (had) g.process = undefined;
    const restore = () => {
      if (had) g.process = saved;
    };
    let p: Promise<T>;
    try {
      p = importer();
    } catch (e) {
      restore();
      throw e;
    }
    const mine = p.finally(restore);
    memo = mine;
    mine.catch(() => {
      if (memo === mine) memo = null;
    });
    return mine;
  };
}

/**
 * v86's StateLoadError messages (src/state.js: read_state_header and read_info_block), plus a
 * zstd failure from its decompressor. Nothing broader: "state" alone matches half of React.
 */
export function isStateLoadFailure(text: string): boolean {
  return /Invalid length: |Invalid header: |Version mismatch: dump=|Length doesn't match header: |Invalid info block length: |zstd/i.test(
    text,
  );
}

const loadV86 = createV86Loader(() => import('v86'));

export async function createVm(opts: CreateVmOptions): Promise<VmHandle> {
  const { screen, manifest, net, signal } = opts;
  const report =
    opts.report ?? ((e: Error) => reportClientError(e, { source: 'rmhos-boot' }));
  const phaseListeners = new Set<(p: VmPhase, d?: VmPhaseDetail) => void>();
  const serialListeners = new Set<(c: string) => void>();
  let phase: VmPhase = 'idle';
  let destroyed = false;
  let emulator: V86Instance | null = null;
  let ready = false;
  let usedState = false;
  let serial1Seen = '';
  let dropRejectionListener: (() => void) | null = null;
  /** The running emulator's own fall-back-to-cold-boot step (only a snapshot boot has one). */
  let fallBackNow: ((why: string) => void) | null = null;
  /** The snapshot is the file v86 reported last, and it is not complete. */
  let stateDownloading = false;
  /** Set once the emulator is built; until then a stall rejects createVm instead. */
  let built = false;
  let rejectEarly: ((e: BootFailure) => void) | null = null;
  const early = new Promise<never>((_, rej) => (rejectEarly = rej));
  early.catch(() => {});

  const setPhase = (p: VmPhase, d?: VmPhaseDetail) => {
    if (destroyed && p !== 'stopped') return;
    phase = p;
    for (const cb of phaseListeners) cb(p, d);
  };

  /** Ends the boot for good: one line for the operator, one state for the person. */
  const failBoot = (reason: BootFailureReason, error: string) => {
    watchdog.stop();
    report(new Error(`rmhOS boot failed (${reason}): ${error}`));
    if (!built) rejectEarly?.(new BootFailure(reason, error));
    else setPhase('failed', { error, reason });
  };

  const watchdog = new BootWatchdog(opts.clock ?? browserClock, (reason, stage) => {
    if (destroyed || signal?.aborted) return;
    const why =
      reason === 'stalled'
        ? `no download progress for ${STALL_MS / 1000} s`
        : `the machine did not report ready (${usedState ? 'snapshot' : 'cold boot'})`;
    // A snapshot that stalls mid-download or never restores costs one cold boot, not the whole
    // session. A stall on any other file (v86 loads the snapshot before the kernel) would only
    // stall again on a cold boot, so it ends the boot.
    if (usedState && fallBackNow && (reason === 'boot-timeout' || stateDownloading))
      return fallBackNow(`snapshot: ${why}`);
    failBoot(reason, `${why} while ${stage}`);
  });
  signal?.addEventListener('abort', () => watchdog.stop(), { once: true });
  /** Awaits a startup step, restarting the stall timer around it, and ending early on a stall. */
  const step = async <T>(p: Promise<T>): Promise<T> => {
    watchdog.downloading();
    try {
      return await Promise.race([p, early]);
    } finally {
      if (!built) watchdog.downloading();
    }
  };
  watchdog.downloading();

  // The files are probed while the emulator module loads: both wait on the network.
  const fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const probing: Promise<ProbeResult> = probeImage(manifest, {
    fetch: fetchFn,
    signal,
    timeoutMs: opts.probeTimeoutMs ?? 15_000,
  });
  probing.catch(() => {});

  const { V86 } = await step((opts.loader ?? loadV86)());
  // The page may have left while the emulator module loaded: build nothing (640 MB a machine).
  if (signal?.aborted) throw new DOMException('rmhOS machine creation aborted', 'AbortError');
  const base = baseUrlOf(manifest);
  let mintedAt = Date.now();
  const configure = async () => {
    const n = typeof net === 'function' ? await net() : net;
    mintedAt = Date.now();
    return relayConfig(n);
  };
  let { relayUrl, dohServer } = await step(configure());
  if (signal?.aborted) throw new DOMException('rmhOS machine creation aborted', 'AbortError');
  const probe = await step(probing);
  if (signal?.aborted) throw new DOMException('rmhOS machine creation aborted', 'AbortError');
  if (probe.failure) {
    failBoot(probe.failure.reason, probe.failure.detail);
    // failBoot rejected `early`; this line is only reached if it did not.
    throw new BootFailure(probe.failure.reason, probe.failure.detail);
  }
  // No usable snapshot (404, 416, unreachable): the machine boots cold, once, without it.
  const stateUsable = probe.stateUsable;
  if (manifest.state && !stateUsable && probe.stateProblem)
    report(new Error(`rmhOS booting cold, snapshot unusable: ${probe.stateProblem}`));

  let captureOn = screen.ownerDocument.activeElement === screen;
  const setCapture = (e: V86Instance, on: boolean) =>
    (e as unknown as { keyboard_set_status?: (v: boolean) => void }).keyboard_set_status?.(on);

  const build = (withState: boolean): V86Instance => {
    dropRejectionListener?.();
    usedState = withState && !!manifest.state;
    ready = false;
    serial1Seen = '';
    stateDownloading = false;
    watchdog.downloading();
    const options = {
      ...vmOptions({ baseUrl: base, relayUrl, rootfsSize: manifest.rootfs.size }),
      // The one wasm file the page serves. v86 derives its "fallback" build (for browsers
      // without a wasm feature) by replacing `v86.wasm` in this path; the hashed asset name
      // makes that a no-op, so such a browser refetches this same file and then the boot
      // watchdog ends it as `stalled`. Nothing is served for the fallback build.
      wasm_path: wasmUrl,
      screen_container: screen,
      // Scale 0: v86's screen adapter then never writes an inline width/height on the canvas
      // (it only does so for a non-zero combined scale), so the stylesheet alone fits it to the box.
      screen: { scale: 0 },
      autostart: true,
      disable_speaker: true,
      net_device: {
        ...vmOptions({ baseUrl: base, relayUrl }).net_device,
        relay_url: relayUrl,
        dns_method: 'doh',
        doh_server: dohServer,
      },
      ...(usedState && manifest.state ? { initial_state: { url: manifest.state.url } } : {}),
    } as unknown as V86Options;
    let e: V86Instance;
    try {
      e = new V86(options);
    } catch (err) {
      fallBackNow = null;
      const why = `the emulator could not start: ${(err as Error)?.message ?? String(err)}`;
      failBoot('start', why);
      throw new BootFailure('start', why);
    }
    // Keys reach the guest only while the screen has focus (see VmHandle.setKeyboardCapture).
    // v86 builds its keyboard adapter during its async init, after the constructor returns, so
    // this is applied again when the emulator reports it is loaded and ready.
    setCapture(e, captureOn);
    e.add_listener('emulator-loaded', () => setCapture(e, captureOn));
    e.add_listener('emulator-ready', () => setCapture(e, captureOn));
    wire(e);
    return e;
  };

  const wire = (e: V86Instance) => {
    let finished = false;
    const fallBack = (why: string) => {
      if (finished || destroyed) return;
      finished = true;
      if (usedState) {
        report(new Error(`rmhOS falling back to a cold boot: ${why}`));
        void e.destroy().catch(() => {});
        emulator = null;
        fallBackNow = null;
        setPhase('downloading');
        void (async () => {
          // The state download may have been slow: a ticket nearly out of its first-use window is replaced.
          if (typeof net === 'function' && Date.now() - mintedAt > TICKET_REFRESH_MS) {
            try {
              ({ relayUrl, dohServer } = await configure());
            } catch {
              // keep the old one: a cold boot without a working network beats none
            }
          }
          if (destroyed) return;
          try {
            emulator = build(false);
          } catch {
            // build() already ended the boot as `failed`
          }
        })();
      } else {
        failBoot('start', why);
      }
    };
    fallBackNow = usedState ? fallBack : null;
    // One bar for the BIOS, kernel and snapshot together: v86 reports each file on its own scale.
    const loadedBy = new Map<string, number>();
    const expected = [
      manifest.seabios,
      manifest.vgabios,
      manifest.bzImage,
      ...(usedState && manifest.state ? [manifest.state] : []),
    ];
    const total = expected.reduce((n, f) => n + f.size, 0);
    e.add_listener('download-progress', (ev) => {
      if (finished || destroyed) return;
      watchdog.progress();
      stateDownloading =
        ev.file_name === manifest.state?.url && ev.loaded < (manifest.state?.size ?? 0);
      // The emulator's own wasm is reported here too; it is not part of the bar's total.
      const file = expected.find((f) => f.url === ev.file_name);
      if (!file) return;
      loadedBy.set(ev.file_name, Math.min(ev.loaded, file.size));
      let loaded = 0;
      for (const v of loadedBy.values()) loaded += v;
      setPhase('downloading', { loaded, total });
    });
    e.add_listener('download-error', (ev) => {
      // The disk is ranged and the BIOS/kernel are required: only a missing state is recoverable.
      if (usedState && ev.file_name === manifest.state?.url)
        fallBack(`could not download ${ev.file_name}`);
      else if (!finished) {
        finished = true;
        const status = (ev as { request?: { status?: number } }).request?.status;
        failBoot(
          status === 404 || status === 410 || status === 416 ? 'image-missing' : 'image-invalid',
          `could not download ${ev.file_name}${status ? ` (status ${status})` : ''}`,
        );
      }
    });
    e.add_listener('emulator-loaded', () => {
      // v86 sends emulator-ready before emulator-loaded: do not step back from running.
      if (!finished && !destroyed && phase !== 'running') {
        setPhase('booting');
        watchdog.booting(usedState ? 'snapshot' : 'cold');
      }
    });
    e.add_listener('emulator-ready', () => {
      if (destroyed) return;
      ready = true;
      // A restored machine is past READY already; a cold one is running once the agent says so.
      if (usedState) {
        watchdog.stop();
        setPhase('running');
      }
    });
    e.add_listener('emulator-stopped', () => {
      if (!destroyed && phase === 'running') setPhase('stopped');
    });
    if (import.meta.env.DEV) {
      // Development only: the guest logs to serial0; a browser test reads it from here.
      const w = window as unknown as { __rmhosSerial0?: string };
      w.__rmhosSerial0 = '';
      e.add_listener('serial0-output-byte', (b: number) => {
        w.__rmhosSerial0 = ((w.__rmhosSerial0 ?? '') + String.fromCharCode(b)).slice(-20000);
      });
    }
    e.add_listener('serial1-output-byte', (b: number) => {
      const chunk = String.fromCharCode(b);
      serial1Seen = (serial1Seen + chunk).slice(-4096);
      if (!usedState && phase !== 'running' && serial1Seen.includes('RMHOS READY')) {
        watchdog.stop();
        setPhase('running');
      }
      for (const cb of serialListeners) cb(chunk);
    });
    // A state that downloads but will not restore surfaces as an unhandled rejection out of v86's
    // loader. Only that is acted on: while the state is loading, a rejection that is v86's own
    // StateLoadError (its exact messages) or a zstd failure. Any other rejection on the page
    // (React or query code that merely mentions "state", an unrelated fetch) is left alone
    // rather than costing a cold boot.
    const onError = (ev: PromiseRejectionEvent) => {
      if (!usedState || ready || finished) return;
      const r = ev.reason as { message?: unknown; stack?: unknown } | string | undefined;
      const text =
        typeof r === 'string' ? r : `${String(r?.message ?? '')} ${String(r?.stack ?? '')}`;
      if (!isStateLoadFailure(text)) return;
      ev.preventDefault();
      drop();
      fallBack('state could not be restored');
    };
    const drop = () => {
      window.removeEventListener('unhandledrejection', onError);
      if (dropRejectionListener === drop) dropRejectionListener = null;
    };
    dropRejectionListener = drop;
    window.addEventListener('unhandledrejection', onError);
    e.add_listener('emulator-ready', drop);
  };

  setPhase('downloading');
  built = true;
  emulator = build(stateUsable);

  const need = (): V86Instance => {
    if (!emulator) throw new Error('rmhOS machine is not started');
    return emulator;
  };

  return {
    onPhase(cb) {
      phaseListeners.add(cb);
      cb(phase);
      return () => phaseListeners.delete(cb);
    },
    onSerial1(cb) {
      serialListeners.add(cb);
      return () => serialListeners.delete(cb);
    },
    bootKind: () => (usedState ? 'snapshot' : 'cold'),
    setKeyboardCapture(on) {
      captureOn = on;
      if (emulator) setCapture(emulator, on);
    },
    releaseModifiers() {
      emulator?.keyboard_send_scancodes([...MODIFIER_BREAK_CODES]);
    },
    sendSerial1(text) {
      if (!ready) return;
      need().serial_send_bytes(1, new TextEncoder().encode(text));
    },
    writeShareFile: (path, data) => need().create_file(path, data),
    readShareFile: (path) => need().read_file(path),
    async deleteShareFile(path) {
      const fs = (need() as unknown as { fs9p?: FsLike }).fs9p;
      const hit = fs?.SearchPath(path);
      if (!fs || !hit || hit.id === -1) return;
      fs.Unlink(hit.parentid, hit.name);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      watchdog.stop();
      dropRejectionListener?.();
      void emulator?.destroy().catch(() => {});
      emulator = null;
      phaseListeners.clear();
      serialListeners.clear();
    },
  };
}

interface FsLike {
  SearchPath(path: string): { id: number; parentid: number; name: string };
  Unlink(parentid: number, name: string): number;
}
