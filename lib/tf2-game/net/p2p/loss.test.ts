/**
 * Loss, choke and jitter from the real traffic's sequence numbers (loss.ts):
 * what net_graph and the scoreboard show for a peer-to-peer link.
 */
import { describe, expect, it } from 'vitest';
import { UniformRandomStream } from '../../core/random';
import { LOSS_WINDOW, SequenceMeter } from './loss';
import { readSequence, sequenced, SEQ_HEADER_BYTES, TAG_SNAPSHOT } from './wire';

describe('SequenceMeter', () => {
  it('measures loss from sequence gaps (a late packet is not lost), across the u16 wrap', () => {
    const m = new SequenceMeter();
    const rng = new UniformRandomStream(7);
    let lost = 0;
    let held: number | null = null;
    // 1000 packets from just below the wrap: 10 % lost, some swapped with the next one.
    for (let i = 0; i < 1000; i++) {
      const seq = (65_000 + i) & 0xffff;
      if (rng.randomFloat() < 0.1) {
        if (i >= 1000 - LOSS_WINDOW) lost++;
        continue;
      }
      if (held === null && rng.randomFloat() < 0.1) {
        held = seq;
        continue;
      }
      m.record(seq, (i * 30) & 0xffff, 0, i * 30 + 40);
      if (held !== null) {
        m.record(held, ((i - 1) * 30) & 0xffff, 0, i * 30 + 41);
        held = null;
      }
    }
    expect(m.loss).toBeCloseTo(lost / LOSS_WINDOW, 1);
    expect(m.loss).toBeGreaterThan(0.03);
    expect(m.loss).toBeLessThan(0.2);
  });

  it('reports the sender’s choke and the transit jitter', () => {
    const m = new SequenceMeter();
    for (let i = 0; i < 200; i++) {
      // Every fifth message the sender had dropped one before it (its channel was backed up).
      const choke = i % 5 === 0 ? 1 : 0;
      const jitter = i % 2 === 0 ? 0 : 8;
      m.record(i, i * 30, choke, i * 30 + 50 + jitter);
    }
    expect(m.loss).toBe(0);
    expect(m.choke).toBeGreaterThan(0.12);
    expect(m.choke).toBeLessThan(0.2);
    expect(m.jitterMs).toBeGreaterThan(5);
    expect(m.jitterMs).toBeLessThan(9);
  });

  it('the header carries sequence, clock and choke and nothing else', () => {
    const body = new Uint8Array([9, 8, 7]);
    const msg = sequenced(TAG_SNAPSHOT, 70_000, 123_456, 300, body);
    expect(msg[0]).toBe(TAG_SNAPSHOT);
    expect(readSequence(msg)).toEqual({ seq: 70_000 & 0xffff, sentMs: 123_456 & 0xffff, choke: 255 });
    expect([...msg.subarray(1 + SEQ_HEADER_BYTES)]).toEqual([9, 8, 7]);
  });
});
