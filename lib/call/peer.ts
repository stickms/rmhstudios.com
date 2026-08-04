/**
 * The browser half of a voice call: microphone in, `RTCPeerConnection`,
 * remote audio out.
 *
 * Deliberately framework-free — no React, no Zustand — so the messy parts
 * (getUserMedia permission, ICE lifecycle, teardown) live in one place with a
 * small surface, and the store above it only has to deal with events.
 *
 * ## Perfect negotiation is not implemented, on purpose
 *
 * A 1:1 call with a clear caller and callee has no glare: exactly one side
 * makes the offer, and it is always the caller, decided by the server's
 * `accepted` event. The "polite/impolite peer" dance exists for renegotiation
 * and for symmetric connections; adding it here would be complexity guarding
 * against a race that cannot happen in this flow.
 */

import { rtcConfiguration, type IceServer } from '@/lib/call/ice';

export interface PeerCallbacks {
  /** An SDP to send to the other side. */
  onDescription: (description: RTCSessionDescriptionInit) => void;
  /** An ICE candidate to send to the other side. */
  onCandidate: (candidate: RTCIceCandidateInit) => void;
  /** Media is flowing. */
  onConnected: () => void;
  /** The connection failed or dropped and will not recover. */
  onFailed: () => void;
}

/** Audio constraints tuned for speech, not music. */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export class CallPeer {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  /** Candidates that arrived before the remote description was set. */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private closed = false;

  constructor(
    private readonly iceServers: IceServer[],
    private readonly callbacks: PeerCallbacks,
  ) {}

  /**
   * Open the microphone.
   *
   * Separate from `connect()` because the permission prompt is a user-visible
   * moment: the callee should be asked when they press Accept, not when the
   * call starts ringing.
   */
  async openMicrophone(): Promise<void> {
    if (this.localStream) return;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false,
    });
    // Mute state may have been set before the mic opened.
    this.applyMute();
  }

  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
  }

  private applyMute(): void {
    // `enabled = false` keeps the track and the connection alive while sending
    // silence, which is what a mute button should do — stopping the track would
    // renegotiate and the other side would hear a drop.
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !this.muted;
    }
  }

  /** Build the peer connection and wire its events. Call after `openMicrophone`. */
  private ensureConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;

    const pc = new RTCPeerConnection(rtcConfiguration(this.iceServers));

    for (const track of this.localStream?.getTracks() ?? []) {
      pc.addTrack(track, this.localStream as MediaStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) this.callbacks.onCandidate(event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      // Playback goes through a detached element rather than the DOM: a call
      // must keep working while the user navigates, and an element owned by a
      // React tree dies with it.
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio();
        this.remoteAudio.autoplay = true;
      }
      this.remoteAudio.srcObject = stream;
      void this.remoteAudio.play().catch(() => {
        /* autoplay policy — the user gesture that answered the call covers us,
           but never let a rejected promise take the call down */
      });
    };

    pc.onconnectionstatechange = () => {
      if (this.closed) return;
      switch (pc.connectionState) {
        case 'connected':
          this.callbacks.onConnected();
          break;
        case 'failed':
          // `disconnected` is not terminal — it recovers regularly on mobile
          // networks — so only `failed` and `closed` end the call.
          this.callbacks.onFailed();
          break;
        default:
          break;
      }
    };

    this.pc = pc;
    return pc;
  }

  /** Caller side: produce the offer. */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const pc = this.ensureConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.callbacks.onDescription(offer);
    return offer;
  }

  /** Apply an SDP from the other side, answering if it was an offer. */
  async acceptDescription(description: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.ensureConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(description));

    // Candidates that raced ahead of the description can be added now.
    for (const candidate of this.pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
    this.pendingCandidates = [];

    if (description.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.callbacks.onDescription(answer);
    }
  }

  /**
   * Add a remote ICE candidate.
   *
   * Candidates routinely arrive before the offer they belong to — that is
   * normal trickle ICE, not an error — so they are buffered until there is a
   * remote description to attach them to.
   */
  async addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.pc;
    if (!pc || !pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
      /* a malformed or stale candidate is not fatal to the call */
    });
  }

  /** Release the microphone, the connection and the audio element. */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    // Stopping tracks is what actually turns the browser's recording indicator
    // off. Leaving them running after a call is the bug users notice.
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
  }
}

/** Whether this browser can place a call at all. */
export function callSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}
