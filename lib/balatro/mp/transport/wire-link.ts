/**
 * One host ↔ member link speaking the §3.b wire: envelopes as CONTROL frames
 * (tag + JSON) on a `ReliableLink`, which fragments above 16 KB, pings on the
 * unreliable channel, applies backpressure and times out after 10 s.
 *
 * Receiving is defensive (NET-10, I-05): frames that are not CONTROL JSON,
 * fail the envelope or per-kind zod schema (`validateEnvelope`), exceed the
 * per-peer rate limits (40/s burst 100; `log` 20/s burst 1024) or are
 * local-only kinds are dropped and counted, never thrown. The host-only and
 * `f` rules depend on the link's direction and are applied by the owner.
 *
 * The underlying channels can be swapped (direct → hub relay) without the
 * owner noticing: `attach` replaces the ReliableLink and keeps the sequence.
 */

import { ReliableLink, type ReliableLinkCloseReason } from '../../../shared/p2p/reliable-link';
import { decodeControl, encodeControl } from '../../../shared/p2p/wire';
import type { ChannelPair } from '../../../shared/p2p/channel';
import type { Envelope, WireData, WireKind } from '../wire';
import { isLocalOnly, validateEnvelope, WIRE_LIMITS } from '../wire-codec';
import { PeerLimiter } from '../ratelimit';
import type { Scheduler } from './types';

export type ConnKind = 'direct' | 'turn' | 'relay';

export interface WireLinkStats {
  sent: number;
  received: number;
  dropped: { decode: number; rate: number; local: number };
}

export interface WireLinkOptions {
  sched: Scheduler;
  onEnvelope(env: Envelope): void;
  onOpen?(): void;
  onClose?(reason: ReliableLinkCloseReason): void;
  onDrop?(why: string, detail?: string): void;
  timeoutMs?: number;
}

export class WireLink {
  private link: ReliableLink | null = null;
  private seq = 0;
  private readonly limiter: PeerLimiter;
  private stopTimer: (() => void) | null = null;
  kind: ConnKind | null = null;
  closed = false;
  readonly stats: WireLinkStats = { sent: 0, received: 0, dropped: { decode: 0, rate: 0, local: 0 } };

  constructor(private readonly opts: WireLinkOptions) {
    this.limiter = new PeerLimiter(() => opts.sched.mono());
  }

  /** Put the link on a channel pair (the first, or a replacement after a fallback). */
  attach(pair: ChannelPair, kind: ConnKind): void {
    if (this.closed) return;
    const old = this.link;
    this.link = null;
    old?.close('local');
    this.kind = kind;
    const link = new ReliableLink({
      unreliable: pair.unreliable,
      reliable: pair.reliable,
      now: () => this.opts.sched.mono(),
      timeoutMs: this.opts.timeoutMs,
      maxMessageBytes: WIRE_LIMITS.MAX_MESSAGE_BYTES,
      onMessage: (bytes) => this.onBytes(bytes),
      onOpen: () => {
        if (this.link === link) this.opts.onOpen?.();
      },
      onClose: (reason) => {
        if (this.link !== link) return; // replaced
        this.link = null;
        this.opts.onClose?.(reason);
      },
    });
    this.link = link;
    this.stopTimer?.();
    this.stopTimer = this.opts.sched.every(250, () => this.link?.update());
  }

  get isOpen(): boolean {
    return !!this.link?.isOpen;
  }

  get attached(): boolean {
    return this.link !== null;
  }

  /** ms since anything arrived (Infinity while detached). */
  silentForMs(): number {
    return this.link ? this.link.silentForMs() : Infinity;
  }

  get rttMs(): number | null {
    return this.link?.stats.rttMs ?? null;
  }

  /** Send one envelope of `kind` (queued until the link opens). */
  send<K extends WireKind>(k: K, d: WireData<K>, extra: { f?: string; to?: string } = {}): boolean {
    if (this.closed || !this.link) return false;
    const env: Record<string, unknown> = { v: 1, k, s: ++this.seq, d };
    if (extra.f !== undefined) env.f = extra.f;
    if (extra.to !== undefined) env.to = extra.to;
    const ok = this.link.send(encodeControl(env));
    if (ok) this.stats.sent += 1;
    return ok;
  }

  private onBytes(bytes: Uint8Array): void {
    const raw = decodeControl(bytes);
    if (raw === undefined) return this.drop('decode', 'not control json');
    const kind = (raw as { k?: unknown })?.k;
    if (typeof kind === 'string' && !this.limiter.allow(kind)) return this.drop('rate', kind);
    const r = validateEnvelope(raw);
    if (!r.ok) return this.drop('decode', `${r.error} ${r.kind ?? ''} ${r.detail ?? ''}`.trim());
    if (isLocalOnly(r.env.k)) return this.drop('local', r.env.k);
    this.stats.received += 1;
    this.opts.onEnvelope(r.env);
  }

  private drop(why: 'decode' | 'rate' | 'local', detail?: string): void {
    this.stats.dropped[why] += 1;
    this.opts.onDrop?.(why, detail);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopTimer?.();
    this.stopTimer = null;
    const l = this.link;
    this.link = null;
    l?.close('local');
  }
}
