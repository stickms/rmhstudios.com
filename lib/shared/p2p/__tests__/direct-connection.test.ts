import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectConnection, type SignalOut } from '../webrtc';

/**
 * A scripted `RTCPeerConnection`: just enough surface for DirectConnection's signalling path, with the failure
 * modes a real browser has (a candidate it refuses). The real thing is exercised by testing/hearthworks-e2e.
 */
class FakePc {
  static last: FakePc;
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';
  added: string[] = [];
  remote: { type: string; sdp: string } | null = null;
  local: { type: string; sdp: string } | null = null;
  refuse = new Set<string>();
  constructor() {
    FakePc.last = this;
  }
  createDataChannel() {
    return { binaryType: '', bufferedAmount: 0, bufferedAmountLowThreshold: 0, readyState: 'connecting', send() {}, close() {} };
  }
  async createOffer() {
    return { type: 'offer', sdp: 'offer-sdp' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer-sdp' };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.local = d;
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remote = d;
  }
  async addIceCandidate(c: { candidate: string }) {
    if (this.refuse.has(c.candidate)) throw new Error('Error processing ICE candidate');
    this.added.push(c.candidate);
  }
  async getStats() {
    return new Map();
  }
  close() {}
}

afterEach(() => vi.unstubAllGlobals());

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('DirectConnection signalling', () => {
  it('answers the offer and applies the good candidates even when a queued candidate is refused', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePc);
    const out: SignalOut[] = [];
    const conn = new DirectConnection({
      role: 'member',
      iceServers: [],
      signal: (s) => out.push(s),
      onChannels: () => {},
      onFailed: () => {},
      hooks: { directTimeoutMs: 60_000 },
    });
    const pc = FakePc.last;
    pc.refuse.add('bad');
    // The host's candidates trickle in before its offer has been applied: they wait in the queue.
    void conn.handle({ candidate: { candidate: 'first' } });
    void conn.handle({ candidate: { candidate: 'bad' } });
    void conn.handle({ candidate: { candidate: 'last' } });
    await flush();
    expect(pc.added).toEqual([]);
    await conn.handle({ description: { type: 'offer', sdp: 'offer-sdp' } });
    await flush();
    // The refused candidate is dropped; the others are applied and the ANSWER still goes out.
    expect(pc.added).toEqual(['first', 'last']);
    expect(out.some((s) => s.description?.type === 'answer')).toBe(true);
    // A candidate after the description is applied directly (and a refused one there is just ignored).
    pc.refuse.add('late-bad');
    await conn.handle({ candidate: { candidate: 'late-bad' } });
    await conn.handle({ candidate: { candidate: 'late' } });
    expect(pc.added).toEqual(['first', 'last', 'late']);
    conn.close();
  });

  it('ignores a description of the wrong kind for its role', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePc);
    const host = new DirectConnection({ role: 'host', iceServers: [], signal: () => {}, onChannels: () => {}, onFailed: () => {}, hooks: { directTimeoutMs: 60_000 } });
    await host.handle({ description: { type: 'offer', sdp: 'x' } });
    expect(FakePc.last.remote).toBeNull();
    host.close();
  });
});
