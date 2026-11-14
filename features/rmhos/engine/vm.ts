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
import type { V86 as V86Instance, V86Options } from 'v86';
import { RMHOS } from './constants';
import type { ImageManifest } from './image-manifest';
import { vmOptions } from './vm-options';

export type VmPhase = 'idle' | 'downloading' | 'booting' | 'running' | 'stopped' | 'failed';

export type VmPhaseDetail = { loaded: number; total: number } | { error: string };

export interface VmHandle {
  onPhase(cb: (p: VmPhase, detail?: VmPhaseDetail) => void): () => void;
  onSerial1(cb: (chunk: string) => void): () => void;
  sendSerial1(text: string): void;
  writeShareFile(path: string, data: Uint8Array): Promise<void>;
  readShareFile(path: string): Promise<Uint8Array>;
  deleteShareFile(path: string): Promise<void>;
  restart(): Promise<void>;
  destroy(): void;
}

export interface CreateVmOptions {
  screen: HTMLDivElement;
  manifest: ImageManifest;
  net: { url: string; ticket: string } | null;
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
 * stub, so it is hidden for the duration of the import and put back after.
 */
async function loadV86() {
  const g = globalThis as { process?: unknown };
  const had = 'process' in g;
  const saved = g.process;
  if (had) g.process = undefined;
  try {
    return await import('v86');
  } finally {
    if (had) g.process = saved;
  }
}

export async function createVm(opts: CreateVmOptions): Promise<VmHandle> {
  const { screen, manifest, net } = opts;
  const phaseListeners = new Set<(p: VmPhase, d?: VmPhaseDetail) => void>();
  const serialListeners = new Set<(c: string) => void>();
  let phase: VmPhase = 'idle';
  let destroyed = false;
  let emulator: V86Instance | null = null;
  let ready = false;
  let usedState = false;
  let serial1Seen = '';

  const setPhase = (p: VmPhase, d?: VmPhaseDetail) => {
    if (destroyed && p !== 'stopped') return;
    phase = p;
    for (const cb of phaseListeners) cb(p, d);
  };

  const { V86 } = await loadV86();
  const base = baseUrlOf(manifest);
  const { relayUrl, dohServer } = relayConfig(net, location.host, location.protocol === 'https:');

  const build = (withState: boolean): V86Instance => {
    usedState = withState && !!manifest.state;
    ready = false;
    serial1Seen = '';
    const options = {
      ...vmOptions({ baseUrl: base, relayUrl }),
      wasm_path: manifest.wasm,
      screen_container: screen,
      autostart: true,
      disable_speaker: true,
      net_device: { type: 'virtio', relay_url: relayUrl, dns_method: 'doh', doh_server: dohServer },
      ...(usedState && manifest.state ? { initial_state: { url: manifest.state.url } } : {}),
    } as unknown as V86Options;
    const e = new V86(options);
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
    const expected = [manifest.seabios, manifest.vgabios, manifest.bzImage, ...(usedState && manifest.state ? [manifest.state] : [])];
    const total = expected.reduce((n, f) => n + f.size, 0);
    e.add_listener('download-progress', (ev) => {
      if (finished || destroyed) return;
      loadedBy.set(ev.file_name, Math.min(ev.loaded, expected.find((f) => f.url === ev.file_name)?.size ?? ev.loaded));
      let loaded = 0;
      for (const v of loadedBy.values()) loaded += v;
      setPhase('downloading', { loaded, total });
    });
    e.add_listener('download-error', (ev) => {
      // The disk is ranged and the BIOS/kernel are required: only a missing state is recoverable.
      if (usedState && ev.file_name === manifest.state?.url) fallBack(`could not download ${ev.file_name}`);
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
      if (!usedState && phase !== 'running' && serial1Seen.includes('RMHOS READY')) setPhase('running');
      for (const cb of serialListeners) cb(chunk);
    });
    // A state that downloads but will not restore surfaces as an error out of the loader.
    const onError = (ev: PromiseRejectionEvent) => {
      if (usedState && !ready && !finished) {
        ev.preventDefault();
        window.removeEventListener('unhandledrejection', onError);
        fallBack('state could not be restored');
      }
    };
    window.addEventListener('unhandledrejection', onError);
    e.add_listener('emulator-ready', () => window.removeEventListener('unhandledrejection', onError));
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

