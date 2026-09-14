/**
 * The browser half of a group voice call: one microphone in, N peer
 * connections out, N audio elements playing.
 *
 * Deliberately framework-free — no React, no Zustand — for the same reason
 * `lib/call/peer.ts` is: the messy parts (permission, ICE lifecycle, teardown,
 * level metering) live in one place with a small surface, and the store above it
 * only has to deal with events. The difference from the 1:1 file is arithmetic —
 * everything here is a `Map` keyed by **userId** where that one is a field — and
 * that arithmetic is what the rest of this header is about.
 *
 * ## Glare, and why this is not perfect negotiation
 *
 * `lib/call/peer.ts` skips perfect negotiation because a 1:1 call has a
 * server-assigned caller: exactly one side offers and it is always the one that
 * dialled. A mesh has no such role — nobody "calls" anybody in a room of five,
 * and the server never says who offers to whom — so the question has to be
 * answered again from scratch. It is answered by {@link shouldOffer}, a plain
 * string compare of the two userIds, and the claim of this file is that the
 * compare is **sufficient** and the polite/impolite dance would be dead code.
 *
 * The argument, in three parts:
 *
 * 1. **The rule is total and symmetric-breaking.** For any `a !== b` exactly one
 *    of `shouldOffer(a, b)` and `shouldOffer(b, a)` is true, both sides compute
 *    it from the same two strings, and neither needs a round trip to learn its
 *    own role. Both peers already hold both ids: the roster names every peer and
 *    `GroupCallJoinedPayload.selfId` echoes ours back precisely so this compare
 *    has both of its operands.
 * 2. **The rule does not change under a peer's feet.** `lib/massive-march/voice.ts`
 *    runs the same compare on **socket ids**, which is fine until somebody
 *    reconnects: a new socket id can flip the role halfway through a
 *    negotiation, which is exactly the glare the compare exists to prevent. Ours
 *    compares userIds, which survive a reconnect, so a peer that drops and comes
 *    back resumes the same side of the same pair.
 * 3. **There is no renegotiation to have glare over.** Perfect negotiation earns
 *    its complexity on connections whose media changes mid-session — a track
 *    added, a camera switched on — because either side can then need to offer.
 *    This contract is audio-only with no place to put video
 *    (`lib/groupcall/events.ts`), one mono track is added before the first offer
 *    and never added or removed again, and mute is `track.enabled = false`
 *    (which is deliberately *not* a renegotiation — see `applyMute`). So a leg
 *    negotiates exactly once, plus ICE restarts, and an ICE restart is issued by
 *    the offerer only.
 *
 * What is implemented instead is the single cheap half of perfect negotiation
 * that costs nine lines and covers the case the compare cannot: if an offer
 * arrives on a leg we own **while our own offer is in flight**, it is ignored
 * rather than answered. That is the impolite peer's behaviour, restricted to the
 * collision window. It cannot deadlock, because the rule is total — only one
 * side of a pair can ever hold a pending local offer — and without it a
 * misbehaving or out-of-date peer could leave both sides half-negotiated with no
 * way back that does not involve rollback. Rollback is the part of perfect
 * negotiation with the real cost (implicit rollback in `setLocalDescription`
 * landed late in Safari), and this is how the file avoids needing it.
 *
 * ## One failed leg is not a failed call
 *
 * `lib/call/peer.ts` treats `failed` as the end of the call because in a 1:1
 * call it is. Here it is the end of **one** leg: the room carries on, the other
 * six people are unaffected, and the status is surfaced per peer
 * ({@link GroupCallPeerStatus}) rather than collapsed into a room-wide phase.
 * `disconnected` is not terminal in either file — it recovers routinely on
 * mobile networks — so it is reported as `reconnecting` and given a deadline
 * rather than being acted on immediately.
 *
 * ## Why the AudioContext is not closed
 *
 * Every analyser here hangs off the page's single shared `AudioContext`, taken
 * from `getAudioContext()` (`lib/shared/platform.ts`) because browsers cap how
 * many contexts a document may create and this app has games that want one too.
 * That shared context is cached in the platform module for the life of the page,
 * so calling `close()` on it at the end of a call would not free anything the
 * page was going to reuse — it would poison the cache and leave every later
 * `getAudioContext()` caller holding a dead context with no way to notice. The
 * teardown obligation is therefore discharged by disconnecting every node and
 * dropping every reference (see {@link GroupCallMesh.close}), which is what
 * actually releases the per-call resources; the context itself is the page's,
 * not ours to close.
 */

import { rtcConfiguration, type IceServer } from '@/lib/call/ice';
import { shouldOffer } from '@/lib/groupcall/state';
import {
  LEVEL_SAMPLE_MS,
  SPEAKING_RELEASE_MS,
  SPEAKING_RMS_THRESHOLD,
  type GroupCallPeerStatus,
} from '@/lib/groupcall/types';
import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';

/* -------------------------------------------------------------------------- */
/* Callbacks                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What the mesh tells its owner about, in the style of `PeerCallbacks`.
 *
 * Every one of them names the peer it is about — the mesh has no "other side" —
 * and none of them is allowed to throw: they are called from socket handlers,
 * from `RTCPeerConnection` events and from a timer, and an exception on any of
 * those paths would take down a leg (or the sampler) for reasons that have
 * nothing to do with media.
 */
export interface GroupCallMeshCallbacks {
  /** An SDP to relay to one named peer. */
  onDescription: (toUserId: string, description: RTCSessionDescriptionInit) => void;
  /** An ICE candidate to relay to one named peer. */
  onCandidate: (toUserId: string, candidate: RTCIceCandidateInit) => void;
  /** One leg's status changed. Fires on the change only, never on every sample. */
  onPeerStatus: (userId: string, status: GroupCallPeerStatus) => void;
  /** A peer started or stopped talking, after the hysteresis below has settled. */
  onSpeaking: (userId: string, speaking: boolean) => void;
  /** We started or stopped talking. Forced to `false` by a mute. */
  onLocalSpeaking: (speaking: boolean) => void;
  /**
   * Smoothed 0–1 levels for the avatar rings, batched.
   *
   * Optional, and one call for the whole room rather than one per peer: at
   * {@link LEVEL_SAMPLE_MS} a room of eight would otherwise be a hundred
   * callbacks a second, each of them a store write. Only sent on a tick where
   * something actually moved.
   */
  onLevels?: (levels: Readonly<Record<string, number>>, localLevel: number) => void;
}

/* -------------------------------------------------------------------------- */
/* Tuning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Audio constraints tuned for speech, not music.
 *
 * Replicated from `lib/call/peer.ts` rather than imported because the constant
 * there is module-private and `lib/call/*` is not this feature's to change. The
 * values must stay identical: they are what makes eight people in one room not
 * feed back into each other, and a mesh where one participant has echo
 * cancellation off is a mesh where *everyone* hears the echo.
 */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

/**
 * Analyser window. 512 samples at 48 kHz is ~10.7 ms of audio — comfortably
 * shorter than the {@link LEVEL_SAMPLE_MS} tick, so consecutive samples do not
 * overlap, and small enough that eight of them per tick is nothing.
 */
const ANALYSER_FFT_SIZE = 512;

/**
 * The RMS that reads as a full ring.
 *
 * Five times the speaking threshold: the ring should be visibly *below* full at
 * the volume that merely counts as talking, or it saturates the moment anyone
 * opens their mouth and stops carrying information.
 */
const LEVEL_FULL_SCALE_RMS = SPEAKING_RMS_THRESHOLD * 5;

/** Level release per tick. Instant attack, eased decay — a VU meter's shape. */
const LEVEL_RELEASE = 0.35;

/** Below this, a level change is not worth telling anyone about. */
const LEVEL_EPSILON = 0.02;

/**
 * How long a leg may sit in `new`/`connecting` before it is called `failed`.
 *
 * Generous, because it has to cover ICE gathering on a slow mobile network plus
 * a relay allocation, and the cost of being wrong is a tile that says "failed"
 * about somebody who was about to connect. Nothing else in the room is waiting
 * on this timer.
 */
const NEGOTIATION_TIMEOUT_MS = 25_000;

/** How long a leg may sit in `reconnecting` before it is called `failed`. */
const RECONNECT_TIMEOUT_MS = 20_000;

/**
 * ICE restarts spent on one leg before giving up.
 *
 * Two, because the common cause is a network handover that succeeds on the
 * first retry, and a leg that has failed three times is failing for a reason a
 * fourth attempt will not fix.
 */
const MAX_ICE_RESTARTS = 2;

/**
 * Candidates held for a peer we have not built a leg for yet.
 *
 * Trickle ICE and the roster are different messages with no ordering between
 * them, so a peer's first candidates can genuinely beat their `PEER_JOINED`.
 * Dropping those makes the leg slower to connect (each candidate is sent once).
 * The cap exists so a peer that only ever sends candidates cannot grow this.
 */
const MAX_ORPHAN_CANDIDATES = 32;

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

/** Everything this browser holds for one remote participant. */
interface MeshLeg {
  readonly userId: string;
  readonly pc: RTCPeerConnection;
  /** Do we make the offer for this pair? {@link shouldOffer}, re-derived if our own id arrives late. */
  offerer: boolean;
  status: GroupCallPeerStatus;
  /** Epoch ms of the last status change; a stuck leg is found by its age. */
  changedAt: number;
  /** True once this leg has been connected at least once. Distinguishes a drop from a cold failure. */
  everConnected: boolean;
  /** ICE restarts already spent. */
  restarts: number;
  /** Candidates that arrived before the remote description was set. */
  pending: RTCIceCandidateInit[];
  /** Detached playback element — see the note in `attachRemote`. */
  audio: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  speaking: boolean;
  /** Epoch ms of the last sample over the threshold. Drives the release window. */
  loudAt: number;
  level: number;
  /** Latched so a callback that fires after teardown cannot resurrect anything. */
  closed: boolean;
}

/* -------------------------------------------------------------------------- */
/* The mesh                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * N peer connections, one microphone, one sampler.
 *
 * Owned by `lib/groupcall/store.ts`, one instance per call. Every method is
 * safe to call after {@link close} — a room that ends while three legs are
 * mid-negotiation is the normal case, not the edge case.
 */
export class GroupCallMesh {
  private readonly legs = new Map<string, MeshLeg>();
  /** Candidates for peers we have not been told about yet. Keyed by userId. */
  private readonly orphanCandidates = new Map<string, RTCIceCandidateInit[]>();
  /**
   * The last peer list we were asked for, replayed once our own id lands.
   *
   * The microphone must open before `JOIN` is emitted, so the mesh exists before
   * the server has told us who we are — and the offer rule cannot run with one
   * operand. Remembering the ask is what stops that ordering from costing a leg.
   */
  private wanted: readonly string[] = [];

  private selfUserId: string | null = null;
  private localStream: MediaStream | null = null;
  private muted = false;
  private closed = false;

  /** The page's shared context, resolved once. `null` where Web Audio is unavailable. */
  private context: AudioContext | null = null;
  private contextResolved = false;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSpeaking = false;
  private localLoudAt = 0;
  private localLevel = 0;

  /** One timer for every meter in the room, not one per peer. */
  private ticker: ReturnType<typeof setInterval> | null = null;
  /** Reused across every analyser — they all share {@link ANALYSER_FFT_SIZE}. */
  private readonly sampleBuffer = new Uint8Array(ANALYSER_FFT_SIZE);

  constructor(
    private readonly iceServers: IceServer[],
    private readonly callbacks: GroupCallMeshCallbacks,
  ) {}

  /* ---------------------------------------------------------------------- */
  /* Identity                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Tell the mesh who we are.
   *
   * Called with `GroupCallJoinedPayload.selfId`, which is the whole reason that
   * field is on the wire. Legs built before this point defaulted to answering
   * (an inbound offer can only make us the answerer); re-deriving here hands
   * recovery ownership to the right side of each pair without disturbing a
   * negotiation already in flight.
   */
  setSelfId(userId: string): void {
    if (this.closed || !userId || this.selfUserId === userId) return;
    this.selfUserId = userId;
    for (const leg of this.legs.values()) leg.offerer = shouldOffer(userId, leg.userId);
    this.syncPeers(this.wanted);
  }

  /* ---------------------------------------------------------------------- */
  /* Microphone                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Open the microphone.
   *
   * Separate from everything else and awaited *before* the store emits `JOIN`,
   * because the permission prompt has to belong to the click the user made: a
   * refusal that happens after the server has admitted us leaves a participant
   * on seven other people's rosters who will never make a sound.
   *
   * Rejects with the raw `getUserMedia` error so the caller can tell "denied"
   * from "no such device" — see `describeMicrophoneError` in ./support.
   */
  async openMicrophone(): Promise<void> {
    if (this.closed || this.localStream) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia is unavailable');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false,
    });

    // The call can end during the prompt — someone else hung up, the user
    // navigated — and a stream opened into a closed mesh is a recording
    // indicator that never goes off.
    if (this.closed) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    this.localStream = stream;
    // Mute may have been set before the mic opened; `set-muted` is legal from
    // `joining` in the state machine precisely so that works.
    this.applyMute();

    // Legs built before the microphone opened (an early inbound offer) have a
    // recvonly transceiver and no track to send. Give them one now.
    for (const leg of this.legs.values()) this.addLocalTracks(leg);

    this.attachLocalAnalyser();
    this.ensureTicker();
  }

  /** True once the microphone is open. False for a listener-only mesh. */
  hasMicrophone(): boolean {
    return this.localStream !== null;
  }

  /**
   * Mute or unmute the local microphone across every leg at once.
   *
   * One track shared by N senders means one flag silences the whole room's view
   * of us, and `enabled = false` keeps the track and every connection alive
   * while sending silence — stopping it would renegotiate N legs and everyone
   * would hear the drop. Same rule as `lib/call/peer.ts`, N times cheaper.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
    // Don't make the room wait out the release window to stop showing us as
    // talking: a mute is a statement, not a decay.
    if (muted && this.localSpeaking) {
      this.localSpeaking = false;
      this.localLevel = 0;
      this.callbacks.onLocalSpeaking(false);
    }
  }

  private applyMute(): void {
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = !this.muted;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Membership                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Make the set of legs match the set of people in the room.
   *
   * Given the userIds of everyone who is actually *in* (never the invitees who
   * are still ringing — they have no media to negotiate and `meshPeers()` in
   * `lib/groupcall/state.ts` filters them out), this adds what is missing,
   * removes what is gone, and leaves everything else alone. Idempotent, so a
   * duplicated `PEER_JOINED` or a roster snapshot that repeats what the deltas
   * already said costs nothing.
   */
  syncPeers(userIds: readonly string[]): void {
    if (this.closed) return;
    this.wanted = [...userIds];

    const self = this.selfUserId;
    const wanted = new Set(userIds.filter((id) => Boolean(id) && id !== self));

    for (const [userId, leg] of this.legs) {
      if (wanted.has(userId)) continue;
      this.teardownLeg(leg, true);
      this.legs.delete(userId);
    }
    for (const userId of [...this.orphanCandidates.keys()]) {
      if (!wanted.has(userId)) this.orphanCandidates.delete(userId);
    }

    // Without our own id the offer rule has only one of its two operands, so a
    // leg created now could not decide who offers and both sides might. Wait
    // for `setSelfId`, which replays this list.
    if (!self) return;

    for (const userId of wanted) {
      if (this.legs.has(userId)) continue;
      const leg = this.createLeg(userId);
      if (leg.offerer) void this.offer(leg);
    }
  }

  /** This leg's status, or `null` if there is no such leg. */
  statusOf(userId: string): GroupCallPeerStatus | null {
    return this.legs.get(userId)?.status ?? null;
  }

  /** How many legs are open. Diagnostics only — the roster is the server's. */
  peerCount(): number {
    return this.legs.size;
  }

  /* ---------------------------------------------------------------------- */
  /* Signalling                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Apply an SDP from one named peer, answering if it was an offer.
   *
   * Creates the leg if there is not one yet: a relayed offer and the roster
   * event that would have announced the sender are different messages with no
   * ordering between them, and refusing the offer because the roster is a beat
   * behind would cost a leg for no reason. A leg created this way answers — an
   * inbound offer can only make us the answerer — and `setSelfId` corrects the
   * bookkeeping if our own id has not arrived yet.
   */
  async handleDescription(
    fromUserId: string,
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (this.closed || !fromUserId || fromUserId === this.selfUserId) return;

    let leg = this.legs.get(fromUserId);

    // A dead leg that the far side is trying to rebuild. Start it over rather
    // than pushing an offer into a connection that has already given up: this
    // is the one path by which a `failed` leg comes back without the person
    // leaving and rejoining the room.
    if (leg && description.type === 'offer' && this.isSpent(leg)) {
      this.teardownLeg(leg, false);
      this.legs.delete(fromUserId);
      leg = undefined;
    }

    if (!leg) {
      // An answer with no leg is stale by definition — we never offered.
      if (description.type !== 'offer') return;
      leg = this.createLeg(fromUserId);
    }

    // The glare guard. See the header: the id compare means only one side of a
    // pair can hold a pending local offer, so ignoring the collision cannot
    // deadlock, and answering it would half-apply two negotiations at once.
    if (description.type === 'offer' && leg.offerer && leg.pc.signalingState !== 'stable') return;

    try {
      await leg.pc.setRemoteDescription(new RTCSessionDescription(description));
      if (leg.closed) return;

      // Candidates that raced ahead of the description can be added now.
      const pending = leg.pending;
      leg.pending = [];
      for (const candidate of pending) {
        await leg.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
          /* a stale candidate from a superseded negotiation is not fatal */
        });
      }

      if (description.type === 'offer') {
        const answer = await leg.pc.createAnswer();
        if (leg.closed) return;
        await leg.pc.setLocalDescription(answer);
        this.callbacks.onDescription(leg.userId, answer);
      }
    } catch {
      // One leg's negotiation, not the room's. Everyone else keeps talking.
      this.setStatus(leg, 'failed');
    }
  }

  /**
   * Add a remote ICE candidate.
   *
   * Buffered per leg until there is a remote description to attach it to —
   * candidates arriving before the offer they belong to is ordinary trickle ICE
   * — and buffered per *userId* when there is no leg at all yet, for the same
   * reason `handleDescription` builds one on demand.
   */
  async handleCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (this.closed || !fromUserId || fromUserId === this.selfUserId) return;

    const leg = this.legs.get(fromUserId);
    if (!leg) {
      const orphans = this.orphanCandidates.get(fromUserId) ?? [];
      if (orphans.length < MAX_ORPHAN_CANDIDATES) orphans.push(candidate);
      this.orphanCandidates.set(fromUserId, orphans);
      return;
    }

    if (!leg.pc.remoteDescription) {
      leg.pending.push(candidate);
      return;
    }
    await leg.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
      /* a malformed or stale candidate is not fatal to the leg */
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Teardown                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Release every connection, every audio element, the microphone and the
   * sampler.
   *
   * The audio elements are the part worth being pedantic about: they are
   * detached from the document on purpose (so navigation cannot kill the call),
   * which means nothing else will ever collect them. Seven leaked elements each
   * holding a live `MediaStream` is a call that keeps playing after it ended.
   *
   * The shared `AudioContext` is deliberately left open — see the file header.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    this.stopTicker();
    for (const leg of this.legs.values()) this.teardownLeg(leg, false);
    this.legs.clear();
    this.orphanCandidates.clear();
    this.wanted = [];

    this.detachLocalAnalyser();
    // Stopping tracks is what actually turns the browser's recording indicator
    // off. Leaving them running after a call is the bug users notice.
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    this.localSpeaking = false;
    this.localLevel = 0;
    this.context = null;
  }

  /* ---------------------------------------------------------------------- */
  /* Legs                                                                   */
  /* ---------------------------------------------------------------------- */

  private createLeg(userId: string): MeshLeg {
    const pc = new RTCPeerConnection(rtcConfiguration(this.iceServers));
    const leg: MeshLeg = {
      userId,
      pc,
      offerer: this.selfUserId ? shouldOffer(this.selfUserId, userId) : false,
      status: 'new',
      changedAt: Date.now(),
      everConnected: false,
      restarts: 0,
      pending: [],
      audio: null,
      source: null,
      analyser: null,
      speaking: false,
      loudAt: 0,
      level: 0,
      closed: false,
    };

    this.addLocalTracks(leg);

    pc.onicecandidate = (event) => {
      if (event.candidate && !leg.closed)
        this.callbacks.onCandidate(userId, event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) this.attachRemote(leg, stream);
    };

    // `negotiationneeded` is deliberately unhandled. It fires once, when the
    // local track is added before the first offer, and this file offers on its
    // own schedule (from `syncPeers`, from a recovery) so that it can obey the
    // id compare. Reacting to the event instead would hand the decision to
    // whichever side happened to add a track first, which is the glare the
    // compare exists to prevent.
    pc.onconnectionstatechange = () => {
      if (leg.closed || this.closed) return;
      switch (pc.connectionState) {
        case 'new':
          this.setStatus(leg, 'new');
          break;
        case 'connecting':
          this.setStatus(leg, leg.everConnected ? 'reconnecting' : 'connecting');
          break;
        case 'connected':
          leg.everConnected = true;
          leg.restarts = 0;
          this.setStatus(leg, 'connected');
          break;
        case 'disconnected':
          // Not terminal, and routinely transient — a lift, a handover. Keep
          // the tile and let the deadline in `checkStalled` decide.
          this.setStatus(leg, leg.everConnected ? 'reconnecting' : 'connecting');
          break;
        case 'failed':
          this.recover(leg);
          break;
        case 'closed':
          this.setStatus(leg, 'closed');
          break;
      }
    };

    this.legs.set(userId, leg);

    // Drain anything that arrived before we knew about this person.
    const orphans = this.orphanCandidates.get(userId);
    if (orphans) {
      this.orphanCandidates.delete(userId);
      leg.pending.push(...orphans);
    }

    this.ensureTicker();
    return leg;
  }

  private addLocalTracks(leg: MeshLeg): void {
    const stream = this.localStream;
    if (stream) {
      // The same track object on every connection: one capture, N senders.
      // Adding it twice would be an error, so only do it for a fresh leg.
      if (leg.pc.getSenders().some((sender) => sender.track)) return;
      for (const track of stream.getAudioTracks()) leg.pc.addTrack(track, stream);
      return;
    }
    // With no microphone there is nothing to send, but the transceiver still
    // has to exist or the other side has nothing to answer. Same trick as
    // `lib/massive-march/voice.ts` uses for its text-only players; here it is
    // a defensive path, since the store opens the mic before it joins.
    if (leg.pc.getTransceivers().length === 0) {
      leg.pc.addTransceiver('audio', { direction: 'recvonly' });
    }
  }

  /** Produce and publish an offer for one leg. Offerer side only. */
  private async offer(leg: MeshLeg, options?: RTCOfferOptions): Promise<void> {
    if (leg.closed || this.closed) return;
    try {
      const description = await leg.pc.createOffer(options);
      // A whole negotiation can complete while that promise was in flight.
      if (leg.closed || this.closed || leg.pc.signalingState === 'closed') return;
      await leg.pc.setLocalDescription(description);
      this.callbacks.onDescription(leg.userId, description);
    } catch {
      // A failed negotiation leaves that one peer silent; everything else stands.
      this.setStatus(leg, 'failed');
    }
  }

  /**
   * A leg's transport failed.
   *
   * Recovery is the **offerer's** job, decided by the same id compare that
   * decided the first offer, so the two sides cannot both try to heal the leg
   * and collide doing it. An ICE restart is preferred to rebuilding the
   * connection: it reuses the negotiated media and the answering side needs no
   * special handling, because a restart arrives as an ordinary offer.
   *
   * The answering side just waits and says `reconnecting`; if nothing comes,
   * the deadline in {@link checkStalled} calls it.
   */
  private recover(leg: MeshLeg): void {
    if (leg.closed || this.closed) return;
    if (!leg.offerer) {
      this.setStatus(leg, 'reconnecting');
      return;
    }
    if (leg.restarts >= MAX_ICE_RESTARTS) {
      this.setStatus(leg, 'failed');
      return;
    }
    leg.restarts += 1;
    this.setStatus(leg, 'reconnecting');
    void this.offer(leg, { iceRestart: true });
  }

  /** True when a leg is past saving and only a fresh negotiation will do. */
  private isSpent(leg: MeshLeg): boolean {
    return (
      leg.status === 'failed' ||
      leg.status === 'closed' ||
      leg.pc.signalingState === 'closed' ||
      leg.pc.connectionState === 'closed'
    );
  }

  private setStatus(leg: MeshLeg, status: GroupCallPeerStatus): void {
    if (leg.status === status) return;
    leg.status = status;
    leg.changedAt = Date.now();
    if (!this.closed) this.callbacks.onPeerStatus(leg.userId, status);
  }

  private teardownLeg(leg: MeshLeg, notify: boolean): void {
    if (leg.closed) return;
    leg.closed = true;

    leg.source?.disconnect();
    leg.source = null;
    leg.analyser?.disconnect();
    leg.analyser = null;

    if (leg.audio) {
      leg.audio.pause();
      leg.audio.srcObject = null;
      leg.audio.remove();
      leg.audio = null;
    }

    leg.pc.onicecandidate = null;
    leg.pc.ontrack = null;
    leg.pc.onconnectionstatechange = null;
    try {
      leg.pc.close();
    } catch {
      /* already closed by the engine — nothing to undo */
    }
    leg.pending = [];

    if (notify && !this.closed) {
      if (leg.speaking) {
        leg.speaking = false;
        this.callbacks.onSpeaking(leg.userId, false);
      }
      leg.status = 'closed';
      leg.changedAt = Date.now();
      this.callbacks.onPeerStatus(leg.userId, 'closed');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Audio                                                                  */
  /* ---------------------------------------------------------------------- */

  private attachRemote(leg: MeshLeg, stream: MediaStream): void {
    if (leg.closed || this.closed) return;

    // Playback goes through a detached element rather than the DOM: a call must
    // keep working while the user navigates, and an element owned by a React
    // tree dies with it. `teardownLeg` is the only thing that frees these, which
    // is why it runs on every removal path.
    if (!leg.audio) {
      leg.audio = new Audio();
      leg.audio.autoplay = true;
    }
    leg.audio.srcObject = stream;
    void leg.audio.play().catch(() => {
      /* autoplay policy — the gesture that joined the call covers us, but never
         let a rejected promise take a leg down */
    });

    this.attachAnalyser(leg, stream);
  }

  /**
   * The page's shared AudioContext, resolved once.
   *
   * Resumed on every access rather than only the first: every engine starts a
   * context suspended until a gesture, and iOS re-suspends it on backgrounding,
   * which is exactly what a phone does during a call.
   */
  private audioContext(): AudioContext | null {
    if (!this.contextResolved) {
      this.contextResolved = true;
      this.context = getAudioContext();
    }
    if (this.context) resumeAudioContext();
    return this.context;
  }

  private attachAnalyser(leg: MeshLeg, stream: MediaStream): void {
    const context = this.audioContext();
    if (!context) return;

    leg.source?.disconnect();
    leg.analyser?.disconnect();
    leg.source = null;
    leg.analyser = null;

    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      // Deliberately NOT connected to `context.destination`: the audio element
      // above is what the user hears, and wiring the graph through as well
      // would play every remote stream twice.
      source.connect(analyser);
      leg.source = source;
      leg.analyser = analyser;
    } catch {
      // No meter for this peer. The call is unaffected — the ring just sits at
      // rest, which is a better outcome than a thrown exception mid-join.
    }
    this.ensureTicker();
  }

  private attachLocalAnalyser(): void {
    const context = this.audioContext();
    const stream = this.localStream;
    if (!context || !stream) return;

    this.detachLocalAnalyser();
    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      source.connect(analyser);
      this.localSource = source;
      this.localAnalyser = analyser;
    } catch {
      // Same as above: no local meter, working call.
    }
  }

  private detachLocalAnalyser(): void {
    this.localSource?.disconnect();
    this.localSource = null;
    this.localAnalyser?.disconnect();
    this.localAnalyser = null;
  }

  /* ---------------------------------------------------------------------- */
  /* The sampler                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * One interval for the whole room.
   *
   * A timer per peer would be eight timers waking the tab independently, and a
   * per-frame animation loop would take sixty samples a second to drive a meter
   * that changes twelve times — as well as being a loop that has to be proved
   * to settle (§17.3, and the allowlist that enforces it).
   * {@link LEVEL_SAMPLE_MS} is the contract's answer and an interval is the
   * honest way to hold it.
   */
  private ensureTicker(): void {
    if (this.ticker || this.closed || typeof window === 'undefined') return;
    this.ticker = setInterval(() => this.tick(), LEVEL_SAMPLE_MS);
  }

  private stopTicker(): void {
    if (!this.ticker) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }

  private tick(): void {
    if (this.closed) return;
    const now = Date.now();

    let levels: Record<string, number> | null = null;
    let dirty = false;

    for (const leg of this.legs.values()) {
      if (leg.closed || !leg.analyser) continue;
      const rms = this.readRms(leg.analyser);

      const speaking = this.evaluateSpeaking(rms, leg.speaking, leg.loudAt, now);
      if (rms >= SPEAKING_RMS_THRESHOLD) leg.loudAt = now;
      if (speaking !== leg.speaking) {
        leg.speaking = speaking;
        this.callbacks.onSpeaking(leg.userId, speaking);
      }

      const level = smoothLevel(leg.level, rms);
      if (Math.abs(level - leg.level) >= LEVEL_EPSILON) dirty = true;
      leg.level = level;
      levels ??= {};
      levels[leg.userId] = level;
    }

    // A muted microphone delivers silence, so this reads 0 on its own — but
    // `setMuted` has already said so, and re-deriving it here would only add a
    // release window's worth of lag.
    if (this.localAnalyser && !this.muted) {
      const rms = this.readRms(this.localAnalyser);
      const speaking = this.evaluateSpeaking(rms, this.localSpeaking, this.localLoudAt, now);
      if (rms >= SPEAKING_RMS_THRESHOLD) this.localLoudAt = now;
      if (speaking !== this.localSpeaking) {
        this.localSpeaking = speaking;
        this.callbacks.onLocalSpeaking(speaking);
      }
      const level = smoothLevel(this.localLevel, rms);
      if (Math.abs(level - this.localLevel) >= LEVEL_EPSILON) dirty = true;
      this.localLevel = level;
    }

    if (dirty) this.callbacks.onLevels?.(levels ?? {}, this.localLevel);

    this.checkStalled(now);
  }

  /** Root-mean-square of one analyser window, 0–1. */
  private readRms(analyser: AnalyserNode): number {
    const buffer = this.sampleBuffer;
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      // Byte time-domain data is centred on 128; ±128 is full scale.
      const sample = (buffer[i] - 128) / 128;
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
  }

  /**
   * The asymmetric gate from `lib/groupcall/types.ts`: cross the threshold to
   * start, and stay under it for {@link SPEAKING_RELEASE_MS} to stop. Speech is
   * full of gaps, and a symmetric rule strobes on every one of them.
   */
  private evaluateSpeaking(rms: number, speaking: boolean, loudAt: number, now: number): boolean {
    if (rms >= SPEAKING_RMS_THRESHOLD) return true;
    return speaking && now - loudAt < SPEAKING_RELEASE_MS;
  }

  /**
   * Give up on legs that have been trying for too long.
   *
   * Rides the sampler's interval rather than owning timers of its own: the
   * deadlines are tens of seconds and the tick is 80 ms, so the resolution is
   * free and there is nothing extra to cancel on teardown.
   */
  private checkStalled(now: number): void {
    for (const leg of this.legs.values()) {
      if (leg.closed) continue;
      const age = now - leg.changedAt;
      if ((leg.status === 'new' || leg.status === 'connecting') && age > NEGOTIATION_TIMEOUT_MS) {
        this.setStatus(leg, 'failed');
      } else if (leg.status === 'reconnecting' && age > RECONNECT_TIMEOUT_MS) {
        this.setStatus(leg, 'failed');
      }
    }
  }
}

/** Instant attack, eased release — the shape a level meter has to have. */
function smoothLevel(previous: number, rms: number): number {
  const target = Math.min(1, rms / LEVEL_FULL_SCALE_RMS);
  if (target >= previous) return target;
  return previous + (target - previous) * LEVEL_RELEASE;
}
