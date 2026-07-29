/**
 * PresenceGrace — "wait for them, then move on".
 *
 * When a player drops mid-session the room has two bad options: carry on
 * without them (they lose their game to a tunnel) or wait forever (everyone
 * else loses theirs to one person's closed laptop). The grace window is the
 * middle: the room pauses and says who it is waiting for, and if they are not
 * back inside `graceMs` it removes them and resumes.
 *
 * The server owns the timer because the server owns the room — a client-side
 * countdown is a display of this one, never the decision.
 *
 * Usage from a socket handler:
 *
 *     const grace = new PresenceGrace({
 *       onChange: (roomId, waiting) => io.to(roomId).emit(S2C.PEERS_WAITING, waiting),
 *       onExpire: (roomId, userId) => removePlayer(io, roomId, userId),
 *     });
 *
 *     // on disconnect
 *     grace.hold(roomId, userId, userName);
 *     // on reconnect
 *     grace.release(roomId, userId);
 *     // when the room goes away
 *     grace.clearRoom(roomId);
 */

import { PEER_GRACE_MS, type PeerWaitState } from '../../lib/shared/realtime/types';

interface HeldPeer {
  userId: string;
  userName: string;
  kickAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface PresenceGraceOptions {
  /** Override the shared 15s window (tests, or a mode with a different pace). */
  graceMs?: number;
  /**
   * The set of peers a room is waiting on changed — including to "nobody",
   * which is signalled with `null` and means "resume".
   */
  onChange?: (roomId: string, waiting: PeerWaitState | null) => void;
  /** A peer's window expired. Remove them; `onChange` fires straight after. */
  onExpire?: (roomId: string, userId: string, userName: string) => void;
}

export class PresenceGrace {
  private readonly graceMs: number;
  private readonly onChange?: PresenceGraceOptions['onChange'];
  private readonly onExpire?: PresenceGraceOptions['onExpire'];
  private readonly rooms = new Map<string, Map<string, HeldPeer>>();

  constructor(options: PresenceGraceOptions = {}) {
    this.graceMs = options.graceMs ?? PEER_GRACE_MS;
    this.onChange = options.onChange;
    this.onExpire = options.onExpire;
  }

  /**
   * Start (or restart) a peer's grace window. Calling this for someone already
   * held restarts their window — a flapping connection that lands one
   * successful handshake buys the full window again rather than being kicked
   * mid-handshake.
   */
  hold(roomId: string, userId: string, userName: string): void {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }

    clearTimeout(room.get(userId)?.timer);

    const timer = setTimeout(() => {
      const current = this.rooms.get(roomId);
      const held = current?.get(userId);
      if (!current || !held) return;
      current.delete(userId);
      if (current.size === 0) this.rooms.delete(roomId);
      // Remove first, then announce — so the state the room broadcasts on
      // resume already reflects the departure.
      this.onExpire?.(roomId, userId, held.userName);
      this.emit(roomId);
    }, this.graceMs);

    // Node keeps the process alive for pending timers; a grace window should
    // never be the reason a worker refuses to shut down.
    timer.unref?.();

    room.set(userId, { userId, userName, kickAt: Date.now() + this.graceMs, timer });
    this.emit(roomId);
  }

  /** A held peer came back. No-op if they weren't held. */
  release(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    const held = room?.get(userId);
    if (!room || !held) return;
    clearTimeout(held.timer);
    room.delete(userId);
    if (room.size === 0) this.rooms.delete(roomId);
    this.emit(roomId);
  }

  /** Drop every window for a room (the room ended, or everyone left). */
  clearRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const held of room.values()) clearTimeout(held.timer);
    this.rooms.delete(roomId);
    this.onChange?.(roomId, null);
  }

  /** Whether the room should currently be paused. */
  isPaused(roomId: string): boolean {
    return (this.rooms.get(roomId)?.size ?? 0) > 0;
  }

  /** The wait state a client needs to render its pause overlay. */
  getWaiting(roomId: string): PeerWaitState | null {
    const room = this.rooms.get(roomId);
    if (!room || room.size === 0) return null;
    const peers = [...room.values()];
    return {
      peers: peers.map(({ userId, userName }) => ({ userId, userName })),
      // The earliest expiry, so the countdown shown is the next thing to
      // happen rather than the last.
      kickAt: Math.min(...peers.map((p) => p.kickAt)),
    };
  }

  /** Release every timer — call on server shutdown. */
  dispose(): void {
    for (const room of this.rooms.values()) {
      for (const held of room.values()) clearTimeout(held.timer);
    }
    this.rooms.clear();
  }

  private emit(roomId: string): void {
    this.onChange?.(roomId, this.getWaiting(roomId));
  }
}
