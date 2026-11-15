/**
 * The v86 wrapper. Client only: v86 is loaded with a dynamic import() so it
 * is never in the server render and ships only in the /rmhos chunk.
 *
 * Wiring decisions (measured in Task 6, see the report):
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
import { RMHOS } from './constants';
import type { ImageManifest } from './image-manifest';
import { vmOptions } from './vm-options';
import type { VmHandle, VmPhase, VmPhaseDetail } from './vm-types';

export type { VmHandle, VmPhase, VmPhaseDetail } from './vm-types';

export interface CreateVmOptions {
  screen: HTMLDivElement;
  manifest: ImageManifest;
  net: { url: string; ticket: string } | null;
  /** Aborting while the emulator is still loading rejects with an AbortError and starts nothing. */
  signal?: AbortSignal;
  /** Test seam: how the emulator module is loaded. Defaults to the memoised v86 import. */
  loader?: () => Promise<{ V86: typeof V86Class }>;
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
 * Without a relay the sockets point at the hub with no ticket, which it refuses.
 */
export function relayConfig(net: CreateVmOptions['net'], pageHost: string, pageIsHttps: boolean) {
  if (!net) {
    return {
      relayUrl: `${pageIsHttps ? 'wisps' : 'wisp'}://${pageHost}${RMHOS.netPath}`,
      dohServer: `${pageHost}${RMHOS.netPath}dns-query#`,
    };
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
  const phaseListeners = new Set<(p: VmPhase, d?: VmPhaseDetail) => void>();
  const serialListeners = new Set<(c: string) => void>();
  let phase: VmPhase = 'idle';
  let destroyed = false;
  let emulator: V86Instance | null = null;
  let ready = false;
  let usedState = false;
  let serial1Seen = '';
  let dropRejectionListener: (() => void) | null = null;

  const setPhase = (p: VmPhase, d?: VmPhaseDetail) => {
    if (destroyed && p !== 'stopped') return;
    phase = p;
    for (const cb of phaseListeners) cb(p, d);
  };

  const { V86 } = await (opts.loader ?? loadV86)();
  // The page may have left while the emulator module loaded: build nothing (640 MB a machine).
  if (signal?.aborted) throw new DOMException('rmhOS machine creation aborted', 'AbortError');
  const base = baseUrlOf(manifest);
  const { relayUrl, dohServer } = relayConfig(net, location.host, location.protocol === 'https:');

  let captureOn = screen.ownerDocument.activeElement === screen;
  const setCapture = (e: V86Instance, on: boolean) =>
    (e as unknown as { keyboard_set_status?: (v: boolean) => void }).keyboard_set_status?.(on);

  const build = (withState: boolean): V86Instance => {
    dropRejectionListener?.();
    usedState = withState && !!manifest.state;
    ready = false;
    serial1Seen = '';
    const options = {
      ...vmOptions({ baseUrl: base, relayUrl }),
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
    const e = new V86(options);
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
        void e.destroy().catch(() => {});
        emulator = null;
        setPhase('downloading');
        emulator = build(false);
      } else {
        setPhase('failed', { error: why });
      }
    };
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
      loadedBy.set(
        ev.file_name,
        Math.min(ev.loaded, expected.find((f) => f.url === ev.file_name)?.size ?? ev.loaded),
      );
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
        setPhase('failed', { error: `could not download ${ev.file_name}` });
      }
    });
    e.add_listener('emulator-loaded', () => {
      // v86 sends emulator-ready before emulator-loaded: do not step back from running.
      if (!finished && !destroyed && phase !== 'running') setPhase('booting');
    });
    e.add_listener('emulator-ready', () => {
      if (destroyed) return;
      ready = true;
      // A restored machine is past READY already; a cold one is running once the agent says so.
      if (usedState) setPhase('running');
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
      if (!usedState && phase !== 'running' && serial1Seen.includes('RMHOS READY'))
        setPhase('running');
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
  emulator = build(true);

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
      // Break codes: left Ctrl, left Alt, left Shift, right Shift.
      emulator?.keyboard_send_scancodes([0x9d, 0xb8, 0xaa, 0xb6]);
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
    async restart() {
      setPhase('booting');
      serial1Seen = '';
      need().restart();
      // A forced reboot is a cold boot: the agent announces itself again.
      usedState = false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
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
