/**
 * `P2pPeerClient` — a member's end of a peer-to-peer match: the same calls
 * and callbacks the game client has over the hub (`../client.ts`), carried by
 * a `PeerLink` to the host instead of a socket. Input packets go out on the
 * unreliable channel, commands and chat on the reliable one; snapshots,
 * reliable batches, `joined`, chat and the host's goodbye come back. Clock
 * sync is the link's (pongs carry the host's match tick).
 *
 * Everything from the host is parsed before use (`control.ts`, and the
 * snapshot / protocol decoders) — the host is trusted to run the match, not to
 * send well-formed bytes.
 *
 * Environment-agnostic.
 */

import type { ClockEstimate } from '../clock';
import { TF2_LIMITS, type ChatMessage, type JoinedPayload } from '../events';
import type { MatchCommand } from '../../server/match-host';
import { zHostToPeer, type HostCloseReason, type PeerRow, type PeerToHost } from './control';
import { PeerLink, type ChannelLike, type LinkCloseReason, type LinkStats } from './link';
import { decodeControl, encodeControl, TAG_CHECKPOINT, TAG_CONTROL, TAG_EVENTS, TAG_INPUT, TAG_SNAPSHOT } from './wire';
import { isPackedCheckpoint } from '../../sim/checkpoint/pack';

/** Why a member's session ended: the host said so, or the link died. */
export type PeerEndReason = HostCloseReason | LinkCloseReason;

export interface P2pPeerHandlers {
  onOpen?(): void;
  onJoined?(info: JoinedPayload): void;
  onSnapshot?(data: Uint8Array): void;
  onEvents?(data: Uint8Array): void;
  onChat?(message: ChatMessage): void;
  /** Every human's connection type (host / direct / relayed), by entity. */
  onPeers?(rows: PeerRow[]): void;
  onClock?(estimate: ClockEstimate): void;
  /** This member is the host's successor: the newest migration checkpoint (packed, unchecked beyond its header). */
  onCheckpoint?(data: Uint8Array): void;
  /** The session is over. `host-left` / `kicked` / `migrating` came from the host; the rest are the link's. */
  onEnded?(reason: PeerEndReason): void;
}

export interface P2pPeerClientOptions {
  unreliable: ChannelLike;
  reliable: ChannelLike;
  now: () => number;
  timeoutMs?: number;
  handlers: P2pPeerHandlers;
}

export class P2pPeerClient {
  readonly link: PeerLink;
  /** Messages from the host that failed validation. */
  rejected = 0;
  private ended = false;
  private handlers: P2pPeerHandlers;

  constructor(opts: P2pPeerClientOptions) {
    this.handlers = opts.handlers;
    this.link = new PeerLink({
      unreliable: opts.unreliable,
      reliable: opts.reliable,
      now: opts.now,
      timeoutMs: opts.timeoutMs,
      onOpen: () => this.handlers.onOpen?.(),
      onUnreliable: (m) => this.onUnreliable(m),
      onReliable: (m) => this.onReliable(m),
      onClock: (e) => this.handlers.onClock?.(e),
      onClose: (reason) => this.end(reason),
    });
  }

  setHandlers(handlers: P2pPeerHandlers): void {
    this.handlers = handlers;
  }

  get stats(): LinkStats {
    return this.link.stats;
  }

  clock(): ClockEstimate | null {
    return this.link.clockEstimate();
  }

  /** One packed input packet (usercmd-codec); dropped when congested or oversized. */
  sendInput(packet: Uint8Array): boolean {
    if (packet.byteLength === 0 || packet.byteLength > TF2_LIMITS.INPUT_MAX_BYTES) return false;
    return this.link.sendSequenced(TAG_INPUT, packet);
  }

  command(cmd: MatchCommand): void {
    this.control({ t: 'cmd', cmd });
  }

  chat(text: string, teamOnly: boolean): void {
    this.command({ kind: 'chat', text, teamOnly });
  }

  /** Leave on purpose (the seat is released at once rather than held). */
  leave(): void {
    if (this.ended) return;
    this.control({ t: 'leave' });
    this.ended = true;
    // The goodbye is on the channel; closing now could drop it, so give it a moment.
    const link = this.link;
    if (typeof setTimeout === 'function') setTimeout(() => link.close('local'), 200);
    else link.close('local');
  }

  update(): void {
    this.link.update();
  }

  private control(message: PeerToHost): void {
    this.link.sendReliable(encodeControl(message));
  }

  private onUnreliable(m: Uint8Array): void {
    if (m[0] !== TAG_SNAPSHOT || m.byteLength < 2) {
      this.rejected++;
      return;
    }
    this.handlers.onSnapshot?.(m.subarray(1));
  }

  private onReliable(m: Uint8Array): void {
    if (m[0] === TAG_EVENTS && m.byteLength > 1) {
      this.handlers.onEvents?.(m.subarray(1));
      return;
    }
    if (m[0] === TAG_CHECKPOINT) {
      const body = m.subarray(1);
      if (isPackedCheckpoint(body)) this.handlers.onCheckpoint?.(body.slice());
      else this.rejected++;
      return;
    }
    if (m[0] !== TAG_CONTROL) {
      this.rejected++;
      return;
    }
    const parsed = zHostToPeer.safeParse(decodeControl(m));
    if (!parsed.success) {
      this.rejected++;
      return;
    }
    const msg = parsed.data;
    switch (msg.t) {
      case 'joined':
        this.handlers.onJoined?.(msg.info);
        break;
      case 'chat':
        this.handlers.onChat?.(msg.message);
        break;
      case 'peers':
        this.handlers.onPeers?.(msg.peers);
        break;
      case 'closed':
        this.end(msg.reason);
        this.link.close('local');
        break;
    }
  }

  private end(reason: PeerEndReason): void {
    if (this.ended) return;
    this.ended = true;
    this.handlers.onEnded?.(reason);
  }

  close(): void {
    this.ended = true;
    this.link.close('local');
  }
}
