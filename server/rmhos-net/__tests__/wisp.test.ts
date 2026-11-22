import { describe, expect, it } from 'vitest';
import { CLOSE_REASON, decodePacket, encodeClose, encodeContinue, encodeData } from '../wisp';

describe('wisp codec', () => {
  it('decodes CONNECT as the v86 client sends it', () => {
    const connect = Uint8Array.from([0x01, 5, 0, 0, 0, 0x01, 0xbb, 0x01, ...Buffer.from('example.com')]);
    expect(decodePacket(connect)).toEqual({
      type: 'connect',
      streamId: 5,
      streamType: 'tcp',
      port: 443,
      host: 'example.com',
    });
  });
  it('decodes udp CONNECT', () => {
    const p = decodePacket(Uint8Array.from([0x01, 1, 0, 0, 0, 0x02, 53, 0, ...Buffer.from('1.1.1.1')]));
    expect(p).toMatchObject({
      type: 'connect',
      streamType: 'udp',
      port: 53,
    });
  });
  it('rejects truncated, unknown and bad-stream-type packets', () => {
    expect(decodePacket(Uint8Array.from([0x01, 5, 0, 0]))).toBeNull();
    expect(decodePacket(Uint8Array.from([0x01, 5, 0, 0, 0, 1, 0]))).toBeNull();
    expect(decodePacket(Uint8Array.from([0x01, 5, 0, 0, 0, 9, 0, 0, 97]))).toBeNull();
    expect(decodePacket(Uint8Array.from([0x09, 0, 0, 0, 0]))).toBeNull();
    expect(decodePacket(Uint8Array.from([0x03, 0, 0, 0, 0, 1]))).toBeNull();
  });
  it('encodes CONTINUE and CLOSE', () => {
    expect([...encodeContinue(0, 128)]).toEqual([0x03, 0, 0, 0, 0, 128, 0, 0, 0]);
    expect([...encodeClose(7, CLOSE_REASON.blocked)]).toEqual([0x04, 7, 0, 0, 0, 0x48]);
  });
  it('round-trips DATA, CONTINUE and CLOSE', () => {
    expect(decodePacket(encodeData(9, Uint8Array.of(1, 2)))).toEqual({
      type: 'data',
      streamId: 9,
      payload: Uint8Array.of(1, 2),
    });
    expect(decodePacket(encodeContinue(3, 70000))).toEqual({
      type: 'continue',
      streamId: 3,
      bufferRemaining: 70000,
    });
    expect(decodePacket(encodeClose(3, 0x42))).toEqual({
      type: 'close',
      streamId: 3,
      reason: 0x42,
    });
  });
  it('decodes a packet that is a view into a larger buffer', () => {
    const big = new Uint8Array(20);
    big.set(encodeData(4, Uint8Array.of(7, 8)), 6);
    expect(decodePacket(big.subarray(6, 13))).toEqual({
      type: 'data',
      streamId: 4,
      payload: Uint8Array.of(7, 8),
    });
  });
});
