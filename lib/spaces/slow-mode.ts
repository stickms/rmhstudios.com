/**
 * Chat slow mode and raid protection — pure, shared by hubs and the UI.
 * Feature idea S3 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Twitch's slow mode ("one message every 30s") and Discord's raid protection
 * ("lots of brand-new accounts just joined and are posting") are two halves
 * of one control a room host needs. Spaces, RMHTube rooms, RMHMusic rooms and
 * group chats all have chat and none of them has either.
 *
 *   • **Slow mode** is a per-user cooldown the host sets (off, 5s … 5m).
 *     Hosts, moderators and anyone the host exempts bypass it.
 *   • **Auto slow mode** turns slow mode on by itself when the room's message
 *     rate crosses a threshold over a sliding window, and off again after the
 *     rate has stayed low for a cooldown. It never turns a host's manual
 *     setting *down*, only up.
 *   • **First-message hold** — accounts younger than `minAccountAgeMs` can
 *     read but not post while auto mode is engaged (the raid case).
 *
 * The gate is a small class with injected time so the same object runs in a
 * Node hub (authoritative) and in the composer (to grey out the send button
 * with a countdown instead of letting the server reject the message).
 */

export interface SlowModeConfig {
  /** Manual per-user cooldown, ms. 0 = off. */
  cooldownMs: number;
  /** Auto mode: engage when more than `burstMessages` arrive within `burstWindowMs`. */
  burstMessages: number;
  burstWindowMs: number;
  /** Cooldown applied while auto mode is engaged. */
  autoCooldownMs: number;
  /** Auto mode disengages after this long below the burst rate. */
  calmMs: number;
  /** While auto mode is engaged, accounts younger than this cannot post. */
  minAccountAgeMs: number;
}

export const DEFAULT_SLOW_MODE: SlowModeConfig = {
  cooldownMs: 0,
  burstMessages: 40,
  burstWindowMs: 10_000,
  autoCooldownMs: 10_000,
  calmMs: 60_000,
  minAccountAgeMs: 24 * 60 * 60 * 1000,
};

export type Verdict =
  | { ok: true }
  | { ok: false; reason: 'cooldown'; retryInMs: number }
  | { ok: false; reason: 'new-account' };

export interface Sender {
  id: string;
  exempt?: boolean;
  accountCreatedAt: number;
}

export class SlowModeGate {
  private lastBy = new Map<string, number>();
  private recent: number[] = [];
  private autoUntilCalm: number | null = null;

  constructor(private cfg: SlowModeConfig = DEFAULT_SLOW_MODE) {}

  configure(next: Partial<SlowModeConfig>): void {
    this.cfg = { ...this.cfg, ...next };
  }

  /** Whether auto mode is currently engaged. */
  autoEngaged(now: number): boolean {
    this.trim(now);
    if (this.autoUntilCalm !== null && now >= this.autoUntilCalm) this.autoUntilCalm = null;
    return this.autoUntilCalm !== null;
  }

  /** The cooldown in force right now. */
  effectiveCooldown(now: number): number {
    return this.autoEngaged(now)
      ? Math.max(this.cfg.cooldownMs, this.cfg.autoCooldownMs)
      : this.cfg.cooldownMs;
  }

  /** Check, and on success record, one message. */
  attempt(sender: Sender, now: number): Verdict {
    if (sender.exempt) {
      this.record(sender.id, now);
      return { ok: true };
    }
    const auto = this.autoEngaged(now);
    if (auto && now - sender.accountCreatedAt < this.cfg.minAccountAgeMs) {
      return { ok: false, reason: 'new-account' };
    }
    const cooldown = this.effectiveCooldown(now);
    const last = this.lastBy.get(sender.id);
    if (cooldown > 0 && last !== undefined && now - last < cooldown) {
      return { ok: false, reason: 'cooldown', retryInMs: cooldown - (now - last) };
    }
    this.record(sender.id, now);
    return { ok: true };
  }

  private record(id: string, now: number): void {
    this.lastBy.set(id, now);
    this.recent.push(now);
    this.trim(now);
    if (this.recent.length > this.cfg.burstMessages) this.autoUntilCalm = now + this.cfg.calmMs;
  }

  private trim(now: number): void {
    const cutoff = now - this.cfg.burstWindowMs;
    let i = 0;
    while (i < this.recent.length && this.recent[i]! <= cutoff) i++;
    if (i) this.recent.splice(0, i);
  }
}
