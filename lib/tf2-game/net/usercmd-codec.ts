/**
 * Input packets: the client's user commands on the wire (the SDK's
 * CL_SendMove / WriteUsercmd in game/shared/usercmd.cpp).
 *
 * Every packet carries the newest command plus up to three before it, each
 * delta-encoded against the one before (the first against a null command),
 * so a dropped packet's commands ride in the next one — `tf2:input` is sent
 * volatile and the hub caps it at 512 bytes. It also carries the newest
 * snapshot tick the client decoded (the delta baseline the server may use)
 * and the client's interpolation delay in ticks (lag compensation's
 * `lerpTicks`, the SDK's cl_interp convar).
 *
 * Layout (bits, LSB first; see bitbuf.ts):
 *   u8 INPUT_TAG · varuint ackTick · u8 interpTicks · u2 (count − 1)
 *   cmd[0]: varuint commandNumber · varuint tickCount · fields vs null
 *   cmd[i]: commandNumber = previous + 1 ·
 *           bit (tickCount = previous + 1) | 0 + varint delta · fields vs previous
 *   fields: per field a changed bit, then
 *           viewAngles x/y/z float32 · forward/side/up zigzag varint (whole
 *           units) · buttons varuint · weaponSelect 4 bits.
 *
 * `randomSeed` is never sent: both sides derive it from the command number
 * (`commandSeed`, the role of MD5_PseudoRandom(command_number)), so a client
 * cannot choose its spread. The client predicts with exactly what the server
 * will decode by passing each command through `canonicalizeUserCmd` first.
 */

import { hashSeed } from '../core/random';
import { emptyUserCmd, type UserCmd } from '../core/types';
import { BitReader, BitWriter } from './bitbuf';
import { TF2_LIMITS } from './events';

export const INPUT_TAG = 0x49;
/** Commands per packet: the newest plus three redundant (cl_cmdbackup 2 in the SDK; we can afford 3). */
export const MAX_CMDS_PER_PACKET = 4;
/** cl_forwardspeed / cl_sidespeed / cl_upspeed maximum. */
export const MAX_MOVE = 450;
const MAX_WEAPON_SELECT = 15;

export interface InputPacket {
  /** Newest snapshot tick the client decoded; 0 before the first. */
  ackTick: number;
  /** Interpolation delay in ticks (TIME_TO_TICKS(cl_interp)). */
  interpTicks: number;
  /** Oldest first, consecutive command numbers. 1…MAX_CMDS_PER_PACKET. */
  cmds: UserCmd[];
}

/** The shared-random seed for a command (both sides compute it). */
export const commandSeed = (commandNumber: number): number => hashSeed(commandNumber);

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
const clampMove = (v: number): number =>
  Math.max(-MAX_MOVE, Math.min(MAX_MOVE, Math.round(finite(v)))) || 0;

/**
 * Rounds a command to wire precision in place (float32 angles, whole move
 * units, 4-bit weapon select) and derives its seed. The client runs every
 * command through this before predicting it, so client and server simulate
 * identical input.
 */
export function canonicalizeUserCmd(cmd: UserCmd): UserCmd {
  cmd.commandNumber = Math.max(0, Math.floor(finite(cmd.commandNumber)));
  cmd.tickCount = Math.max(0, Math.floor(finite(cmd.tickCount)));
  cmd.viewAngles.x = Math.fround(finite(cmd.viewAngles.x));
  cmd.viewAngles.y = Math.fround(finite(cmd.viewAngles.y));
  cmd.viewAngles.z = Math.fround(finite(cmd.viewAngles.z));
  cmd.forwardMove = clampMove(cmd.forwardMove);
  cmd.sideMove = clampMove(cmd.sideMove);
  cmd.upMove = clampMove(cmd.upMove);
  cmd.buttons = cmd.buttons >>> 0;
  cmd.weaponSelect = Math.max(0, Math.min(MAX_WEAPON_SELECT, Math.floor(finite(cmd.weaponSelect))));
  cmd.randomSeed = commandSeed(cmd.commandNumber);
  return cmd;
}

const NULL_CMD = emptyUserCmd();

function writeFields(w: BitWriter, cmd: UserCmd, from: UserCmd): void {
  const angles = [cmd.viewAngles.x, cmd.viewAngles.y, cmd.viewAngles.z];
  const prev = [from.viewAngles.x, from.viewAngles.y, from.viewAngles.z];
  for (let i = 0; i < 3; i++) {
    const v = Math.fround(finite(angles[i]));
    const changed = v !== Math.fround(finite(prev[i]));
    w.writeBit(changed);
    if (changed) w.writeFloat32(v);
  }
  for (const [v, p] of [
    [cmd.forwardMove, from.forwardMove],
    [cmd.sideMove, from.sideMove],
    [cmd.upMove, from.upMove],
  ] as const) {
    const a = clampMove(v);
    const changed = a !== clampMove(p);
    w.writeBit(changed);
    if (changed) w.writeVarInt(a);
  }
  const buttons = cmd.buttons >>> 0;
  w.writeBit(buttons !== from.buttons >>> 0);
  if (buttons !== from.buttons >>> 0) w.writeVarUint(buttons);
  const ws = Math.max(0, Math.min(MAX_WEAPON_SELECT, Math.floor(finite(cmd.weaponSelect))));
  w.writeBit(ws !== 0);
  if (ws !== 0) w.writeBits(ws, 4);
}

function readFields(r: BitReader, out: UserCmd, from: UserCmd): void {
  out.viewAngles.x = r.readBit() ? r.readFloat32() : from.viewAngles.x;
  out.viewAngles.y = r.readBit() ? r.readFloat32() : from.viewAngles.y;
  out.viewAngles.z = r.readBit() ? r.readFloat32() : from.viewAngles.z;
  out.forwardMove = r.readBit() ? clampMove(r.readVarInt()) : from.forwardMove;
  out.sideMove = r.readBit() ? clampMove(r.readVarInt()) : from.sideMove;
  out.upMove = r.readBit() ? clampMove(r.readVarInt()) : from.upMove;
  out.buttons = r.readBit() ? r.readVarUint() >>> 0 : from.buttons;
  out.weaponSelect = r.readBit() ? r.readBits(4) : 0;
}

const packetWriter = new BitWriter(TF2_LIMITS.INPUT_MAX_BYTES);

/** Packs a packet. Throws if it would exceed the hub's 512-byte cap (it cannot with ≤ 4 commands). */
export function encodeInputPacket(packet: InputPacket): Uint8Array {
  const cmds = packet.cmds;
  if (cmds.length < 1 || cmds.length > MAX_CMDS_PER_PACKET)
    throw new Error(`input packet: ${cmds.length} commands`);
  for (let i = 1; i < cmds.length; i++) {
    if (cmds[i].commandNumber !== cmds[i - 1].commandNumber + 1)
      throw new Error('input packet: commands not consecutive');
  }
  const w = packetWriter.reset(0);
  w.writeU8(INPUT_TAG);
  w.writeVarUint(packet.ackTick);
  w.writeU8(Math.max(0, Math.min(255, Math.round(finite(packet.interpTicks)))));
  w.writeBits(cmds.length - 1, 2);
  let prev = NULL_CMD;
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (i === 0) {
      w.writeVarUint(c.commandNumber);
      w.writeVarUint(c.tickCount);
    } else {
      const same = c.tickCount === prev.tickCount + 1;
      w.writeBit(same);
      if (!same) w.writeVarInt(c.tickCount - prev.tickCount);
    }
    writeFields(w, c, prev);
    prev = c;
  }
  if (w.byteLength > TF2_LIMITS.INPUT_MAX_BYTES)
    throw new Error('input packet over the 512-byte cap');
  return w.toBytes();
}

/** Unpacks a packet, or null when it is malformed (wrong tag, truncated, absurd values). */
export function decodeInputPacket(bytes: Uint8Array): InputPacket | null {
  if (bytes.byteLength < 4 || bytes.byteLength > TF2_LIMITS.INPUT_MAX_BYTES) return null;
  const r = new BitReader(bytes);
  if (r.readU8() !== INPUT_TAG) return null;
  const ackTick = r.readVarUint();
  const interpTicks = r.readU8();
  const count = r.readBits(2) + 1;
  const cmds: UserCmd[] = [];
  let prev = NULL_CMD;
  for (let i = 0; i < count; i++) {
    const c = emptyUserCmd();
    if (i === 0) {
      c.commandNumber = r.readVarUint();
      c.tickCount = r.readVarUint();
    } else {
      c.commandNumber = prev.commandNumber + 1;
      c.tickCount = r.readBit() ? prev.tickCount + 1 : prev.tickCount + r.readVarInt();
    }
    readFields(r, c, prev);
    if (r.overflowed) return null;
    if (
      !Number.isFinite(c.viewAngles.x) ||
      !Number.isFinite(c.viewAngles.y) ||
      !Number.isFinite(c.viewAngles.z)
    )
      return null;
    c.randomSeed = commandSeed(c.commandNumber);
    cmds.push(c);
    prev = c;
  }
  if (r.overflowed || r.bitsLeft >= 8) return null;
  return { ackTick, interpTicks, cmds };
}
