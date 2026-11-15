/**
 * Host side of the guest agent's line protocol (agent-protocol.ts): one command at a time over
 * serial1, each answered by one guest line or an error. Client only; the VM is injected.
 */
import { encodeCommand, GuestLineParser, type GuestEvent } from './agent-protocol';
import type { VmHandle } from './vm-types';

/** `code` is the guest's `ERR <code>`, or `timeout`, `protocol` or `busy` (raised here). */
export class AgentError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? `rmhOS agent: ${code}`);
    this.name = 'AgentError';
  }
}

export const AGENT_TIMEOUTS = {
  ready: 120_000,
  session: 30_000,
  restore: 120_000,
  save: 120_000,
} as const;

export interface AgentOptions {
  /** Milliseconds since the epoch. */
  now?: () => number;
  randomBytes?: (n: number) => Uint8Array;
  /** A fresh nonce per SAVE, matching /^[a-z0-9_-]{1,31}$/i. */
  nonce?: () => string;
}

interface Pending {
  /** true: this event settles the command. false: not ours, keep waiting. */
  accepts(e: GuestEvent): boolean;
  resolve(e: GuestEvent): void;
  reject(err: AgentError): void;
  timer: ReturnType<typeof setTimeout>;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export class AgentClient {
  private readonly parser = new GuestLineParser();
  private readonly off: () => void;
  private readonly poweroff = new Set<() => void>();
  private readyWaiters = new Set<() => void>();
  private readySeen = false;
  private pending: Pending | null = null;
  private readonly now: () => number;
  private readonly randomBytes: (n: number) => Uint8Array;
  private readonly nonce: () => string;

  constructor(
    private readonly vm: Pick<VmHandle, 'onSerial1' | 'sendSerial1'>,
    opts: AgentOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.randomBytes = opts.randomBytes ?? ((n) => crypto.getRandomValues(new Uint8Array(n)));
    this.nonce = opts.nonce ?? (() => `s${hex(this.randomBytes(8))}`);
    this.off = vm.onSerial1((chunk) => {
      for (const e of this.parser.push(chunk)) this.dispatch(e);
    });
  }

  dispose(): void {
    this.off();
    if (this.pending) this.settle().reject(new AgentError('closed'));
    this.poweroff.clear();
    for (const w of this.readyWaiters) w();
    this.readyWaiters.clear();
  }

  private dispatch(e: GuestEvent): void {
    if (e.type === 'ready') {
      this.readySeen = true;
      for (const w of this.readyWaiters) w();
      this.readyWaiters.clear();
      return;
    }
    if (e.type === 'poweroff') {
      for (const cb of [...this.poweroff]) cb();
      return;
    }
    const p = this.pending;
    if (!p) return;
    if (e.type === 'error') this.settle().reject(new AgentError(e.code));
    else if (p.accepts(e)) this.settle().resolve(e);
  }

  private settle(): Pending {
    const p = this.pending!;
    clearTimeout(p.timer);
    this.pending = null;
    return p;
  }

  private command(
    text: string,
    accepts: Pending['accepts'],
    timeoutMs: number,
  ): Promise<GuestEvent> {
    if (this.pending) return Promise.reject(new AgentError('busy'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) this.settle().reject(new AgentError('timeout'));
      }, timeoutMs);
      this.pending = { accepts, resolve, reject, timer };
      this.vm.sendSerial1(text);
    });
  }

  /** Resolves on `RMHOS READY`, also when it arrived before the call. */
  waitReady(timeoutMs: number = AGENT_TIMEOUTS.ready): Promise<void> {
    if (this.readySeen) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.readyWaiters.delete(done);
        if (this.readySeen) resolve();
        else reject(new AgentError('closed'));
      };
      const timer = setTimeout(() => {
        this.readyWaiters.delete(done);
        reject(new AgentError('timeout'));
      }, timeoutMs);
      this.readyWaiters.add(done);
    });
  }

  /** Tells the guest who is signing in. The clock and entropy are generated here, never logged. */
  async startSession(user: string, timeoutMs: number = AGENT_TIMEOUTS.session): Promise<void> {
    const text = encodeCommand({
      type: 'session',
      user,
      epoch: Math.floor(this.now() / 1000),
      entropy: hex(this.randomBytes(64)),
    });
    await this.command(text, (e) => e.type === 'session-ok', timeoutMs);
  }

  /** Extracts the home archive from the share (if any) and starts the desktop. */
  async restore(timeoutMs: number = AGENT_TIMEOUTS.restore): Promise<void> {
    await this.command(encodeCommand({ type: 'restore' }), (e) => e.type === 'restored', timeoutMs);
  }

  async save(timeoutMs: number = AGENT_TIMEOUTS.save): Promise<{ bytes: number }> {
    const nonce = this.nonce();
    const e = await this.command(
      encodeCommand({ type: 'save', nonce }),
      (ev) => ev.type === 'saved' && ev.nonce === nonce,
      timeoutMs,
    );
    return { bytes: e.type === 'saved' ? e.bytes : 0 };
  }

  /** Fire and forget: the guest powers off, there is no reply. */
  async shutdown(): Promise<void> {
    this.vm.sendSerial1(encodeCommand({ type: 'shutdown' }));
  }

  onPoweroff(cb: () => void): () => void {
    this.poweroff.add(cb);
    return () => this.poweroff.delete(cb);
  }
}
