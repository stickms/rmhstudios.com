/**
 * Input packets: round trips, the 512-byte cap, malformed input, and loss
 * resilience — with three redundant commands per packet the server receives
 * every command unless four packets in a row are lost.
 */
import { describe, expect, it } from 'vitest';
import { IN_ATTACK, IN_JUMP, IN_FORWARD } from '../core/constants';
import { UniformRandomStream } from '../core/random';
import { emptyUserCmd, type UserCmd } from '../core/types';
import { TF2_LIMITS } from './events';
import {
  canonicalizeUserCmd,
  commandSeed,
  decodeInputPacket,
  encodeInputPacket,
  INPUT_TAG,
  MAX_CMDS_PER_PACKET,
} from './usercmd-codec';

function makeCmd(n: number, rng: UniformRandomStream): UserCmd {
  const c = emptyUserCmd();
  c.commandNumber = n;
  c.tickCount = 1000 + n;
  c.viewAngles = { x: rng.randomFloat(-89, 89), y: rng.randomFloat(-180, 180), z: 0 };
  c.forwardMove = rng.randomInt(0, 2) ? 450 : 0;
  c.sideMove = rng.randomFloat(-450, 450);
  c.upMove = 0;
  c.buttons =
    (rng.randomInt(0, 1) ? IN_FORWARD : 0) |
    (rng.randomInt(0, 5) === 0 ? IN_JUMP : 0) |
    (rng.randomInt(0, 3) === 0 ? IN_ATTACK : 0);
  c.weaponSelect = rng.randomInt(0, 10) === 0 ? rng.randomInt(1, 6) : 0;
  return canonicalizeUserCmd(c);
}

describe('usercmd codec', () => {
  it('round-trips the canonical commands exactly, with derived seeds', () => {
    const rng = new UniformRandomStream(11);
    const cmds = [1, 2, 3, 4].map((n) => makeCmd(500 + n, rng));
    cmds[2].tickCount += 3; // a tick jump
    const bytes = encodeInputPacket({ ackTick: 12345, interpTicks: 4, cmds });
    expect(bytes[0]).toBe(INPUT_TAG);
    const p = decodeInputPacket(bytes)!;
    expect(p).not.toBeNull();
    expect(p.ackTick).toBe(12345);
    expect(p.interpTicks).toBe(4);
    expect(p.cmds).toEqual(cmds);
    for (const c of p.cmds) expect(c.randomSeed).toBe(commandSeed(c.commandNumber));
  });

  it('stays far below the 512-byte cap even with every field changing', () => {
    const cmds: UserCmd[] = [];
    for (let i = 0; i < MAX_CMDS_PER_PACKET; i++) {
      const c = emptyUserCmd();
      c.commandNumber = 2 ** 40 + i;
      c.tickCount = (i % 2) * 2 ** 31;
      c.viewAngles = { x: 89.123 - i, y: -179.5 + i, z: 3.3 * i };
      c.forwardMove = i % 2 ? 450 : -450;
      c.sideMove = i % 2 ? -450 : 450;
      c.upMove = i % 2 ? 450 : -450;
      c.buttons = 0xffffffff - i;
      c.weaponSelect = 15 - i;
      cmds.push(canonicalizeUserCmd(c));
    }
    const bytes = encodeInputPacket({ ackTick: 2 ** 31, interpTicks: 255, cmds });
    expect(bytes.byteLength).toBeLessThan(TF2_LIMITS.INPUT_MAX_BYTES / 4);
    expect(decodeInputPacket(bytes)!.cmds).toEqual(cmds);
    // A steady stream (same buttons, small aim changes) is a few bytes per command.
    const rng = new UniformRandomStream(1);
    const steady = [1, 2, 3, 4].map((n) => {
      const c = makeCmd(n, rng);
      c.buttons = IN_FORWARD;
      c.sideMove = 0;
      c.forwardMove = 450;
      c.weaponSelect = 0;
      return c;
    });
    expect(
      encodeInputPacket({ ackTick: 10, interpTicks: 4, cmds: steady }).byteLength,
    ).toBeLessThan(48);
  });

  it('rejects malformed packets', () => {
    const rng = new UniformRandomStream(2);
    const good = encodeInputPacket({
      ackTick: 1,
      interpTicks: 4,
      cmds: [makeCmd(1, rng), makeCmd(2, rng)],
    });
    expect(decodeInputPacket(new Uint8Array([1, 2, 3]))).toBeNull();
    const badTag = good.slice();
    badTag[0] = 0;
    expect(decodeInputPacket(badTag)).toBeNull();
    expect(decodeInputPacket(good.subarray(0, good.length - 3))).toBeNull();
    const padded = new Uint8Array(good.length + 4);
    padded.set(good);
    expect(decodeInputPacket(padded)).toBeNull();
    expect(decodeInputPacket(new Uint8Array(600))).toBeNull();
    expect(() => encodeInputPacket({ ackTick: 0, interpTicks: 0, cmds: [] })).toThrow();
    expect(() =>
      encodeInputPacket({ ackTick: 0, interpTicks: 0, cmds: [makeCmd(1, rng), makeCmd(5, rng)] }),
    ).toThrow();
  });

  it('clamps what a client may claim', () => {
    const c = emptyUserCmd();
    c.commandNumber = 1;
    c.forwardMove = 9000;
    c.sideMove = Number.NaN;
    c.viewAngles = { x: Number.POSITIVE_INFINITY, y: 10.123456789, z: 0 };
    c.weaponSelect = 99;
    canonicalizeUserCmd(c);
    expect(c.forwardMove).toBe(450);
    expect(c.sideMove).toBe(0);
    expect(c.viewAngles.x).toBe(0);
    expect(c.viewAngles.y).toBe(Math.fround(10.123456789));
    expect(c.weaponSelect).toBe(15);
  });

  it('recovers every command through 2 % loss (and bursts of up to 3 lost packets)', () => {
    const rng = new UniformRandomStream(77);
    const sent: UserCmd[] = [];
    const received = new Map<number, UserCmd>();
    let lastReceived = 0;
    let burst = 0;
    for (let n = 1; n <= 5000; n++) {
      sent.push(makeCmd(n, rng));
      const window = sent.slice(-MAX_CMDS_PER_PACKET);
      const bytes = encodeInputPacket({ ackTick: n, interpTicks: 4, cmds: window });
      // 2 % random loss, plus forced bursts of three every 1000 packets.
      const forced = n % 1000 < 3 && n > 3;
      const lost = forced || (burst < 3 && rng.randomFloat() < 0.02);
      burst = lost ? burst + 1 : 0;
      if (lost) continue;
      const p = decodeInputPacket(bytes)!;
      for (const c of p.cmds) {
        if (c.commandNumber <= lastReceived) continue;
        received.set(c.commandNumber, c);
        lastReceived = c.commandNumber;
      }
    }
    // The tail may be in flight; everything up to the last delivered packet arrived, intact and in order.
    for (let n = 1; n <= lastReceived; n++)
      expect(received.get(n), `cmd ${n}`).toEqual(sent[n - 1]);
    expect(lastReceived).toBeGreaterThan(4990);
  });
});
