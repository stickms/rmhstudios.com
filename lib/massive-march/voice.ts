/**
 * Massive March — spatial voice.
 *
 * A full WebRTC mesh: every player connects directly to every other player, so
 * twelve people cost eleven audio connections each and no server ever carries a
 * sample. The hub is a post box for offers, answers and ICE candidates, and
 * reads none of them.
 *
 * The mesh is what makes *spatial* voice affordable at all. Mixing twelve
 * streams server-side would mean twelve different mixes, one per listener,
 * because the whole point is that nobody hears the same thing. Peer to peer,
 * each client mixes its own — and the mix is computed from `world/audio.ts`, the
 * same function the hub uses to decide who receives a line of text, so speaking
 * and typing are under identical rules (§8.2).
 *
 * Per peer the chain is:
 *
 *   remote stream → lowpass (walls, distance, radio) → panner (which side they
 *   are on) → gain (how far away they are) → speakers
 *
 * The gain and the cutoff are recomputed a few times a second from the
 * authoritative positions in `live.ts`, which is often enough that walking
 * behind a boulder audibly does something and rare enough to cost nothing.
 */

'use client';

import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';
import { live } from './live';
import { mm, onVoicePeers, onVoiceSignal } from './net/client';
import { settings } from './settings';
import { useMmStore } from './store';
import { BIT } from './net/events';
import { CROUCH_EYE_HEIGHT, EYE_HEIGHT } from './constants';
import { audibility, boothAt, type AudioActor } from './world/audio';

interface Peer {
  id: string;
  connection: RTCPeerConnection;
  source: MediaStreamAudioSourceNode | null;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  /** The audio element exists only to satisfy engines that will not play a
   *  WebRTC stream routed purely through Web Audio; it is muted and detached. */
  sink: HTMLAudioElement | null;
}

interface VoiceRuntime {
  context: AudioContext;
  local: MediaStream | null;
  peers: Map<string, Peer>;
  /** Socket id of this client — decides who offers, to avoid glare. */
  selfId: string;
  timer: ReturnType<typeof setInterval> | null;
  transmitting: boolean;
  unsubscribe: (() => void)[];
}

let runtime: VoiceRuntime | null = null;

export type VoiceState = 'off' | 'starting' | 'live' | 'denied' | 'unsupported';

let state: VoiceState = 'off';
const listeners = new Set<(state: VoiceState) => void>();

export function voiceState(): VoiceState {
  return state;
}

export function onVoiceStateChange(handler: (state: VoiceState) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

function setState(next: VoiceState): void {
  if (state === next) return;
  state = next;
  for (const handler of listeners) handler(next);
}

const ICE_SERVERS: RTCIceServer[] = [
  // Public STUN only. A TURN relay would be needed for the strictest symmetric
  // NATs; without one those players fall back to text, which the design already
  // treats as a full alternative rather than a degraded mode.
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Open the microphone and start meeting people.
 *
 * Called from a click, always: every browser suspends an AudioContext until a
 * user gesture, and asking for a microphone outside one is a permission prompt
 * nobody expected.
 */
export async function startVoice(selfId: string): Promise<void> {
  if (runtime) return;
  const context = getAudioContext();
  if (!context || typeof RTCPeerConnection === 'undefined') {
    setState('unsupported');
    return;
  }
  setState('starting');
  resumeAudioContext();

  runtime = {
    context,
    local: null,
    peers: new Map(),
    selfId,
    timer: null,
    transmitting: false,
    unsubscribe: [],
  };

  // `textOnly` never touches the microphone — but it still connects, because a
  // player who types must still be able to HEAR the people who speak.
  if (!settings().textOnly) {
    try {
      runtime.local = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // Silent until the player asks to talk; `micMode` decides how they ask.
      const open = settings().micMode === 'open';
      for (const track of runtime.local.getAudioTracks()) track.enabled = open;
      runtime.transmitting = open;
    } catch {
      setState('denied');
      // Deliberately not a return: listening still works, and a group where one
      // person can only listen is a group that has to change how it talks, which
      // is a game problem rather than a broken client.
    }
  }

  runtime.unsubscribe.push(
    onVoicePeers(({ peers }) => syncPeers(peers)),
    onVoiceSignal((message) => void handleSignal(message)),
  );

  runtime.timer = setInterval(updateMix, 140);
  if (state !== 'denied') setState('live');
}

export function stopVoice(): void {
  if (!runtime) return;
  if (runtime.timer) clearInterval(runtime.timer);
  for (const unsubscribe of runtime.unsubscribe) unsubscribe();
  for (const peer of runtime.peers.values()) teardown(peer);
  runtime.local?.getTracks().forEach((track) => track.stop());
  runtime = null;
  setState('off');
}

/** Push-to-talk, toggle, or open mic — all of them end up here. */
export function setTransmitting(on: boolean): void {
  if (!runtime?.local) return;
  if (runtime.transmitting === on) return;
  runtime.transmitting = on;
  for (const track of runtime.local.getAudioTracks()) track.enabled = on;
  mm.voiceState(on);
}

export function isTransmitting(): boolean {
  return runtime?.transmitting ?? false;
}

export function hasMicrophone(): boolean {
  return Boolean(runtime?.local);
}

// ─── Mesh ───────────────────────────────────────────────────────────────────

function syncPeers(peers: string[]): void {
  if (!runtime) return;
  const wanted = new Set(peers.filter((id) => id !== runtime!.selfId));

  for (const [id, peer] of runtime.peers) {
    if (wanted.has(id)) continue;
    teardown(peer);
    runtime.peers.delete(id);
  }

  for (const id of wanted) {
    if (runtime.peers.has(id)) continue;
    // Exactly one side offers, chosen by comparing ids — otherwise both sides
    // offer at once and the negotiation collapses (WebRTC calls it glare).
    const shouldOffer = runtime.selfId < id;
    const peer = createPeer(id);
    if (shouldOffer) void offer(peer);
  }
}

function createPeer(id: string): Peer {
  const context = runtime!.context;
  const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 20000;
  const panner = context.createStereoPanner();
  const gain = context.createGain();
  gain.gain.value = 0;
  filter.connect(panner).connect(gain).connect(context.destination);

  const peer: Peer = { id, connection, source: null, filter, panner, gain, sink: null };

  if (runtime!.local) {
    for (const track of runtime!.local.getAudioTracks()) {
      connection.addTrack(track, runtime!.local);
    }
  } else {
    // With no microphone there is nothing to send, but the transceiver still has
    // to exist or the other side has nothing to answer.
    connection.addTransceiver('audio', { direction: 'recvonly' });
  }

  connection.onicecandidate = (event) => {
    if (event.candidate) mm.voiceSignal(id, 'ice', event.candidate.toJSON());
  };

  connection.ontrack = (event) => {
    const [stream] = event.streams;
    if (!stream) return;
    peer.source?.disconnect();
    peer.source = context.createMediaStreamSource(stream);
    peer.source.connect(filter);
    // Chrome will not deliver audio from a remote stream that is not attached to
    // a media element, even when the graph is wired — a long-standing quirk. The
    // element is muted; everything audible comes out of the graph above.
    const sink = new Audio();
    sink.srcObject = stream;
    sink.muted = true;
    void sink.play().catch(() => {});
    peer.sink = sink;
  };

  connection.onconnectionstatechange = () => {
    if (connection.connectionState !== 'failed') return;
    // A failed connection is worth one more try — a phone that changed networks
    // is the common cause and it recovers immediately.
    teardown(peer);
    runtime?.peers.delete(id);
    if (runtime && runtime.selfId < id) {
      const replacement = createPeer(id);
      void offer(replacement);
    }
  };

  runtime!.peers.set(id, peer);
  return peer;
}

async function offer(peer: Peer): Promise<void> {
  try {
    const description = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(description);
    mm.voiceSignal(peer.id, 'offer', description);
  } catch {
    // A failed negotiation leaves that one peer silent; everything else stands.
  }
}

async function handleSignal(message: { peer: string; kind: string; data: unknown }): Promise<void> {
  if (!runtime) return;
  const peer = runtime.peers.get(message.peer) ?? createPeer(message.peer);

  try {
    if (message.kind === 'offer') {
      await peer.connection.setRemoteDescription(message.data as RTCSessionDescriptionInit);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      mm.voiceSignal(peer.id, 'answer', answer);
      return;
    }
    if (message.kind === 'answer') {
      await peer.connection.setRemoteDescription(message.data as RTCSessionDescriptionInit);
      return;
    }
    if (message.kind === 'ice') {
      await peer.connection.addIceCandidate(message.data as RTCIceCandidateInit);
    }
  } catch {
    // Candidates that arrive before the description are expected and harmless.
  }
}

function teardown(peer: Peer): void {
  peer.source?.disconnect();
  peer.filter.disconnect();
  peer.panner.disconnect();
  peer.gain.disconnect();
  if (peer.sink) {
    peer.sink.srcObject = null;
    peer.sink.remove();
  }
  peer.connection.onicecandidate = null;
  peer.connection.ontrack = null;
  peer.connection.onconnectionstatechange = null;
  peer.connection.close();
}

// ─── The mix ────────────────────────────────────────────────────────────────

function actorFor(source: {
  x: number;
  z: number;
  bits: number;
}): AudioActor {
  return {
    x: source.x,
    z: source.z,
    y: (source.bits & BIT.CROUCH) !== 0 ? CROUCH_EYE_HEIGHT : EYE_HEIGHT,
    hasRadio: (source.bits & BIT.HAS_RADIO) !== 0,
    hasMegaphone: (source.bits & BIT.MEGAPHONE) !== 0,
    booth: boothAt(source.x, source.z),
  };
}

/**
 * Recompute every peer's loudness, muffling and direction.
 *
 * Runs seven times a second. The occlusion sampling is skipped past sixty
 * metres, where distance has already decided the answer and sixteen height
 * samples per peer would be paid for nothing.
 */
function updateMix(): void {
  if (!runtime) return;
  const store = useMmStore.getState();
  const listenerSlot = store.selfSlot;
  const repeater = store.world?.unlocks.includes('repeater') ?? false;
  const volume = settings().voiceVolume;

  const listener = actorFor(live.self);
  const now = runtime.context.currentTime;

  for (const peer of runtime.peers.values()) {
    const member = store.session?.members.find((m) => m.socketId === peer.id);
    const speaker = member ? live.players.get(member.slot) : null;
    if (!member || !speaker || member.slot === listenerSlot) {
      peer.gain.gain.setTargetAtTime(0, now, 0.05);
      continue;
    }

    const channel =
      (speaker.bits & BIT.RADIO) !== 0
        ? 'radio'
        : (speaker.bits & BIT.MEGAPHONE) !== 0
          ? 'megaphone'
          : 'near';

    const distance = Math.hypot(speaker.x - live.self.x, speaker.z - live.self.z);
    const heard = audibility(actorFor(speaker), listener, {
      repeater,
      channel,
      skipOcclusion: distance > 60,
    });

    // `setTargetAtTime` rather than a direct assignment: an instant gain change
    // on a live stream is an audible click, and this fires seven times a second.
    peer.gain.gain.setTargetAtTime(heard.audible ? heard.gain * volume : 0, now, 0.06);

    // Muffle maps onto a cutoff, logarithmically — hearing is logarithmic and a
    // linear sweep spends most of its range somewhere nobody notices.
    const cutoff = 18000 * Math.pow(0.02, heard.muffle);
    peer.filter.frequency.setTargetAtTime(Math.max(320, cutoff), now, 0.08);

    // A radio comes out of the object in your hand, not from over there.
    if (channel === 'radio') {
      peer.panner.pan.setTargetAtTime(0, now, 0.1);
      continue;
    }
    const bearing = Math.atan2(speaker.x - live.self.x, speaker.z - live.self.z) - live.self.yaw;
    // Only a partial pan: fully-panned voices are disorienting on headphones and
    // useless on laptop speakers, and this is a direction cue rather than a mix.
    peer.panner.pan.setTargetAtTime(Math.sin(bearing) * -0.75, now, 0.1);
  }
}
