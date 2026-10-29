/**
 * Building and sending user commands (the SDK's CInput::CreateMove +
 * CL_SendMove): one command per client tick, numbered, canonicalized to wire
 * precision (so prediction runs exactly what the server will decode), and
 * packed with the previous three for loss resilience.
 *
 * Environment-agnostic.
 */

import { emptyUserCmd, type UserCmd } from '../../core/types';
import {
  canonicalizeUserCmd,
  encodeInputPacket,
  MAX_CMDS_PER_PACKET,
} from '../../net/usercmd-codec';

export class InputSender {
  private readonly recent: UserCmd[] = [];
  private nextNumber = 1;

  /** Starts numbering after `last` (a rejoin keeps numbers increasing). */
  constructor(last = 0) {
    this.nextNumber = last + 1;
  }

  /**
   * Makes the next command: `fill` sets angles, moves, buttons and weapon
   * select; the number, tick and seed are assigned here. Returns the
   * canonical command (hand it to `Prediction.addCommand`).
   */
  createCommand(tickCount: number, fill: (cmd: UserCmd) => void): UserCmd {
    const cmd = emptyUserCmd();
    fill(cmd);
    cmd.commandNumber = this.nextNumber++;
    cmd.tickCount = Math.max(0, Math.floor(tickCount));
    canonicalizeUserCmd(cmd);
    this.recent.push(cmd);
    while (this.recent.length > MAX_CMDS_PER_PACKET) this.recent.shift();
    return cmd;
  }

  get lastCommandNumber(): number {
    return this.nextNumber - 1;
  }

  /** The packet for the newest commands, acking `ackTick`, with the interpolation delay in ticks. */
  packet(ackTick: number, interpTicks: number): Uint8Array | null {
    if (this.recent.length === 0) return null;
    return encodeInputPacket({ ackTick, interpTicks, cmds: this.recent });
  }
}
