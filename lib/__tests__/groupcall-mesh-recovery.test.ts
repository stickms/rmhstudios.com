/**
 * The mesh's recovery decisions, against a stub `RTCPeerConnection`.
 *
 * Two rules that decide whether a call that hit a network wobble comes back:
 * an ICE restart must land on the connection it restarts (a fresh connection
 * cannot answer it — the DTLS session would not match), and an offer lost in
 * transit must be re-sent rather than leaving the leg dead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupCallMesh } from '@/lib/groupcall/mesh';

vi.mock('@/lib/shared/platform', () => ({
  getAudioContext: () => null,
  resumeAudioContext: () => {},
}));

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  signalingState: RTCSignalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onicecandidate: unknown = null;
  ontrack: unknown = null;
  offers: Array<RTCOfferOptions | undefined> = [];

  constructor() {
    FakePeerConnection.instances.push(this);
  }
  getSenders() {
    return [];
  }
  getTransceivers() {
    return [];
  }
  addTransceiver() {}
  async createOffer(options?: RTCOfferOptions) {
    this.offers.push(options);
    return { type: 'offer' as const, sdp: 'a=fingerprint:sha-256 AA:AA\r\n' };
  }
  async createAnswer() {
    return { type: 'answer' as const, sdp: 'a=fingerprint:sha-256 BB:BB\r\n' };
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    // As browsers do: an answer is only valid against a pending local offer.
    if (description.type === 'answer' && this.signalingState !== 'have-local-offer') {
      throw new Error('InvalidStateError');
    }
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate() {}
  close() {
    this.signalingState = 'closed';
    this.connectionState = 'closed';
  }
  enter(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

const callbacks = () => ({
  onDescription: vi.fn(),
  onCandidate: vi.fn(),
  onPeerStatus: vi.fn(),
  onSpeaking: vi.fn(),
  onLocalSpeaking: vi.fn(),
  onLevels: vi.fn(),
});

const offerFrom = (fingerprint: string): RTCSessionDescriptionInit => ({
  type: 'offer',
  sdp: `v=0\r\na=fingerprint:sha-256 ${fingerprint}\r\n`,
});

describe('group-call mesh recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakePeerConnection.instances = [];
    // The stall deadline rides the level ticker, which only runs in a browser.
    vi.stubGlobal('window', {});
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('RTCSessionDescription', class {
      constructor(init: RTCSessionDescriptionInit) {
        return init;
      }
    });
    vi.stubGlobal('RTCIceCandidate', class {
      constructor(init: RTCIceCandidateInit) {
        return init;
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('applies an ICE restart to the connection it restarts, even after the stall deadline', async () => {
    const mesh = new GroupCallMesh([], callbacks());
    // "zz" sorts after "aa", so the peer offers and we answer.
    mesh.setSelfId('zz-self');
    await mesh.handleDescription('aa-peer', offerFrom('11:11'));
    const [pc] = FakePeerConnection.instances;
    pc.enter('connected');
    pc.enter('disconnected');
    // Past the reconnect deadline: the leg reads `failed` while the
    // connection itself is still alive and waiting for the offerer's restart.
    await vi.advanceTimersByTimeAsync(25_000);

    await mesh.handleDescription('aa-peer', offerFrom('11:11'));

    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(pc.signalingState).not.toBe('closed');
    mesh.close();
  });

  it('starts over when the far side started a new connection', async () => {
    const mesh = new GroupCallMesh([], callbacks());
    mesh.setSelfId('zz-self');
    await mesh.handleDescription('aa-peer', offerFrom('11:11'));
    FakePeerConnection.instances[0].enter('connected');

    await mesh.handleDescription('aa-peer', offerFrom('22:22'));

    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(FakePeerConnection.instances[0].signalingState).toBe('closed');
    mesh.close();
  });

  it('re-offers when its first offer was lost in transit', async () => {
    const mesh = new GroupCallMesh([], callbacks());
    // "aa" sorts first, so we are the offerer.
    mesh.setSelfId('aa-self');
    mesh.syncPeers(['zz-peer']);
    await vi.advanceTimersByTimeAsync(0);
    const [pc] = FakePeerConnection.instances;
    expect(pc.offers).toHaveLength(1);

    // No answer ever arrives and the connection never leaves `new`.
    await vi.advanceTimersByTimeAsync(26_000);

    expect(pc.offers).toHaveLength(2);
    expect(pc.offers[1]).toEqual({ iceRestart: true });
    mesh.close();
  });

  it('drops an answer to an offer it no longer has pending', async () => {
    const status = vi.fn();
    const mesh = new GroupCallMesh([], { ...callbacks(), onPeerStatus: status });
    mesh.setSelfId('aa-self');
    mesh.syncPeers(['zz-peer']);
    await vi.advanceTimersByTimeAsync(0);
    const [pc] = FakePeerConnection.instances;
    await mesh.handleDescription('zz-peer', { type: 'answer', sdp: 'a=fingerprint:sha-256 BB:BB' });
    pc.enter('connected');

    // A second answer for the same exchange arrives late.
    await mesh.handleDescription('zz-peer', { type: 'answer', sdp: 'a=fingerprint:sha-256 BB:BB' });

    expect(status).not.toHaveBeenCalledWith('zz-peer', 'failed');
    mesh.close();
  });
});
