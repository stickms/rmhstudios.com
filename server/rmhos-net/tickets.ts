// The hub's ticket book. A relay ticket is an HMAC over `userId.expiry` that must be FIRST
// presented within its 60 s validity. v86 bakes the relay and DoH URLs (ticket included) in when
// the machine starts and reuses them forever, so once a ticket has been seen it stays good for
// reconnects and DNS while it is in use: 15 minutes idle, 12 hours at most. One live ticket per
// user: a newer one replaces the older. State is per createRelayServer instance.
import { verifyNetTicketSignature } from '@features/rmhos/engine/net-ticket.server';

export const IDLE_MS = 15 * 60 * 1000;
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const MAX_TICKETS = 10_000;

interface Entry {
  userId: string;
  expiry: number;
  firstSeen: number;
  lastSeen: number;
}

export type Authorization =
  | {
      ok: true;
      userId: string;
      /** Set when presenting this ticket replaced an older one of the same user. */
      replaced: boolean;
    }
  | {
      ok: false;
    };

export class TicketBook {
  private readonly byTicket = new Map<string, Entry>();
  private readonly byUser = new Map<string, string>();

  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.byTicket.size;
  }

  private drop(ticket: string): void {
    const e = this.byTicket.get(ticket);
    if (!e) return;
    this.byTicket.delete(ticket);
    if (this.byUser.get(e.userId) === ticket) this.byUser.delete(e.userId);
  }

  private stale(e: Entry, t: number): boolean {
    return t - e.lastSeen > IDLE_MS || t - e.firstSeen > MAX_AGE_MS;
  }

  /** Accepts a ticket for a WebSocket upgrade or a DoH/status request, and records the use. */
  authorize(ticket: string): Authorization {
    const sig = verifyNetTicketSignature(ticket, this.secret);
    if (!sig.ok) return { ok: false };
    const t = this.now();
    const known = this.byTicket.get(ticket);
    if (known) {
      if (this.stale(known, t)) {
        this.drop(ticket);
        return { ok: false };
      }
      known.lastSeen = t;
      return { ok: true, userId: known.userId, replaced: false };
    }
    // Never seen: it has to be first presented inside its own validity window.
    if (t > sig.expiry) return { ok: false };
    // An older ticket cannot displace a newer one the user already holds.
    const currentTicket = this.byUser.get(sig.userId);
    const current = currentTicket ? this.byTicket.get(currentTicket) : undefined;
    if (current && sig.expiry <= current.expiry) return { ok: false };
    if (currentTicket) this.drop(currentTicket);
    if (this.byTicket.size >= MAX_TICKETS) this.evictOldest();
    this.byTicket.set(ticket, {
      userId: sig.userId,
      expiry: sig.expiry,
      firstSeen: t,
      lastSeen: t,
    });
    this.byUser.set(sig.userId, ticket);
    return { ok: true, userId: sig.userId, replaced: currentTicket !== undefined };
  }

  /** Relayed activity for a user keeps their ticket alive. */
  touch(userId: string): void {
    const ticket = this.byUser.get(userId);
    const e = ticket ? this.byTicket.get(ticket) : undefined;
    if (e) e.lastSeen = this.now();
  }

  private evictOldest(): void {
    let oldest: string | null = null;
    let at = Infinity;
    for (const [ticket, e] of this.byTicket) {
      if (e.lastSeen < at) {
        at = e.lastSeen;
        oldest = ticket;
      }
    }
    if (oldest !== null) this.drop(oldest);
  }

  prune(): void {
    const t = this.now();
    for (const [ticket, e] of this.byTicket) if (this.stale(e, t)) this.drop(ticket);
  }
}
