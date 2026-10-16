/**
 * Per-room slow mode for the Node hubs (S3): one `SlowModeGate` per room, the
 * host's cooldown setting, and a lazily cached account-age lookup (only needed
 * while auto/raid mode is engaged). Authoritative — clients only mirror it.
 */
import { SlowModeGate, DEFAULT_SLOW_MODE, type Verdict } from '../../lib/spaces/slow-mode';
import { SLOW_MODE_CHOICES_S } from '../../lib/safety/slow-mode-events';

const MAX_ROOMS = 2_000;
const MAX_AGES = 20_000;

export class RoomSlowMode {
  private gates = new Map<string, SlowModeGate>();
  private cooldowns = new Map<string, number>();
  private ages = new Map<string, number>();

  constructor(private loadCreatedAt: (userId: string) => Promise<number | null>) {}

  private gate(roomId: string): SlowModeGate {
    let g = this.gates.get(roomId);
    if (!g) {
      if (this.gates.size >= MAX_ROOMS) {
        const oldest = this.gates.keys().next().value;
        if (oldest !== undefined) {
          this.gates.delete(oldest);
          this.cooldowns.delete(oldest);
        }
      }
      g = new SlowModeGate({ ...DEFAULT_SLOW_MODE, cooldownMs: this.cooldowns.get(roomId) ?? 0 });
      this.gates.set(roomId, g);
    }
    return g;
  }

  /** Host setting. Returns the applied cooldown in ms, or null if the value is not an offered choice. */
  setCooldown(roomId: string, seconds: number): number | null {
    if (!(SLOW_MODE_CHOICES_S as readonly number[]).includes(seconds)) return null;
    const ms = seconds * 1000;
    this.cooldowns.set(roomId, ms);
    this.gate(roomId).configure({ cooldownMs: ms });
    return ms;
  }

  state(roomId: string, now = Date.now()) {
    const g = this.gate(roomId);
    return {
      roomId,
      cooldownMs: this.cooldowns.get(roomId) ?? 0,
      autoEngaged: g.autoEngaged(now),
    };
  }

  /** Check (and on success record) one chat message. Hosts are exempt. */
  async check(roomId: string, userId: string, isHost: boolean, now = Date.now()): Promise<Verdict> {
    const g = this.gate(roomId);
    let createdAt = 0;
    if (!isHost && g.autoEngaged(now)) {
      createdAt = (await this.createdAt(userId)) ?? now;
    }
    return g.attempt({ id: userId, exempt: isHost, accountCreatedAt: createdAt }, Date.now());
  }

  private async createdAt(userId: string): Promise<number | null> {
    const hit = this.ages.get(userId);
    if (hit !== undefined) return hit;
    const v = await this.loadCreatedAt(userId).catch(() => null);
    if (v !== null) {
      if (this.ages.size >= MAX_AGES) this.ages.clear();
      this.ages.set(userId, v);
    }
    return v;
  }
}
